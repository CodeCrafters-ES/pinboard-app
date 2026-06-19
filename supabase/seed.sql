-- =============================================================================
-- SEED FILE — Nun Ibiza PinBoard App
-- PURPOSE : Development and testing only. NOT FOR PRODUCTION.
-- WARNING : These users are fictional. Do not use real credentials here.
-- Reset   : pnpm supabase:reset (runs supabase db reset which applies this file)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Idempotent: remove existing seed users before re-inserting.
DELETE FROM auth.users
WHERE id IN (
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid
);

-- Insert seed users into auth.users.
-- encrypted_password is a bcrypt hash of the literal string "password123".
-- The `role` column here is the Postgres role (authenticated), not the app role.
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role
) VALUES
  (
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    'admin@nun-ibiza.dev',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin"}'::jsonb,
    false,
    'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
    'manager@nun-ibiza.dev',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"manager"}'::jsonb,
    false,
    'authenticated'
  ),
  (
    'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
    'staff@nun-ibiza.dev',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"staff"}'::jsonb,
    false,
    'authenticated'
  );

-- Insert corresponding profiles (ON CONFLICT ensures idempotency).
INSERT INTO public.profiles (user_id, email, role, name, surname) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 'admin@nun-ibiza.dev',   'admin',   'Dev',  'Admin'),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'manager@nun-ibiza.dev', 'manager', 'Dev',  'Manager'),
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'staff@nun-ibiza.dev',   'staff',   'Dev',  'Staff')
ON CONFLICT (user_id) DO UPDATE
  SET role       = EXCLUDED.role,
      name       = EXCLUDED.name,
      surname    = EXCLUDED.surname,
      updated_at = now();
