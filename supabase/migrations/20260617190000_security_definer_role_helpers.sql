-- Migration: 0003 — SECURITY DEFINER role helper functions
-- Part of Epic S00 / Feature F-S00-02: Helpers SECURITY DEFINER
-- Depends on: 0001 (public.user_role enum + public.profiles table)
-- Safe to re-run: all functions use CREATE OR REPLACE

-- auth_role: returns the app role of the currently authenticated user, or NULL
-- when no session exists. SECURITY DEFINER + fixed search_path prevent both
-- search_path hijacking attacks and infinite recursion if RLS were ever enabled
-- on profiles itself.
CREATE OR REPLACE FUNCTION public.auth_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

COMMENT ON FUNCTION public.auth_role()
  IS 'Devuelve el rol del usuario autenticado leyendo public.profiles. Devuelve NULL si no hay sesión.';

-- is_admin: true only for the admin role.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(public.auth_role() = 'admin', false);
$$;

COMMENT ON FUNCTION public.is_admin()
  IS 'True solo para el rol admin. Devuelve false (nunca null) cuando no hay sesión.';

-- is_manager: true for admin + manager (inclusive hierarchy).
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(public.auth_role() IN ('admin', 'manager'), false);
$$;

COMMENT ON FUNCTION public.is_manager()
  IS 'True para admin y manager (jerarquía inclusiva). Devuelve false (nunca null) cuando no hay sesión.';

-- is_staff: true for any authenticated role (admin + manager + staff).
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(public.auth_role() IN ('admin', 'manager', 'staff'), false);
$$;

COMMENT ON FUNCTION public.is_staff()
  IS 'True para cualquier rol autenticado. Devuelve false (nunca null) cuando no hay sesión.';
