-- Schema + acceso: push_receipts_pending (I-F-N06-02-03)
-- refs: 20260805000000_push_receipts_pending.sql
--
-- La cola es infraestructura del servidor: RLS activo y CERO policies, de modo que
-- ningún cliente ve nada y solo entran las Edge Functions con service_role.
--
-- Seed UUIDs (supabase/seed.sql):
--   staff: aaaaaaaa-0000-0000-0000-000000000003

begin;
select plan(9);

-- ── Estructura ───────────────────────────────────────────────────────────────

select has_column('public', 'push_receipts_pending', 'ticket_id', 'tiene ticket_id');
select col_is_pk(
  'public', 'push_receipts_pending', 'ticket_id',
  'ticket_id es PK: reencolar el mismo ticket no duplica'
);
select is(
  (select count(*)::int from pg_indexes
   where schemaname = 'public' and tablename = 'push_receipts_pending'
     and indexname = 'push_receipts_pending_enqueued_idx'),
  1,
  'existe el índice por enqueued_at que usa el job'
);

-- ── Aislamiento: RLS sin policies ────────────────────────────────────────────

select is(
  (select relrowsecurity from pg_class where oid = 'public.push_receipts_pending'::regclass),
  true,
  'RLS habilitado'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'push_receipts_pending'),
  0,
  'sin policies: ningún cliente accede a la cola'
);
select ok(
  not has_table_privilege('authenticated', 'public.push_receipts_pending', 'SELECT'),
  'authenticated no tiene GRANT sobre la cola'
);
select ok(
  not has_table_privilege('anon', 'public.push_receipts_pending', 'SELECT'),
  'anon no tiene GRANT sobre la cola'
);

-- ── service_role: lo que necesita el job y nada más ──────────────────────────

select ok(
  has_table_privilege('service_role', 'public.push_receipts_pending', 'SELECT')
    and has_table_privilege('service_role', 'public.push_receipts_pending', 'INSERT')
    and has_table_privilege('service_role', 'public.push_receipts_pending', 'DELETE'),
  'service_role puede encolar, leer y vaciar'
);

-- ── Cascade: borrar el perfil se lleva sus tickets pendientes ────────────────

insert into public.push_receipts_pending (ticket_id, user_id, token)
values ('ticket-cascade-1', 'aaaaaaaa-0000-0000-0000-000000000003'::uuid,
        'ExponentPushToken[cascade]');

delete from public.profiles where user_id = 'aaaaaaaa-0000-0000-0000-000000000003'::uuid;

select is(
  (select count(*)::int from public.push_receipts_pending where ticket_id = 'ticket-cascade-1'),
  0,
  'borrar el perfil elimina en cascada sus tickets pendientes'
);

select * from finish();
rollback;
