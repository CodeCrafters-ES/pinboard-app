-- Schema tests: post_ratings structure & constraints (#167, I-F-N03-03-01)
-- Verifies the canonical N03-03 shape: composite PK (post_id, user_id),
-- `rating` smallint 1-5, upsert idempotency and the post_id index. Runs as the
-- default role (BYPASSRLS on public tables), so RLS does not interfere here.
-- refs: 20260708100000_alter_post_ratings_n03_schema.sql
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(9);

-- ── Structure ──────────────────────────────────────────────────────────────
select has_column('public', 'post_ratings', 'rating', 'post_ratings has a rating column');
select col_type_is('public', 'post_ratings', 'rating', 'smallint', 'rating is smallint');
select hasnt_column('public', 'post_ratings', 'score', 'legacy score column is gone');
select hasnt_column('public', 'post_ratings', 'id', 'surrogate id column is gone');
select col_is_pk(
  'public', 'post_ratings', ARRAY['post_id', 'user_id'],
  'primary key is composite (post_id, user_id)'
);
select is(
  (select count(*)::int from pg_indexes
   where schemaname = 'public' and tablename = 'post_ratings'
     and indexname = 'post_ratings_post_id_idx'),
  1,
  'post_ratings_post_id_idx exists on post_id'
);

-- ── Fixtures ───────────────────────────────────────────────────────────────
insert into public.posts (id, author_id, title, external_url)
select
  'eeeeeeee-0000-0000-0000-000000000001'::uuid,
  p.id,
  'Post for rating schema',
  'https://example.com/s'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

insert into public.post_ratings (post_id, user_id, rating)
values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 3);

-- ── CHECK range ────────────────────────────────────────────────────────────
select throws_ok(
  $test$
    insert into public.post_ratings (post_id, user_id, rating)
    values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000001'::uuid, 6)
  $test$,
  '23514',
  null,
  'rating above 5 violates the CHECK constraint'
);

-- ── Composite PK blocks duplicates ─────────────────────────────────────────
select throws_ok(
  $test$
    insert into public.post_ratings (post_id, user_id, rating)
    values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
            'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 5)
  $test$,
  '23505',
  null,
  'duplicate (post_id, user_id) violates the composite PK'
);

-- ── Upsert updates in place (no new row) ───────────────────────────────────
insert into public.post_ratings (post_id, user_id, rating)
values ('eeeeeeee-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000003'::uuid, 5)
on conflict (post_id, user_id) do update set rating = excluded.rating;

select results_eq(
  $test$
    select count(*)::int, max(rating)::int from public.post_ratings
    where post_id = 'eeeeeeee-0000-0000-0000-000000000001'::uuid
      and user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  $expected$ values (1, 5) $expected$,
  'upsert on (post_id, user_id) updates the existing row in place'
);

select * from finish();
rollback;
