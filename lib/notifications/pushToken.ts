import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

// Ciclo de vida del Expo Push Token de ESTE dispositivo (I-F-N06-01-02):
// permisos → token → fila en push_tokens → refresco al rotar → borrado al logout.
// La fila se identifica por (user_id, token): un usuario con varios dispositivos
// tiene una fila por dispositivo y ninguna operación de aquí toca las demás.

export type PushRegistrationStatus =
  /** Fila escrita en push_tokens. */
  | 'registered'
  /** El usuario no concedió permisos: no hay token que registrar. */
  | 'denied'
  /** Emulador, simulador o web: Expo no emite token de dispositivo. */
  | 'unsupported'
  /** Fallo de red o de BD: queda pendiente y se reintenta al siguiente foreground. */
  | 'error';

export type PushRegistration = {
  status: PushRegistrationStatus;
  token: string | null;
};

// El token del dispositivo se cachea porque el logout necesita borrar exactamente
// su fila, y para entonces los permisos pueden estar revocados (getExpoPushTokenAsync
// ya no lo devolvería) o la app estar sin red.
const DEVICE_TOKEN_KEY = '@push/deviceToken';
const PENDING_USER_KEY = '@push/pendingUserId';

export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(DEVICE_TOKEN_KEY);
}

async function setStoredPushToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(DEVICE_TOKEN_KEY, token);
  else await AsyncStorage.removeItem(DEVICE_TOKEN_KEY);
}

export async function getPendingRegistrationUserId(): Promise<string | null> {
  return AsyncStorage.getItem(PENDING_USER_KEY);
}

async function setPendingRegistration(userId: string | null): Promise<void> {
  if (userId) await AsyncStorage.setItem(PENDING_USER_KEY, userId);
  else await AsyncStorage.removeItem(PENDING_USER_KEY);
}

// 42501 RLS, 23503 FK, 23514 check: el servidor rechaza la fila de forma
// permanente, reintentarla en cada foreground sería un bucle inútil.
const PERMANENT_ERROR_CODES = new Set(['42501', '23503', '23514']);

function isRetryable(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code !== 'string' || !PERMANENT_ERROR_CODES.has(code);
}

async function fetchExpoToken(
  devicePushToken?: Notifications.DevicePushToken,
): Promise<string | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken });
  return data || null;
}

async function upsertToken(userId: string, token: string): Promise<PushRegistration> {
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS as 'android' | 'ios' | 'web',
      device_name: Device.deviceName ?? Device.modelName,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,token' },
  );

  if (error) {
    console.error(`[push] upsert de push_tokens falló: ${errorMessage(error)}`, error);
    await setPendingRegistration(isRetryable(error) ? userId : null);
    return { status: 'error', token: null };
  }

  await setStoredPushToken(token);
  await setPendingRegistration(null);
  return { status: 'registered', token };
}

/**
 * Pide permisos si hacen falta, obtiene el Expo Push Token y lo persiste.
 * Nunca lanza: los fallos se devuelven en `status` para que la UI avise sin
 * bloquear la sesión.
 */
export async function registerPushToken(userId: string): Promise<PushRegistration> {
  // Los emuladores no reciben push y `getExpoPushTokenAsync` lanzaría.
  if (!Device.isDevice || Platform.OS === 'web') {
    return { status: 'unsupported', token: null };
  }

  try {
    // Preguntar antes de pedir evita reabrir el diálogo del sistema en cada login.
    const current = await Notifications.getPermissionsAsync();
    const status =
      current.status === 'granted'
        ? current.status
        : (await Notifications.requestPermissionsAsync()).status;

    if (status !== 'granted') {
      await setPendingRegistration(null);
      return { status: 'denied', token: null };
    }

    const token = await fetchExpoToken();
    if (!token) {
      await setPendingRegistration(userId);
      return { status: 'error', token: null };
    }

    return await upsertToken(userId, token);
  } catch (e) {
    console.error(`[push] registro de token falló: ${errorMessage(e)}`, e);
    await setPendingRegistration(userId);
    return { status: 'error', token: null };
  }
}

/**
 * Rotación de token: FCM/APNs emite un token de dispositivo nuevo, se canjea por
 * el Expo token correspondiente y se sustituye la fila. El device token se pasa a
 * `getExpoPushTokenAsync` en vez de dejar que lo pida: pedirlo dentro del listener
 * volvería a dispararlo (bucle infinito, documentado en `addPushTokenListener`).
 */
export async function refreshPushToken(
  userId: string,
  devicePushToken: Notifications.DevicePushToken,
): Promise<PushRegistration> {
  try {
    const token = await fetchExpoToken(devicePushToken);
    if (!token) {
      await setPendingRegistration(userId);
      return { status: 'error', token: null };
    }

    const previous = await getStoredPushToken();
    const result = await upsertToken(userId, token);

    // El token viejo ya no entrega: borrarlo evita que send-push gaste envíos en él.
    if (result.status === 'registered' && previous && previous !== token) {
      await removePushToken(userId, previous).catch(() => null);
    }
    return result;
  } catch (e) {
    console.error(`[push] refresco de token falló: ${errorMessage(e)}`, e);
    await setPendingRegistration(userId);
    return { status: 'error', token: null };
  }
}

/** Borra la fila (user_id, token). No afecta a otros dispositivos del usuario. */
export async function removePushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase.from('push_tokens').delete().match({ user_id: userId, token });
  if (error) throw error;

  if ((await getStoredPushToken()) === token) await setStoredPushToken(null);
}

/**
 * Logout: borra solo el token de este dispositivo. Se llama con la sesión aún
 * activa (RLS own exige `auth.uid() = user_id`) y no lanza, porque el usuario
 * debe poder cerrar sesión sin red.
 */
export async function removeCurrentDevicePushToken(userId: string): Promise<void> {
  await setPendingRegistration(null);
  const token = await getStoredPushToken();
  if (!token) return;

  try {
    await removePushToken(userId, token);
  } catch (e) {
    // La fila queda huérfana hasta la purga por last_seen_at (>60 días); el
    // dispositivo seguiría recibiendo push hasta entonces, pero bloquear el
    // logout sería peor.
    console.error(`[push] borrado del token en logout falló: ${errorMessage(e)}`, e);
    await setStoredPushToken(null);
  }
}

/** Reintenta el registro que falló por red. No hace nada si no hay ninguno pendiente. */
export async function retryPendingRegistration(): Promise<PushRegistration | null> {
  const userId = await getPendingRegistrationUserId();
  if (!userId) return null;
  return registerPushToken(userId);
}
