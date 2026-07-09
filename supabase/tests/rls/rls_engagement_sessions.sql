-- RLS tests: engagement_sessions (N04 reading-session model, #178)
-- After I-F-N04-02-01 the table has RLS enabled but NO policies yet — the SELECT
-- policies (own / manager-admin) are delivered in EPIC-S00 / I-F-S00-04-05. Until
-- then the table is default-deny for authenticated, and all writes go through the
-- track-engagement Edge Function with service_role. This test locks in that
-- intentional gap: authenticated reads see nothing and cannot write directly.
-- refs: 20260710000000_replace_engagement_sessions_n04_schema.sql · docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(3);

create or replace function pg_temp.set_session(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end;
$$;

-- Fixtures (inserted as postgres = service_role equivalent, bypasses RLS).
insert into public.posts (id, author_id, title, external_url)
select
  'dddddddd-0000-0000-0000-0000000000aa'::uuid,
  p.id,
  'Post for engagement RLS',
  'https://example.com/rls'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

insert into public.engagement_sessions (session_id, post_id, user_id)
select
  'dddddddd-1111-0000-0000-0000000000aa'::uuid,
  'dddddddd-0000-0000-0000-0000000000aa'::uuid,
  p.id
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

-- ── SELECT default-deny (no policy yet → 0 rows for any authenticated user) ──
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select is(
  (select count(*)::int from public.engagement_sessions),
  0,
  'staff no ve ninguna sesión (RLS default-deny, policy pendiente en EPIC-S00)'
);

select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);
select is(
  (select count(*)::int from public.engagement_sessions),
  0,
  'manager tampoco ve sesiones aún (policy de dashboard pendiente en EPIC-S00)'
);

-- ── INSERT denied for authenticated (writes only via service_role) ───────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select throws_ok(
  $test$
    insert into public.engagement_sessions (session_id, post_id, user_id)
    values ('dddddddd-1111-0000-0000-0000000000bb'::uuid,
            'dddddddd-0000-0000-0000-0000000000aa'::uuid,
            'dddddddd-0000-0000-0000-0000000000cc'::uuid)
  $test$,
  '42501',
  null,
  'authenticated no puede insertar en engagement_sessions (solo Edge Function service_role)'
);

select * from finish();
rollback;
