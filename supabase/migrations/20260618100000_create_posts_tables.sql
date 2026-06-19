-- Migration: 0006 — Create posts, post_reactions, post_ratings, post_comments
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-02
-- Precondition for 0007_rls_posts_interactions

-- ── posts ─────────────────────────────────────────────────────────────────────
create table public.posts (
  id           uuid        primary key default gen_random_uuid(),
  author_id    uuid        not null references auth.users(id) on delete cascade,
  title        text        not null,
  body         text        not null,
  image_url    text,
  external_url text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index posts_author_id_idx on public.posts (author_id);
create index posts_created_at_idx on public.posts (created_at desc);

grant select, insert, update, delete on public.posts to authenticated;

-- ── post_reactions ────────────────────────────────────────────────────────────
-- One active reaction per user per post (upsert-friendly via ON CONFLICT).
create table public.post_reactions (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  reaction   text        not null,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index post_reactions_post_id_idx on public.post_reactions (post_id);

grant select, insert, update, delete on public.post_reactions to authenticated;

-- ── post_ratings ──────────────────────────────────────────────────────────────
-- One rating per user per post. Updated in-place; never deleted.
create table public.post_ratings (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  score      smallint    not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create index post_ratings_post_id_idx on public.post_ratings (post_id);

grant select, insert, update on public.post_ratings to authenticated;

-- ── post_comments ─────────────────────────────────────────────────────────────
create table public.post_comments (
  id         uuid        primary key default gen_random_uuid(),
  post_id    uuid        not null references public.posts(id) on delete cascade,
  author_id  uuid        not null references auth.users(id) on delete cascade,
  body       text        not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index post_comments_post_id_idx on public.post_comments (post_id);
create index post_comments_author_id_idx on public.post_comments (author_id);

grant select, insert, update, delete on public.post_comments to authenticated;

-- ── updated_at triggers ───────────────────────────────────────────────────────
create trigger posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

create trigger post_ratings_updated_at
  before update on public.post_ratings
  for each row execute function public.set_updated_at();

create trigger post_comments_updated_at
  before update on public.post_comments
  for each row execute function public.set_updated_at();
