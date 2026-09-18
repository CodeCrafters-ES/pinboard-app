-- Cron → Edge Function process-push-receipts (I-F-N06-02-03)
--
-- Drena `push_receipts_pending` cada hora: consulta a Expo el receipt de cada ticket
-- y purga los tokens que dé por perdidos. La cadencia horaria basta porque los
-- receipts tardan minutos en estar listos y Expo los conserva ~24h.
--
-- La URL y el secreto NO se commitean: se pasan como variables de psql.
--
--   psql "$DB_URL" \
--     -v url="https://<project-ref>.supabase.co/functions/v1/process-push-receipts" \
--     -v secret="$PUSH_WEBHOOK_SECRET" \
--     -f supabase/schedules/process_push_receipts.sql
--
-- En local, la URL debe resolverse desde el contenedor de Postgres:
--   http://kong:8000/functions/v1/process-push-receipts
--
-- Es idempotente: reejecutarlo reprograma el job con la URL o el secreto nuevos.

\set ON_ERROR_STOP on

select set_config('push_receipts.url',    :'url',    false);
select set_config('push_receipts.secret', :'secret', false);

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
declare
  v_job_name text := 'process-push-receipts-hourly';
  v_command  text;
begin
  -- net.http_post es asíncrono: el job encola la petición y termina, así que el
  -- worker de cron no se queda esperando a Expo.
  v_command := format(
    $cmd$select net.http_post(
      url     := %L,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || %L
      ),
      body    := '{}'::jsonb
    )$cmd$,
    current_setting('push_receipts.url'),
    current_setting('push_receipts.secret')
  );

  -- cron.schedule sobre un nombre existente reemplaza la definición.
  perform cron.schedule(v_job_name, '0 * * * *', v_command);
end $$;

-- Comprobación: debe aparecer el job activo con su cadencia.
select jobname, schedule, active from cron.job where jobname = 'process-push-receipts-hourly';
