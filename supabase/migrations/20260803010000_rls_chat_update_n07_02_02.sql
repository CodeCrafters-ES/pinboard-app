-- Migration: N07-02-02 — RLS de chat: UPDATE own (edit/soft delete) + last_read_at (#283)
-- Epic N07 (#274) / Feature F-N07-02 (#276) / Issue I-F-N07-02-02 (#283).
-- Depends on: 20260803000000_rls_chat_n07_02_01.sql (RLS habilitada + policies base
--   SELECT/INSERT) e is_admin() de 20260617190000_security_definer_role_helpers.sql.
--
-- Completa la RLS de escritura que #282 dejó denegada por defecto: edición y soft
-- delete del propio mensaje, moderación por admin, y actualización del propio
-- last_read_at (base del contador de no leídos de F-N07-03).

-- ── messages: editar/soft-delete propio; admin modera cualquiera ──────────────
-- La ventana de edición (15 min) es regla de UX en cliente, no en RLS (ADR-0004):
-- aquí solo se comprueba autoría o admin. El trigger messages_set_edited_at
-- (BEFORE UPDATE, 20260731000000) fija edited_at solo cuando cambia content, así
-- que el soft delete (deleted_at) no marca el mensaje como editado.
create policy messages_update_own
  on public.messages for update to authenticated
  using  (sender_id = auth.uid() or public.is_admin())
  with check (sender_id = auth.uid() or public.is_admin());

-- ── messages: sin DELETE físico para usuarios (solo soft delete vía UPDATE) ────
-- 20260731000000_chat.sql concedió select/insert/update pero NO delete: sin el
-- privilegio de tabla, el DELETE falla con "permission denied" (nivel GRANT, antes
-- que la RLS) para TODOS, incluido admin, dejando el policy inerte. Patrón Supabase:
-- conceder el privilegio y restringir con RLS. Así admin borra y el resto obtiene 0
-- filas en silencio (la USING filtra), manteniendo el soft delete como norma.
grant delete on public.messages to authenticated;

create policy messages_no_hard_delete
  on public.messages for delete to authenticated
  using (public.is_admin());

-- ── chat_participants: cada quien actualiza su propio last_read_at ────────────
create policy chat_participants_update_own
  on public.chat_participants for update to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
