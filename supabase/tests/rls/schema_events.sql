-- Schema tests: events additive migration (I-F-N05-01-01)
-- Verifies all_day + color_tag (paleta DESIGN.md), length constraints,
-- nullable author_id with ON DELETE SET NULL and the color index. Runs as the
-- default role (BYPASSRLS on public tables), so RLS does not interfere here.
-- refs: 20260716000000_alter_events_n05_schema.sql
--
-- Seed UUIDs (supabase/seed.sql):
--   manager: aaaaaaaa-0000-0000-0000-000000000002

begin;
select plan(10);

-- ── Structure ──────────────────────────────────────────────────────────────
select has_column('public', 'events', 'all_day', 'events has an all_day column');
select col_type_is('public', 'events', 'all_day', 'boolean', 'all_day is boolean');
select has_column('public', 'events', 'color_tag', 'events has a color_tag column');
select col_type_is('public', 'events', 'color_tag', 'event_color', 'color_tag is event_color');
select enum_has_labels(
  'event_color',
  ARRAY['brown', 'sea', 'sage', 'amber', 'parchment'],
  'event_color matches the DESIGN.md palette'
);
select col_is_null('public', 'events', 'author_id', 'author_id is nullable (orphaned events)');
select is(
  (select count(*)::int from pg_indexes
   where schemaname = 'public' and tablename = 'events'
     and indexname = 'events_color_tag_idx'),
  1,
  'events_color_tag_idx exists on color_tag'
);

-- ── FK delete rule: SET NULL ───────────────────────────────────────────────
-- pg_constraint.confdeltype: 'n' = SET NULL (information_schema da problemas
-- de collation dentro de results_eq de pgTAP)
select is(
  (select c.confdeltype::text
   from pg_catalog.pg_constraint c
   where c.conname = 'events_author_id_fkey'
     and c.conrelid = 'public.events'::regclass),
  'n',
  'author_id FK is ON DELETE SET NULL (los eventos se conservan)'
);

-- ── CHECK length ───────────────────────────────────────────────────────────
select throws_ok(
  $test$
    insert into public.events (author_id, title, event_start_at, event_end_at)
    values ('aaaaaaaa-0000-0000-0000-000000000002'::uuid,
            repeat('x', 201), now(), now() + interval '1 hour')
  $test$,
  '23514',
  null,
  'title above 200 chars violates the CHECK constraint'
);

-- ── Defaults ───────────────────────────────────────────────────────────────
insert into public.events (id, author_id, title, event_start_at, event_end_at)
values ('eeeeeeee-1111-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'Default color', now(), now() + interval '1 hour');

select results_eq(
  $test$
    select color_tag::text, all_day from public.events
    where id = 'eeeeeeee-1111-0000-0000-000000000001'::uuid
  $test$,
  $expected$ values ('brown', false) $expected$,
  'defaults: color_tag = brown, all_day = false'
);

select * from finish();
rollback;
