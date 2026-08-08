-- Migration: S00-04-05 — revocar privilegios residuales a anon/authenticated en public (#323)
-- Epic S00 / Feature F-S00-04 (#38) / Issue I-F-S00-04-05 (#323).
-- refs: docs/adr/0002-rbac.md (convención de grants y revokes)
--
-- `TRUNCATE` NO pasa por RLS: una policy no impide vaciar la tabla. Los privilegios
-- por defecto del esquema conceden a anon y authenticated `Dxtm` sobre toda tabla
-- nueva creada por `postgres` (D=TRUNCATE, x=REFERENCES, t=TRIGGER, m=MAINTAIN),
-- y el `revoke insert, update, delete` que usan las migraciones del repo no los toca.
-- Resultado: cualquiera con acceso SQL directo podía vaciar posts, profiles, messages
-- o user_points.
--
-- Riesgo práctico bajo —PostgREST no expone TRUNCATE, así que no hay ruta desde la
-- API— pero incumple el mínimo privilegio y deja una operación destructiva fuera del
-- alcance de las policies, que es justo la premisa de EPIC-S00.
--
-- `service_role` conserva sus privilegios: es el rol de servidor (Edge Functions), ya
-- omite RLS por diseño y restringirlo no aporta nada.
--
-- Nada del proyecto depende de lo que se revoca: los clientes no crean triggers ni
-- FKs, y la única vista materializada (`private.post_engagement_daily`) vive fuera de
-- `public` y se refresca por una función SECURITY DEFINER que corre como owner.
--
-- Alcance del `alter default privileges`: solo afecta al ACL por defecto de `postgres`,
-- que es el rol con el que corren las migraciones y el dueño de las 21 tablas y vistas
-- de `public`. Sigue existiendo un ACL por defecto de `supabase_admin` que concede
-- `arwdDxtm`, pero solo se aplicaría a objetos creados POR ese rol —ninguno del
-- proyecto— y `postgres` no puede alterarlo en un proyecto hosted, donde no es
-- superusuario. Intentarlo aquí haría fallar la migración en producción.

do $$
declare
  -- MAINTAIN existe desde Postgres 17: nombrarlo en un servidor anterior es un error
  -- de sintaxis. Se aplica condicionalmente para que la migración valga en 15, 16 y 17
  -- sin tener que editarla según la versión del proyecto Supabase.
  privs text := case
    when current_setting('server_version_num')::int >= 170000
      then 'truncate, references, trigger, maintain'
    else 'truncate, references, trigger'
  end;
begin
  -- Tablas y vistas que ya existen.
  execute format(
    'revoke %s on all tables in schema public from anon, authenticated', privs
  );

  -- Tablas futuras. Sin esto, la siguiente migración que cree una tabla vuelve a
  -- introducir el privilegio y el arreglo dura hasta el próximo `create table`.
  -- Se ejecuta como `postgres`, que es el owner del default ACL implicado.
  execute format(
    'alter default privileges in schema public revoke %s on tables from anon, authenticated',
    privs
  );
end $$;
