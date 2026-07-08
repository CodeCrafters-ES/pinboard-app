-- Migration: N03-03-01 — Evolve post_ratings to composite PK + canonical `rating`
-- Issue: I-F-N03-03-01 (#167)
-- Precondition: 20260618100000 (table exists), 20260618200000 (RLS + policies exist)
-- Mirrors the post_reactions evolution in 20260707000000. The RLS policies check
-- only user_id = auth.uid(), so they stay valid across these changes.

-- 1. Rename column score → rating (canonical N03 naming). Postgres rewrites the
--    CHECK expression to reference the new name automatically; rename the
--    constraint too so its name stays meaningful.
alter table public.post_ratings rename column score to rating;
alter table public.post_ratings
  rename constraint post_ratings_score_check to post_ratings_rating_check;

-- 2. Switch PK from the surrogate id to the composite (post_id, user_id) that
--    already guaranteed one rating per user per post; drop the now-redundant
--    unique constraint and the surrogate column. The composite PK is what makes
--    upsert on (post_id, user_id) idempotent.
alter table public.post_ratings drop constraint post_ratings_pkey;
alter table public.post_ratings drop constraint post_ratings_post_id_user_id_key;
alter table public.post_ratings drop column id;
alter table public.post_ratings add primary key (post_id, user_id);

-- 3. post_ratings_post_id_idx (from 20260618100000) is kept on purpose: ratings
--    are read in bulk per post to compute averages (I-F-N03-03-01 DoD).
--    The updated_at trigger (post_ratings_updated_at → set_updated_at) already
--    exists from 20260618100000; no change needed.
