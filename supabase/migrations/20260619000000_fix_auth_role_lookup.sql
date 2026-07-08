-- Fix: auth_role() was using `id = auth.uid()` but the FK to auth.users is `user_id`.
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role
  FROM public.profiles
  WHERE user_id = auth.uid();
$$;
