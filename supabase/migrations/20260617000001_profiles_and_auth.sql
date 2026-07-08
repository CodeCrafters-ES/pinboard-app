-- ============================================================
-- Migration: profiles table, RLS policies, helper functions
-- ============================================================

-- 1. Role enum
CREATE TYPE public.user_role AS ENUM ('staff', 'manager', 'admin');

-- 2. Profiles table
CREATE TABLE public.profiles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  name        text,
  surname     text,
  title       text,
  avatar_url  text,
  role        public.user_role NOT NULL DEFAULT 'staff',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. GRANTs (auto_expose_new_tables is disabled in config.toml)
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- 4. Helper functions (SECURITY DEFINER, locked search_path)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role IN ('manager', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
  );
$$;

-- 5. RLS policies

-- Authenticated user can read their own profile
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admin can read all profiles
CREATE POLICY "profiles_select_admin"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- User can update their own non-role fields
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- Prevent self role-escalation: only admins may change the role column
    AND (role = (SELECT role FROM public.profiles WHERE user_id = auth.uid()) OR public.is_admin())
  );

-- Admin can update any profile (role changes, etc.)
CREATE POLICY "profiles_update_admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No INSERT policy for authenticated role; only the trigger inserts (runs as postgres, bypasses RLS)
-- No DELETE policy; deactivation will use a soft-delete column in a future migration

-- 6. updated_at auto-update trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7. Trigger: auto-create profile on auth.users insert (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _raw_role text;
  _role     public.user_role;
BEGIN
  _raw_role := NEW.raw_user_meta_data->>'role';
  _role := CASE
    WHEN _raw_role IN ('staff', 'manager', 'admin') THEN _raw_role::public.user_role
    ELSE 'staff'::public.user_role
  END;

  INSERT INTO public.profiles (user_id, email, role)
  VALUES (NEW.id, NEW.email, _role);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
