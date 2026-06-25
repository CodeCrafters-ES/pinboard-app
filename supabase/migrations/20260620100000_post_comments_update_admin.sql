-- Migration: 0018 — Fix post_comments UPDATE policy to include admin moderation
-- refs: docs/adr/0002-rbac.md
-- Part of Epic S00 / Feature F-S00-04 / Issue I-F-S00-04-02
-- Reason: migration 0007 created post_comments_update_self which only allowed the
-- comment author to update their own comment. The ADR specifies that admin can also
-- UPDATE any comment (moderation). This migration corrects the discrepancy.

DROP POLICY IF EXISTS post_comments_update_self ON public.post_comments;

CREATE POLICY post_comments_update_own_or_admin
  ON public.post_comments FOR UPDATE
  TO authenticated
  USING  (author_id = auth.uid() OR is_admin())
  WITH CHECK (author_id = auth.uid() OR is_admin());
