-- Migration: RPC apply_engagement_events — escritura atómica del lote de engagement
-- Part of Epic N04 / Feature F-N04-02 (#174) / Issue I-F-N04-02-02 (#179)
-- refs: docs/adr/0001-engagement.md (link_clicked append-only + status)
--       docs/adr/0006-engagement-behavioral-signals.md (acumulación focused_seconds / max_scroll_pct)
--
-- La Edge Function track-engagement (service_role) delega aquí el UPSERT porque
-- PostgREST/supabase-js no puede expresar la acumulación `columna = columna + excluded`.
-- La RPC recibe el lote validado (jsonb array), lo PRE-AGREGA por post_id (para no
-- violar "ON CONFLICT ... cannot affect row a second time" cuando el lote trae varios
-- eventos del mismo post) y hace un único INSERT ... ON CONFLICT idempotente:
--   - link_clicked: append-only (OR), nunca true → false.
--   - status: 'clicked' es terminal; si no hay clic se conserva el status actual
--             (no lo degrada; 'engaged' lo deriva el dashboard, no esta función).
--   - focused_seconds: se acumula (suma de deltas).
--   - max_scroll_pct: se toma el máximo (monotónico).

create or replace function public.apply_engagement_events(
  p_user_id uuid,
  p_events  jsonb
)
returns table (
  post_id         uuid,
  status          text,
  link_clicked    boolean,
  focused_seconds integer,
  max_scroll_pct  numeric
)
language sql
-- SECURITY DEFINER: la función es dueña de la escritura. service_role omite RLS
-- pero carece de privilegios de tabla sobre engagement_sessions; ejecutándose como
-- el owner (postgres) la escritura queda encapsulada aquí y solo service_role puede
-- invocarla (grants abajo). search_path vacío evita secuestro de nombres.
security definer
set search_path = ''
as $$
  insert into public.engagement_sessions as es
    (id, user_id, post_id, link_clicked, status, focused_seconds, max_scroll_pct, last_seen_at)
  select
    coalesce(min(e->>'session_id')::uuid, gen_random_uuid()),
    p_user_id,
    (e->>'post_id')::uuid,
    coalesce(bool_or((e->>'link_clicked')::boolean), false),
    case when coalesce(bool_or((e->>'link_clicked')::boolean), false)
         then 'clicked' else 'viewed' end,
    coalesce(sum((e->>'focused_seconds_delta')::int), 0),
    coalesce(max((e->>'max_scroll_pct')::numeric), 0),
    now()
  from jsonb_array_elements(p_events) as e
  group by (e->>'post_id')::uuid
  on conflict (user_id, post_id) do update set
    link_clicked    = es.link_clicked or excluded.link_clicked,
    status          = case when es.link_clicked or excluded.link_clicked
                           then 'clicked' else es.status end,
    focused_seconds = es.focused_seconds + excluded.focused_seconds,
    max_scroll_pct  = greatest(es.max_scroll_pct, excluded.max_scroll_pct),
    last_seen_at    = now()
  returning es.post_id, es.status, es.link_clicked, es.focused_seconds, es.max_scroll_pct;
$$;

comment on function public.apply_engagement_events(uuid, jsonb) is
  'Escritura atómica de un lote de eventos de engagement. Uso exclusivo de la Edge '
  'Function track-engagement con service_role: p_user_id = auth.uid() del JWT verificado. '
  'refs: docs/adr/0001-engagement.md, docs/adr/0006-engagement-behavioral-signals.md';

-- No exponer a clientes: escribiría engagement de cualquier p_user_id (suplantación).
-- Solo service_role (Edge Function) puede ejecutarla.
revoke execute on function public.apply_engagement_events(uuid, jsonb) from public;
revoke execute on function public.apply_engagement_events(uuid, jsonb) from anon, authenticated;
grant  execute on function public.apply_engagement_events(uuid, jsonb) to service_role;
