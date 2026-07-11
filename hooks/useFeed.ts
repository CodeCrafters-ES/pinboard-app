import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listPublishedPosts,
  type PostWithAuthor,
  type PostCursor,
} from '@/lib/supabase/queries/posts';
import { reportError } from '@/lib/errors';

export type { PostWithAuthor };

type FeedState = {
  posts: PostWithAuthor[];
  nextCursor: PostCursor | null;
  loading: boolean;
  error: string | null;
};

export function useFeed() {
  const [state, setState] = useState<FeedState>({
    posts: [],
    nextCursor: null,
    loading: true,
    error: null,
  });
  const loadingRef = useRef(false);

  const load = useCallback(async (cursor?: PostCursor, replace = false) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const { rows, nextCursor } = await listPublishedPosts({ cursor });
      setState((prev) => ({
        posts: replace ? rows : [...prev.posts, ...rows],
        nextCursor,
        loading: false,
        error: null,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: reportError('useFeed', e, 'No se pudieron cargar las noticias.'),
      }));
    } finally {
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    load(undefined, true);
  }, [load]);

  const loadMore = useCallback(() => {
    if (!loadingRef.current && state.nextCursor) {
      load(state.nextCursor);
    }
  }, [state.nextCursor, load]);

  const refresh = useCallback(() => {
    load(undefined, true);
  }, [load]);

  return {
    posts: state.posts,
    loading: state.loading,
    error: state.error,
    hasMore: state.nextCursor !== null,
    loadMore,
    refresh,
  };
}
