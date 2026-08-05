# ADR-007 — Gamificación: puntos por engagement y ranking

**Estado:** Aceptado — arquitectura y valores numéricos aprobados (spec «Reglas de gamificación», 2026-07-30). Implementado en F-N08-01.
**Fecha:** 2026-07-30 · **Actualizado:** 2026-08-05 (implementación I-F-N08-01-01 / I-F-N08-01-02)
**Autores:** Alex Zapata
**Issues:** EPIC-N08 · F-N08-01 · F-N08-02 · I-F-N08-01-01/02 · I-F-N08-02-01/02

---

## Contexto

La gamificación (EPIC-N08) busca fomentar la **participación real** de los empleados con el contenido del tablón, premiando las acciones de mayor valor (leer el enlace externo) por encima de la simple apertura, sin convertirlo en una competición tóxica.

Las señales ya existen en el modelo: `engagement_sessions` (estados `viewed`/`engaged`/`clicked`, [ADR-001](0001-engagement.md)), `post_reactions`, `post_ratings` y `post_comments` (EPIC-N03). Falta decidir: (1) qué acciones puntúan y cuánto, (2) cómo persistir los puntos de forma idempotente y auditable, y (3) cómo servir un leaderboard barato sin exponer datos personales.

Restricción transversal: en el proyecto `profiles.id` **≠** `auth.uid()` (la FK a `auth.users` es `profiles.user_id`). Toda clave de usuario en tablas de puntos debe referenciar `auth.users(id)` para que la RLS `user_id = auth.uid()` funcione, como en el resto de tablas (events, reactions, engagement).

---

## Decisión

### Valores por acción (fuente: spec «Reglas de gamificación — Spec de puntos y ranking»)

| Acción | Puntos | Fuente |
|---|---|---|
| Clic en enlace externo (`link_clicked`) | 10 | `engagement_sessions` |
| Comentario | 5 | `post_comments` |
| Valoración (1–5) | 3 | `post_ratings` |
| Reacción (like/dislike/love) | 2 | `post_reactions` |
| Vista de la card (`viewed`) | 1 | `engagement_sessions` |

Valores aprobados por el cliente el 2026-07-30. Cambiarlos exige una migración nueva: los puntos ya adjudicados **no** se recalculan (`user_points` es un histórico, no una proyección).

### Idempotencia y anti-farming

Una fila de puntos por `(user_id, source_type, source_id = post_id)`. Cada acción puntúa **una sola vez por post**; cambiar la reacción/valoración o recomentar no suma extra. Máximo natural **21 pts/post/usuario** (1+10+2+3+5). **No hay tope diario**: la idempotencia por acción ya limita el farming.

### Persistencia — Opción A: tabla `user_points` (elegida)

Se elige persistencia desnormalizada (tabla + triggers) frente a cálculo derivado, por permitir idempotencia + auditoría sin lógica en el cliente.

```sql
create type points_source as enum
  ('post_viewed', 'post_clicked', 'post_reacted', 'post_rated', 'post_commented');

create table public.user_points (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,  -- = auth.uid()
  source_type points_source not null,
  source_id   uuid not null,          -- post_id
  points      int  not null check (points >= 0),
  awarded_at  timestamptz not null default now()
);
create unique index user_points_uniq_source on public.user_points (user_id, source_type, source_id);

alter table public.user_points enable row level security;
-- SELECT: propio o admin; escritura solo vía triggers SECURITY DEFINER
create policy user_points_select_own on public.user_points
  for select using (user_id = auth.uid() or is_admin());
revoke insert, update, delete on public.user_points from authenticated, anon;
```

Un helper `award_points()` idempotente (`insert … on conflict do nothing`) y **un trigger por tabla fuente**: `engagement_sessions` (vista 1 al abrir, clic 10 cuando `status = 'clicked'`/`link_clicked`), `post_reactions` (2), `post_ratings` (3), `post_comments` (5, solo si `deleted_at is null`). Detalle en I-F-N08-01-01.

