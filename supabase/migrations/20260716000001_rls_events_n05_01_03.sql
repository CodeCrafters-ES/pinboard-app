-- Migration: N05-01-03 — RLS events: manager solo own; admin all
-- Corrige las policies permisivas de 20260618400000_rls_events.sql, donde
-- cualquier manager podía escribir sobre cualquier evento.
-- Decisión cerrada el 2026-07-16 (EPIC-N05 / ADR-002-rbac): consistente con posts.
-- Depends on: helpers is_admin() / is_manager() (0003/0004), events (0008)

-- ── 1. Retirar policies permisivas ────────────────────────────────────────────
drop policy events_insert_manager_or_admin on public.events;
drop policy events_update_manager_or_admin on public.events;
drop policy events_delete_manager_or_admin on public.events;

-- (events_select_authenticated se mantiene: lectura para cualquier autenticado)

-- ── 2. Policies definitivas ───────────────────────────────────────────────────
-- INSERT: manager/admin, siempre como ellos mismos (is_manager() incluye admin)
create policy events_insert_manager_or_admin
  on public.events for insert to authenticated
  with check (is_manager() and author_id = auth.uid());

-- UPDATE: admin cualquiera; manager solo own.
-- Eventos huérfanos (author_id null): el check own falla con null → solo admin.
create policy events_update_own_or_admin
  on public.events for update to authenticated
  using  (is_admin() or (is_manager() and author_id = auth.uid()))
  with check (is_admin() or (is_manager() and author_id = auth.uid()));

-- DELETE: admin cualquiera; manager solo own
create policy events_delete_own_or_admin
  on public.events for delete to authenticated
  using (is_admin() or (is_manager() and author_id = auth.uid()));
