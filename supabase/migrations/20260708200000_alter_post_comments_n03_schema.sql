-- Migration: N03-02-01 — Align post_comments scaffold with N03 spec (issue #164)
-- Precondition: 20260618100000 (tabla post_comments + trigger updated_at existen)
-- Note: FK author_id se mantiene en auth.users(id) — las RLS policies (author_id =
-- auth.uid()) siguen siendo válidas; el cambio a profiles(id) queda para N03-02-03.

-- 1. CHECK de longitud de body (1..2000)
alter table public.post_comments
  add constraint post_comments_body_length
  check (char_length(body) between 1 and 2000);

-- 2. Índice de paginación cursor-based (post_id, created_at desc)
--    reemplaza al índice simple (post_id) del scaffold.
drop index if exists public.post_comments_post_id_idx;
create index post_comments_post_id_created_at_idx
  on public.post_comments (post_id, created_at desc);

-- Índice (author_id), trigger updated_at, RLS y grants ya existen (20260618100000).
