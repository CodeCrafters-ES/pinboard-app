import { renderHook, waitFor } from '@testing-library/react-native';

import { usePushNavigation } from '@/hooks/usePushNavigation';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockAddListener = jest.fn();
const mockGetLast = jest.fn();
const mockRemove = jest.fn();

let mockSessionStatus: 'loading' | 'authenticated' | 'unauthenticated' = 'authenticated';
let mockNavigationState: { key: string } | undefined = { key: 'root' };

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  useRootNavigationState: () => mockNavigationState,
}));

jest.mock('expo-notifications', () => ({
  addNotificationResponseReceivedListener: (...args: unknown[]) => mockAddListener(...args),
  getLastNotificationResponseAsync: (...args: unknown[]) => mockGetLast(...args),
}));

jest.mock('@/hooks/useSession', () => ({
  useSession: () => ({ status: mockSessionStatus }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ID = '11111111-1111-1111-1111-111111111111';

type Listener = (response: unknown) => void;

function response(data: unknown, identifier = 'notif-1') {
  return { notification: { request: { identifier, content: { data } } } };
}

/** Captura el listener que registra el hook para poder simular un tap. */
function captureListener(): () => Listener {
  let listener: Listener | undefined;
  mockAddListener.mockImplementation((cb: Listener) => {
    listener = cb;
    return { remove: mockRemove };
  });
  return () => listener!;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockSessionStatus = 'authenticated';
  mockNavigationState = { key: 'root' };
  mockGetLast.mockResolvedValue(null);
  mockAddListener.mockReturnValue({ remove: mockRemove });
});

afterEach(() => jest.restoreAllMocks());

describe('usePushNavigation', () => {
  it('navega al detalle del post al tocar la notificación', async () => {
    const listener = captureListener();
    renderHook(() => usePushNavigation());

    listener()(response({ type: 'post', id: ID }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/(app)/(tabs)/tablon/${ID}`));
  });

  it('navega al detalle del evento', async () => {
    const listener = captureListener();
    renderHook(() => usePushNavigation());

    listener()(response({ type: 'event', id: ID }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/(app)/(tabs)/calendario/${ID}`));
  });

  // Cold start: la app se abre tocando la notificación y el listener ya no dispara.
  it('atiende el tap que arrancó la app', async () => {
    mockGetLast.mockResolvedValue(response({ type: 'post', id: ID }));
    renderHook(() => usePushNavigation());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/(app)/(tabs)/tablon/${ID}`));
  });

  it('no navega dos veces si el mismo tap llega por las dos vías', async () => {
    const listener = captureListener();
    mockGetLast.mockResolvedValue(response({ type: 'post', id: ID }, 'notif-dup'));
    renderHook(() => usePushNavigation());

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    listener()(response({ type: 'post', id: ID }, 'notif-dup'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
  });

  it('no navega con un payload inválido', async () => {
    const listener = captureListener();
    renderHook(() => usePushNavigation());

    listener()(response({ type: 'invoice', id: 'nope' }));

    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();
  });

  // El envío de push de chat llega con F-N07-05, pero el destino ya existe.
  it('navega al hilo del chat', async () => {
    const listener = captureListener();
    renderHook(() => usePushNavigation());

    listener()(response({ type: 'chat', id: ID }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/(app)/(tabs)/chat/${ID}`));
  });

  it('espera a que el router esté montado', async () => {
    mockNavigationState = undefined;
    const listener = captureListener();
    const { rerender } = renderHook(() => usePushNavigation());

    listener()(response({ type: 'post', id: ID }));
    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();

    mockNavigationState = { key: 'root' };
    rerender(undefined);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/(app)/(tabs)/tablon/${ID}`));
  });

  // Sin sesión, el guard de (app) redirigiría al login y el destino se perdería.
  it('guarda el destino y navega tras el login', async () => {
    mockSessionStatus = 'unauthenticated';
    const listener = captureListener();
    const { rerender } = renderHook(() => usePushNavigation());

    listener()(response({ type: 'event', id: ID }));
    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());
    expect(mockPush).not.toHaveBeenCalled();

    mockSessionStatus = 'authenticated';
    rerender(undefined);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/(app)/(tabs)/calendario/${ID}`));
  });

  it('se desuscribe al desmontar', async () => {
    captureListener();
    const { unmount } = renderHook(() => usePushNavigation());
    await waitFor(() => expect(mockAddListener).toHaveBeenCalled());

    unmount();

    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
