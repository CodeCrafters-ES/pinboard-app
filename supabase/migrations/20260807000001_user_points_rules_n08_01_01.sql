-- Migration: N08-01-01 — Reglas de puntos: helper award_points + un trigger por fuente (#294)
-- Epic N08 (#291) / Feature F-N08-01 (#292) / Issue I-F-N08-01-01 (#294).
-- Depends on: 20260807000000_create_user_points_n08_01_02.sql (enum + tabla + índice único).
-- refs: docs/adr/0007-gamification.md (tabla de valores, idempotencia, máximo 21)
--       docs/adr/0001-engagement.md (status viewed/engaged/clicked, link_clicked append-only)
--
-- Valores (spec «Reglas de gamificación», aprobada 2026-07-30):
--   clic 10 · comentario 5 · valoración 3 · reacción 2 · vista 1.
-- Idempotencia por (user_id, source_type, source_id = post_id): cada acción puntúa
-- una vez por post → máximo natural 21 pts/post/usuario. Sin tope diario.
--
-- La zona horaria (Europe/Madrid) NO aplica aquí: solo al rango del ranking (F-N08-02).
-- `awarded_at` se guarda en timestamptz (UTC) y el leaderboard hace la conversión.

-- ── Helper idempotente ────────────────────────────────────────────────────────
-- SECURITY DEFINER porque user_points tiene RLS y ningún grant de escritura: la
-- escritura es propiedad de esta función, que corre como owner (postgres). El
-- `on conflict do nothing` se apoya en user_points_uniq_source: repetir la acción
-- (recomentar, cambiar la reacción, reabrir la card) no inserta puntos nuevos.
create or replace function public.award_points(
  p_user_id uuid,
  p_source  public.points_source,
  p_post_id uuid,
  p_points  int
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.user_points (user_id, source_type, source_id, points)
  values (p_user_id, p_source, p_post_id, p_points)
  on conflict (user_id, source_type, source_id) do nothing;
$$;

comment on function public.award_points(uuid, public.points_source, uuid, int) is
  'Adjudica puntos de forma idempotente por (user_id, source_type, post_id). '
  'Uso exclusivo de los triggers award_points_* — no expuesta a clientes.';

-- ── 1) Engagement: vista (1) y clic en el enlace externo (10) ─────────────────
-- La Edge Function track-engagement escribe vía apply_engagement_events, que hace
-- INSERT ... ON CONFLICT DO UPDATE fijando siempre `status` y `link_clicked`; por
-- eso el trigger de UPDATE se limita a esas dos columnas (acumular focused_seconds
-- o max_scroll_pct no debe repuntuar). Abrir la card ya implica vista, así que el
-- punto de `post_viewed` se otorga en cualquier caso.
create or replace function public.award_points_engagement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(NEW.user_id, 'post_viewed', NEW.post_id, 1);

  if NEW.status = 'clicked' or NEW.link_clicked then
    perform public.award_points(NEW.user_id, 'post_clicked', NEW.post_id, 10);
  end if;

  return NEW;
end;
$$;

create trigger trg_award_points_engagement
  after insert or update of status, link_clicked on public.engagement_sessions
  for each row execute function public.award_points_engagement();

-- ── 2) Reacción (2) ───────────────────────────────────────────────────────────
-- `after update` incluido a propósito: cambiar like → love reejecuta el helper,
-- que no inserta nada (ya existe la fila). Deja el comportamiento explícito.
create or replace function public.award_points_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(NEW.user_id, 'post_reacted', NEW.post_id, 2);
  return NEW;
end;
$$;

create trigger trg_award_points_reaction
  after insert or update on public.post_reactions
  for each row execute function public.award_points_reaction();

-- ── 3) Valoración (3) ─────────────────────────────────────────────────────────
create or replace function public.award_points_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(NEW.user_id, 'post_rated', NEW.post_id, 3);
  return NEW;
end;
$$;

create trigger trg_award_points_rating
  after insert or update on public.post_ratings
  for each row execute function public.award_points_rating();

-- ── 4) Comentario (5) ─────────────────────────────────────────────────────────
-- DESVIACIÓN respecto al snippet de la issue #294: post_comments NO tiene columna
-- `deleted_at` — el borrado es duro (policy post_comments_delete_self_or_admin,
-- 20260618200000). El guard `NEW.deleted_at is null` no compila, así que se omite.
-- Consecuencia asumida: borrar el comentario no retira los 5 puntos, coherente con
-- la regla general de «deshacer una acción no altera los puntos ya otorgados»
-- (idem reacción borrada). Si N03 añade soft delete, revisar aquí y en el ADR-007.
create or replace function public.award_points_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.award_points(NEW.author_id, 'post_commented', NEW.post_id, 5);
  return NEW;
end;
$$;

create trigger trg_award_points_comment
  after insert or update on public.post_comments
  for each row execute function public.award_points_comment();

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Solo los triggers invocan estas funciones. Postgres no comprueba EXECUTE al
-- disparar un trigger (solo al crearlo), así que revocarlas no rompe la ejecución
-- y sí cierra la llamada directa: award_points() expuesta permitiría inventarse
-- puntos para cualquier user_id.
revoke execute on function public.award_points(uuid, public.points_source, uuid, int)
  from public, anon, authenticated;
revoke execute on function public.award_points_engagement() from public, anon, authenticated;
revoke execute on function public.award_points_reaction()   from public, anon, authenticated;
revoke execute on function public.award_points_rating()     from public, anon, authenticated;
revoke execute on function public.award_points_comment()    from public, anon, authenticated;
