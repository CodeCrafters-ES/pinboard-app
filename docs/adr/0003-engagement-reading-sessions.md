# ADR-0003 — Modelo de engagement por sesión de lectura: viewed / skimmed / read

**Estado:** Aceptado
**Fecha:** 2026-07-09
**Supersedes:** [ADR-001](0001-engagement.md)
**Issues:** [EPIC-N04 #172](https://github.com/CodeCrafters-ES/pinboard-app/issues/172) · [F-N04-02 #174](https://github.com/CodeCrafters-ES/pinboard-app/issues/174) · [I-F-N04-02-01 #178](https://github.com/CodeCrafters-ES/pinboard-app/issues/178)

---

## Contexto

[ADR-001](0001-engagement.md) modeló el engagement como **una fila por `(user_id, post_id)`** con estados de negocio `viewed → engaged → clicked`, siendo `link_clicked` la métrica de éxito, y **rechazó** medir el tiempo de lectura in-app por considerarlo semánticamente irrelevante (el contenido vive fuera de la app).

La EPIC-N04 revisa esa decisión: aunque el artículo sea externo, el **comportamiento in-app antes del clic** (cuánto foco real y cuánto scroll dedica el usuario a la card/preview) sí es una señal útil de interés editorial, y es lo que el cliente ya captura (hook `usePostEngagement`, #176/#177: `focused_seconds`, `max_scroll_pct`, `session_id`). ADR-001 y ese cliente son incompatibles; este ADR resuelve el conflicto adoptando el modelo por sesión.

## Decisión

### Modelo de datos

**Una fila por sesión de lectura**, identificada por un `session_id` (UUID v4 generado en el cliente al abrir la card). A diferencia de ADR-001, **no** hay unicidad por `(user_id, post_id)`: cada apertura de pantalla es una sesión nueva.

```sql
create type public.engagement_state as enum ('viewed', 'skimmed', 'read');

create table public.engagement_sessions (
  session_id      uuid         primary key,
  post_id         uuid         not null references public.posts(id)    on delete cascade,
  user_id         uuid         not null references public.profiles(id) on delete cascade,
  focused_seconds integer      not null default 0 check (focused_seconds >= 0),
  max_scroll_pct  numeric(4,3) not null default 0 check (max_scroll_pct between 0 and 1),
  state           public.engagement_state not null default 'viewed',
  started_at      timestamptz  not null default now(),
  updated_at      timestamptz  not null default now()
);
```

- `focused_seconds`: segundos de foco in-app acumulados. El cliente envía **deltas** por heartbeat (5s); la Edge Function los suma.
- `max_scroll_pct`: máximo scroll alcanzado en la sesión, monotónico ∈ [0, 1].
- `state`: estado **derivado por el servidor** (nunca aceptado del cliente).

### Estados y umbrales

| Estado | Condición |
|---|---|
| `viewed` | Sesión creada al abrir la card (estado inicial). |
| `skimmed` | `max_scroll_pct ≥ 0.70`. |
| `read` | `focused_seconds ≥ N` **y** `max_scroll_pct ≥ 0.70`, donde `N = max(15, palabras / 4)`. |

`palabras` proviene de `posts.word_count` (EPIC-N02). El estado solo avanza; nunca retrocede.

### FK a `profiles(id)`

`user_id` referencia `public.profiles(id)` (no `auth.users`). Consecuencia: **almacena `profiles.id`, no `auth.uid()`**. Implicaciones para las issues consumidoras:

- **Edge Function `track-engagement` (#179):** debe resolver `profiles.id` a partir de `auth.uid()` antes de escribir.
- **Policies RLS (EPIC-S00 / I-F-S00-04-05):** la comprobación de propiedad es `user_id in (select id from public.profiles where user_id = auth.uid())`, no el patrón directo `user_id = auth.uid()` usado en otras tablas.

### Arquitectura de escritura

Igual que ADR-001: **solo** la Edge Function `track-engagement` (con `service_role`) escribe en `engagement_sessions`. Los clientes autenticados no tienen policies de escritura; la lectura (own / manager-admin, para el dashboard) se define en EPIC-S00.

## Consecuencias

**Positivas:**

- Captura granular del comportamiento de lectura (tiempo + scroll) que ADR-001 descartaba.
- El `session_id` como PK hace el UPSERT idempotente por sesión (reintentos de la cola offline no duplican).
- Alinea el servidor con el cliente ya mergeado (#173).

**Negativas / limitaciones:**

- Varias filas por (usuario, post) → el dashboard debe agregar (`count(distinct user_id)`, `avg`, etc.).
- La FK a `profiles(id)` rompe el patrón `user_id = auth.uid()` y obliga a mapear en Edge Function y policies.
- Reemplazar la tabla de ADR-001 deja temporalmente incoherente la Edge Function de `link_clicked` (N03-04) hasta #179.
- El tiempo in-app mide interés sobre la card/preview, no lectura del artículo externo (la crítica de ADR-001 sigue siendo parcialmente válida; se asume como proxy).

## Referencias

- `supabase/migrations/20260710000000_replace_engagement_sessions_n04_schema.sql` — tabla del nuevo modelo.
- `supabase/tests/rls/schema_engagement_sessions.sql` — tests de estructura y constraints.
- [ADR-001](0001-engagement.md) — modelo anterior (superseded).
- Consumidores: Edge Function `track-engagement` (#179) · hook `usePostEngagement` (#176/#177) · policies RLS (EPIC-S00).
