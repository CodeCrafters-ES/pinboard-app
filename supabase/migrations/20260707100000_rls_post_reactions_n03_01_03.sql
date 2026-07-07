-- Migration: N03-01-03 — Formalize RLS policy names for post_reactions
-- Issue: I-F-N03-01-03 (#163)
-- Precondition: 20260618200000 (RLS enabled + initial policies created with _self suffix),
--               20260707000000 (schema evolved to enum type + composite PK)
--
-- The initial scaffold (20260618200000) created the policies with _self / _self_or_admin
-- suffixes. This migration renames them to the N03 standard (_own) for consistency
-- with the rest of the N03 feature set. No policy logic changes.

alter policy post_reactions_insert_self
  on public.post_reactions rename to post_reactions_insert_own;

alter policy post_reactions_update_self
  on public.post_reactions rename to post_reactions_update_own;

alter policy post_reactions_delete_self_or_admin
  on public.post_reactions rename to post_reactions_delete_own;

-- post_reactions_select_authenticated already matches the N03 naming convention.
