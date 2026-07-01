import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Post, PostStatus } from '@/lib/database.types';

export type { Post };

export type PostInsertData = {
  author_id: string;
  title: string;
  subtitle?: string | null;
  external_url: string;
  body?: string | null;
  status: PostStatus;
};

export type PostUpdateData = {
  title?: string;
  subtitle?: string | null;
  external_url?: string;
  body?: string | null;
  status?: PostStatus;
  published_at?: string | null;
};

type UsePostsOptions = {
  authorId?: string;
};

const PAGE_SIZE = 20;

export function usePosts({ authorId }: UsePostsOptions = {}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const fetchIdRef = useRef(0);

  const fetchPosts = useCallback(
    async (pageVal: number) => {
      const fetchId = ++fetchIdRef.current;
      setLoading(true);
      setError(null);

      const from = pageVal * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from('posts')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (authorId) {
        query = query.eq('author_id', authorId);
      }

      const { data, error: err } = await query.range(from, to);

      if (fetchIdRef.current !== fetchId) return;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const rows = data ?? [];
      setPosts(pageVal === 0 ? rows : (prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    },
    [authorId],
  );

  useEffect(() => {
    setPage(0);
    fetchPosts(0);
  }, [fetchPosts]);

  const loadNextPage = useCallback(() => {
    if (!loading && hasMore) {
      const next = page + 1;
      setPage(next);
      fetchPosts(next);
    }
  }, [loading, hasMore, page, fetchPosts]);

  const createPost = useCallback(
    async (data: PostInsertData): Promise<{ id: string | null; error: string | null }> => {
      const insertData = {
        ...data,
        published_at: data.status === 'published' ? new Date().toISOString() : null,
      };

      const { data: row, error: err } = await supabase
        .from('posts')
        .insert(insertData)
        .select('id')
        .single();

      if (err) return { id: null, error: err.message };

      setPage(0);
      fetchPosts(0);
      return { id: row.id, error: null };
    },
    [fetchPosts],
  );

  const updatePost = useCallback(
    async (
      id: string,
      data: PostUpdateData,
      previousStatus?: PostStatus,
    ): Promise<{ error: string | null }> => {
      const updateData: PostUpdateData = { ...data };

      if (data.status === 'published' && previousStatus !== 'published') {
        updateData.published_at = new Date().toISOString();
      } else if (data.status === 'draft') {
        updateData.published_at = null;
      }

      const { error: err } = await supabase.from('posts').update(updateData).eq('id', id);

      if (err) return { error: err.message };

      setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, ...updateData } : p)));
      return { error: null };
    },
    [],
  );

  const softDelete = useCallback(async (id: string): Promise<{ error: string | null }> => {
    const { error: err } = await supabase
      .from('posts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (err) return { error: err.message };

    setPosts((prev) => prev.filter((p) => p.id !== id));
    return { error: null };
  }, []);

  const refresh = useCallback(() => {
    setPage(0);
    fetchPosts(0);
  }, [fetchPosts]);

  return {
    posts,
    loading,
    error,
    hasMore,
    loadNextPage,
    createPost,
    updatePost,
    softDelete,
    refresh,
  };
}
