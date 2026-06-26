# ADR-004 — Arquitectura del chat en tiempo real: persistente / efímero

**Estado:** Aceptado
**Fecha:** 2026-06-27
**Autores:** Alex Zapata
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-04-01 #56](https://github.com/CodeCrafters-ES/pinboard-app/issues/56)

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

### Canal Realtime y mensajería efímera

Un único canal por chat activo: `chat:{chat_id}`.

```
canal: "chat:{chat_id}"
├── postgres_changes → tabla messages, filter: chat_id=eq.{chat_id}   (persistente)
├── broadcast → event: "typing"                                         (efímero)
│     payload: { user_id, is_typing }
│     debounce: emit cada 1–2 s mientras el usuario escribe
│     auto-clear: el receptor marca is_typing=false a los 3 s sin nuevo evento
└── presence → track: { user_id, online_at }                           (efímero)
```

El evento `postgres_changes` llega cuando un mensaje se inserta en BD, actualizando la lista en tiempo real sin necesidad de polling.

---

### Envío optimista

El cliente inserta el mensaje en su estado local con estado `pending` antes de recibir confirmación de Supabase. Al completarse el INSERT:

- Si tiene éxito: el mensaje pasa a `sent` (reconciliado por `id`).
- Si falla: el mensaje pasa a `failed` y se muestra un indicador de reintento.

```
pending → sent
       → failed → (reintento manual del usuario)
```

---

### Cola offline

Los mensajes enviados sin conexión se encolan en `AsyncStorage` bajo la clave `chat_outbox`. Al recuperar red (`NetInfo.addEventListener`), la cola se vacía en orden FIFO. La idempotencia se garantiza por `id` (UUID generado en cliente): un reintento del mismo mensaje produce un `INSERT … ON CONFLICT DO NOTHING` en el servidor.

---

### Contrato del hook `useChat(chatId)`

```ts
interface UseChatReturn {
  messages: Message[];        // Ordenados: más antiguo arriba, más reciente abajo
  hasMore: boolean;           // Hay páginas anteriores disponibles
  loadMore: () => void;       // Carga la página anterior (cursor-based)
  send: (content: string) => Promise<void>;
  participants: Participant[];
  typingUsers: string[];      // user_ids de quienes están escribiendo ahora
  presenceMap: Record<string, boolean>; // user_id → online
}
```

Responsabilidades internas del hook:

1. Carga inicial de los últimos 30 mensajes.
2. Suscripción Realtime `postgres_changes` para recibir mensajes nuevos.
3. Suscripción a Broadcast (`typing`) y Presence en el canal `chat:{chat_id}`.
4. Envío optimista con gestión de estados `pending / sent / failed`.
5. Vaciado de cola offline al recuperar conexión.
6. Limpieza de suscripciones en `useEffect` cleanup.

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

- [ADR-002](0002-rbac.md) — RLS policies (aplica a `chats`, `chat_participants`, `messages`)
- Consumidores: hook `useChat` (EPIC-N07) · pantalla de chat (EPIC-N07)
- Continúa en: [I-F-A00-04-02 #57](https://github.com/CodeCrafters-ES/pinboard-app/issues/57) — RLS policies del chat, canales Realtime y contrato completo del hook `useChat`
