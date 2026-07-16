-- Schema tests: push_tokens additive migration (I-F-N06-01-01)
-- Verifies device_name + last_seen_at and the purge index. RLS own policies
-- are covered by rls_push_tokens.sql (unchanged).
-- refs: 20260716000002_alter_push_tokens_n06_schema.sql

begin;
select plan(5);

select has_column('public', 'push_tokens', 'device_name', 'push_tokens has a device_name column');
select col_type_is('public', 'push_tokens', 'device_name', 'text', 'device_name is text');
select has_column('public', 'push_tokens', 'last_seen_at', 'push_tokens has a last_seen_at column');
select col_type_is(
  'public', 'push_tokens', 'last_seen_at', 'timestamp with time zone',
  'last_seen_at is timestamptz'
);
select is(
  (select count(*)::int from pg_indexes
   where schemaname = 'public' and tablename = 'push_tokens'
     and indexname = 'push_tokens_last_seen_idx'),
  1,
  'push_tokens_last_seen_idx exists for the age-based purge'
);

select * from finish();
rollback;
