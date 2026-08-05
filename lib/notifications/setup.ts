import * as Notifications from 'expo-notifications';
import { AppState, type AppStateStatus } from 'react-native';

import { refreshPushToken, retryPendingRegistration } from './pushToken';
import { setupAndroidChannels } from './setupChannels';

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
 * Configuración global de notificaciones, independiente de la sesión: se ejecuta al
 * cargar el layout raíz, antes de que haya token registrado o llegue nada.
 *
 * Los canales se crean sin esperar (`void`): son una llamada nativa a Android que no
 * debe retrasar el primer render, y el push más temprano posible llega mucho después.
 */
export function configureNotifications(): void {
  configureNotificationHandler();
  void setupAndroidChannels();
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
