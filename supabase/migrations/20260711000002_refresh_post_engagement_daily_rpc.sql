-- Migration: RPC public.refresh_post_engagement_daily — refresco manual del dashboard
-- Part of Epic N04 / Feature F-N04-03 (#175)
-- Depende de: 20260711000001 (MV private.post_engagement_daily + job horario)
--
-- El dashboard lee datos materializados con hasta 1h de lag. Esta RPC permite forzar
-- el refresco (admin/manager) sin esperar al job de pg_cron, y es lo que ejercita el
-- test e2e del DoD ("validar que la pantalla muestra los números tras refresco manual").
--
-- La MV vive en el schema `private` (no expuesto por PostgREST), así que el único
-- camino desde el cliente es esta función: SECURITY DEFINER para poder refrescarla,
-- con guard is_manager() dentro (jerarquía inclusiva admin > manager).

create or replace function public.refresh_post_engagement_daily()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_manager() then
    raise exception 'solo admin/manager pueden refrescar el dashboard de engagement'
      using errcode = '42501';
  end if;

  -- Refresco NO concurrente a propósito: PostgREST ejecuta cada request dentro de una
  -- transacción y REFRESH ... CONCURRENTLY no puede correr en un bloque transaccional.
  -- El refresco periódico (job horario de pg_cron) sí usa CONCURRENTLY, porque corre
  -- fuera de transacción y no debe bloquear las lecturas del dashboard.
  refresh materialized view private.post_engagement_daily;
end;
$$;

comment on function public.refresh_post_engagement_daily() is
  'Refresco manual del dashboard de engagement (F-N04-03). Solo admin/manager. '
  'El refresco periódico lo hace el job horario de pg_cron con CONCURRENTLY.';

revoke execute on function public.refresh_post_engagement_daily() from public;
revoke execute on function public.refresh_post_engagement_daily() from anon;
grant  execute on function public.refresh_post_engagement_daily() to authenticated;
