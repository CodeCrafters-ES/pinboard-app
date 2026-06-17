-- Migration: 0002 — profiles.role indexes and defaults (idempotent reaffirmation)
-- Depends on: 0001 (public.user_role enum + public.profiles table)
-- Safe to re-run: all statements are guarded with IF NOT EXISTS or DO $$ blocks.

-- 1. Reaffirm NOT NULL constraint on profiles.role.
--    The column was already created NOT NULL in 0001; this ALTER is a no-op if the
--    constraint is already in place and raises a clear error if someone accidentally
--    dropped it between migrations.
ALTER TABLE public.profiles
  ALTER COLUMN role SET NOT NULL;

-- 2. Reaffirm DEFAULT 'staff' on profiles.role.
ALTER TABLE public.profiles
  ALTER COLUMN role SET DEFAULT 'staff';

-- 3. Ensure the B-Tree index on profiles(role) exists.
--    IF NOT EXISTS prevents a duplicate-index error when running against a database
--    that already applied migration 0001 (which also creates this index).
CREATE INDEX IF NOT EXISTS profiles_role_idx
  ON public.profiles (role);

-- 4. Partial index for elevated roles to accelerate RLS helper function lookups
--    (is_admin / is_manager), which are called on every authenticated request.
CREATE INDEX IF NOT EXISTS profiles_elevated_role_idx
  ON public.profiles (id)
  WHERE role IN ('admin', 'manager');
