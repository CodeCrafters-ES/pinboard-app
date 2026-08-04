# Chat 1:1 — paginación e índices

Documentación del dominio de chat (EPIC-N07, feature F-N07-01). Este documento cubre las **queries de
referencia**, el **contrato del cursor** y los **índices** de paginación (I-F-N07-01-02). El modelo de datos
base (tablas, triggers, unicidad del par 1:1) vive en la migración `20260731000000_chat.sql`.

## Modelo de datos (resumen)

| Tabla | Columnas relevantes para paginación |
|---|---|
| `public.chats` | `id`, `last_message_at` (se actualiza por trigger en cada mensaje) |
| `public.chat_participants` | PK `(chat_id, user_id)`, `last_read_at` |
| `public.messages` | `id`, `chat_id`, `sender_id`, `content`, `created_at`, `edited_at`, `deleted_at` |

Los mensajes **no se borran físicamente**: el soft delete pone `deleted_at` y el cliente los muestra como
_"Mensaje eliminado"_. Por tanto la paginación **trae también** las filas con `deleted_at not null` (solo se
enmascara `content` en cliente); no se filtra por `deleted_at is null`.

## Índices (`20260731100000_chat_indexes.sql`)

| Índice | Definición | Sirve |
|---|---|---|
| `messages_chat_paging_idx` | `messages (chat_id, created_at desc, id desc)` | Paginación cursor-based del hilo |
| `chats_last_message_at_idx` | `chats (last_message_at desc)` | Ordenar "mis chats" por actividad |
| `chat_participants_user_idx` | `chat_participants (user_id, chat_id)` | Resolver los chats de un usuario + `is_chat_participant()` |
| `messages_active_idx` | `messages (chat_id, created_at) where deleted_at is null` | Conteo de no leídos por chat (F-N07-03, `my_chats_v`) |

**`messages.chat_id` no tenía índice** (Postgres no lo crea para la FK): sin `messages_chat_paging_idx` la
paginación haría un Seq Scan de toda la tabla.

### El índice parcial de mensajes activos

`messages_active_idx (chat_id, created_at) where deleted_at is null` (migración
`20260805100000_chat_unread_counts.sql`) es el índice parcial que #281 dejó **reservado** a propósito. Se
descartó entonces porque la paginación muestra los mensajes borrados y por tanto no filtra por
`deleted_at is null` — no había query que leyera solo mensajes activos. El **conteo de no leídos** de
`my_chats_v` es exactamente esa query (filtra `deleted_at is null` y un rango `created_at > last_read_at` por
chat), así que ahora el índice tiene consumidor: excluye las filas borradas del índice y sirve el rango por chat
sin tocar `messages_chat_paging_idx`.

## Queries de referencia

### Paginación del hilo (cursor-based, hacia atrás en el tiempo)

Orden fijo `created_at desc, id desc`; página de **30**. Consumida por el hook `useChat` (I-F-N07-03-01).

```sql
-- Primera página:
select id, chat_id, sender_id, content, created_at, edited_at, deleted_at
from public.messages
where chat_id = $1
order by created_at desc, id desc
limit 30;

-- Páginas siguientes, con cursor (created_at, id) de la última fila de la página previa:
select id, chat_id, sender_id, content, created_at, edited_at, deleted_at
from public.messages
where chat_id = $1
  and (created_at, id) < ($2, $3)   -- comparación de tupla (row-value)
order by created_at desc, id desc
limit 30;
```

La comparación de **tupla** `(created_at, id) < ($2, $3)` (no `created_at < $2 OR (...)`) es la que permite al
planner recorrer `messages_chat_paging_idx` en un único Index Scan, sin empates ni gaps aunque dos mensajes
compartan `created_at`. El `id` (uuid) es el desempate estable.

### Mis chats ordenados por actividad

```sql
select c.id, c.last_message_at
from public.chat_participants cp
join public.chats c on c.id = cp.chat_id
where cp.user_id = $1
order by c.last_message_at desc
limit 30;
```

`chat_participants_user_idx` resuelve el filtro por `user_id`; el orden final lo da `last_message_at desc`.

## Contrato del cursor

El cursor identifica de forma inequívoca la última fila entregada mediante la **tupla `(created_at, id)`**:

- **En la query** se pasa como dos parámetros posicionales (`$2 = created_at`, `$3 = id`) y se compara con
  `(created_at, id) < ($2, $3)`.
- **En transporte** (paginación de red / caché del hook) se serializa como string opaco
  **`"<created_at_iso>_<uuid>"`**, p. ej. `"2026-07-31T10:00:00.000Z_1f0a…c9"`. El cliente lo trata como
  opaco: lo parte por el **último** `_` (el uuid no contiene `_`; el ISO sí puede contener `:` y `.`, no `_`),
  reconstruye la tupla y la reenvía. `null` ⇒ primera página.
- El cursor **no** codifica dirección ni tamaño de página: la dirección es siempre "hacia atrás en el tiempo"
  y el tamaño es fijo (30).

## Presencia y typing (canales efímeros)

Presence (online/offline) y typing viajan por **Supabase Realtime** y **no se persisten en BD**. Se usan
**topics propios** por chat, distintos del `chat:<chatId>` que `useChat` usa para `postgres_changes`, para no
solapar dos canales con el mismo topic:

