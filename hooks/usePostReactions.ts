import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import {
  EMPTY_COUNTS,
  getMyReaction,
  getReactionCounts,
  toggleReaction,
  type ReactionCounts,
  type ReactionType,
} from '@/lib/reactions';

type State = {
  myReaction: ReactionType | null;
  counts: ReactionCounts;
  loading: boolean;
};

export function usePostReactions(postId: string) {
  const [state, setState] = useState<State>({
    myReaction: null,
    counts: { ...EMPTY_COUNTS },
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    Promise.all([getMyReaction(postId), getReactionCounts(postId)])
      .then(([myReaction, counts]) => {
        if (!cancelled) setState({ myReaction, counts, loading: false });
      })
      .catch(() => {
        if (!cancelled)
          setState({ myReaction: null, counts: { ...EMPTY_COUNTS }, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const toggle = useCallback(
    async (type: ReactionType) => {
      const prevState = state;
      const isTogglingOff = state.myReaction === type;

      setState((s) => {
        const newCounts = { ...s.counts };
        if (s.myReaction) newCounts[s.myReaction] = Math.max(0, newCounts[s.myReaction] - 1);
        if (!isTogglingOff) newCounts[type]++;
        return { ...s, myReaction: isTogglingOff ? null : type, counts: newCounts };
      });

      try {
        await toggleReaction(postId, type, prevState.myReaction);
      } catch {
        setState(prevState);
        Alert.alert('Error', 'No se pudo guardar la reacción. Inténtalo de nuevo.');
      }
    },
    [postId, state],
  );

  return { ...state, toggle };
}
