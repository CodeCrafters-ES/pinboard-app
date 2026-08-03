import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getPendingRegistrationUserId,
  getStoredPushToken,
  refreshPushToken,
  registerPushToken,
  removeCurrentDevicePushToken,
  removePushToken,
  retryPendingRegistration,
} from '@/lib/notifications/pushToken';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockGetPermissionsAsync = jest.fn();
const mockRequestPermissionsAsync = jest.fn();
const mockGetExpoPushTokenAsync = jest.fn();
const mockFrom = jest.fn();
const mockDevice = { isDevice: true, deviceName: 'iPhone de Ana', modelName: 'iPhone 15' };

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissionsAsync(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissionsAsync(...args),
  getExpoPushTokenAsync: (...args: unknown[]) => mockGetExpoPushTokenAsync(...args),
}));

jest.mock('expo-device', () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
  get deviceName() {
    return mockDevice.deviceName;
  },
  get modelName() {
    return mockDevice.modelName;
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TOKEN = 'ExponentPushToken[abc]';

function grantPermissions() {
  mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
  mockGetExpoPushTokenAsync.mockResolvedValue({ data: TOKEN });
}

function stubUpsert(result: { error: unknown } = { error: null }) {
  const upsert = jest.fn().mockResolvedValue(result);
  mockFrom.mockReturnValue({ upsert });
  return upsert;
}

function stubDelete(result: { error: unknown } = { error: null }) {
  const match = jest.fn().mockResolvedValue(result);
  const del = jest.fn().mockReturnValue({ match });
  mockFrom.mockReturnValue({ delete: del });
  return match;
}

// `upsert` y `delete` se piden sobre el mismo mock de `from`, así que las suites
// que encadenan ambas operaciones necesitan las dos rutas disponibles.
function stubUpsertAndDelete() {
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const match = jest.fn().mockResolvedValue({ error: null });
  const del = jest.fn().mockReturnValue({ match });
  mockFrom.mockReturnValue({ upsert, delete: del });
  return { upsert, match };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(async () => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  await AsyncStorage.clear();
  mockDevice.isDevice = true;
});

afterEach(() => jest.restoreAllMocks());

describe('registerPushToken', () => {
  it('inserta la fila y cachea el token cuando hay permisos concedidos', async () => {
    grantPermissions();
    const upsert = stubUpsert();

    const result = await registerPushToken('user-1');

    expect(result).toEqual({ status: 'registered', token: TOKEN });
    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        token: TOKEN,
        platform: expect.stringMatching(/^(ios|android)$/),
        device_name: 'iPhone de Ana',
        last_seen_at: expect.any(String),
      }),
      // Re-login del mismo dispositivo: la fila se reutiliza en vez de duplicarse.
      { onConflict: 'user_id,token' },
    );
    await expect(getStoredPushToken()).resolves.toBe(TOKEN);
  });

  it('no vuelve a pedir permisos si ya están concedidos', async () => {
    grantPermissions();
    stubUpsert();

    await registerPushToken('user-1');

    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('pide permisos cuando aún no se han concedido', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockResolvedValue({ data: TOKEN });
    stubUpsert();

    const result = await registerPushToken('user-1');

    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('registered');
  });

  it('devuelve denied y no toca la BD cuando el usuario rechaza los permisos', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissionsAsync.mockResolvedValue({ status: 'denied' });

    const result = await registerPushToken('user-1');

    expect(result).toEqual({ status: 'denied', token: null });
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
    await expect(getPendingRegistrationUserId()).resolves.toBeNull();
  });

  it('devuelve unsupported en emulador sin pedir permisos', async () => {
    mockDevice.isDevice = false;

    const result = await registerPushToken('user-1');

    expect(result).toEqual({ status: 'unsupported', token: null });
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('deja el registro pendiente y no lanza cuando el upsert falla por red', async () => {
    grantPermissions();
    stubUpsert({ error: { message: 'Network request failed', code: '' } });

    const result = await registerPushToken('user-1');

    expect(result).toEqual({ status: 'error', token: null });
    await expect(getPendingRegistrationUserId()).resolves.toBe('user-1');
    await expect(getStoredPushToken()).resolves.toBeNull();
  });

  it('no deja pendiente un rechazo permanente de RLS', async () => {
    grantPermissions();
    stubUpsert({ error: { message: 'new row violates row-level security', code: '42501' } });

    const result = await registerPushToken('user-1');

    expect(result.status).toBe('error');
    await expect(getPendingRegistrationUserId()).resolves.toBeNull();
  });

  it('deja el registro pendiente si Expo no puede emitir el token', async () => {
    mockGetPermissionsAsync.mockResolvedValue({ status: 'granted' });
    mockGetExpoPushTokenAsync.mockRejectedValue(new Error('Network request failed'));

    const result = await registerPushToken('user-1');

    expect(result).toEqual({ status: 'error', token: null });
    await expect(getPendingRegistrationUserId()).resolves.toBe('user-1');
  });
});

describe('retryPendingRegistration', () => {
  it('no hace nada si no hay registro pendiente', async () => {
    await expect(retryPendingRegistration()).resolves.toBeNull();
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled();
  });

  it('reintenta el registro pendiente y lo limpia al tener éxito', async () => {
    grantPermissions();
    stubUpsert({ error: { message: 'Network request failed', code: '' } });
    await registerPushToken('user-1');

    const upsert = stubUpsert();
    const result = await retryPendingRegistration();

    expect(result).toEqual({ status: 'registered', token: TOKEN });
    expect(upsert).toHaveBeenCalledTimes(1);
    await expect(getPendingRegistrationUserId()).resolves.toBeNull();
  });
});

describe('refreshPushToken', () => {
  const NEW_TOKEN = 'ExponentPushToken[xyz]';
  const DEVICE_TOKEN = { type: 'ios' as const, data: 'apns-token' };

  it('canjea el device token rotado y sustituye la fila anterior', async () => {
    grantPermissions();
    stubUpsert();
    await registerPushToken('user-1');

    mockGetExpoPushTokenAsync.mockResolvedValue({ data: NEW_TOKEN });
    const { upsert, match } = stubUpsertAndDelete();

    const result = await refreshPushToken('user-1', DEVICE_TOKEN);

    expect(result).toEqual({ status: 'registered', token: NEW_TOKEN });
    // El device token se pasa explícitamente: pedirlo dentro del listener
    // volvería a dispararlo.
    expect(mockGetExpoPushTokenAsync).toHaveBeenLastCalledWith({
      projectId: 'project-1',
      devicePushToken: DEVICE_TOKEN,
    });
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ token: NEW_TOKEN }),
      { onConflict: 'user_id,token' },
    );
    expect(match).toHaveBeenCalledWith({ user_id: 'user-1', token: TOKEN });
    await expect(getStoredPushToken()).resolves.toBe(NEW_TOKEN);
  });

  it('no borra nada si el token rotado coincide con el ya registrado', async () => {
    grantPermissions();
    stubUpsert();
    await registerPushToken('user-1');

    const { match } = stubUpsertAndDelete();
    await refreshPushToken('user-1', DEVICE_TOKEN);

    expect(match).not.toHaveBeenCalled();
  });
});

