import { useEffect, useState } from 'react';

import { getPostById, type PostDetail } from '@/lib/supabase/queries/posts';

export type { PostDetail };

type PostDetailState = {
  post: PostDetail | null;
  loading: boolean;
  error: string | null;
};

export function usePostDetail(id: string | undefined) {
  const [state, setState] = useState<PostDetailState>({
    post: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!id) {
      setState({ post: null, loading: false, error: 'No disponible' });
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    getPostById(id)
      .then((post) => {
        if (!cancelled) setState({ post, loading: false, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ post: null, loading: false, error: 'No disponible' });
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  return state;
}
