-- Migration: N02-01-03 — Formalize RLS policies for posts table
-- Issue: I-F-N02-01-03 (#145)
-- Depends on: 20260630000001 (posts RLS with correct profiles FK)
--
-- Changes vs. previous policies:
--   SELECT  : was `using (true)` (all rows visible); now filters by
--             deleted_at, status, and role so staff/managers never see
--             soft-deleted posts and only see published or own content.
--   INSERT  : was `is_manager() AND author_id = own`, which incorrectly
--             restricted admins to their own profile as author_id.
--             Now `is_admin() OR (is_manager() AND author_id = own)`.
--   UPDATE  : adds `deleted_at IS NULL` guard for managers so they cannot
--             touch soft-deleted rows (admin remains unrestricted).
--   DELETE  : was `is_admin() OR (is_manager() AND own)`; soft-deletes are
--             handled via UPDATE (setting deleted_at), so hard DELETE is
--             now admin-only.

-- ── Drop existing policies ────────────────────────────────────────────────────
drop policy if exists posts_select_authenticated    on public.posts;
drop policy if exists posts_insert_manager_or_admin on public.posts;
drop policy if exists posts_update_own_or_admin     on public.posts;
drop policy if exists posts_delete_own_or_admin     on public.posts;

-- ── SELECT ────────────────────────────────────────────────────────────────────
-- Admin: sees all rows including soft-deleted.
-- Manager / staff: non-deleted rows that are either published or authored
-- by the calling user.
create policy posts_select_authenticated
  on public.posts for select to authenticated
  using (
    is_admin()
    or (
      deleted_at is null
      and (
        status = 'published'
        or author_id = (select id from public.profiles where user_id = auth.uid())
      )
    )
  );

-- ── INSERT ────────────────────────────────────────────────────────────────────
-- Admin: can insert a post with any author_id.
-- Manager: can only insert as themselves (author_id must match their profile).
-- Staff: blocked.
create policy posts_insert_manager_or_admin
  on public.posts for insert to authenticated
  with check (
    is_admin()
    or (
      is_manager()
      and author_id = (select id from public.profiles where user_id = auth.uid())
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────
-- Admin: can update any post (including to restore a soft-deleted one).
-- Manager: can only update their own non-deleted posts; the USING clause
--          blocks access to soft-deleted rows so they cannot un-delete.
-- Staff: blocked.
create policy posts_update_own_or_admin
  on public.posts for update to authenticated
  using (
    is_admin()
    or (
      is_manager()
      and deleted_at is null
      and author_id = (select id from public.profiles where user_id = auth.uid())
    )
  )
  with check (
    is_admin()
    or (
      is_manager()
      and author_id = (select id from public.profiles where user_id = auth.uid())
    )
  );

-- ── DELETE (hard delete, admin-only) ─────────────────────────────────────────
-- Soft-deletes are performed via UPDATE (setting deleted_at); they are
-- governed by the UPDATE policy above. Physical deletion is reserved for
-- admin only (e.g., GDPR erasure or data cleanup).
create policy posts_delete_admin
  on public.posts for delete to authenticated
  using (is_admin());
