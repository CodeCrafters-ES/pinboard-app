-- Migration: 0005 — RLS policies for public.profiles
-- refs: docs/adr/0002-rbac.md
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-01
-- Depends on: 0001 (profiles table, RLS already enabled), 0003/0004 (helpers)
--
-- Replaces the split policies created in migration 0001 with the unified set
-- defined in ADR-002. Changes:
--   - SELECT: was (own OR admin), now any authenticated user sees all rows.
--   - INSERT: was no policy (only trigger), now explicit admin-only policy.
--   - UPDATE: was two separate policies, now one unified policy with WITH CHECK
--             protecting the `role` column against non-admin changes.
--   - DELETE: was no policy, now explicit admin-only policy.

-- ── Drop old policies from migration 0001 ─────────────────────────────────────
drop policy if exists "profiles_select_own"    on public.profiles;
drop policy if exists "profiles_select_admin"  on public.profiles;
drop policy if exists "profiles_update_own"    on public.profiles;
drop policy if exists "profiles_update_admin"  on public.profiles;

-- ── Table-level grants (INSERT and DELETE were not granted in migration 0001) ─
grant insert, delete on public.profiles to authenticated;

-- ── RLS is already enabled (migration 0001); this is a no-op ─────────────────
alter table public.profiles enable row level security;

-- ── SELECT: any authenticated user sees all profiles ─────────────────────────
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (true);

-- ── INSERT: only admin (normal profile creation goes through the trigger) ─────
create policy profiles_insert_admin
  on public.profiles for insert
  to authenticated
  with check (is_admin());

-- ── UPDATE: own profile or admin; WITH CHECK blocks non-admin role changes ────
-- The subquery reads the caller's current role via SECURITY DEFINER auth_role()
-- to avoid a direct recursive read through RLS.
create policy profiles_update_self_or_admin
  on public.profiles for update
  to authenticated
  using  (user_id = auth.uid() or is_admin())
  with check (
    (user_id = auth.uid() and role = auth_role())
    or is_admin()
  );

-- ── DELETE: only admin ────────────────────────────────────────────────────────
create policy profiles_delete_admin
  on public.profiles for delete
  to authenticated
  using (is_admin());
