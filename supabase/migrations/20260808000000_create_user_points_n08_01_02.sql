-- Migration: N08-01-02 — Persistencia de puntos: enum points_source + tabla user_points (#295)
-- Epic N08 (#291) / Feature F-N08-01 (#292) / Issue I-F-N08-01-02 (#295).
-- refs: docs/adr/0007-gamification.md (Opción A: tabla + triggers, elegida)
--       docs/adr/0002-rbac.md (helper is_admin(), convención RLS)
-- Precondition for 20260808000001_user_points_rules_n08_01_01.sql (helper + triggers).
--
-- Una fila por (user_id, source_type, source_id = post_id): cada acción puntúa una
-- sola vez por post. El índice único es lo que hace idempotente el `on conflict do
-- nothing` de award_points(), no lógica en el cliente.
--
-- user_id referencia auth.users(id) — NO profiles(id) — porque en este proyecto
-- profiles.id ≠ auth.uid() (la FK a auth es profiles.user_id). Las tablas fuente
-- (engagement_sessions.user_id, post_reactions.user_id, post_ratings.user_id,
-- post_comments.author_id) también apuntan a auth.users, así que los triggers
-- copian el valor tal cual y la policy `user_id = auth.uid()` funciona.

create type public.points_source as enum
  ('post_viewed', 'post_clicked', 'post_reacted', 'post_rated', 'post_commented');

create table public.user_points (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  source_type public.points_source not null,
  source_id   uuid        not null,
  points      int         not null check (points >= 0),
  awarded_at  timestamptz not null default now()
);

-- Idempotencia por acción: máximo natural 21 pts/post/usuario (1+10+2+3+5).
create unique index user_points_uniq_source
  on public.user_points (user_id, source_type, source_id);

-- Lectura de la fila propia ("mis puntos", posición en el ranking).
create index user_points_user_awarded_at
  on public.user_points (user_id, awarded_at desc);

-- Agregación del leaderboard por ventana temporal (F-N08-02).
create index user_points_awarded_at
  on public.user_points (awarded_at desc);

comment on table public.user_points is
  'Puntos de gamificación materializados por los triggers award_points_* '
  '(I-F-N08-01-01). Una fila por (user_id, source_type, post_id). '
  'refs: docs/adr/0007-gamification.md';
comment on column public.user_points.source_id is
  'post_id de la acción puntuada. Sin FK a posts: los puntos ya ganados sobreviven '
  'al borrado del post (auditoría e histórico del ranking).';

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.user_points enable row level security;

-- SELECT: solo la fila propia; admin ve todo (soporte / auditoría). El leaderboard
-- NO lee esta tabla directamente: lo hará la RPC agregada de F-N08-02.
create policy user_points_select_own
  on public.user_points for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Escritura: exclusiva de los triggers SECURITY DEFINER. `auto_expose_new_tables`
-- está desactivado (config.toml), así que la tabla nace sin grants; el revoke es
-- explícito para que la intención quede en el esquema y no dependa de esa opción,
-- que además desaparece el 2026-10-30.
grant select on public.user_points to authenticated;
revoke insert, update, delete on public.user_points from authenticated, anon;
