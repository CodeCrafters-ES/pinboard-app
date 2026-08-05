-- RLS tests: user_points table (I-F-N08-01-02, #295)
-- Policies: user_points_select_own (propia fila o admin).
-- Escritura: sin grants para authenticated/anon — es exclusiva de los triggers
-- SECURITY DEFINER award_points_* (I-F-N08-01-01), cubiertos en trigger_award_points.sql.
-- refs: docs/adr/0007-gamification.md, migración 20260807000000_create_user_points_n08_01_02.sql
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(8);

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

-- ── Fixtures (como postgres: superusuario, omite RLS) ─────────────────────────
-- source_id no tiene FK a posts a propósito, así que basta con un uuid estable.
insert into public.user_points (user_id, source_type, source_id, points) values
  ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'post_clicked',
   'dddddddd-0000-0000-0000-000000000001'::uuid, 10),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 'post_clicked',
   'dddddddd-0000-0000-0000-000000000001'::uuid, 10);

-- ── Índice único: idempotencia a nivel de esquema ─────────────────────────────

-- Negative: repetir (user_id, source_type, source_id) viola user_points_uniq_source
select throws_ok(
  $test$
    insert into public.user_points (user_id, source_type, source_id, points)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'post_clicked',
            'dddddddd-0000-0000-0000-000000000001'::uuid, 10)
  $test$,
  '23505',
  null,
  'el índice único impide duplicar (user_id, source_type, source_id)'
);

-- Positive: la misma acción sobre OTRO post sí puntúa
select lives_ok(
  $test$
    insert into public.user_points (user_id, source_type, source_id, points)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'post_clicked',
            'dddddddd-0000-0000-0000-000000000002'::uuid, 10)
  $test$,
  'la misma acción sobre otro post sí inserta una fila nueva'
);

-- ── SELECT ────────────────────────────────────────────────────────────────────

select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);  -- staff

-- Positive: staff ve sus propias filas (2: dos posts distintos)
select results_eq(
  $test$
    select count(*)::int from public.user_points
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  $expected$ values (2) $expected$,
  'staff puede leer sus propios puntos'
);

-- Negative: staff no ve los puntos del manager
select results_eq(
  $test$
    select count(*)::int from public.user_points
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid
  $test$,
  $expected$ values (0) $expected$,
  'staff no puede leer los puntos de otro usuario'
);

-- ── INSERT / UPDATE / DELETE: sin grants para authenticated ───────────────────

-- Negative: staff no puede inventarse puntos propios
select throws_ok(
  $test$
    insert into public.user_points (user_id, source_type, source_id, points)
    values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'post_commented',
            'dddddddd-0000-0000-0000-000000000003'::uuid, 5)
  $test$,
  '42501',
  null,
  'staff no puede insertar puntos directamente'
);

-- Negative: staff no puede inflar sus puntos existentes
select throws_ok(
  $test$
    update public.user_points set points = 999
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  '42501',
  null,
  'staff no puede actualizar sus puntos'
);

-- Negative: staff no puede borrar filas de puntos
select throws_ok(
  $test$
    delete from public.user_points
    where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  '42501',
  null,
  'staff no puede borrar puntos'
);

-- ── Admin ─────────────────────────────────────────────────────────────────────

reset role;
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);  -- admin

-- Positive: admin ve las filas de todos (2 de staff + 1 de manager)
select results_eq(
  $test$ select count(*)::int from public.user_points $test$,
  $expected$ values (3) $expected$,
  'admin puede leer los puntos de todos los usuarios'
);

select * from finish();
rollback;
