-- Migration: I-F-N02-03-01 (#148) — Create post-images and event-images buckets
-- Bucket avatars already exists (20260619200000_create_avatars_bucket.sql).
--
-- Path convention:
--   post-images/{author_id}/{post_id}/cover.webp
--   event-images/{author_id}/{event_id}/cover.webp
-- The first path segment is always the owner's id, so future Storage RLS
-- policies can validate ownership with auth.uid()::text = (storage.foldername(name))[1]
-- (same contract as ADR-002 / ADR-005).
--
-- RLS policies: intentionally NOT created here — see issue #150
-- (I-F-N02-03-03). Until that migration lands, these buckets have RLS
-- enabled by default with no policies, so all access is denied.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  false,
  5242880,  -- 5 MB
  ARRAY['image/webp', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-images',
  'event-images',
  false,
  5242880,  -- 5 MB
  ARRAY['image/webp', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;
