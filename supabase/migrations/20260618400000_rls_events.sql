-- Migration: 0009 — RLS policies for public.events
-- refs: docs/adr/0002-rbac.md
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-03
-- Depends on: 0008 (events table), 0003/0004 (helpers is_manager)

alter table public.events enable row level security;

-- SELECT: any authenticated user can read events
create policy events_select_authenticated
  on public.events for select to authenticated
  using (true);

-- INSERT / UPDATE / DELETE: is_manager() covers admin + manager (inclusive hierarchy)
create policy events_insert_manager_or_admin
  on public.events for insert to authenticated
  with check (is_manager());

create policy events_update_manager_or_admin
  on public.events for update to authenticated
  using  (is_manager())
  with check (is_manager());

create policy events_delete_manager_or_admin
  on public.events for delete to authenticated
  using (is_manager());
