# ADR-001 — Modelo de engagement: viewed / engaged / clicked

**Estado:** Aceptado
**Fecha:** 2026-06-26
**Autores:** Alex Zapata
**Issues:** [EPIC-A00 #45](https://github.com/CodeCrafters-ES/pinboard-app/issues/45) · [I-F-A00-01-01 #47](https://github.com/CodeCrafters-ES/pinboard-app/issues/47) · [I-F-A00-01-02 #48](https://github.com/CodeCrafters-ES/pinboard-app/issues/48)

---

## Contexto

Los posts de Nun Ibiza enlazan a contenido externo (noticias, artículos, comunicados). El usuario consume ese contenido fuera de la app, por lo que el tiempo de lectura in-app no es un indicador útil de interés real. Se necesita un modelo de métricas que:

- Capture el nivel de interés del usuario en el post dentro de la app.
- Identifique cuándo el usuario llega al contenido final (clic en enlace externo).
- Soporte el dashboard de engagement para managers y admins.
- Funcione de forma robusta en escenarios offline con reintentos.

---

## Decisión

### Métricas y tablas

| Métrica | Acción del usuario | Tabla | Clave natural | Operación |
|---|---|---|---|---|
| `viewed` | Abrir la card del post | `engagement_sessions` | `(user_id, post_id)` | INSERT → `status = 'viewed'` |
| `link_clicked` | Activar el enlace externo | `engagement_sessions` | `(user_id, post_id)` | UPSERT → `link_clicked = true`, `status = 'clicked'` |
| `reaction_type` | Reaccionar (like / dislike / love) | `post_reactions` | `(user_id, post_id)` | UPSERT — una reacción activa por usuario por post |
| `rating` | Valorar con estrellas | `post_ratings` | `(user_id, post_id)` | UPSERT — una valoración actualizable (1–5) |
| `comment` | Publicar comentario | `post_comments` | `(author_id, post_id)` | INSERT — múltiples comentarios permitidos |

La métrica de éxito principal es `link_clicked`: representa el consumo real del contenido. Las métricas `reaction_type`, `rating` y `comment` indican implicación aunque el usuario no llegue al contenido externo. `viewed` es la métrica mínima de alcance.

### Estados de negocio de la sesión

```
[sin sesión]
      │  abrir card
      ▼
   viewed
      │  reaccionar / valorar / comentar
      ▼
  engaged ──── clic enlace externo ───▶ clicked
      │                                    ▲
      └──────────── clic enlace externo ───┘
```

| Estado (`status`) | Condición |
|---|---|
| `viewed` | Sesión creada al abrir la card; sin interacción activa |
| `engaged` | Al menos una reacción, valoración o comentario; sin clic en enlace |
| `clicked` | `link_clicked = true`; estado final — no puede retroceder |

El campo `status` de `engagement_sessions` persiste directamente el estado de negocio. `clicked` es un estado absorbente: ningún evento posterior puede revertirlo.

### Esquema SQL canónico

```sql
-- engagement_sessions
-- Una sesión por par (user_id, post_id). Escritura exclusiva vía Edge Function track-engagement.
create table public.engagement_sessions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  post_id      uuid        not null references public.posts(id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  link_clicked boolean     not null default false,
  status       text        not null default 'viewed'
                           check (status in ('viewed', 'engaged', 'clicked')),
  device       text,
  unique (user_id, post_id)
);

create index engagement_sessions_post_id_status_idx
  on public.engagement_sessions (post_id, status);
-- la restricción UNIQUE crea implícitamente el índice en (user_id, post_id)


-- post_reactions
-- Una reacción activa por usuario por post (upsert-friendly vía PK compuesta).
create table public.post_reactions (
  post_id    uuid        not null references public.posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  reaction   text        not null check (reaction in ('like', 'dislike', 'love')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);


-- post_ratings
-- Una valoración actualizable por usuario por post.
create table public.post_ratings (
  post_id    uuid        not null references public.posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  score      smallint    not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
```

### Reglas de transición de estado

| Evento | Estado actual | Nuevo `status` | Nuevo `link_clicked` |
|---|---|---|---|
| `viewed` (abrir card, sesión nueva) | — | `viewed` | `false` |
| `viewed` (abrir card, sesión existente) | cualquiera | sin cambio | sin cambio |
| `reaction` / `rating` / `comment` | `viewed` | `engaged` | sin cambio |
| `reaction` / `rating` / `comment` | `engaged` | `engaged` | sin cambio |
| `reaction` / `rating` / `comment` | `clicked` | `clicked` (estado final) | sin cambio |
| `link_clicked` | cualquiera | `clicked` | `true` |

**Invariante:** `link_clicked` nunca puede volver a `false` una vez establecido como `true`. La Edge Function debe ignorar o rechazar payloads que intenten revertirlo.

### Contrato de la Edge Function track-engagement

**Ruta:** `POST /functions/v1/track-engagement`

**Autenticación:** JWT de Supabase en header `Authorization: Bearer <token>`.

**Request body:**

```json
{
  "post_id":    "uuid",
  "session_id": "uuid-v4",
  "event":      "viewed" | "reaction" | "rating" | "comment" | "link_clicked",
  "device":     "ios" | "android" | null
}
```

**Validaciones:**
1. JWT válido: `auth.uid()` extraído del token es el `user_id` que se persiste — nunca aceptado del body.
2. `post_id` existe en `public.posts`.
3. `event` es uno de los cinco valores permitidos.
4. Si `event = 'link_clicked'` y `link_clicked` ya es `true`, la operación es idempotente: `200 OK` sin escritura.

**Lógica UPSERT (pseudoSQL):**

```sql
insert into engagement_sessions (user_id, post_id, status, link_clicked, device)
values (auth_uid, post_id, 'viewed', false, device)
on conflict (user_id, post_id) do update set
  last_seen_at = now(),
  status = case
    when event = 'link_clicked'                        then 'clicked'
    when engagement_sessions.status = 'clicked'        then 'clicked'
    when event in ('reaction', 'rating', 'comment')    then 'engaged'
    else engagement_sessions.status
  end,
  link_clicked = engagement_sessions.link_clicked
              or (event = 'link_clicked');
```

**Response:** `{ "ok": true }` con HTTP 200 en todos los casos, incluidos los idempotentes.

La función usa `SUPABASE_SERVICE_ROLE_KEY` para omitir RLS y escribir directamente en `engagement_sessions`.

### Cola offline (link_clicked)

El evento `link_clicked` puede ocurrir sin conexión (el usuario toca el enlace antes de que la app tenga red). El cliente debe:

1. Llamar `Linking.openURL(post.external_url)` inmediatamente — no bloquear por red.
2. Intentar `POST /track-engagement` con `{ event: 'link_clicked', session_id, post_id }`.
3. Si la llamada falla por error de red, encolar el payload en `AsyncStorage` bajo la clave `engagement_queue`.
4. Al detectar recuperación de red (`NetInfo.addEventListener`), vaciar la cola y reenviar cada payload.
5. Idempotencia garantizada: la Edge Function ignora reintentos del mismo `session_id` + `post_id` + `event = 'link_clicked'` si `link_clicked` ya es `true`.

### Vista materializada post_engagement_daily

```sql
create materialized view public.post_engagement_daily as
select
  es.post_id,
  date_trunc('day', es.started_at)::date                       as day,
  count(distinct es.user_id)                                   as unique_views,
  count(distinct es.user_id) filter (where es.link_clicked)    as unique_clicks,
  round(
    count(distinct es.user_id) filter (where es.link_clicked)::numeric
    / nullif(count(distinct es.user_id), 0) * 100, 2
  )                                                            as click_rate,
  round(avg(pr.score), 2)                                      as avg_rating,
  count(distinct prx.user_id)                                  as total_reactions
from public.engagement_sessions es
left join public.post_ratings   pr  on pr.post_id  = es.post_id
left join public.post_reactions prx on prx.post_id = es.post_id
group by es.post_id, date_trunc('day', es.started_at)::date;

create unique index post_engagement_daily_pk
  on public.post_engagement_daily (post_id, day);

-- Refresco horario vía pg_cron (requiere extensión pg_cron habilitada)
select cron.schedule(
  'refresh-post-engagement-daily',
  '0 * * * *',
  $$ refresh materialized view concurrently public.post_engagement_daily $$
);
```

El índice único sobre `(post_id, day)` es necesario para `REFRESH CONCURRENTLY`: permite refrescar sin bloquear lecturas del dashboard.

### Sesión y deduplicación

Se define una **sesión única por par (user\_id, post\_id)** almacenada en `engagement_sessions`. La deduplicación opera en dos niveles:

**A nivel de base de datos:** restricción `UNIQUE(user_id, post_id)`. La Edge Function `track-engagement` usa upsert sobre esa clave; múltiples envíos del mismo evento actualizan la sesión existente.

**A nivel de cliente (offline):** el cliente genera un `session_id` (UUID v4) al abrir la card y lo encola en `AsyncStorage` junto a los eventos pendientes. Al recuperar conectividad, los reintentos incluyen el mismo `session_id`, permitiendo a la Edge Function descartar envíos duplicados por idempotencia.

### Arquitectura de escritura

- **Solo** la Edge Function `track-engagement` (con `service_role`) escribe en `engagement_sessions`. Los clientes autenticados no tienen políticas `INSERT`/`UPDATE`/`DELETE` sobre esa tabla.
- `post_reactions`, `post_ratings` y `post_comments` se escriben directamente desde el cliente con sus políticas RLS definidas en [ADR-002](0002-rbac.md).

---

## Consecuencias

**Positivas:**

- Un único `SELECT` por (usuario, post) proporciona el estado completo de engagement para el dashboard.
- La restricción `UNIQUE(user_id, post_id)` hace el modelo naturalmente idempotente.
- `status` como estado de negocio directo simplifica las queries del dashboard (sin derivar estado de múltiples tablas).
- `REFRESH CONCURRENTLY` en la vista materializada garantiza lecturas sin bloqueo durante el refresco horario.

**Negativas / limitaciones conocidas:**

- La vista materializada introduce un lag máximo de 1 hora en los datos del dashboard (no es tiempo real).
- El estado `engaged` en `engagement_sessions` no implica que las métricas derivadas (`post_reactions`, etc.) tengan datos: si el usuario reaccionó y luego eliminó la reacción, `status` puede quedar en `engaged` sin reflejo actual en `post_reactions`.
- Si un usuario reacciona sin haber abierto la card, no existirá sesión en `engagement_sessions`; el dashboard mostrará interacción sin `viewed`.

---

## Opciones evaluadas

### Opción B — Log de eventos append-only

Cada interacción genera una fila nueva en una tabla de eventos.

**Pros:** historial completo, auditable, fácil de extender.

**Contras:** agregaciones costosas en queries de dashboard (GROUP BY sobre millones de filas); mayor almacenamiento; deduplicación más compleja (requiere `DISTINCT ON` o ventanas). Descartado por complejidad operacional desproporcionada al tamaño del equipo.

### Opción C — Tiempo de lectura in-app como métrica principal

Registrar cuántos segundos pasa el usuario en la pantalla del post.

**Pros:** métrica familiar en análisis de contenido.

**Contras:** el contenido es externo; el tiempo in-app mide el tiempo leyendo el título y la imagen, no el artículo. No predice consumo real. Descartado por irrelevancia semántica.

---

## Referencias

- `supabase/migrations/20260618500000_create_engagement_sessions_table.sql` — tabla `engagement_sessions` (migración inicial; el campo `status` debe actualizarse para reflejar los valores canónicos de este ADR)
- `supabase/migrations/20260618600000_rls_engagement_sessions.sql` — políticas RLS
- `supabase/migrations/20260618100000_create_posts_tables.sql` — tablas `post_reactions`, `post_ratings`, `post_comments`
- [ADR-002](0002-rbac.md) — RBAC y jerarquía de roles (políticas RLS de interacciones)
- Consumidores: Edge Function `track-engagement` (EPIC-N04) · hook `usePostEngagement` (EPIC-N04) · RLS policies de `engagement_sessions` (EPIC-S00)
