import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  createComment,
  deleteComment,
  listComments,
  MAX_COMMENT_LENGTH,
  type CommentAuthor,
  type CommentCursor,
  type CommentWithAuthor,
} from '@/lib/comments';

const PAGE_SIZE = 20;

type State = {
  comments: CommentWithAuthor[];
  cursor: CommentCursor | null;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
};

const INITIAL: State = {
  comments: [],
  cursor: null,
  hasMore: false,
  loading: true,
  loadingMore: false,
  error: null,
};

export function useComments(postId: string, currentUser: CommentAuthor | null) {
  const [state, setState] = useState<State>(INITIAL);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const { rows, nextCursor } = await listComments({ postId, pageSize: PAGE_SIZE });
      setState({
        comments: rows,
        cursor: nextCursor,
        hasMore: nextCursor !== null,
        loading: false,
        loadingMore: false,
        error: null,
      });
    } catch {
      setState((s) => ({
        ...s,
        loading: false,
        error: 'No se pudieron cargar los comentarios.',
      }));
    }
  }, [postId]);

  useEffect(() => {
    let cancelled = false;
    setState({ ...INITIAL });
    listComments({ postId, pageSize: PAGE_SIZE })
      .then(({ rows, nextCursor }) => {
        if (cancelled) return;
        setState({
          comments: rows,
          cursor: nextCursor,
          hasMore: nextCursor !== null,
          loading: false,
          loadingMore: false,
          error: null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: 'No se pudieron cargar los comentarios.',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  const loadMore = useCallback(async () => {
    if (state.loading || state.loadingMore || !state.hasMore || !state.cursor) return;
    const cursor = state.cursor;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const { rows, nextCursor } = await listComments({ postId, cursor, pageSize: PAGE_SIZE });
      setState((s) => {
        const seen = new Set(s.comments.map((c) => c.id));
        const merged = [...s.comments, ...rows.filter((r) => !seen.has(r.id))];
        return {
          ...s,
          comments: merged,
          cursor: nextCursor,
          hasMore: nextCursor !== null,
          loadingMore: false,
        };
      });
    } catch {
      setState((s) => ({ ...s, loadingMore: false }));
      Alert.alert('Error', 'No se pudieron cargar más comentarios.');
    }
  }, [postId, state.loading, state.loadingMore, state.hasMore, state.cursor]);

  const add = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (trimmed.length < 1 || trimmed.length > MAX_COMMENT_LENGTH) return;

      const tempId = `temp-${Date.now()}`;
      const now = new Date().toISOString();
      const optimistic: CommentWithAuthor = {
        id: tempId,
        post_id: postId,
        author_id: currentUser?.user_id ?? '',
        body: trimmed,
        created_at: now,
        updated_at: now,
        author: currentUser,
      };
      setState((s) => ({ ...s, comments: [optimistic, ...s.comments] }));

      try {
        const created = await createComment({ postId, body: trimmed });
        setState((s) => ({
          ...s,
          comments: s.comments.map((c) =>
            c.id === tempId ? { ...created, author: currentUser } : c,
          ),
        }));
      } catch {
        setState((s) => ({ ...s, comments: s.comments.filter((c) => c.id !== tempId) }));
        Alert.alert('Error', 'No se pudo publicar el comentario. Inténtalo de nuevo.');
      }
    },
    [postId, currentUser],
  );

  const remove = useCallback(async (commentId: string) => {
    let removed: CommentWithAuthor | undefined;
    let index = -1;
    setState((s) => {
      index = s.comments.findIndex((c) => c.id === commentId);
      removed = s.comments[index];
      return { ...s, comments: s.comments.filter((c) => c.id !== commentId) };
    });

    try {
      await deleteComment(commentId);
    } catch {
      setState((s) => {
        if (!removed) return s;
        const next = [...s.comments];
        next.splice(index < 0 ? 0 : index, 0, removed);
        return { ...s, comments: next };
      });
      Alert.alert('Error', 'No se pudo borrar el comentario.');
    }
  }, []);

  return {
    comments: state.comments,
    loading: state.loading,
    loadingMore: state.loadingMore,
    hasMore: state.hasMore,
    error: state.error,
    loadMore,
    refresh: load,
    add,
    remove,
  };
}
