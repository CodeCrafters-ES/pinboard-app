-- Migration: N08-02-01 — RPC leaderboard(period_start, period_end, limit_n) (#296)
-- Epic N08 (#291) / Feature F-N08-02 (#293) / Issue I-F-N08-02-01 (#296).
-- Depends on: 20260808000000_create_user_points_n08_01_02.sql (tabla user_points)
--             20260702000000_profiles_public_view.sql (vista profiles_public)
-- refs: docs/adr/0007-gamification.md (sección «Leaderboard»)
--
-- Único camino de lectura del ranking: `user_points` NO se consulta en crudo desde
-- el cliente (su policy solo deja ver la fila propia). Esta función corre como
-- SECURITY DEFINER para poder agregar las filas de todos y devolver únicamente el
-- agregado + campos públicos del perfil.
--
-- El rango llega ya resuelto desde el cliente (lib/gamification/dateRange.ts, que
-- calcula las ventanas en Europe/Madrid). Aquí se trata como half-open
-- [period_start, period_end): «lunes 00:00 → domingo 23:59» se expresa pasando el
-- lunes siguiente como fin exclusivo, que es exacto y no pierde el último segundo.

create or replace function public.leaderboard(
  period_start timestamptz,
  period_end   timestamptz,
  limit_n      int default 20
)
returns table (
  user_id      uuid,
  full_name    text,
  avatar_url   text,
  total_points bigint,
  rank         int,
  is_self      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with bounded as (
    -- Tope duro: limit_n llega del cliente y sin acotar permitiría pedir la tabla
    -- entera en una sola llamada.
    select least(greatest(coalesce(limit_n, 20), 1), 100) as n
  ),
  agg as (
    select up.user_id                as uid,
           sum(up.points)::bigint    as total_points,
           min(up.awarded_at)        as first_awarded_at
    from public.user_points up
    where up.awarded_at >= period_start
      and up.awarded_at <  period_end
    group by up.user_id
  ),
  ranked as (
    -- rank() y no row_number(): un empate exacto (mismos puntos y mismo primer
    -- awarded_at) debe compartir puesto en lugar de romperse por orden físico.
    select a.uid,
           a.total_points,
           rank() over (order by a.total_points desc, a.first_awarded_at asc)::int as rnk
    from agg a
  ),
  visible as (
    select r.uid, r.total_points, r.rnk
    from ranked r, bounded b
    where r.rnk <= b.n
    union all
    -- Fila propia cuando el usuario queda fuera del top N (AC de F-N08-02).
    select r.uid, r.total_points, r.rnk
    from ranked r, bounded b
    where r.uid = auth.uid()
      and r.rnk > b.n
  )
  -- left join: un usuario con puntos pero sin fila en profiles no debe desaparecer
  -- del ranking (ni, peor, perder su propia posición).
  select v.uid,
         coalesce(p.full_name, 'Usuario'),
         p.avatar_url,
         v.total_points,
         v.rnk,
         coalesce(v.uid = auth.uid(), false)
  from visible v
  left join public.profiles_public p on p.user_id = v.uid
  order by v.rnk asc, v.uid asc;
$$;

comment on function public.leaderboard(timestamptz, timestamptz, int) is
  'Ranking agregado de user_points en [period_start, period_end). Devuelve el top N '
  'más la fila propia si queda fuera. Solo campos públicos del perfil — nunca emails. '
  'refs: docs/adr/0007-gamification.md';

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Solo sesiones autenticadas: `auth.uid()` gobierna is_self y la fila propia, y sin
-- JWT la función no aporta nada. El revoke a public cubre anon.
revoke execute on function public.leaderboard(timestamptz, timestamptz, int)
  from public, anon;
grant execute on function public.leaderboard(timestamptz, timestamptz, int)
  to authenticated;
