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
-- `aud` must be 'authenticated' and a matching auth.identities row (below) is
-- required for GoTrue's password grant to accept these credentials — a bare
-- INSERT into auth.users (without going through real signup) isn't enough.
-- GoTrue's Go scanner requires the token/change columns to be '' rather than
-- NULL (a NULL there fails with "converting NULL to string is unsupported"
-- on login) — real signups always get '' from GoTrue itself.
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  role,
  confirmation_token,
  recovery_token,
  email_change_token_new,
  email_change
) VALUES
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    'authenticated',
    'admin@nun-ibiza.dev',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"admin"}'::jsonb,
    false,
    'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
    'authenticated',
    'manager@nun-ibiza.dev',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"manager"}'::jsonb,
    false,
    'authenticated',
    '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
    'authenticated',
    'staff@nun-ibiza.dev',
    crypt('password123', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"role":"staff"}'::jsonb,
    false,
    'authenticated',
    '', '', '', ''
  );

-- Corresponding auth.identities rows (provider 'email'), matching the shape
-- GoTrue itself writes on real signup. auth.users deletion above cascades
-- and removes these too, so re-running this file stays idempotent.
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  u.id::text,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
  now(), now(), now()
FROM auth.users u
WHERE u.id IN (
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000003'::uuid
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
