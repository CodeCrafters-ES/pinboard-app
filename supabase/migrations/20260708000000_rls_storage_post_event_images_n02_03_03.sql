-- Migration: I-F-N02-03-03 (#150) — Storage RLS policies for post-images / event-images
-- Buckets created in 20260707010000_create_post_event_images_buckets.sql (private, 5 MB).
-- Canonical policy definitions: docs/adr/0002-rbac.md ("Storage Policies — SQL canónico").
--
-- Path convention: {author_id}/{content_id}/cover.webp — the first path segment is
-- the owner id, so ownership is validated with (storage.foldername(name))[1]
-- without a JOIN. Role helpers is_admin()/is_manager() are SECURITY DEFINER
-- (20260617190000) and follow the inclusive hierarchy admin > manager > staff.
--
-- Role rules:
--   SELECT  — any authenticated user (private buckets served via signed URLs)
--   INSERT  — admin (any folder) or manager on their own folder
--   UPDATE  — admin (any) or owner of the folder (supports upsert on re-upload)
--   DELETE  — admin (any) or owner of the folder
-- staff has read-only access; unauthenticated is blocked (policies are TO authenticated).
--
-- avatars is intentionally left untouched: ADR-002 keeps it without a DELETE
-- policy (replaced via UPDATE), so #150 does not add one.

-- ── post-images ───────────────────────────────────────────────────────────────

CREATE POLICY "post_images_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'post-images');

CREATE POLICY "post_images_insert_manager_or_admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'post-images'
  AND (
    is_admin()
    OR (is_manager() AND auth.uid()::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "post_images_update_own_or_admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'post-images'
  AND (is_admin() OR auth.uid()::text = (storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'post-images'
  AND (
    is_admin()
    OR (is_manager() AND auth.uid()::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "post_images_delete_own_or_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'post-images'
  AND (is_admin() OR auth.uid()::text = (storage.foldername(name))[1])
);

-- ── event-images ──────────────────────────────────────────────────────────────

CREATE POLICY "event_images_select_authenticated"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'event-images');

CREATE POLICY "event_images_insert_manager_or_admin"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-images'
  AND (
    is_admin()
    OR (is_manager() AND auth.uid()::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "event_images_update_own_or_admin"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (is_admin() OR auth.uid()::text = (storage.foldername(name))[1])
)
WITH CHECK (
  bucket_id = 'event-images'
  AND (
    is_admin()
    OR (is_manager() AND auth.uid()::text = (storage.foldername(name))[1])
  )
);

CREATE POLICY "event_images_delete_own_or_admin"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-images'
  AND (is_admin() OR auth.uid()::text = (storage.foldername(name))[1])
);
