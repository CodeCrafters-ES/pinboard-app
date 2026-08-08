-- Tests: privilegios residuales de anon/authenticated en el esquema public — I-F-S00-04-05 (#323)
-- Migración 20260814000000_revoke_residual_grants_public_s00_04_05.sql.
-- Cubre: ninguna tabla de public concede TRUNCATE/REFERENCES/TRIGGER/MAINTAIN a los
-- roles de cliente, las tablas futuras nacen ya sin ellos, service_role los conserva,
-- el DML legítimo no se toca y truncar como authenticated falla de verdad.
--
-- Es una comprobación sobre el catálogo, así que falla también si una migración
-- futura reintroduce el privilegio al crear una tabla nueva.
--
-- Seed UUIDs (supabase/seed.sql):
--   staff: aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(7);

-- MAINTAIN solo existe en Postgres 17+; en versiones anteriores simplemente nunca
-- aparece en el catálogo, así que la lista sirve para cualquier versión.
create or replace function pg_temp.residual_grants(role_name text)
returns int language sql stable as $$
  select count(*)::int
  from information_schema.role_table_grants
  where table_schema = 'public'
    and grantee = role_name
    and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN');
$$;

-- ── Tablas existentes ─────────────────────────────────────────────────────────

select is(
  pg_temp.residual_grants('anon'), 0,
  'ninguna tabla de public concede TRUNCATE/REFERENCES/TRIGGER/MAINTAIN a anon'
);

select is(
  pg_temp.residual_grants('authenticated'), 0,
  'ninguna tabla de public concede TRUNCATE/REFERENCES/TRIGGER/MAINTAIN a authenticated'
);

-- ── service_role conserva lo suyo ─────────────────────────────────────────────
-- Es el rol de servidor: restringirlo no aporta y rompería el mantenimiento.

select cmp_ok(
  pg_temp.residual_grants('service_role'), '>', 0,
  'service_role conserva sus privilegios'
);

-- ── No-regresión del DML legítimo ─────────────────────────────────────────────
-- El revoke solo debía tocar los privilegios residuales.

select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and table_name = 'posts' and privilege_type = 'SELECT'),
  1,
  'authenticated mantiene el SELECT sobre posts'
);

-- ── Tablas futuras ────────────────────────────────────────────────────────────
-- ALTER DEFAULT PRIVILEGES: una tabla creada después de la migración (por postgres,
-- como hacen todas las migraciones) debe nacer ya sin los privilegios residuales.

create table public._grants_probe (id int primary key);

select is(
  (select count(*)::int
   from information_schema.role_table_grants
   where table_schema = 'public' and table_name = '_grants_probe'
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN')),
  0,
  'una tabla nueva nace sin privilegios residuales para anon/authenticated'
);

drop table public._grants_probe;

-- ── Comprobación funcional ────────────────────────────────────────────────────
-- El catálogo puede decir una cosa y el motor otra: se ejercita el TRUNCATE real.

insert into public.user_points (user_id, source_type, source_id, points)
values ('aaaaaaaa-0000-0000-0000-000000000003', 'post_clicked',
        'bbbbbbbb-0000-0000-0000-000000000001', 10);

select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  'truncate public.user_points',
  '42501',
  null,
  'authenticated no puede truncar user_points'
);

select throws_ok(
  'truncate public.posts',
  '42501',
  null,
  'authenticated tampoco puede truncar posts'
);

reset role;

select * from finish();
rollback;
