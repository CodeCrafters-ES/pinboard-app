-- Migration: N06-02-03 — Cola de receipts de Expo pendientes de comprobar
-- Precondition: 20260618700000 (push_tokens), 20260801000000 (grants de service_role)

-- Expo acusa cada envío con un ticket, pero el resultado real llega en un *receipt*
-- que solo está disponible unos minutos después. Esta cola guarda qué ticket
-- corresponde a qué dispositivo para que `process-push-receipts` pueda purgar los
-- tokens que Expo acabe marcando como inválidos.

create table public.push_receipts_pending (
  ticket_id   text        primary key,
  user_id     uuid        not null references public.profiles(user_id) on delete cascade,
  token       text        not null,
  enqueued_at timestamptz not null default now()
);

-- El job consulta por antigüedad: "pendientes de hace más de 15 minutos".
create index push_receipts_pending_enqueued_idx
  on public.push_receipts_pending (enqueued_at);

-- Sin policies a propósito: RLS activo y ninguna regla significa que ningún cliente
-- (anon o authenticated) ve nada. La cola es infraestructura del servidor; solo la
-- tocan las Edge Functions, que van con service_role y bypassean RLS.
alter table public.push_receipts_pending enable row level security;

-- `auto_expose_new_tables` está desactivado: sin GRANT explícito, service_role
-- bypassea RLS pero no llega a la tabla.
grant select, insert, delete on public.push_receipts_pending to service_role;

comment on table public.push_receipts_pending is
  'Tickets de Expo a la espera de receipt; los procesa process-push-receipts (I-F-N06-02-03)';
comment on column public.push_receipts_pending.ticket_id is
  'Identificador devuelto por Expo al aceptar el mensaje';
