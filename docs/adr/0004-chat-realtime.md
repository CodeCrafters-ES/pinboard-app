# ADR-004 — Arquitectura del chat en tiempo real: persistente / efímero

**Estado:** Aceptado
**Fecha:** 2026-06-27
**Autores:** Alex Zapata
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-04-01 #56](https://github.com/CodeCrafters-ES/pinboard-app/issues/56) · [I-F-A00-04-02 #57](https://github.com/CodeCrafters-ES/pinboard-app/issues/57)

---

## Contexto

El chat 1:1 de Nun Ibiza requiere mensajería en tiempo real entre dos empleados. Las necesidades son de naturaleza distinta:

- **Persistencia:** el historial de mensajes debe sobrevivir a cierres de sesión, reinstalaciones y cambios de dispositivo.
- **Efímero:** el estado online de un participante y el indicador de escritura son relevantes solo mientras la sesión está activa; persistirlos en base de datos añadiría escrituras sin valor duradero.

Mezclar ambas necesidades en un solo mecanismo (Postgres o Broadcast) produce un modelo innecesariamente complejo o caro. Se necesita una separación clara de responsabilidades.

---

## Decisión

### Separación persistente / efímero

| Canal | Mecanismo Supabase | Qué viaja por él |
|---|---|---|
| **Persistente** | Postgres + Realtime `postgres_changes` | Mensajes, participantes, `last_read_at` |
| **Efímero** | Realtime **Broadcast** | Typing indicator (sin escritura en BD) |
| **Efímero** | Realtime **Presence** | Estado online (sin escritura en BD) |

El cliente se suscribe a cambios Postgres en la tabla `messages` para el `chat_id` activo. Los eventos Broadcast y Presence corren en el mismo canal `chat:{chat_id}` pero nunca tocan Postgres.

---

### Modelo SQL

#### Tabla `chats`

```sql
create table public.chats (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  is_group   boolean     not null default false
);
```

> `is_group` reservado para uso futuro. En v1 todos los chats son 1:1.

#### Tabla `chat_participants`

```sql
create table public.chat_participants (
  chat_id      uuid        not null references public.chats(id) on delete cascade,
  user_id      uuid        not null references auth.users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (chat_id, user_id)
);
```

`last_read_at` marca el punto hasta donde el usuario ha leído. Se usa para calcular el badge de mensajes no leídos: `count(*) from messages where chat_id = $id and created_at > last_read_at`.

#### Tabla `messages`

```sql
create table public.messages (
  id         uuid        primary key default gen_random_uuid(),
  chat_id    uuid        not null references public.chats(id) on delete cascade,
  sender_id  uuid        not null references auth.users(id) on delete cascade,
  content    text        not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

`deleted_at` implementa soft-delete: el cliente no muestra el mensaje si `deleted_at is not null`, pero el historial de la conversación permanece coherente (sin huecos visuales).

---

### Índices

```sql
-- Índice compuesto para paginación cursor-based y stream Realtime filtrado por chat.
create index messages_chat_pagination_idx
  on public.messages (chat_id, created_at desc, id desc);
```

El orden `(chat_id, created_at DESC, id DESC)` soporta directamente la query de paginación (ver sección siguiente). El campo `id` como tercer componente desambigua mensajes con el mismo `created_at` (escrituras concurrentes en el mismo milisegundo).

---

### RLS Policies

#### Helper SECURITY DEFINER

Las policies de `chat_participants` se referencian mutuamente (un participante necesita ver a los demás participantes del mismo chat). Para evitar recursión infinita en RLS, se usa un helper SECURITY DEFINER que omite las policies al ejecutar la subquery:

```sql
create or replace function public.is_chat_participant(p_chat_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.chat_participants
    where chat_id = p_chat_id
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_chat_participant(uuid) from public;
grant execute on function public.is_chat_participant(uuid) to authenticated;
```

#### Tabla `chats`

```sql
-- SELECT: solo si el usuario figura como participante del chat
create policy "chats_select" on public.chats
  for select to authenticated
  using (public.is_chat_participant(id));

-- INSERT: cualquier usuario autenticado puede iniciar un chat
-- La participación se registra en chat_participants inmediatamente después
create policy "chats_insert" on public.chats
  for insert to authenticated
  with check (true);
```

#### Tabla `chat_participants`

```sql
-- SELECT: ver todos los participantes de los chats en los que participo
-- Usa el helper para evitar recursión RLS
create policy "chat_participants_select" on public.chat_participants
  for select to authenticated
  using (public.is_chat_participant(chat_id));

-- INSERT: añadirse uno mismo; admin puede añadir a cualquier usuario
create policy "chat_participants_insert" on public.chat_participants
  for insert to authenticated
  with check (user_id = auth.uid() or is_admin());
```

#### Tabla `messages`

```sql
-- SELECT: solo participantes del chat pueden leer sus mensajes
create policy "messages_select" on public.messages
  for select to authenticated
  using (public.is_chat_participant(chat_id));

-- INSERT: el sender_id debe ser el usuario autenticado y debe ser participante
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_chat_participant(chat_id)
  );

