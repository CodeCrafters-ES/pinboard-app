-- Migration: 0001 — user_role enum + profiles table with role column
-- Part of Epic S00: Data Security and Audit
-- Safe to re-run: all statements use IF NOT EXISTS / DO $$ guards

-- 1. Create the user_role enum if it does not already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'user_role'
      AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'manager', 'staff');
  END IF;
END
$$;

COMMENT ON TYPE public.user_role IS
  'Hierarchical role for Nun Ibiza staff: admin > manager > staff.';

-- 2. Create profiles table if it does not already exist.
--    id mirrors auth.users so there is a single source of truth for identity.
CREATE TABLE IF NOT EXISTS public.profiles (
  id          uuid              PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.user_role  NOT NULL DEFAULT 'staff',
  full_name   text,
  avatar_url  text,
  created_at  timestamptz       NOT NULL DEFAULT now(),
  updated_at  timestamptz       NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.profiles             IS 'One row per authenticated user; extends auth.users with app-level data.';
COMMENT ON COLUMN public.profiles.id          IS 'References auth.users(id). Deleted when the auth user is deleted.';
COMMENT ON COLUMN public.profiles.role        IS 'Application role. Only admins may modify this column (enforced by RLS in a later migration).';
COMMENT ON COLUMN public.profiles.name        IS 'Given name of the employee.';
COMMENT ON COLUMN public.profiles.surname     IS 'Family name of the employee.';
COMMENT ON COLUMN public.profiles.avatar_url  IS 'URL to profile picture in Supabase Storage.';

-- 3. Index on role to support fast role-filtered queries and future RLS helper functions.
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- 4. Trigger to keep updated_at current without relying on the client.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'profiles_set_updated_at'
      AND tgrelid = 'public.profiles'::regclass
  ) THEN
    CREATE TRIGGER profiles_set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;
