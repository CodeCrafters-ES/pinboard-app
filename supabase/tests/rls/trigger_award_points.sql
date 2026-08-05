-- Trigger tests: reglas de puntos award_points_* (I-F-N08-01-01, #294)
-- Valores: clic 10 · comentario 5 · valoración 3 · reacción 2 · vista 1.
-- Cubre las 5 acciones, la idempotencia por (user_id, source_type, post_id) y el
-- máximo natural de 21 pts/post/usuario.
-- refs: docs/adr/0007-gamification.md, migración 20260808000001_user_points_rules_n08_01_01.sql
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(12);

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

-- Resumen de los puntos de un usuario sobre el post de la prueba.
create or replace function pg_temp.points_of(uid uuid)
returns table (source_type text, points int) language sql as $$
  select up.source_type::text, up.points
  from public.user_points up
  where up.user_id = uid
    and up.source_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid
  order by 1;
$$;

-- ── Fixtures (como postgres: superusuario, omite RLS) ─────────────────────────
-- posts.author_id referencia profiles(id), no auth.users(id).
insert into public.posts (id, author_id, title, external_url, status, published_at)
select
  'eeeeeeee-0000-0000-0000-000000000001'::uuid,
  p.id,
  'Post para puntos',
  'https://example.com/gamificacion',
  'published',
  now()
from public.profiles p
where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

-- ── 1) Engagement: vista (1 pt) ───────────────────────────────────────────────
-- Solo la Edge Function track-engagement (service_role) escribe aquí; en el test
-- se simula la escritura directa, que dispara el mismo trigger.
insert into public.engagement_sessions (user_id, post_id, status)
values ('aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'viewed');

select results_eq(
  $test$ select * from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid) $test$,
  $expected$ values ('post_viewed', 1) $expected$,
  'abrir la card otorga 1 pt de vista'
);

-- ── 2) Engagement: clic en el enlace externo (10 pts) ─────────────────────────
update public.engagement_sessions
  set status = 'clicked', link_clicked = true
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
    and post_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid;

select results_eq(
  $test$ select * from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid) $test$,
  $expected$ values ('post_clicked', 10), ('post_viewed', 1) $expected$,
  'clicar el enlace otorga 10 pts, sin repetir el punto de vista'
);

-- ── 3) Reentrada: la misma sesión vuelve a reportar clic ──────────────────────
update public.engagement_sessions
  set status = 'clicked', link_clicked = true
  where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
    and post_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid;

select results_eq(
  $test$ select * from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid) $test$,
  $expected$ values ('post_clicked', 10), ('post_viewed', 1) $expected$,
  'reportar el clic otra vez no duplica puntos'
);

-- ── Interacciones N03: se escriben como el propio usuario (RLS activa) ────────
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);  -- staff

-- Negative: award_points() no es invocable por clientes (solo por los triggers)
select throws_ok(
  $test$
    select public.award_points(
      'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 'post_clicked',
      'eeeeeeee-0000-0000-0000-000000000001'::uuid, 999)
  $test$,
  '42501',
  null,
  'staff no puede llamar a award_points() directamente'
);

-- ── 4) Reacción (2 pts) ───────────────────────────────────────────────────────
insert into public.post_reactions (post_id, user_id, type)
values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'like');

select results_eq(
  $test$
    select points from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid)
    where source_type = 'post_reacted'
  $test$,
  $expected$ values (2) $expected$,
  'reaccionar otorga 2 pts'
);

update public.post_reactions set type = 'love'
  where post_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

select results_eq(
  $test$
    select count(*)::int from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid)
    where source_type = 'post_reacted'
  $test$,
  $expected$ values (1) $expected$,
  'cambiar la reacción no suma puntos extra'
);

-- ── 5) Valoración (3 pts) ─────────────────────────────────────────────────────
insert into public.post_ratings (post_id, user_id, rating)
values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        4);

select results_eq(
  $test$
    select points from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid)
    where source_type = 'post_rated'
  $test$,
  $expected$ values (3) $expected$,
  'valorar otorga 3 pts'
);

update public.post_ratings set rating = 5
  where post_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid
    and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

select results_eq(
  $test$
    select count(*)::int from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid)
    where source_type = 'post_rated'
  $test$,
  $expected$ values (1) $expected$,
  'cambiar la valoración no suma puntos extra'
);

-- ── 6) Comentario (5 pts) ─────────────────────────────────────────────────────
insert into public.post_comments (post_id, author_id, body)
values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'Primer comentario');

select results_eq(
  $test$
    select points from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid)
    where source_type = 'post_commented'
  $test$,
  $expected$ values (5) $expected$,
  'comentar otorga 5 pts'
);

insert into public.post_comments (post_id, author_id, body)
values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'Segundo comentario');

select results_eq(
  $test$
    select count(*)::int from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid)
    where source_type = 'post_commented'
  $test$,
  $expected$ values (1) $expected$,
  'comentar dos veces el mismo post no suma 5 pts dos veces'
);

-- ── 7) Máximo natural por post y usuario ──────────────────────────────────────
select results_eq(
  $test$
    select count(*)::int, sum(points)::int
    from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000003'::uuid)
  $test$,
  $expected$ values (5, 21) $expected$,
  'las 5 acciones suman el máximo de 21 pts por post y usuario'
);

-- ── 8) La idempotencia es por usuario, no global ──────────────────────────────
reset role;

insert into public.engagement_sessions (user_id, post_id, status, link_clicked)
values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'clicked', true);

select results_eq(
  $test$ select * from pg_temp.points_of('aaaaaaaa-0000-0000-0000-000000000002'::uuid) $test$,
  $expected$ values ('post_clicked', 10), ('post_viewed', 1) $expected$,
  'otro usuario puntúa el mismo post de forma independiente'
);

select * from finish();
rollback;
