-- Migration: 0017 — Add SECURITY DEFINER + fixed search_path to is_admin/is_manager/is_staff
-- Part of Epic S00 / Feature F-S00-02
-- Reason: migration 0003 replaced the SECURITY DEFINER versions from 0001 with plain
-- STABLE functions. While safe in practice (they delegate to auth_role() which IS
-- SECURITY DEFINER), the DoD requires all four helpers to be SECURITY DEFINER with a
-- fixed search_path to prevent search_path injection and match the ADR spec.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(public.auth_role() = 'admin', false);
$$;

COMMENT ON FUNCTION public.is_admin()
  IS 'True solo para el rol admin. SECURITY DEFINER con search_path fijado. Devuelve false (nunca null) cuando no hay sesión.';

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(public.auth_role() IN ('admin', 'manager'), false);
$$;

COMMENT ON FUNCTION public.is_manager()
  IS 'True para admin y manager (jerarquía inclusiva). SECURITY DEFINER con search_path fijado. Devuelve false (nunca null) cuando no hay sesión.';

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT COALESCE(public.auth_role() IN ('admin', 'manager', 'staff'), false);
$$;

COMMENT ON FUNCTION public.is_staff()
  IS 'True para cualquier rol autenticado. SECURITY DEFINER con search_path fijado. Devuelve false (nunca null) cuando no hay sesión.';
