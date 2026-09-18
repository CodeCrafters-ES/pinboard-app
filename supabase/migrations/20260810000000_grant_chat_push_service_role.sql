-- Migration: N07-05-01 — grants de SELECT para service_role (push de chat)
-- Epic N07 (#274) / Feature F-N07-05 (#279) / Issue I-F-N07-05-01 (#289).
-- Precondition: 20260731000000_chat.sql (chat_participants) y
--   20260702000000_profiles_public_view.sql (profiles_public).
--
-- La Edge Function send-push corre con service_role para saltarse la RLS al resolver
-- destinatarios. Con `auto_expose_new_tables` desactivado, service_role bypassa la RLS
-- pero NO llega a tablas/vistas nuevas sin GRANT explícito (mismo caso que
-- 20260804000000 para profiles y 20260805000000 para push_receipts_pending).
--
-- El handler de mensajes (handleMessageInsert) necesita:
--   · chat_participants → resolver los participantes del chat (destinatarios ≠ remitente).
--   · profiles_public   → el full_name del remitente para el título de la notificación.
-- Sin estos grants la query fallaría con "permission denied" y no se notificaría a nadie.
--
-- Solo lectura: send-push nunca escribe en estas relaciones.
grant select on public.chat_participants to service_role;
grant select on public.profiles_public  to service_role;
