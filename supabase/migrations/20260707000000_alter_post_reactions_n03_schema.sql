-- Migration: N03-01-01 — Evolve post_reactions to typed enum + composite PK
-- Issue: I-F-N03-01-01 (#161)
-- Precondition: 20260618100000 (table exists), 20260618200000 (RLS + policies exist)
-- Note: user_id FK stays on auth.users(id) so existing policies (user_id = auth.uid()) remain valid.

-- 1. Enum de tipo de reacción
create type public.reaction_type as enum ('like', 'dislike', 'love');

-- 2. Renombrar columna reaction → type y cambiar a enum
alter table public.post_reactions
  rename column reaction to type;

alter table public.post_reactions
  alter column type type public.reaction_type using type::public.reaction_type;

-- 3. Añadir columna updated_at
alter table public.post_reactions
  add column updated_at timestamptz not null default now();

-- 4. Cambiar PK: de id → (post_id, user_id)
alter table public.post_reactions drop constraint post_reactions_pkey;
alter table public.post_reactions drop constraint post_reactions_post_id_user_id_key;
alter table public.post_reactions drop column id;
alter table public.post_reactions add primary key (post_id, user_id);

-- 5. Reemplazar índice post_id (redundante tras la PK compuesta) por user_id
drop index if exists public.post_reactions_post_id_idx;
create index post_reactions_user_id_idx on public.post_reactions (user_id);

-- 6. Trigger updated_at (función set_updated_at definida en 20260617000001)
create trigger post_reactions_updated_at
  before update on public.post_reactions
  for each row execute function public.set_updated_at();

-- RLS ya habilitado en 20260618200000; policies existentes siguen siendo válidas.
