import { AppState, type AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';

import { configureNotificationHandler, startPushTokenSync } from '@/lib/notifications/setup';
import { refreshPushToken, retryPendingRegistration } from '@/lib/notifications/pushToken';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSetNotificationHandler = jest.fn();
const mockAddPushTokenListener = jest.fn();
const mockRemoveTokenSubscription = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler: (...args: unknown[]) => mockSetNotificationHandler(...args),
  addPushTokenListener: (...args: unknown[]) => mockAddPushTokenListener(...args),
}));

jest.mock('@/lib/notifications/pushToken', () => ({
  refreshPushToken: jest.fn().mockResolvedValue({ status: 'registered', token: 'tok' }),
  retryPendingRegistration: jest.fn().mockResolvedValue(null),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

type TokenListener = (token: Notifications.DevicePushToken) => void;

const DEVICE_TOKEN = { type: 'android' as const, data: 'fcm-token' };

function captureListeners() {
  let onToken: TokenListener | undefined;
  let onAppState: ((state: AppStateStatus) => void) | undefined;
  const removeAppStateSubscription = jest.fn();

  mockAddPushTokenListener.mockImplementation((cb: TokenListener) => {
    onToken = cb;
    return { remove: mockRemoveTokenSubscription };
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, cb) => {
    onAppState = cb as (state: AppStateStatus) => void;
    return { remove: removeAppStateSubscription } as ReturnType<typeof AppState.addEventListener>;
  });

  return {
    emitToken: () => onToken?.(DEVICE_TOKEN),
    emitAppState: (state: AppStateStatus) => onAppState?.(state),
    removeAppStateSubscription,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('configureNotificationHandler', () => {
  it('muestra la notificación en primer plano', async () => {
    configureNotificationHandler();

    expect(mockSetNotificationHandler).toHaveBeenCalledTimes(1);
    const handler = mockSetNotificationHandler.mock.calls[0]![0];
    await expect(handler.handleNotification()).resolves.toEqual({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });
});

describe('startPushTokenSync', () => {
  it('refresca la fila cuando Expo rota el token del dispositivo', () => {
    const listeners = captureListeners();
    startPushTokenSync(() => 'user-1');

    listeners.emitToken();

    expect(refreshPushToken).toHaveBeenCalledWith('user-1', DEVICE_TOKEN);
  });

  it('ignora la rotación si ya no hay sesión', () => {
    const listeners = captureListeners();
    startPushTokenSync(() => null);

    listeners.emitToken();

    expect(refreshPushToken).not.toHaveBeenCalled();
  });

  it('lee el userId en cada evento, no al montar el listener', () => {
    let userId: string | null = null;
    const listeners = captureListeners();
    startPushTokenSync(() => userId);

    userId = 'user-2';
    listeners.emitToken();

    expect(refreshPushToken).toHaveBeenCalledWith('user-2', DEVICE_TOKEN);
  });

  it('reintenta el registro pendiente al volver a primer plano', () => {
    const listeners = captureListeners();
    startPushTokenSync(() => 'user-1');

    listeners.emitAppState('active');

    expect(retryPendingRegistration).toHaveBeenCalledTimes(1);
  });

  it('no reintenta al pasar a segundo plano', () => {
    const listeners = captureListeners();
    startPushTokenSync(() => 'user-1');

    listeners.emitAppState('background');

    expect(retryPendingRegistration).not.toHaveBeenCalled();
  });

  it('desuscribe ambos listeners en la limpieza', () => {
    const listeners = captureListeners();
    const stop = startPushTokenSync(() => 'user-1');

    stop();

    expect(mockRemoveTokenSubscription).toHaveBeenCalledTimes(1);
    expect(listeners.removeAppStateSubscription).toHaveBeenCalledTimes(1);
  });
});
