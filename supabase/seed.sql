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

-- ── Seed posts (dev only) ────────────────────────────────────────────────────
DELETE FROM public.posts
WHERE id IN (
  'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  'bbbbbbbb-0000-0000-0000-000000000003'::uuid
);

INSERT INTO public.posts (id, author_id, title, subtitle, external_url, body, status, published_at)
SELECT
  'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
  p.id,
  'Ibiza proclamada destino sostenible del año 2026',
  'Reconocimiento europeo por turismo responsable',
  'https://example.com/noticias/ibiza-sostenible-2026',
  'La Unión Europea ha galardonado a Ibiza como destino turístico sostenible del año.',
  'published',
  now() - interval '2 days'
FROM public.profiles p WHERE p.user_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;

INSERT INTO public.posts (id, author_id, title, subtitle, external_url, status, published_at)
SELECT
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  p.id,
  'Nueva carta de verano 2026 en Nun Ibiza',
  'Platos mediterráneos con ingredientes de km 0',
  'https://example.com/noticias/carta-verano-2026',
  'published',
  now() - interval '1 day'
FROM public.profiles p WHERE p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

INSERT INTO public.posts (id, author_id, title, external_url, status)
SELECT
  'bbbbbbbb-0000-0000-0000-000000000003'::uuid,
  p.id,
  'Guía de protocolo para la temporada alta',
  'https://example.com/noticias/protocolo-temporada-alta',
  'draft'
FROM public.profiles p WHERE p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;
