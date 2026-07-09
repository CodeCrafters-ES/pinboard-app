-- Schema tests: engagement_sessions structure & constraints (#178, I-F-N04-02-01)
-- Verifies the N04 reading-session shape: session_id PK, focused_seconds/max_scroll_pct
-- with CHECK ranges, engagement_state enum, on-conflict upsert, and cascade deletes
-- from posts and profiles. Runs as the default role (BYPASSRLS on public tables),
-- so RLS does not interfere here.
-- refs: 20260710000000_replace_engagement_sessions_n04_schema.sql · docs/adr/0003-engagement-reading-sessions.md
--
-- Seed UUIDs (supabase/seed.sql):
--   admin:   aaaaaaaa-0000-0000-0000-000000000001
--   manager: aaaaaaaa-0000-0000-0000-000000000002
--   staff:   aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(16);

-- ── Structure ──────────────────────────────────────────────────────────────
select has_column('public', 'engagement_sessions', 'session_id', 'has session_id column');
select col_is_pk('public', 'engagement_sessions', 'session_id', 'primary key is session_id');
select has_column('public', 'engagement_sessions', 'focused_seconds', 'has focused_seconds column');
select has_column('public', 'engagement_sessions', 'max_scroll_pct', 'has max_scroll_pct column');
select has_column('public', 'engagement_sessions', 'state', 'has state column');
select col_type_is('public', 'engagement_sessions', 'state', 'engagement_state', 'state is engagement_state enum');
select hasnt_column('public', 'engagement_sessions', 'id', 'legacy surrogate id column is gone');
select hasnt_column('public', 'engagement_sessions', 'link_clicked', 'legacy link_clicked column is gone');
select hasnt_column('public', 'engagement_sessions', 'status', 'legacy status column is gone');
select hasnt_column('public', 'engagement_sessions', 'device', 'legacy device column is gone');

-- ── Fixtures (post authored by manager; session owned by staff's profile) ────
insert into public.posts (id, author_id, title, external_url)
select
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  p.id,
  'Post for engagement schema',
  'https://example.com/e'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

insert into public.engagement_sessions (session_id, post_id, user_id, focused_seconds, max_scroll_pct)
select
  'dddddddd-1111-0000-0000-000000000001'::uuid,
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  p.id,
  10,
  0.5
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

-- ── Defaults ─────────────────────────────────────────────────────────────────
select is(
  (select state::text from public.engagement_sessions
   where session_id = 'dddddddd-1111-0000-0000-000000000001'::uuid),
  'viewed',
  'state defaults to viewed'
);

-- ── CHECK constraints reject invalid values ─────────────────────────────────
select throws_ok(
  $test$
    insert into public.engagement_sessions (session_id, post_id, user_id, max_scroll_pct)
    select 'dddddddd-1111-0000-0000-0000000000ff'::uuid,
           'dddddddd-0000-0000-0000-000000000001'::uuid, p.id, 1.5
    from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  '23514',
  null,
  'max_scroll_pct = 1.5 violates the CHECK (0..1)'
);

select throws_ok(
  $test$
    insert into public.engagement_sessions (session_id, post_id, user_id, focused_seconds)
    select 'dddddddd-1111-0000-0000-0000000000fe'::uuid,
           'dddddddd-0000-0000-0000-000000000001'::uuid, p.id, -1
    from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
  $test$,
  '23514',
  null,
  'focused_seconds = -1 violates the CHECK (>= 0)'
);

-- ── PK upsert (on conflict (session_id) do update) ───────────────────────────
insert into public.engagement_sessions (session_id, post_id, user_id, focused_seconds, max_scroll_pct)
select
  'dddddddd-1111-0000-0000-000000000001'::uuid,
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  p.id, 25, 0.8
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid
on conflict (session_id) do update
  set focused_seconds = excluded.focused_seconds,
      max_scroll_pct  = excluded.max_scroll_pct;

select results_eq(
  $test$
    select count(*)::int, max(focused_seconds)::int from public.engagement_sessions
    where session_id = 'dddddddd-1111-0000-0000-000000000001'::uuid
  $test$,
  $expected$ values (1, 25) $expected$,
  'on conflict (session_id) updates the existing row in place (no duplicate)'
);

-- ── Cascade: deleting the post removes its sessions ──────────────────────────
delete from public.posts where id = 'dddddddd-0000-0000-0000-000000000001'::uuid;

select is(
  (select count(*)::int from public.engagement_sessions
   where session_id = 'dddddddd-1111-0000-0000-000000000001'::uuid),
  0,
  'deleting a post cascades to its engagement_sessions'
);

-- ── Cascade: deleting a profile removes its sessions ─────────────────────────
insert into public.posts (id, author_id, title, external_url)
select
  'dddddddd-0000-0000-0000-000000000002'::uuid,
  p.id, 'Post for cascade', 'https://example.com/e2'
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000002'::uuid;

insert into public.engagement_sessions (session_id, post_id, user_id)
select
  'dddddddd-1111-0000-0000-000000000002'::uuid,
  'dddddddd-0000-0000-0000-000000000002'::uuid,
  p.id
from public.profiles p where p.user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

delete from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

select is(
  (select count(*)::int from public.engagement_sessions
   where session_id = 'dddddddd-1111-0000-0000-000000000002'::uuid),
  0,
  'deleting a profile cascades to its engagement_sessions'
);

select * from finish();
rollback;
