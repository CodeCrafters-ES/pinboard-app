-- RLS + helpers tests: user_blocks (SELECT/INSERT/DELETE own-or-admin) — I-F-N07-04-02 (#288)
-- Policies: user_blocks_select, user_blocks_insert, user_blocks_delete
-- Helpers:  public.is_blocked(uuid,uuid)  ·  public.direct_chat_blocked(uuid)
-- refs: 20260808100000_user_blocks.sql, docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(17);

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

-- ── Fixture (postgres superuser, bypassa RLS): manager bloquea a staff ─────────
insert into public.user_blocks (blocker_user_id, blocked_user_id) values
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'aaaaaaaa-0000-0000-0000-000000000003'::uuid);

-- ── Firma de los helpers ─────────────────────────────────────────────────────
select has_function(
  'public', 'is_blocked', array['uuid', 'uuid'],
  'existe la función is_blocked(uuid, uuid)'
);
select has_function(
  'public', 'direct_chat_blocked', array['uuid'],
  'existe la función direct_chat_blocked(uuid)'
);

-- ── is_blocked: bidireccional ────────────────────────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);
select ok(
  public.is_blocked('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
                    'aaaaaaaa-0000-0000-0000-000000000003'::uuid),
  'is_blocked: true en el sentido bloqueador→bloqueado'
);
select ok(
  public.is_blocked('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
                    'aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  'is_blocked: true también en sentido inverso (bidireccional)'
);
select ok(
  not public.is_blocked('aaaaaaaa-0000-0000-0000-000000000001'::uuid,
                        'aaaaaaaa-0000-0000-0000-000000000003'::uuid),
  'is_blocked: false para un par sin bloqueo'
);

-- ── direct_chat_blocked: acotada al llamante ─────────────────────────────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select ok(
  public.direct_chat_blocked('aaaaaaaa-0000-0000-0000-000000000002'::uuid),
  'direct_chat_blocked: true cuando el llamante está en un par bloqueado'
);
select ok(
  not public.direct_chat_blocked('aaaaaaaa-0000-0000-0000-000000000001'::uuid),
  'direct_chat_blocked: false para un interlocutor sin bloqueo'
);

-- ── SELECT: solo mis filas (o admin) ─────────────────────────────────────────

-- Positive: el bloqueador ve su propia fila.
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);
select results_eq(
  $test$ select count(*)::int from public.user_blocks
         where blocked_user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid $test$,
  $expected$ values (1) $expected$,
  'manager: ve el bloqueo que él creó'
);

-- Negative: el bloqueado NO ve quién le ha bloqueado.
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select results_eq(
  $test$ select count(*)::int from public.user_blocks $test$,
  $expected$ values (0) $expected$,
  'staff (bloqueado): no ve la fila de quien le bloqueó'
);

-- Positive admin: ve cualquier bloqueo.
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);
select results_eq(
  $test$ select count(*)::int from public.user_blocks $test$,
  $expected$ values (1) $expected$,
  'admin: ve cualquier bloqueo (gestión global)'
);

-- ── INSERT ───────────────────────────────────────────────────────────────────

-- Positive: bloqueo propio (blocker = auth.uid()).
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
select lives_ok(
  $test$ insert into public.user_blocks (blocker_user_id, blocked_user_id)
         values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
                 'aaaaaaaa-0000-0000-0000-000000000002'::uuid) $test$,
  'staff: puede crear un bloqueo propio'
);

-- Negative: bloqueo con blocker ajeno → deny.
select throws_ok(
  $test$ insert into public.user_blocks (blocker_user_id, blocked_user_id)
         values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
                 'aaaaaaaa-0000-0000-0000-000000000001'::uuid) $test$,
  '42501', null,
  'staff: no puede crear un bloqueo en nombre de otro (blocker ajeno)'
);

-- Negative: auto-bloqueo → viola el check (23514).
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);
select throws_ok(
  $test$ insert into public.user_blocks (blocker_user_id, blocked_user_id)
         values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
                 'aaaaaaaa-0000-0000-0000-000000000002'::uuid) $test$,
  '23514', null,
  'nadie puede bloquearse a sí mismo (check user_blocks_no_self)'
);

-- Positive admin: puede crear bloqueos ajenos (blocker ≠ admin).
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);
select lives_ok(
  $test$ insert into public.user_blocks (blocker_user_id, blocked_user_id)
         values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
                 'aaaaaaaa-0000-0000-0000-000000000001'::uuid) $test$,
  'admin: puede gestionar bloqueos ajenos (INSERT en nombre de otro)'
);

-- ── DELETE ───────────────────────────────────────────────────────────────────

-- Negative: un tercero no puede borrar un bloqueo ajeno (0 filas afectadas). La CTE
-- modificadora se ancla en el nivel superior (SELECT … INTO) para contar lo borrado.
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);
with d as (
  delete from public.user_blocks
  where blocker_user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
    and blocked_user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  returning 1
) select count(*)::int as n into temp _del_ajeno from d;
select is(
  (select n from _del_ajeno), 0,
  'staff: no puede borrar el bloqueo de otro (RLS filtra la fila)'
);

-- Positive: el bloqueador borra su propia fila.
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);
with d as (
  delete from public.user_blocks
  where blocker_user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
    and blocked_user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  returning 1
) select count(*)::int as n into temp _del_own from d;
select is(
  (select n from _del_own), 1,
  'manager: puede deshacer su propio bloqueo'
);

-- Positive admin: puede borrar un bloqueo ajeno (el que creó staff).
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);
with d as (
  delete from public.user_blocks
  where blocker_user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
    and blocked_user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  returning 1
) select count(*)::int as n into temp _del_admin from d;
select is(
  (select n from _del_admin), 1,
  'admin: puede revertir un bloqueo ajeno (DELETE en nombre de otro)'
);

reset role;

select * from finish();
rollback;