-- UPDATE: solo el remitente puede editar el contenido o hacer soft-delete (deleted_at)
create policy "messages_update" on public.messages
  for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());
```

> `DELETE` físico no está permitido en ningún rol de cliente. El soft-delete (`deleted_at = now()`) pasa por la policy de UPDATE.

---

### Estrategia de paginación cursor-based

La paginación con `OFFSET` es O(n) en Postgres y produce resultados inestables cuando se insertan mensajes nuevos mientras el usuario pagina. Se usa en su lugar un cursor de tupla.

**Cursor:** la tupla `(created_at, id)` del mensaje más antiguo visible en pantalla.

**Page size:** 30 mensajes por página.

**Carga inicial** (página más reciente):

```sql
select *
from public.messages
where chat_id = $chat_id
  and deleted_at is null
order by created_at desc, id desc
limit 30;
```

**Página anterior** (mensajes más antiguos que el cursor):

```sql
select *
from public.messages
where chat_id = $chat_id
  and deleted_at is null
  and (created_at, id) < ($cursor_at, $cursor_id)
order by created_at desc, id desc
limit 30;
```

El cliente invierte el resultado antes de renderizar (el mensaje más antiguo arriba, el más reciente abajo). El cursor para la siguiente página es `(created_at, id)` del último elemento devuelto. Si la query devuelve menos de 30 resultados, no hay más páginas.

---

### Canales Supabase Realtime

Un único canal por chat activo agrupa el stream persistente y los canales efímeros: `chat:{chat_id}`.

#### Canal persistente — `postgres_changes`

```ts
supabase
  .channel(`chat:${chatId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
    filter: `chat_id=eq.${chatId}`,
  }, handleNewMessage)
  .subscribe();
```

Cuando un participante inserta un mensaje, todos los suscriptores reciben el evento sin polling. Los mensajes con `deleted_at is not null` se filtran en el cliente al renderizar.

#### Canal efímero — Broadcast `typing`

```ts
interface TypingPayload {
  user_id: string;
  typing: boolean;
}
```

- **Canal:** `chat:{chat_id}` · **Evento:** `"typing"`.
- El emisor envía `typing: true` con debounce de 1–2 s mientras escribe; `typing: false` inmediatamente al hacer blur del campo.
- El receptor elimina al usuario de `typingUsers` 3 s después del último evento `typing: true` (auto-clear sin necesidad de evento explícito de cierre).
- **No persiste en Postgres.**

#### Canal efímero — Presence `online`

```ts
interface OnlineState {
  user_id: string;
  online_at: string; // ISO 8601
}
```

- El cliente llama a `channel.track({ user_id, online_at: new Date().toISOString() })` al montar el hook.
- Al desmontar (`useEffect` cleanup), el canal libera la presencia automáticamente.
- `presenceMap` agrega el estado de todos los participantes: `Record<string, boolean>` (`user_id → online`).
- **No persiste en Postgres.**

---

### Envío optimista

El cliente inserta el mensaje en su estado local con estado `pending` antes de recibir confirmación de Supabase. Al completarse el INSERT:

- Si tiene éxito: el mensaje pasa a `sent` (reconciliado por `id`).
- Si falla: el mensaje pasa a `failed` y se muestra un indicador de reintento.

```text
pending → sent
       → failed → (reintento manual del usuario)
```

---

### Cola offline

Los mensajes enviados sin conexión se encolan en `AsyncStorage` bajo la clave `chat_outbox`. Al recuperar red (`NetInfo.addEventListener`), la cola se vacía en orden FIFO. La idempotencia se garantiza por `id` (UUID generado en cliente): un reintento del mismo mensaje produce un `INSERT … ON CONFLICT DO NOTHING` en el servidor.

---

### Contrato del hook `useChat(chatId)`

#### Firma y tipos

```ts
// Estado optimista de un mensaje en tránsito (solo en cliente, nunca persiste)
type MessageStatus = 'pending' | 'sent' | 'failed';

interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;        // ISO 8601
  deleted_at: string | null;
  _status?: MessageStatus;   // presente solo en mensajes optimistas
}

interface Participant {
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  profile: {
    full_name: string;
    avatar_url: string | null;
  };
}

interface UseChatReturn {
  // Estado
  messages: Message[];                       // más antiguo arriba, más reciente abajo
  participants: Participant[];
  isLoading: boolean;                        // true durante la carga inicial
  hasMore: boolean;                          // hay páginas anteriores disponibles
  typingUsers: string[];                     // user_ids escribiendo en este momento
  presenceMap: Record<string, boolean>;      // user_id → online
  // Métodos
  sendMessage: (content: string) => Promise<void>;
  loadMore: () => void;                      // carga la página anterior (cursor-based)
  markAsRead: () => Promise<void>;           // actualiza last_read_at en chat_participants
  setTyping: (typing: boolean) => void;      // emite Broadcast typing con debounce interno
}

function useChat(chatId: string): UseChatReturn;
```

#### Responsabilidades internas

1. **Carga inicial:** SELECT últimos 30 mensajes (`deleted_at is null`) + participantes con sus perfiles. Establece `isLoading = true` hasta completar.
2. **`postgres_changes`:** suscripción INSERT en `messages` filtrada por `chat_id`. Añade el mensaje recibido al final del array y reconcilia con mensajes optimistas por `id`.
3. **Broadcast `typing`:** suscripción al evento `"typing"` en el canal `chat:{chatId}`. Mantiene `typingUsers` con auto-clear de 3 s.
4. **Presence:** `channel.track({ user_id, online_at })` al montar; agrega `presenceMap` en cada sync.
5. **`sendMessage`:** genera UUID en cliente → INSERT optimista (`_status: 'pending'`) → confirma como `sent` o marca `failed`.
6. **`markAsRead`:** UPSERT en `chat_participants` con `last_read_at = now()` para el `user_id` autenticado.
7. **`setTyping`:** debounce interno de 1–2 s; emite `typing: false` inmediatamente al recibir `false`.
8. **Cola offline:** vacía `chat_outbox` de AsyncStorage al recuperar red (`NetInfo.addEventListener`).
9. **Cleanup:** `supabase.removeChannel(channel)` en el return del `useEffect`.

---

## Consecuencias

**Positivas:**

- El historial es durable y consistente: sobrevive a reconexiones, cierres de app y cambios de dispositivo.
- El typing indicator y la presencia online son baratos: no generan escrituras en Postgres.
- La paginación cursor-based es O(log n) gracias al índice compuesto y estable ante inserciones concurrentes.
- El envío optimista mejora la percepción de latencia sin comprometer la consistencia.

**Negativas / limitaciones conocidas:**

- `deleted_at` no elimina el mensaje del historial paginado: los clientes más antiguos que ya lo cargaron siguen viéndolo hasta que actualizan. Aceptable para v1.
- La presencia Realtime expone el estado online a todos los participantes del canal; no hay granularidad de privacidad por usuario en v1.
- El canal único por chat implica que todos los participantes reciben todos los eventos Broadcast aunque solo sean relevantes para uno. Con chats 1:1 el impacto es mínimo.

---

## Opciones evaluadas

### Opción B — Polling REST cada N segundos

El cliente hace `GET /messages?after=<timestamp>` cada 2–5 s.

**Pros:** sin WebSockets; compatible con cualquier backend.

**Contras:** latencia perceptible (hasta N s de retraso), carga constante en Postgres incluso sin actividad. Descartado por experiencia de usuario inferior.

### Opción C — Todos los eventos por Broadcast (sin postgres_changes)

Los mensajes también viajan por Broadcast y el INSERT en Postgres lo hace el receptor.

**Pros:** menor latencia percibida.

**Contras:** el remitente no sabe si el mensaje fue guardado; sin reconexión automática los mensajes se pierden; RLS no aplica en Broadcast. Descartado por inconsistencia en escenarios de red inestable.

---

## Referencias

- [ADR-002](0002-rbac.md) — helpers `is_admin()` / `is_manager()` / `is_staff()` (reutilizados en policies de chat)
- Consumidores: hook `useChat` (EPIC-N07 · `I-F-N07-03-01`) · RLS migrations (EPIC-N07 · `I-F-N07-02-01` / `I-F-N07-02-02`) · pantalla de chat (EPIC-N07)
