-- Schema tests: push_tokens (I-F-N06-01-01)
-- Verifies device_name + last_seen_at, el índice de purga, la FK contra
-- profiles (cascade), la unicidad que sostiene el UPSERT del cliente y los
-- grants que necesita la Edge Function send-push.
-- Las policies RLS own se cubren en rls_push_tokens.sql.
-- refs: 20260716000002_alter_push_tokens_n06_schema.sql
--       20260801000000_push_tokens_n06_fk_and_grants.sql
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(13);

-- ── Columnas e índice de purga ───────────────────────────────────────────────

select has_column('public', 'push_tokens', 'device_name', 'push_tokens has a device_name column');
select col_type_is('public', 'push_tokens', 'device_name', 'text', 'device_name is text');
select has_column('public', 'push_tokens', 'last_seen_at', 'push_tokens has a last_seen_at column');
select col_type_is(
  'public', 'push_tokens', 'last_seen_at', 'timestamp with time zone',
  'last_seen_at is timestamptz'
);
select is(
  (select count(*)::int from pg_indexes
   where schemaname = 'public' and tablename = 'push_tokens'
     and indexname = 'push_tokens_last_seen_idx'),
  1,
  'push_tokens_last_seen_idx exists for the age-based purge'
);

-- ── FK contra profiles con cascade ───────────────────────────────────────────

select is(
  (select confrelid from pg_constraint
    where conrelid = 'public.push_tokens'::regclass
      and conname  = 'push_tokens_user_id_fkey'),
  'public.profiles'::regclass::oid,
  'push_tokens.user_id referencia public.profiles'
);
select is(
  (select confdeltype from pg_constraint
    where conrelid = 'public.push_tokens'::regclass
      and conname  = 'push_tokens_user_id_fkey'),
  'c'::"char",
  'la FK de user_id borra en cascada'
);

-- ── UPSERT: unique (user_id, token) ──────────────────────────────────────────

select col_is_unique(
  'public', 'push_tokens', array['user_id', 'token'],
  'unique (user_id, token) sostiene el onConflict del cliente'
);

insert into public.push_tokens (user_id, token, platform)
values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'ExponentPushToken[upsert]', 'ios');

insert into public.push_tokens (user_id, token, platform, device_name)
values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'ExponentPushToken[upsert]', 'android', 'Pixel 8')
on conflict (user_id, token) do update
  set platform     = excluded.platform,
      device_name  = excluded.device_name,
      last_seen_at = now();

select results_eq(
  $test$
    select count(*)::int, max(platform), max(device_name)
    from public.push_tokens where token = 'ExponentPushToken[upsert]'
  $test$,
  $expected$ values (1, 'android', 'Pixel 8') $expected$,
  'el UPSERT reutiliza la fila existente en vez de duplicarla'
);

-- ── Cascade: borrar el perfil elimina sus tokens ─────────────────────────────

insert into public.push_tokens (user_id, token, platform)
values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'ExponentPushToken[cascade-profile]', 'ios');

delete from public.profiles
where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

select is(
  (select count(*)::int from public.push_tokens
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  0,
  'borrar el perfil elimina en cascada sus push_tokens'
);

-- ── Cascade: borrar el usuario de auth arrastra perfil y tokens ──────────────

insert into public.push_tokens (user_id, token, platform)
values ('aaaaaaaa-0000-0000-0000-000000000001'::uuid,
        'ExponentPushToken[cascade-auth]', 'android');

delete from auth.users where id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;

select is(
  (select count(*)::int from public.push_tokens
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
  0,
  'borrar el usuario de auth elimina en cascada sus push_tokens'
);

-- ── Grants de service_role (Edge Function send-push) ─────────────────────────

select ok(
  has_table_privilege('service_role', 'public.push_tokens', 'SELECT'),
  'service_role puede leer push_tokens (resolver destinatarios en send-push)'
);
select ok(
  has_table_privilege('service_role', 'public.push_tokens', 'DELETE'),
  'service_role puede borrar push_tokens (purga de DeviceNotRegistered)'
);

select * from finish();
rollback;
