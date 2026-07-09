-- Migration: N03-03-03 — Formalize RLS policy names for post_ratings
-- Issue: I-F-N03-03-03 (#168)
-- Precondition: 20260618200000 (RLS enabled + initial policies created with _self suffix),
--               20260708100000 (schema evolved to composite PK + rating column)
--
-- The initial scaffold (20260618200000) enabled RLS and created the write policies
-- with the _self suffix. This migration renames them to the N03 standard (_own),
-- mirroring post_reactions (20260707100000). No policy logic changes: select stays
-- open to any authenticated user, insert/update stay restricted to user_id = auth.uid(),
-- and there is intentionally no DELETE policy (ratings are updated in place, never
-- deleted; DELETE is also not granted to `authenticated`).

alter policy post_ratings_insert_self
  on public.post_ratings rename to post_ratings_insert_own;

alter policy post_ratings_update_self
  on public.post_ratings rename to post_ratings_update_own;

-- post_ratings_select_authenticated already matches the N03 naming convention.
