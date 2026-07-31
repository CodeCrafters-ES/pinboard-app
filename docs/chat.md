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

**`messages.chat_id` no tenía índice** (Postgres no lo crea para la FK): sin `messages_chat_paging_idx` la
paginación haría un Seq Scan de toda la tabla.

### Por qué NO hay índice parcial de mensajes activos

El issue #281 proponía además `messages_active_idx (chat_id, created_at desc) where deleted_at is null`. Se
**descarta a propósito**: como la paginación muestra los mensajes borrados (ver arriba), la query no filtra por
`deleted_at is null` y ya la cubre `messages_chat_paging_idx`. No existe hoy ninguna query que lea solo
mensajes activos, así que el índice parcial sería peso muerto en cada `INSERT`/soft-delete. Se añadirá junto a
la query que lo justifique (p. ej. el conteo de no leídos de F-N07-03) si surge la necesidad.

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
