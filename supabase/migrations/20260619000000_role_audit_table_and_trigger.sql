-- Migration: 0014 — role_audit table, trigger, and RLS
-- refs: docs/adr/0002-rbac.md
-- Part of Epic S00 / Feature F-S00-05 / Issue I-F-S00-05-01
-- Depends on: 0001 (profiles table), 0003/0004 (is_admin helper)

-- ── Table ─────────────────────────────────────────────────────────────────────
create table if not exists public.role_audit (
  id             uuid            primary key default gen_random_uuid(),
  target_user_id uuid            references public.profiles(id) on delete set null,
  changed_by     uuid,           -- auth.uid() of the actor; null when service_role
  from_role      public.user_role,           -- previous role (null on first assignment)
  to_role        public.user_role not null,  -- new role
  changed_at     timestamptz     not null default now()
);

create index if not exists role_audit_target_user_idx on public.role_audit (target_user_id);
create index if not exists role_audit_changed_at_idx  on public.role_audit (changed_at desc);

comment on table public.role_audit is
  'Auditoría append-only de cambios en profiles.role. '
  'Solo admin puede leer. Escritura exclusiva vía trigger log_role_change(). '
  'refs: docs/adr/0002-rbac.md';

-- ── Trigger function ──────────────────────────────────────────────────────────
-- SECURITY DEFINER: runs as owner (postgres) so the insert into role_audit
-- succeeds regardless of which Postgres role executed the UPDATE on profiles.
create or replace function public.log_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if new.role is distinct from old.role then
    insert into public.role_audit (target_user_id, changed_by, from_role, to_role)
    values (new.id, auth.uid(), old.role, new.role);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_role_audit on public.profiles;
create trigger profiles_role_audit
  after update of role on public.profiles
  for each row execute function public.log_role_change();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.role_audit enable row level security;

-- Only admin can read audit records.
create policy role_audit_select_admin
  on public.role_audit for select
  to authenticated
  using (is_admin());

-- No INSERT / UPDATE / DELETE policies for clients.
-- RLS denies by default; REVOKE adds a second layer of defense.
revoke insert, update, delete on public.role_audit from authenticated, anon;
