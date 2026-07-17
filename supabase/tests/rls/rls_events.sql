-- RLS tests: events table (modelo own — decisión 2026-07-16)
-- Policies: events_select_authenticated, events_insert_manager_or_admin,
--           events_update_own_or_admin, events_delete_own_or_admin
-- refs: docs/adr/0002-rbac.md, 20260716000001_rls_events_n05_01_03.sql
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(15);

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

-- Fixtures (como postgres, bypassa RLS):
--   e1: evento del manager   e2: evento del admin
--   e3: evento del manager (para borrado own)
--   e4: evento huérfano (author_id null, autor eliminado)
insert into public.events (id, author_id, title, event_start_at, event_end_at)
values
  ('ffffffff-0000-0000-0000-000000000001'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
   'Evento del manager', now() + interval '1 day', now() + interval '2 days'),
  ('ffffffff-0000-0000-0000-000000000002'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
   'Evento del admin', now() + interval '3 days', now() + interval '4 days'),
  ('ffffffff-0000-0000-0000-000000000003'::uuid,
   'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
   'Evento a borrar', now() + interval '5 days', now() + interval '6 days'),
  ('ffffffff-0000-0000-0000-000000000004'::uuid,
   null,
   'Evento huérfano', now() + interval '7 days', now() + interval '8 days');

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read all events (including orphaned ones)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from public.events $test$,
  $expected$ values (4) $expected$,
  'staff puede leer todos los eventos'
);

-- ── INSERT ────────────────────────────────────────────────────────────────────

-- Positive: manager can insert an event as themself
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values (
      'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
      'Manager event',
      now() + interval '9 days',
      now() + interval '10 days'
    )
  $test$,
  'manager puede insertar un evento propio'
);

-- Positive: admin can insert an event as themself (is_manager() = true for admin)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
      'Admin event',
      now() + interval '11 days',
      now() + interval '12 days'
    )
  $test$,
  'admin puede insertar un evento propio'
);

-- Negative: staff cannot insert an event
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values (
      'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
      'Staff event',
      now() + interval '13 days',
      now() + interval '14 days'
    )
  $test$,
  '42501',
  null,
  'staff no puede insertar un evento'
);

-- Negative: manager cannot insert impersonating another author
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select throws_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values (
      'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
      'Suplantación',
      now() + interval '15 days',
      now() + interval '16 days'
    )
  $test$,
  '42501',
  null,
  'manager no puede insertar con author_id de otro usuario'
);

-- ── UPDATE ────────────────────────────────────────────────────────────────────

-- Positive: admin can update any event (e1, del manager)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    update public.events set title = 'Editado por admin'
    where id = 'ffffffff-0000-0000-0000-000000000001'::uuid
  $test$,
  'admin puede actualizar cualquier evento'
);

-- Positive: manager can update their own event (e1)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    update public.events set title = 'Editado por su autor'
    where id = 'ffffffff-0000-0000-0000-000000000001'::uuid
  $test$,
  'manager puede actualizar su propio evento'
);

-- Negative: manager cannot update someone else's event (e2, del admin)
select results_eq(
  $test$
    with res as (
      update public.events set title = 'Hackeado'
      where id = 'ffffffff-0000-0000-0000-000000000002'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'manager no puede actualizar eventos ajenos'
);

-- Negative: manager cannot update an orphaned event (e4, author_id null)
select results_eq(
  $test$
    with res as (
      update public.events set title = 'Hackeado'
      where id = 'ffffffff-0000-0000-0000-000000000004'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'manager no puede actualizar un evento huérfano (author_id null)'
);

-- Positive: admin can update an orphaned event (e4)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    update public.events set title = 'Huérfano editado por admin'
    where id = 'ffffffff-0000-0000-0000-000000000004'::uuid
  $test$,
  'admin puede actualizar un evento huérfano'
);

-- Negative: staff cannot update any event (e1)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$
    with res as (
      update public.events set title = 'Hackeado'
      where id = 'ffffffff-0000-0000-0000-000000000001'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede modificar ningún evento'
);

-- ── DELETE ────────────────────────────────────────────────────────────────────

-- Positive: manager can delete their own event (e3)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$
    delete from public.events
    where id = 'ffffffff-0000-0000-0000-000000000003'::uuid
  $test$,
  'manager puede borrar su propio evento'
);

-- Negative: manager cannot delete someone else's event (e2, del admin)
select results_eq(
  $test$
    with res as (
      delete from public.events
      where id = 'ffffffff-0000-0000-0000-000000000002'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'manager no puede borrar eventos ajenos'
);

-- Negative: staff cannot delete any event (e1)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$
    with res as (
      delete from public.events
      where id = 'ffffffff-0000-0000-0000-000000000001'::uuid
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede borrar ningún evento'
);

-- Positive: admin can delete any event (e1, del manager)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$
    delete from public.events
    where id = 'ffffffff-0000-0000-0000-000000000001'::uuid
  $test$,
  'admin puede borrar cualquier evento'
);

select * from finish();
rollback;
