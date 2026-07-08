-- Migration: 0007 — RLS policies for posts, post_reactions, post_ratings, post_comments
-- refs: docs/adr/0002-rbac.md
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-02
-- Depends on: 0006 (tables), 0003/0004 (helpers is_manager, is_admin)

-- ── posts ─────────────────────────────────────────────────────────────────────
alter table public.posts enable row level security;

create policy posts_select_authenticated
  on public.posts for select to authenticated
  using (true);

-- manager and admin can insert; author_id must match the caller
create policy posts_insert_manager_or_admin
  on public.posts for insert to authenticated
  with check (is_manager() and author_id = auth.uid());

create policy posts_update_own_or_admin
  on public.posts for update to authenticated
  using  (is_admin() or (is_manager() and author_id = auth.uid()))
  with check (is_admin() or (is_manager() and author_id = auth.uid()));

create policy posts_delete_own_or_admin
  on public.posts for delete to authenticated
  using (is_admin() or (is_manager() and author_id = auth.uid()));

-- ── post_reactions ────────────────────────────────────────────────────────────
alter table public.post_reactions enable row level security;

create policy post_reactions_select_authenticated
  on public.post_reactions for select to authenticated
  using (true);

create policy post_reactions_insert_self
  on public.post_reactions for insert to authenticated
  with check (user_id = auth.uid());

create policy post_reactions_update_self
  on public.post_reactions for update to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy post_reactions_delete_self_or_admin
  on public.post_reactions for delete to authenticated
  using (user_id = auth.uid() or is_admin());

-- ── post_ratings ──────────────────────────────────────────────────────────────
alter table public.post_ratings enable row level security;

create policy post_ratings_select_authenticated
  on public.post_ratings for select to authenticated
  using (true);

create policy post_ratings_insert_self
  on public.post_ratings for insert to authenticated
  with check (user_id = auth.uid());

-- Ratings are updated in-place; no DELETE policy exists by design (see ADR-002).
create policy post_ratings_update_self
  on public.post_ratings for update to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ── post_comments ─────────────────────────────────────────────────────────────
alter table public.post_comments enable row level security;

create policy post_comments_select_authenticated
  on public.post_comments for select to authenticated
  using (true);

create policy post_comments_insert_self
  on public.post_comments for insert to authenticated
  with check (author_id = auth.uid());

create policy post_comments_update_self
  on public.post_comments for update to authenticated
  using  (author_id = auth.uid())
  with check (author_id = auth.uid());

create policy post_comments_delete_self_or_admin
  on public.post_comments for delete to authenticated
  using (author_id = auth.uid() or is_admin());
