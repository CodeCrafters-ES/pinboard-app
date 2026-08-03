import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { refreshPushToken, retryPendingRegistration } from './pushToken';

/**
 * Sin handler, una notificación que llega con la app en primer plano no se ve:
 * el sistema la entrega a la app y no la pinta. Se llama una vez al arrancar.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      // El badge de no leídos no está en el alcance del MVP (EPIC-N06).
      shouldSetBadge: false,
    }),
  });
}

/**
 * Configuración global de notificaciones, independiente de la sesión.
 *
 * I-F-N06-03-02 añadirá `lib/notifications/setupChannels.ts` con los canales
 * Android `general` y `chat`; su `ensureAndroidChannels()` se invoca desde aquí,
 * antes de cualquier registro de token.
 */
export function configureNotifications(): void {
  configureNotificationHandler();
}

/**
 * Mantiene viva la fila de `push_tokens` de este dispositivo mientras hay sesión:
 *
 * - Expo rota el token del dispositivo → se sustituye la fila.
 * - La app vuelve a primer plano → se reintenta el registro que falló por red.
 *
 * `getUserId` se lee en cada evento (no se captura) porque la sesión puede haber
 * cambiado desde que se montó el listener. Devuelve la función de limpieza.
 */
export function startPushTokenSync(getUserId: () => string | null): () => void {
  const tokenSubscription = Notifications.addPushTokenListener((devicePushToken) => {
    const userId = getUserId();
    if (userId) void refreshPushToken(userId, devicePushToken);
  });

  const appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active' && getUserId()) void retryPendingRegistration();
  });

  return () => {
    tokenSubscription.remove();
    appStateSubscription.remove();
  };
}
