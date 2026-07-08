-- RLS tests: storage.objects for buckets post-images / event-images / avatars (#150)
-- Policies: {post,event}_images_{select_authenticated,insert_manager_or_admin,
--           update_own_or_admin,delete_own_or_admin} and the existing avatars_*.
-- refs: docs/adr/0002-rbac.md ("Storage Policies — SQL canónico")
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(13);

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

-- storage guards direct deletes with the protect_objects_delete trigger, which
-- lets a delete through only when storage.allow_delete_query = 'true'. We opt in
-- for this rolled-back transaction so the DELETE policies can be exercised via
-- plain SQL; RLS is still enforced per role independently of this flag.
select set_config('storage.allow_delete_query', 'true', true);

-- Fixtures inserted as postgres (bypasses RLS). Owner folders:
--   F1: post-images  owned by manager
--   F2: event-images owned by manager
--   F3: post-images  owned by admin
insert into storage.objects (bucket_id, name) values
  ('post-images',  'aaaaaaaa-0000-0000-0000-000000000002/p1/cover.webp'),
  ('event-images', 'aaaaaaaa-0000-0000-0000-000000000002/e1/cover.webp'),
  ('post-images',  'aaaaaaaa-0000-0000-0000-000000000001/pa/cover.webp');

-- ── SELECT ────────────────────────────────────────────────────────────────────

-- Positive: staff can read post-images (read-only access)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select results_eq(
  $test$ select count(*)::int from storage.objects
         where name = 'aaaaaaaa-0000-0000-0000-000000000002/p1/cover.webp' $test$,
  $expected$ values (1) $expected$,
  'staff puede leer objetos de post-images'
);

-- Positive: staff can read event-images
select results_eq(
  $test$ select count(*)::int from storage.objects
         where name = 'aaaaaaaa-0000-0000-0000-000000000002/e1/cover.webp' $test$,
  $expected$ values (1) $expected$,
  'staff puede leer objetos de event-images'
);

-- ── INSERT (post-images / event-images) ───────────────────────────────────────

-- Positive: manager uploads to their own post-images folder
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select lives_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('post-images', 'aaaaaaaa-0000-0000-0000-000000000002/p2/cover.webp') $test$,
  'manager puede subir a su propia carpeta de post-images'
);

-- Positive: manager uploads to their own event-images folder
select lives_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('event-images', 'aaaaaaaa-0000-0000-0000-000000000002/e2/cover.webp') $test$,
  'manager puede subir a su propia carpeta de event-images'
);

-- Positive: admin uploads to post-images
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select lives_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('post-images', 'aaaaaaaa-0000-0000-0000-000000000001/pa2/cover.webp') $test$,
  'admin puede subir a post-images'
);

-- Negative: manager cannot upload under a different owner's folder
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select throws_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('post-images', 'aaaaaaaa-0000-0000-0000-000000000001/hack/cover.webp') $test$,
  '42501',
  null,
  'manager no puede subir a la carpeta de otro usuario en post-images'
);

-- Negative: staff cannot upload to post-images (even to their own folder)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000003'::uuid);

select throws_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('post-images', 'aaaaaaaa-0000-0000-0000-000000000003/s/cover.webp') $test$,
  '42501',
  null,
  'staff no puede subir a post-images'
);

-- Negative: staff cannot upload to event-images
select throws_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('event-images', 'aaaaaaaa-0000-0000-0000-000000000003/s/cover.webp') $test$,
  '42501',
  null,
  'staff no puede subir a event-images'
);

-- ── INSERT (avatars) ──────────────────────────────────────────────────────────

-- Positive: a user can upload their own avatar
select lives_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('avatars', 'aaaaaaaa-0000-0000-0000-000000000003/avatar.webp') $test$,
  'staff puede subir su propio avatar'
);

-- Negative: a user cannot write to another user's avatar folder (overwrite attempt)
select throws_ok(
  $test$ insert into storage.objects (bucket_id, name)
         values ('avatars', 'aaaaaaaa-0000-0000-0000-000000000001/avatar.webp') $test$,
  '42501',
  null,
  'staff no puede escribir en el avatar de otro usuario'
);

-- ── DELETE (post-images) ──────────────────────────────────────────────────────

-- Positive: manager can delete an object in their own folder (F1)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000002'::uuid);

select results_eq(
  $test$
    with res as (
      delete from storage.objects
      where name = 'aaaaaaaa-0000-0000-0000-000000000002/p1/cover.webp'
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (1) $expected$,
  'manager puede borrar un objeto de su propia carpeta en post-images'
);

-- Negative: manager cannot delete an admin-owned object (F3)
select results_eq(
  $test$
    with res as (
      delete from storage.objects
      where name = 'aaaaaaaa-0000-0000-0000-000000000001/pa/cover.webp'
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (0) $expected$,
  'manager no puede borrar un objeto de la carpeta de otro usuario'
);

-- Positive: admin can delete any object (the admin-owned F3 survives above)
select pg_temp.set_session('aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select results_eq(
  $test$
    with res as (
      delete from storage.objects
      where name = 'aaaaaaaa-0000-0000-0000-000000000001/pa/cover.webp'
      returning 1
    ) select count(*)::int from res
  $test$,
  $expected$ values (1) $expected$,
  'admin puede borrar cualquier objeto de post-images'
);

select * from finish();
rollback;