### Opción B (descartada): cálculo derivado

Vista materializada que agrega las 5 acciones desde las tablas fuente con refresco horario (`pg_cron`). Descartada: dificulta la idempotencia por acción y la auditoría, y el refresco no es instantáneo.

### Leaderboard

Función RPC `leaderboard(period_start, period_end, limit_n)` `SECURITY DEFINER` que agrega `user_points` por rango, ordena por puntos desc (desempate por `min(awarded_at)` asc) y añade la fila propia (`is_self`) si el usuario queda fuera del top N. Devuelve `full_name` (vista `profiles_public`) + `avatar_url`; **nunca emails**. Ventanas semanal (lunes 00:00 → domingo 23:59) y mensual, en `Europe/Madrid`. `user_points` no se expone por SELECT directo al cliente.

---

## Implementación (F-N08-01)

| Migración | Contenido | Issue |
|---|---|---|
| `20260808000000_create_user_points_n08_01_02.sql` | Enum `points_source`, tabla `user_points`, índice único `(user_id, source_type, source_id)`, índices de lectura por usuario y por fecha, RLS `user_points_select_own` | I-F-N08-01-02 |
| `20260808000001_user_points_rules_n08_01_01.sql` | Helper `award_points()` + 4 trigger functions `award_points_*` con sus triggers | I-F-N08-01-01 |

Detalles que fija la implementación:

- **Grants.** `auto_expose_new_tables` está desactivado, así que la tabla nace sin privilegios: se concede solo `select` a `authenticated` (para «mis puntos») y se revoca `insert/update/delete` de forma explícita. Las funciones `award_points*` tienen `EXECUTE` revocado a `public`, `anon` y `authenticated`: solo las invocan los triggers, y Postgres no comprueba `EXECUTE` al dispararlos.
- **Trigger de engagement.** `after insert or update of status, link_clicked`: la RPC `apply_engagement_events` fija siempre esas dos columnas, mientras que acumular `focused_seconds` / `max_scroll_pct` (ADR-006) no debe repuntuar.
- **`source_id` sin FK a `posts`.** Los puntos ganados sobreviven al borrado del post, para no falsear el histórico del ranking.
- **Comentarios: sin `deleted_at`.** El diseño original preveía puntuar solo comentarios no borrados, pero `post_comments` usa borrado duro (`post_comments_delete_self_or_admin`) y no tiene columna `deleted_at`. El trigger puntúa al insertar y borrar el comentario **no** retira los 5 puntos — coherente con la regla general de que deshacer una acción no altera los puntos ya otorgados (ídem reacción borrada). Si N03 añadiera soft delete, hay que revisar `award_points_comment()` y este apartado.
- **Tests pgTAP.** `supabase/tests/rls/rls_user_points.sql` (RLS + índice único) y `supabase/tests/rls/trigger_award_points.sql` (las 5 acciones, idempotencia por acción, máximo 21 pts/post/usuario, aislamiento entre usuarios).

---

## Consecuencias

**Positivas:** puntos deterministas, idempotentes y auditables; leaderboard barato vía RPC sin exponer datos personales; claves de usuario homogéneas (`auth.uid()`), sin el desajuste `profiles.id`.

**Negativas / limitaciones:** triggers en cuatro tablas fuente (cualquier cambio de esquema en ellas obliga a revisarlos); retirar puntos exige lógica extra que el MVP no tiene; sin decaimiento temporal de puntos ni streaks.

---

## Referencias

- Spec «Reglas de gamificación — Spec de puntos y ranking» (Notion) — origen de los valores.
- [ADR-001](0001-engagement.md) — estados `viewed`/`engaged`/`clicked` de `engagement_sessions`.
- [ADR-002](0002-rbac.md) — helpers `is_admin()` y convención RLS.
