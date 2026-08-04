-- Database Webhooks → Edge Function send-push (I-F-N06-02-01)
--
-- Los "Database Webhooks" de Supabase son triggers que llaman a
-- supabase_functions.http_request (pg_net). Este script los crea de forma
-- reproducible en cualquier entorno, en vez de a mano en Studio.
--
-- La URL y el secreto NO se commitean: se pasan como variables de psql.
--
--   psql "$DB_URL" \
--     -v url="https://<project-ref>.supabase.co/functions/v1/send-push" \
--     -v secret="$PUSH_WEBHOOK_SECRET" \
--     -f supabase/webhooks/send_push_webhooks.sql
--
-- En el stack local la URL debe resolverse desde el contenedor de Postgres, así que
-- se usa el gateway interno: http://kong:8000/functions/v1/send-push
--
-- Es idempotente: se puede reejecutar para rotar el secreto o cambiar la URL.

\set ON_ERROR_STOP on

-- `messages` está desactivado salvo que se pase -v enable_messages=true.
\if :{?enable_messages}
\else
\set enable_messages false
\endif

select set_config('send_push.url',              :'url',              false);
select set_config('send_push.secret',           :'secret',           false);
select set_config('send_push.enable_messages',  :'enable_messages',  false);

do $$
declare
  v_headers text := json_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || current_setting('send_push.secret')
  )::text;
  v_url     text := current_setting('send_push.url');
  v_timeout text := '5000';
begin
  -- ── posts ────────────────────────────────────────────────────────────────
  -- INSERT y UPDATE OF status: los posts nacen como borrador y se publican
  -- después (hooks/usePosts.ts), así que colgar el push solo del INSERT dejaría
  -- sin notificar el flujo real de publicación. La Edge Function decide si toca
  -- notificar (`shouldNotifyPost`), aquí solo se acota el ruido.
  drop trigger if exists posts_send_push on public.posts;
  execute format(
    'create trigger posts_send_push
       after insert or update of status on public.posts
       for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
    v_url, 'POST', v_headers, '{}', v_timeout
  );

  -- ── events ───────────────────────────────────────────────────────────────
  -- No tienen estado de publicación: existir es estar publicado.
  drop trigger if exists events_send_push on public.events;
  execute format(
    'create trigger events_send_push
       after insert on public.events
       for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
    v_url, 'POST', v_headers, '{}', v_timeout
  );

  -- ── messages (Hito 3) ────────────────────────────────────────────────────
  -- El contrato del handler ya acepta `messages`, pero mientras el envío de chat
  -- sea un stub (F-N07-05) este trigger solo generaría tráfico inútil: se activa
  -- ejecutando el script con -v enable_messages=true.
  if current_setting('send_push.enable_messages', true) = 'true' then
    drop trigger if exists messages_send_push on public.messages;
    execute format(
      'create trigger messages_send_push
         after insert on public.messages
         for each row execute function supabase_functions.http_request(%L, %L, %L, %L, %L)',
      v_url, 'POST', v_headers, '{}', v_timeout
    );
  end if;
end $$;

-- Comprobación: deben aparecer posts_send_push y events_send_push.
select event_object_table as tabla, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_name in ('posts_send_push', 'events_send_push', 'messages_send_push')
order by tabla, event_manipulation;
