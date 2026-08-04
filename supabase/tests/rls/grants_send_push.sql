-- Grants que necesita la Edge Function send-push (I-F-N06-02-02)
-- refs: 20260801000000_push_tokens_n06_fk_and_grants.sql
--       20260804000000_grant_profiles_select_service_role.sql
--
-- service_role bypassea RLS por atributo de rol, pero no los GRANTs: sin ellos la
-- función no puede resolver destinatarios. Las policies own de push_tokens y las de
-- profiles se cubren en sus propios ficheros.

begin;
select plan(4);

-- Traducción posts.author_id (profiles.id) → profiles.user_id (auth.uid()).
select ok(
  has_table_privilege('service_role', 'public.profiles', 'SELECT'),
  'service_role puede leer profiles (mapear el autor de un post a su user_id)'
);

-- Solo lectura: send-push nunca escribe perfiles.
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'INSERT'),
  'service_role no puede insertar perfiles'
);
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'UPDATE'),
  'service_role no puede modificar perfiles'
);
select ok(
  not has_table_privilege('service_role', 'public.profiles', 'DELETE'),
  'service_role no puede borrar perfiles'
);

select * from finish();
rollback;
