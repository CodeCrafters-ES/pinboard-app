import { Platform } from 'react-native';

import {
  CHAT_CHANNEL_ID,
  GENERAL_CHANNEL_ID,
  setupAndroidChannels,
} from '@/lib/notifications/setupChannels';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockSetChannel = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationChannelAsync: (...args: unknown[]) => mockSetChannel(...args),
  AndroidImportance: { DEFAULT: 5, HIGH: 6 },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function runOn(os: 'android' | 'ios' | 'web') {
  Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
}

function channelConfig(id: string): Record<string, unknown> {
  const call = mockSetChannel.mock.calls.find((c) => c[0] === id);
  return call?.[1] as Record<string, unknown>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const originalOS = Platform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  mockSetChannel.mockResolvedValue(null);
  runOn('android');
});

afterEach(() => {
  jest.restoreAllMocks();
  runOn(originalOS as 'android' | 'ios' | 'web');
});

describe('setupAndroidChannels', () => {
  it('crea los dos canales del contrato con send-push', async () => {
    await setupAndroidChannels();

    expect(mockSetChannel).toHaveBeenCalledTimes(2);
    expect(mockSetChannel.mock.calls.map((c) => c[0])).toEqual([
      GENERAL_CHANNEL_ID,
      CHAT_CHANNEL_ID,
    ]);
  });

  it('deja general en importancia normal', async () => {
    await setupAndroidChannels();

    expect(channelConfig(GENERAL_CHANNEL_ID)).toMatchObject({
      name: 'General',
      importance: 5, // AndroidImportance.DEFAULT
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  });

  // Un mensaje directo sí interrumpe: alta prioridad y luz propia.
  it('deja chat en importancia alta', async () => {
    await setupAndroidChannels();

    expect(channelConfig(CHAT_CHANNEL_ID)).toMatchObject({
      name: 'Mensajes de chat',
      importance: 6, // AndroidImportance.HIGH
      sound: 'default',
      enableLights: true,
      lightColor: '#5B97B4',
    });
  });

  it('da a cada canal una descripción propia para Ajustes', async () => {
    await setupAndroidChannels();

    const general = channelConfig(GENERAL_CHANNEL_ID).description;
    const chat = channelConfig(CHAT_CHANNEL_ID).description;

    expect(general).toBeTruthy();
    expect(chat).toBeTruthy();
    expect(general).not.toBe(chat);
  });

  it.each(['ios', 'web'] as const)('no hace nada en %s', async (os) => {
    runOn(os);

    await setupAndroidChannels();

    expect(mockSetChannel).not.toHaveBeenCalled();
  });

  // Sin canales las notificaciones caen en el del sistema: molesto, no fatal.
  it('no propaga el error si la llamada nativa falla', async () => {
    mockSetChannel.mockRejectedValueOnce(new Error('native module unavailable'));

    await expect(setupAndroidChannels()).resolves.toBeUndefined();
  });
});
