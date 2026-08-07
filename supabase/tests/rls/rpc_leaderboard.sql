-- Tests: RPC public.leaderboard(period_start, period_end, limit_n) — I-F-N08-02-01 (#296)
-- Migración 20260809000000_leaderboard_fn_n08_02_01.sql.
-- Cubre: orden por puntos desc, desempate por min(awarded_at) asc, acotado a la
-- ventana temporal, fila propia cuando el usuario queda fuera del top N, is_self,
-- ausencia de campos privados y denegación a anon.
--
-- Seed UUIDs (supabase/seed.sql) — ids de auth.users:
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(11);

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

-- Ventana de prueba: semana natural del 2 al 9 de marzo de 2026 (lunes → lunes),
-- half-open igual que la usa el cliente.
create or replace function pg_temp.board(limit_n int)
returns table (user_id uuid, full_name text, total_points bigint, rank int, is_self boolean)
language sql stable as $$
  select l.user_id, l.full_name, l.total_points, l.rank, l.is_self
  from public.leaderboard(
    '2026-03-02T00:00:00+01:00'::timestamptz,
    '2026-03-09T00:00:00+01:00'::timestamptz,
    limit_n
  ) l;
$$;

select has_function(
  'public', 'leaderboard', array['timestamptz', 'timestamptz', 'integer'],
  'existe la función leaderboard(timestamptz, timestamptz, int)'
);

-- ── Fixtures ──────────────────────────────────────────────────────────────────
-- admin 30 pts · manager 20 pts · staff 10 pts, todos dentro de la ventana.
-- source_id es un uuid cualquiera: no hay FK a posts (ADR-0007).
insert into public.user_points (user_id, source_type, source_id, points, awarded_at) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'post_clicked',   'cccccccc-0000-0000-0000-000000000001', 10, '2026-03-03T10:00:00+01:00'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'post_rated',     'cccccccc-0000-0000-0000-000000000001', 10, '2026-03-03T11:00:00+01:00'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'post_commented', 'cccccccc-0000-0000-0000-000000000001', 10, '2026-03-03T12:00:00+01:00'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'post_clicked',   'cccccccc-0000-0000-0000-000000000002', 10, '2026-03-04T10:00:00+01:00'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'post_rated',     'cccccccc-0000-0000-0000-000000000002', 10, '2026-03-04T11:00:00+01:00'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'post_clicked',   'cccccccc-0000-0000-0000-000000000003', 10, '2026-03-05T10:00:00+01:00');

-- Fuera de la ventana: no debe contar para nadie.
insert into public.user_points (user_id, source_type, source_id, points, awarded_at) values
  ('aaaaaaaa-0000-0000-0000-000000000003', 'post_reacted', 'cccccccc-0000-0000-0000-000000000009', 2, '2026-02-20T10:00:00+01:00'),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'post_viewed',  'cccccccc-0000-0000-0000-00000000000a', 1, '2026-03-09T00:00:01+01:00');

-- ── Orden y agregación ────────────────────────────────────────────────────────

select results_eq(
  $test$ select rank, total_points from pg_temp.board(20) $test$,
  $expected$ values (1, 30::bigint), (2, 20::bigint), (3, 10::bigint) $expected$,
  'ordena por puntos descendentes y numera los puestos'
);

select results_eq(
  $test$ select full_name from pg_temp.board(20) order by 1 $test$,
  $expected$ values ('Dev Admin'), ('Dev Manager'), ('Dev Staff') $expected$,
  'resuelve full_name desde profiles_public'
);

-- El punto del 2026-03-09T00:00:01 queda fuera: el fin del rango es exclusivo.
select is(
  (select total_points from pg_temp.board(20) where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'),
  10::bigint,
  'el rango es half-open: los puntos de fuera de la ventana no suman'
);

-- ── Desempate por min(awarded_at) ─────────────────────────────────────────────
-- staff sube a 20 pts con un primer punto MÁS TARDÍO que el del manager, así que
-- empata en puntos pero queda por detrás.
insert into public.user_points (user_id, source_type, source_id, points, awarded_at)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'post_commented',
        'cccccccc-0000-0000-0000-000000000003', 10, '2026-03-05T11:00:00+01:00');

select results_eq(
  $test$
    select user_id, rank from pg_temp.board(20)
    where total_points = 20 order by rank
  $test$,
  $expected$ values
    ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 2),
    ('aaaaaaaa-0000-0000-0000-000000000003'::uuid, 3)
  $expected$,
  'empate a puntos: desempata por el primer awarded_at (manager antes que staff)'
);

-- ── is_self y fila propia fuera del top ───────────────────────────────────────

select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);  -- staff

select results_eq(
  $test$ select is_self from pg_temp.board(20) order by rank $test$,
  $expected$ values (false), (false), (true) $expected$,
  'is_self marca únicamente la fila del usuario de la sesión'
);

-- Con limit_n = 1 el staff (puesto 3) queda fuera del top y debe aparecer aparte.
select results_eq(
  $test$ select rank, is_self from pg_temp.board(1) order by rank $test$,
  $expected$ values (1, false), (3, true) $expected$,
  'staff fuera del top recibe su fila propia con el puesto real'
);

select is(
  (select count(*)::int from pg_temp.board(1)),
  2,
  'fuera del top: exactamente top N + 1 filas, sin duplicar la propia'
);

-- El admin sí está en el top 1: no se le añade fila extra.
reset role;
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);  -- admin

select is(
  (select count(*)::int from pg_temp.board(1)),
  1,
  'dentro del top: la fila propia no se repite'
);

-- ── Superficie expuesta ───────────────────────────────────────────────────────
-- La función devuelve solo columnas públicas; `email` no está entre ellas.
select ok(
  pg_get_function_result(
    'public.leaderboard(timestamptz,timestamptz,int)'::regprocedure
  ) not ilike '%email%',
  'la firma de retorno no incluye ningún campo de email'
);

-- ── Negativo: anon no puede ejecutarla ────────────────────────────────────────
reset role;
set local role anon;

select throws_ok(
  $test$
    select * from public.leaderboard(
      '2026-03-02T00:00:00+01:00'::timestamptz,
      '2026-03-09T00:00:00+01:00'::timestamptz,
      20)
  $test$,
  '42501',
  null,
  'anon no puede ejecutar leaderboard()'
);

reset role;

select * from finish();
rollback;
