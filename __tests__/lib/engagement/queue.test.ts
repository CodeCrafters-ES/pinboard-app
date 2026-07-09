import type { EngagementPayload } from '@/lib/engagement/queue';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockStore = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => Promise.resolve(mockStore.get(k) ?? null)),
    setItem: jest.fn((k: string, v: string) => {
      mockStore.set(k, v);
      return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
      mockStore.delete(k);
      return Promise.resolve();
    }),
  },
}));

const mockGetSession = jest.fn();
const mockRefreshSession = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      refreshSession: (...a: unknown[]) => mockRefreshSession(...a),
    },
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: { supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'anon-key' },
    },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const QUEUE_KEY = '@engagement/queue';

function payload(n: number): EngagementPayload {
  return {
    session_id: `sess-${n}`,
    post_id: 'post-1',
    focused_seconds_delta: 5,
    max_scroll_pct: 0.5,
    client_ts: new Date(n).toISOString(),
  };
}

function seed(items: EngagementPayload[]): void {
  mockStore.set(QUEUE_KEY, JSON.stringify(items));
}

function stored(): EngagementPayload[] {
  const raw = mockStore.get(QUEUE_KEY);
  return raw ? (JSON.parse(raw) as EngagementPayload[]) : [];
}

function resp(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as unknown as Response;
}

// Módulo re-importado en cada test para resetear su estado interno (backoff, flags).
let queue: typeof import('@/lib/engagement/queue');

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
  mockStore.clear();
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({ data: { session: { access_token: 'jwt' } } });
  mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });
  global.fetch = jest.fn();
  // require (no import) para reimportar el módulo con estado interno fresco tras resetModules.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  queue = require('@/lib/engagement/queue');
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('engagement queue', () => {
  it('persiste eventos en AsyncStorage bajo @engagement/queue en orden FIFO', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));

    await queue.enqueue(payload(1));
    await queue.enqueue(payload(2));

    const persisted = stored();
    expect(persisted).toHaveLength(2);
    expect(persisted.map((p) => p.session_id)).toEqual(['sess-1', 'sess-2']);
    expect(await queue.size()).toBe(2);
  });

  it('descarta los más antiguos y loguea dropped_count al superar 500', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    seed(Array.from({ length: 500 }, (_, i) => payload(i)));

    await queue.enqueue(payload(500));

    const persisted = stored();
    expect(persisted).toHaveLength(500);
    expect(persisted[0]!.session_id).toBe('sess-1'); // sess-0 descartado
    expect(persisted[499]!.session_id).toBe('sess-500');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('descartados 1'),
      expect.objectContaining({ dropped_count: 1 }),
    );
    warn.mockRestore();
  });

  it('drena la cola en lotes de ≤50 con red activa', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(resp(200));
    seed(Array.from({ length: 120 }, (_, i) => payload(i)));

    await queue.flush();

    expect(global.fetch).toHaveBeenCalledTimes(3); // 50 + 50 + 20
    const firstBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0]![1].body);
    expect(firstBody).toHaveLength(50);
    expect(await queue.size()).toBe(0);
  });

  it('envía Authorization Bearer con el token de la sesión', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(resp(200));
    seed([payload(1)]);

    await queue.flush();

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0]!;
    expect(url).toBe('https://test.supabase.co/functions/v1/track-engagement');
    expect(init.headers.Authorization).toBe('Bearer jwt');
    expect(init.headers.apikey).toBe('anon-key');
  });

  it('mantiene el lote y programa reintento con backoff 1s→2s ante error de red', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    seed([payload(1)]);

    await queue.flush();
    expect(await queue.size()).toBe(1); // no se pierde
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 1000);

    // El timer de reintento vuelve a fallar → siguiente backoff 2s.
    await jest.advanceTimersByTimeAsync(1000);
    expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 2000);
    setTimeoutSpy.mockRestore();
  });

  it('ante 401 refresca la sesión y reintenta una vez', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(resp(401))
      .mockResolvedValueOnce(resp(200));
    seed([payload(1)]);

    await queue.flush();

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(await queue.size()).toBe(0);
  });

  it('descarta el lote ante un 4xx permanente (no-401)', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(resp(400));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    seed([payload(1)]);

    await queue.flush();

    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(await queue.size()).toBe(0); // descartado, no reintentado
    warn.mockRestore();
  });

  it('no lanza flushes concurrentes', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise<Response>((r) => {
        resolveFetch = r;
      }),
    );
    seed([payload(1), payload(2)]);

    const first = queue.flush();
    const second = queue.flush(); // debe ser no-op mientras el primero está en curso

    resolveFetch(resp(200));
    await Promise.all([first, second]);

    // Un único ciclo de drenaje: 2 eventos → 1 request (batch).
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
