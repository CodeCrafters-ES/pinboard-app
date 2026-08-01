-- Migration: N06-01-01 — push_tokens: FK a profiles + grants de service_role
-- Precondition: 20260618700000 (tabla), 20260618800000 (RLS own),
--               20260716000002 (device_name, last_seen_at)

-- ── 1. FK user_id: auth.users → profiles ─────────────────────────────────────
-- `profiles_delete_admin` permite a un admin borrar una fila de public.profiles
-- sin tocar auth.users, y con la FK original los tokens de ese usuario
-- sobrevivían: el dispositivo seguía registrado para alguien que la app ya
-- considera eliminado. profiles.user_id es UNIQUE y cascadea desde auth.users,
-- así que apuntar ahí cubre los dos caminos de borrado sin cambiar la semántica
-- de la columna (user_id sigue siendo auth.uid()).

delete from public.push_tokens pt
where not exists (
  select 1 from public.profiles p where p.user_id = pt.user_id
);

alter table public.push_tokens
  drop constraint push_tokens_user_id_fkey;

alter table public.push_tokens
  add constraint push_tokens_user_id_fkey
  foreign key (user_id) references public.profiles(user_id) on delete cascade;

-- ── 2. Grants para la Edge Function send-push ────────────────────────────────
-- service_role bypassea RLS, pero no los GRANTs: `auto_expose_new_tables` está
-- desactivado en config.toml, así que sin esto send-push no puede ni listar
-- tokens ni purgar los que Expo marca como DeviceNotRegistered.
grant select, delete on public.push_tokens to service_role;
