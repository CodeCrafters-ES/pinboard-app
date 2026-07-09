import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';

import { EMPTY_RATING, getRatingState, upsertRating, type RatingState } from '@/lib/ratings';

type State = RatingState & { loading: boolean };

export function usePostRating(postId: string) {
  const [state, setState] = useState<State>({ ...EMPTY_RATING, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));

    getRatingState(postId)
      .then((r) => {
        if (!cancelled) setState({ ...r, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY_RATING, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [postId]);

  const rate = useCallback(
    async (value: number) => {
      // Reselecting the same star is a no-op: no optimistic change, no upsert.
      if (value === state.myRating) return;

      const prevState = state;

      // Optimistic average: swap out my previous contribution for the new one.
      setState((s) => {
        const count = s.myRating === null ? s.count + 1 : s.count;
        const sum = s.average * s.count - (s.myRating ?? 0) + value;
        return { ...s, myRating: value, count, average: count > 0 ? sum / count : 0 };
      });

      try {
        await upsertRating(postId, value);
      } catch {
        setState(prevState);
        Alert.alert('Error', 'No se pudo guardar la valoración. Inténtalo de nuevo.');
      }
    },
    [postId, state],
  );

  return { ...state, rate };
}
