-- Migration: 0013 — RLS policies for public.push_tokens
-- refs: docs/adr/0002-rbac.md
-- Part of Epic S00 / Feature F-S00-04
-- Depends on: 0012 (push_tokens table), 0003/0004 (helpers)
--
-- Each user manages only their own tokens (ALL operations restricted to own rows).

alter table public.push_tokens enable row level security;

create policy push_tokens_select_own
  on public.push_tokens for select to authenticated
  using (user_id = auth.uid());

create policy push_tokens_insert_own
  on public.push_tokens for insert to authenticated
  with check (user_id = auth.uid());

create policy push_tokens_update_own
  on public.push_tokens for update to authenticated
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy push_tokens_delete_own
  on public.push_tokens for delete to authenticated
  using (user_id = auth.uid());
