-- Migration: N06-02-02 — profiles: grant de SELECT para service_role
-- Precondition: 20260801000000 (grants de push_tokens)

-- `posts.author_id` referencia `profiles.id`, pero `push_tokens.user_id` guarda
-- `auth.uid()`. Para excluir al autor de un post nuevo, la Edge Function send-push
-- tiene que traducir uno en otro leyendo `profiles`. `auto_expose_new_tables` está
-- desactivado, así que service_role bypassea RLS pero no llega a la tabla sin este
-- GRANT: la query fallaba con "permission denied for table profiles" y el push se
-- habría enviado también al autor (o no se habría enviado en absoluto).
--
-- Solo lectura: send-push nunca escribe en profiles.
grant select on public.profiles to service_role;
