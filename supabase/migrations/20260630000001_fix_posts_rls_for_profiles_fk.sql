-- Migration: N02-01-01 followup — Fix posts RLS policies after author_id FK change
-- 20260630000000 changed author_id from auth.users(id) → profiles(id).
-- The scaffold policies used `author_id = auth.uid()` which is now broken:
-- auth.uid() returns auth.users.id, but author_id is now profiles.id (different UUID).
-- This migration drops the stale policies and recreates them with the correct lookup.

drop policy if exists posts_insert_manager_or_admin on public.posts;
drop policy if exists posts_update_own_or_admin     on public.posts;
drop policy if exists posts_delete_own_or_admin     on public.posts;

create policy posts_insert_manager_or_admin
  on public.posts for insert to authenticated
  with check (
    is_manager()
    and author_id = (select id from public.profiles where user_id = auth.uid())
  );

create policy posts_update_own_or_admin
  on public.posts for update to authenticated
  using  (
    is_admin()
    or (is_manager() and author_id = (select id from public.profiles where user_id = auth.uid()))
  )
  with check (
    is_admin()
    or (is_manager() and author_id = (select id from public.profiles where user_id = auth.uid()))
  );

create policy posts_delete_own_or_admin
  on public.posts for delete to authenticated
  using (
    is_admin()
    or (is_manager() and author_id = (select id from public.profiles where user_id = auth.uid()))
  );
