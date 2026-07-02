-- Migration: profiles_public view — column-restricted read path for staff
-- refs: docs/adr/0002-rbac.md, issue #74 (I-F-N01-02-02)
-- Depends on: 20260617000001 (profiles table)
--
-- PostgreSQL RLS restricts rows, not columns. This view is the DB-level
-- mechanism that prevents staff from reading `email` or `title` from other
-- users' profiles. Admin/manager queries continue to use `profiles` directly.

CREATE OR REPLACE VIEW public.profiles_public AS
SELECT
  id,
  user_id,
  -- full_name: concatenates name+surname; falls back to whichever is non-null
  COALESCE(
    NULLIF(TRIM(COALESCE(name, '') || ' ' || COALESCE(surname, '')), ''),
    name,
    surname
  ) AS full_name,
  name,
  surname,
  avatar_url,
  role,
  created_at
FROM public.profiles;

-- Allow any authenticated user to query the view
GRANT SELECT ON public.profiles_public TO authenticated;
