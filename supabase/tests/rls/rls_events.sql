-- RLS tests: events table
-- Policies: events_select_authenticated, events_insert_manager_or_admin,
--           events_update_manager_or_admin, events_delete_manager_or_admin
-- refs: docs/adr/0002-rbac.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(7);

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

create or replace function pg_temp.reset_session()
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{}', true);
  reset role;
end;
$$;

-- Fixture: an event owned by the manager seed user (inserted as postgres, bypasses RLS)
insert into public.events (id, author_id, title, event_start_at, event_end_at)
values (
  'ffffffff-0000-0000-0000-000000000001'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Team event',
  now() + interval '1 day',
  now() + interval '2 days'
);

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read events
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.events $test$,
  $expected$ values (1) $expected$,
  'staff puede leer eventos'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Positive: manager can insert an event
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values (
      'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
      'Manager event',
      now() + interval '3 days',
      now() + interval '4 days'
    )
  $test$,
  'manager puede insertar un evento'
);

-- Positive: admin can also insert an event (is_manager() = true for admin)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
      'Admin event',
      now() + interval '5 days',
      now() + interval '6 days'
    )
  $test$,
  'admin puede insertar un evento'
);

-- Negative: staff cannot insert an event
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values (
      'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
      'Staff event',
      now() + interval '7 days',
      now() + interval '8 days'
    )
  $test$,
  '42501',
  null,
  'staff no puede insertar un evento'
);

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- Positive: admin can update any event
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    update public.events set title = 'Updated event'
    where id = 'ffffffff-0000-0000-0000-000000000001'::uuid
  $test$,
  'admin puede actualizar cualquier evento'
);

-- Negative: staff cannot update any event
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$
    with res as (
      update public.events set title = 'Hacked'
      where id = 'ffffffff-0000-0000-0000-000000000001'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede modificar ningún evento'
);

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- Positive: manager can delete their event (re-insert fixture as superuser first)
select pg_temp.reset_session();

insert into public.events (id, author_id, title, event_start_at, event_end_at)
values (
  'ffffffff-0000-0000-0000-000000000002'::uuid,
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  'Event to delete',
  now() + interval '9 days',
  now() + interval '10 days'
);

select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    delete from public.events
    where id = 'ffffffff-0000-0000-0000-000000000002'::uuid
  $test$,
  'manager puede borrar un evento'
);

select * from finish();
rollback;