describe('removePushToken', () => {
  it('borra solo la fila (user_id, token) de este dispositivo', async () => {
    const match = stubDelete();

    await removePushToken('user-1', TOKEN);

    expect(mockFrom).toHaveBeenCalledWith('push_tokens');
    expect(match).toHaveBeenCalledWith({ user_id: 'user-1', token: TOKEN });
  });

  it('lanza cuando el delete devuelve error de Supabase', async () => {
    stubDelete({ error: new Error('DB error') });

    await expect(removePushToken('user-1', TOKEN)).rejects.toThrow('DB error');
  });
});

describe('removeCurrentDevicePushToken', () => {
  it('borra la fila del token cacheado y lo olvida', async () => {
    grantPermissions();
    stubUpsert();
    await registerPushToken('user-1');

    const match = stubDelete();
    await removeCurrentDevicePushToken('user-1');

    expect(match).toHaveBeenCalledWith({ user_id: 'user-1', token: TOKEN });
    await expect(getStoredPushToken()).resolves.toBeNull();
  });

  it('no toca la BD si el dispositivo no tiene token registrado', async () => {
    await removeCurrentDevicePushToken('user-1');

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('no lanza si el borrado falla sin red y olvida el token igualmente', async () => {
    grantPermissions();
    stubUpsert();
    await registerPushToken('user-1');

    stubDelete({ error: new Error('Network request failed') });

    await expect(removeCurrentDevicePushToken('user-1')).resolves.toBeUndefined();
    await expect(getStoredPushToken()).resolves.toBeNull();
  });
});
