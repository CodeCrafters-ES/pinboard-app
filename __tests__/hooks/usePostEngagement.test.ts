import { act, renderHook } from '@testing-library/react-native';
import {
  AppState,
  type AppStateStatus,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import { usePostEngagement, type EngagementEvent } from '@/hooks/usePostEngagement';

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@react-navigation/native', () => ({
  useIsFocused: jest.fn(() => true),
}));

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => `sess-${++mockUuidCounter}`),
}));

const mockUseIsFocused = useIsFocused as jest.MockedFunction<typeof useIsFocused>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Captura el handler de AppState para simular transiciones active/background.
function spyAppState() {
  let handler: ((state: AppStateStatus) => void) | undefined;
  const remove = jest.fn();
  const addSpy = jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, cb) => {
      handler = cb as (state: AppStateStatus) => void;
      return { remove } as never;
    });
  return {
    addSpy,
    remove,
    change: (state: AppStateStatus) => act(() => handler?.(state)),
  };
}

function scrollEvent(pct: number): NativeSyntheticEvent<NativeScrollEvent> {
  const layoutHeight = 100;
  const contentHeight = 200; // scrollable = 100
  return {
    nativeEvent: {
      contentOffset: { x: 0, y: pct * (contentHeight - layoutHeight) },
      contentSize: { width: 0, height: contentHeight },
      layoutMeasurement: { width: 0, height: layoutHeight },
      zoomScale: 1,
      contentInset: { top: 0, left: 0, bottom: 0, right: 0 },
    },
  } as NativeSyntheticEvent<NativeScrollEvent>;
}

const HEARTBEAT = 5000;

function ticks(events: EngagementEvent[]) {
  return events.filter((e): e is Extract<EngagementEvent, { type: 'tick' }> => e.type === 'tick');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.useFakeTimers();
  mockUuidCounter = 0;
  mockUseIsFocused.mockReturnValue(true);
  (AppState as unknown as { currentState: AppStateStatus }).currentState = 'active';
});

afterEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe('usePostEngagement', () => {
  it('genera un sessionId estable durante toda la vida del hook', () => {
    spyAppState();
    const { result, rerender } = renderHook(() => usePostEngagement('post-1'));

    const first = result.current.sessionId;
    expect(first).toBe('sess-1');

    // Un re-render (p. ej. por cambio de foco) no debe cambiar el id.
    mockUseIsFocused.mockReturnValue(false);
    rerender({});
    expect(result.current.sessionId).toBe(first);
  });

  it('emite un init al montar y un tick por heartbeat', () => {
    spyAppState();
    const onEvent = jest.fn();
    renderHook(() => usePostEngagement('post-1', { wordCount: 120, onEvent, heartbeatMs: HEARTBEAT }));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'init', postId: 'post-1', wordCount: 120, sessionId: 'sess-1' }),
    );

    act(() => jest.advanceTimersByTime(HEARTBEAT * 2));
    const events = onEvent.mock.calls.map((c) => c[0] as EngagementEvent);
    expect(ticks(events)).toHaveLength(2);
  });

  it('acumula focusedSeconds mientras hay foco real', () => {
    spyAppState();
    const onEvent = jest.fn();
    renderHook(() => usePostEngagement('post-1', { onEvent, heartbeatMs: HEARTBEAT }));

    act(() => jest.advanceTimersByTime(HEARTBEAT * 2));
    const events = ticks(onEvent.mock.calls.map((c) => c[0] as EngagementEvent));
    expect(events[events.length - 1]!.focusedSeconds).toBe(10);
  });

  it('no incrementa focusedSeconds en background y lo retoma al volver a active', () => {
    const app = spyAppState();
    const onEvent = jest.fn();
    renderHook(() => usePostEngagement('post-1', { onEvent, heartbeatMs: HEARTBEAT }));

    act(() => jest.advanceTimersByTime(HEARTBEAT)); // +5s activo
    app.change('background');
    act(() => jest.advanceTimersByTime(HEARTBEAT * 2)); // congelado
    app.change('active');
    act(() => jest.advanceTimersByTime(HEARTBEAT)); // +5s activo

    const events = ticks(onEvent.mock.calls.map((c) => c[0] as EngagementEvent));
    // Sigue emitiendo ticks en background pero el contador no avanza allí.
    expect(events.map((e) => e.focusedSeconds)).toEqual([5, 5, 5, 10]);
  });

  it('detiene la cuenta cuando useIsFocused es false aunque AppState siga active', () => {
    spyAppState();
    mockUseIsFocused.mockReturnValue(false);
    const onEvent = jest.fn();
    renderHook(() => usePostEngagement('post-1', { onEvent, heartbeatMs: HEARTBEAT }));

    act(() => jest.advanceTimersByTime(HEARTBEAT * 3));
    const events = ticks(onEvent.mock.calls.map((c) => c[0] as EngagementEvent));
    expect(events.every((e) => e.focusedSeconds === 0)).toBe(true);
  });

  it('maxScrollPct solo aumenta y nunca decrece', () => {
    spyAppState();
    const onEvent = jest.fn();
    const { result } = renderHook(() =>
      usePostEngagement('post-1', { onEvent, heartbeatMs: HEARTBEAT }),
    );

    act(() => result.current.onScroll(scrollEvent(0.5)));
    act(() => result.current.onScroll(scrollEvent(0.8)));
    act(() => result.current.onScroll(scrollEvent(0.3))); // scroll hacia arriba

    act(() => jest.advanceTimersByTime(HEARTBEAT));
    const last = ticks(onEvent.mock.calls.map((c) => c[0] as EngagementEvent)).at(-1)!;
    expect(last.maxScrollPct).toBeCloseTo(0.8);
  });

  it('clampa maxScrollPct al rango [0, 1]', () => {
    spyAppState();
    const onEvent = jest.fn();
    const { result } = renderHook(() =>
      usePostEngagement('post-1', { onEvent, heartbeatMs: HEARTBEAT }),
    );

    act(() => result.current.onScroll(scrollEvent(3))); // overscroll
    act(() => jest.advanceTimersByTime(HEARTBEAT));
    const last = ticks(onEvent.mock.calls.map((c) => c[0] as EngagementEvent)).at(-1)!;
    expect(last.maxScrollPct).toBe(1);
  });

  it('limpia timers y listener tras unmount sin emitir más eventos', () => {
    const app = spyAppState();
    const onEvent = jest.fn();
    const { unmount } = renderHook(() =>
      usePostEngagement('post-1', { onEvent, heartbeatMs: HEARTBEAT }),
    );

    unmount();
    expect(app.remove).toHaveBeenCalledTimes(1);

    onEvent.mockClear();
    act(() => jest.advanceTimersByTime(HEARTBEAT * 3));
    expect(onEvent).not.toHaveBeenCalled();
  });
});
