import { useCallback, useEffect, useRef } from 'react';
import { AppState, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';

export type EngagementEvent =
  | { type: 'init'; sessionId: string; postId: string; wordCount: number; startedAt: string }
  | {
      type: 'tick';
      sessionId: string;
      postId: string;
      focusedSeconds: number;
      maxScrollPct: number;
      at: string;
    };

export type UsePostEngagementOpts = {
  wordCount?: number;
  // La cola offline real la inyecta I-F-N04-01-02; por defecto no-op.
  onEvent?: (event: EngagementEvent) => void;
  // Configurable solo para tests; en producción se mantiene el heartbeat de 5s (ADR-001).
  heartbeatMs?: number;
};

type UsePostEngagementResult = {
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  sessionId: string;
};

const DEFAULT_HEARTBEAT_MS = 5000;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

export function usePostEngagement(
  postId: string,
  opts?: UsePostEngagementOpts,
): UsePostEngagementResult {
  const wordCount = opts?.wordCount ?? 0;
  const heartbeatMs = opts?.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  // sessionId estable durante toda la vida del hook: un post nuevo desmonta la
  // pantalla, por lo que se genera un id por sesión de lectura.
  const sessionIdRef = useRef<string>('');
  if (sessionIdRef.current === '') sessionIdRef.current = Crypto.randomUUID();
  const sessionId = sessionIdRef.current;

  // Acumuladores en refs para no re-renderizar en cada heartbeat/scroll.
  const focusedSecondsRef = useRef(0);
  const maxScrollPctRef = useRef(0);

  // Foco real = app en primer plano Y pantalla enfocada en la navegación.
  const appStateActiveRef = useRef(AppState.currentState === 'active');
  const navigationFocused = useIsFocused();
  const navigationFocusedRef = useRef(navigationFocused);
  navigationFocusedRef.current = navigationFocused;

  // Mantener referencias frescas de los callbacks/valores para el intervalo,
  // que se crea una sola vez y no debe recrearse en cada render.
  const onEventRef = useRef(opts?.onEvent);
  onEventRef.current = opts?.onEvent;

  const emit = useCallback((event: EngagementEvent) => {
    onEventRef.current?.(event);
  }, []);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const scrollable = contentSize.height - layoutMeasurement.height;
    const pct = scrollable > 0 ? clamp01(contentOffset.y / scrollable) : 0;
    // Monótono: nunca decrece aunque el usuario haga scroll hacia arriba.
    if (pct > maxScrollPctRef.current) maxScrollPctRef.current = pct;
  }, []);

  useEffect(() => {
    focusedSecondsRef.current = 0;
    maxScrollPctRef.current = 0;
    appStateActiveRef.current = AppState.currentState === 'active';

    emit({
      type: 'init',
      sessionId,
      postId,
      wordCount,
      startedAt: new Date().toISOString(),
    });

    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateActiveRef.current = nextState === 'active';
    });

    const secondsPerTick = heartbeatMs / 1000;
    const interval = setInterval(() => {
      const isActive = appStateActiveRef.current && navigationFocusedRef.current;
      // focusedSeconds solo avanza mientras hay foco real.
      if (isActive) focusedSecondsRef.current += secondsPerTick;

      emit({
        type: 'tick',
        sessionId,
        postId,
        focusedSeconds: focusedSecondsRef.current,
        maxScrollPct: maxScrollPctRef.current,
        at: new Date().toISOString(),
      });
    }, heartbeatMs);

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [sessionId, postId, wordCount, heartbeatMs, emit]);

  return { onScroll, sessionId };
}
