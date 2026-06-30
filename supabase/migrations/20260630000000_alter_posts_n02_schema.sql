-- Migration: N02-01-01 — Evolve posts scaffold → full posts schema per issue #143
-- Precondition: 20260618100000_create_posts_tables.sql (scaffold posts + trigger)
-- Note: RLS policies intentionally left for I-F-N02-01-03.

-- ── 1. FK author_id: auth.users → profiles ──────────────────────────────────
alter table public.posts
  drop constraint posts_author_id_fkey;

alter table public.posts
  add constraint posts_author_id_fkey
  foreign key (author_id) references public.profiles(id) on delete cascade;

-- ── 2. title: añadir constraint de longitud ──────────────────────────────────
alter table public.posts
  add constraint posts_title_length
  check (char_length(title) between 1 and 200);

-- ── 3. body: hacer nullable ──────────────────────────────────────────────────
alter table public.posts
  alter column body drop not null;

-- ── 4. external_url: NOT NULL + formato URL básico ──────────────────────────
alter table public.posts
  add constraint posts_external_url_format
  check (external_url ~ '^https?://');

alter table public.posts
  alter column external_url set not null;

-- ── 5. Renombrar image_url → cover_image_url ─────────────────────────────────
alter table public.posts
  rename column image_url to cover_image_url;

-- ── 6. Columnas nuevas ────────────────────────────────────────────────────────
alter table public.posts
  add column subtitle     text,
  add column status       text not null default 'draft'
                            check (status in ('draft', 'published')),
  add column published_at timestamptz,
  add column deleted_at   timestamptz default null;

-- ── 7. Índices: eliminar básico, añadir parciales ────────────────────────────
drop index if exists public.posts_created_at_idx;

create index posts_feed_idx
  on public.posts (status, published_at desc)
  where deleted_at is null;

create index posts_deleted_idx
  on public.posts (deleted_at)
  where deleted_at is not null;

-- ── 8. Habilitar RLS (idempotente) ───────────────────────────────────────────
alter table public.posts enable row level security;
