-- =============================================================================
-- BENCH RUN — Chat pagination (I-F-N07-01-02, #281)
-- PURPOSE : Validar los criterios de aceptación de rendimiento sobre los datos
--           sembrados por chat_bench_seed.sql:
--             · Paginación (30 filas) en el hot chat  → p95 ≤ 30 ms
--             · "Mis chats" (10k chats)               → p95 ≤ 50 ms
--           y confirmar vía EXPLAIN que se usa Index Scan (no Bitmap/Seq).
-- USAGE   : pnpm bench:chat:run          (o)
--           psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--                -f supabase/bench/chat_bench_run.sql
-- Requiere haber corrido antes chat_bench_seed.sql.
-- =============================================================================
\set ON_ERROR_STOP on

\set hot_chat    '00000000-0000-4000-9000-000000000001'
\set focus_user  '00000000-0000-4000-8000-000000000000'

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' EXPLAIN — Paginación primera página (hot chat)'
\echo '════════════════════════════════════════════════════════════════════════'
explain (analyze, buffers, verbose, summary)
select id, chat_id, sender_id, content, created_at, edited_at, deleted_at
from public.messages
where chat_id = :'hot_chat'::uuid
order by created_at desc, id desc
limit 30;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' EXPLAIN — Paginación página siguiente con cursor (tupla created_at,id)'
\echo '════════════════════════════════════════════════════════════════════════'
-- Cursor ~60k filas dentro del hot chat: página "profunda" realista.
select created_at, id
from public.messages
where chat_id = :'hot_chat'::uuid
order by created_at desc, id desc
offset 60000 limit 1
\gset cursor_

explain (analyze, buffers, verbose, summary)
select id, chat_id, sender_id, content, created_at, edited_at, deleted_at
from public.messages
where chat_id = :'hot_chat'::uuid
  and (created_at, id) < (:'cursor_created_at'::timestamptz, :'cursor_id'::uuid)
order by created_at desc, id desc
limit 30;

\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' EXPLAIN — Mis chats ordenados por actividad'
\echo '════════════════════════════════════════════════════════════════════════'
explain (analyze, buffers, verbose, summary)
select c.id, c.last_message_at
from public.chat_participants cp
join public.chats c on c.id = cp.chat_id
where cp.user_id = :'focus_user'::uuid
order by c.last_message_at desc
limit 30;

-- ── Arnés de percentiles (mide sólo el tiempo de ejecución, sin EXPLAIN) ──────
\echo ''
\echo '════════════════════════════════════════════════════════════════════════'
\echo ' PERCENTILES (200 iteraciones por query)'
\echo '════════════════════════════════════════════════════════════════════════'
do $$
declare
  _iters      int := 200;
  _hot_chat   uuid := '00000000-0000-4000-9000-000000000001';
  _focus_user uuid := '00000000-0000-4000-8000-000000000000';
  _cur_ts     timestamptz;
  _cur_id     uuid;
  _t0         timestamptz;
  _paging     double precision[] := '{}';
  _mychats    double precision[] := '{}';
  _p50        numeric;
  _p95        numeric;
  i           int;
begin
  select created_at, id into _cur_ts, _cur_id
  from public.messages
  where chat_id = _hot_chat
  order by created_at desc, id desc
  offset 60000 limit 1;

  -- Paginación cursor-based.
  for i in 1.._iters loop
    _t0 := clock_timestamp();
    perform id, chat_id, sender_id, content, created_at, edited_at, deleted_at
    from public.messages
    where chat_id = _hot_chat
      and (created_at, id) < (_cur_ts, _cur_id)
    order by created_at desc, id desc
    limit 30;
    _paging := _paging || (extract(epoch from clock_timestamp() - _t0) * 1000.0);
  end loop;

  -- Mis chats.
  for i in 1.._iters loop
    _t0 := clock_timestamp();
    perform c.id, c.last_message_at
    from public.chat_participants cp
    join public.chats c on c.id = cp.chat_id
    where cp.user_id = _focus_user
    order by c.last_message_at desc
    limit 30;
    _mychats := _mychats || (extract(epoch from clock_timestamp() - _t0) * 1000.0);
  end loop;

  select round(percentile_cont(0.5)  within group (order by d)::numeric, 3),
         round(percentile_cont(0.95) within group (order by d)::numeric, 3)
    into _p50, _p95
  from unnest(_paging) as d;
  raise notice 'Paginación (30 filas)  p50=% ms  p95=% ms  [umbral p95 ≤ 30 ms]', _p50, _p95;

  select round(percentile_cont(0.5)  within group (order by d)::numeric, 3),
         round(percentile_cont(0.95) within group (order by d)::numeric, 3)
    into _p50, _p95
  from unnest(_mychats) as d;
  raise notice 'Mis chats (10k chats)  p50=% ms  p95=% ms  [umbral p95 ≤ 50 ms]', _p50, _p95;
end $$;