| Hook | Topic | Mecanismo | Devuelve |
|---|---|---|---|
| `usePresence(chatId)` | `presence:<chatId>` | Realtime **Presence** (`track`/`presenceState`, key = `userId`) | `onlineUserIds: string[]` |
| `useTyping(chatId)` | `typing:<chatId>` | Realtime **Broadcast** (event `typing`) | `typingUserIds: string[]`, `setTyping(isTyping)` |

### Contrato del broadcast `typing`

```jsonc
// channel.send({ type: 'broadcast', event: 'typing', payload })
{ "user_id": "<uuid del emisor>", "isTyping": true }
```

- El receptor **ignora su propio eco** (`payload.user_id === userId`).
- `setTyping(true)` emite `true` en el primer keypress; **debounce** de 3s de inactividad → emite `false`.
  `setTyping(false)` (o pasar la app a **background**) fuerza `false` inmediatamente.

### Presencia

- Al `SUBSCRIBED` se hace `channel.track({ at })`; `presenceState()` en el evento `sync` da los presentes
  (las **claves** de presence son el `userId`).
- **Background** → `untrack()`; **volver a activo** → `track()` de nuevo. Supabase retira por heartbeat a los
  ~30s sin conexión.

### Limpieza

Ambos hooks hacen `supabase.removeChannel(channel)` y quitan el listener de `AppState` en el cleanup del
efecto, así que no quedan canales activos al salir del chat.

## No leídos (`my_chats_v` + `useUnreadCount`)

El contador de no leídos por chat (I-F-N07-03-03) no persiste estado nuevo: se deriva de
`chat_participants.last_read_at` (ya existente) contra `messages`.

### Vista `my_chats_v` (`20260805100000_chat_unread_counts.sql`)

```sql
create view public.my_chats_v with (security_invoker = true) as
select c.id as chat_id, c.is_group, c.last_message_at, cp.last_read_at,
       (select count(*) from public.messages m
         where m.chat_id = c.id
           and m.created_at > cp.last_read_at
           and m.sender_id <> cp.user_id
           and m.deleted_at is null)::int as unread_count
from public.chats c
join public.chat_participants cp on cp.chat_id = c.id and cp.user_id = auth.uid();
```

- **`security_invoker = true`** (PG15+): la vista corre con la RLS del usuario que consulta, no del owner. El
  `join ... on cp.user_id = auth.uid()` acota las filas a mis chats y el subquery de mensajes se ve filtrado
  por la policy `messages_select_participant`.
- **`unread_count`** cuenta mensajes posteriores a **mi** `last_read_at`, enviados por **otro** (`sender_id <>
  cp.user_id`) y **no borrados**. Es por-espectador: los dos participantes de un chat ven contadores distintos.
- Edge cases: chat sin mensajes → `0`; el propio remitente nunca infla su unread (self-sent excluido).

### Hook `useUnreadCount`

- Lee `my_chats_v` (`listMyChats`) y devuelve `{ chats, totalUnread, markAsRead, refresh, loading, error }`.
- **Refetch en tiempo real**: se suscribe a `postgres_changes` INSERT de `messages` (canal `unread:messages`,
  sin filtro). Realtime respeta la RLS, así que solo llegan mensajes de mis chats; cada INSERT dispara un
  refetch de la vista.
- **`markAsRead(chatId)`**: pone el badge a `0` de forma **optimista** y persiste `last_read_at = now()`
  (`markChatAsRead`) con **throttle de 2 s por chat** (`MARK_READ_THROTTLE_MS`): la primera llamada escribe al
  vuelo; las siguientes dentro de la ventana se colapsan en un único flush al borde que persiste el `now()`
  final. Se dispara al abrir el chat y al llegar al fondo del hilo (scroll bottom).

### Badge `UnreadBadge`

Componente `components/ui/UnreadBadge` (`count`, `max = 99`): no renderiza nada cuando `count <= 0` (el badge se
oculta en 0) y satura a `max`+ (p. ej. `99+`). La lista de chats lo pinta con `unread_count`.

## Benchmark (validación de umbrales)

Scripts en `supabase/bench/` (solo BD local; **no** corren en CI, que solo ejecuta `supabase/tests/rls/`):

```bash
pnpm supabase:start        # Postgres local en :54322
pnpm bench:chat:seed       # siembra ~1M mensajes + ~10k chats (idempotente)
pnpm bench:chat:run        # EXPLAIN + percentiles p50/p95
```

Criterios de aceptación (#281) que valida `chat_bench_run.sql`:

| Escenario | Umbral | Comprobación |
|---|---|---|
| Paginación (30 filas) sobre hot chat de 100k mensajes (1M totales) | p95 ≤ 30 ms | arnés de 200 iteraciones |
| "Mis chats" con 10k chats del usuario | p95 ≤ 50 ms | arnés de 200 iteraciones |
| Plan de paginación | Index Scan usando `messages_chat_paging_idx` | `EXPLAIN (ANALYZE, BUFFERS)` — no Bitmap, no Seq Scan |

El seed desactiva los triggers durante la carga masiva y fija `last_message_at` de forma escalonada; usa
usuarios/`chat` throwaway con prefijos deterministas (`bench-*@nun-ibiza.dev`,
`00000000-0000-4000-9000-*`) que limpia al reejecutarse, sin tocar el seed de desarrollo.
