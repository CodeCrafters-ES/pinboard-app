import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Canales de notificación de Android (I-F-N06-03-02). Android 8+ exige que cada
// notificación pertenezca a un canal; sin declararlos, el sistema las agrupa en uno
// por defecto y el usuario no puede silenciar el chat sin silenciar también el tablón.
//
// Los identificadores son el contrato con `send-push`, que los envía en `channelId`.

export const GENERAL_CHANNEL_ID = 'general';
export const CHAT_CHANNEL_ID = 'chat';

/**
 * Crea (o actualiza) los canales. Idempotente: `setNotificationChannelAsync` sobre un
 * canal existente lo actualiza, y tras reinstalar la app se recrean en el arranque.
 *
 * En iOS y web no hace nada: el concepto de canal no existe fuera de Android.
 *
 * Nota: el usuario puede cambiar importancia y sonido desde Ajustes, y a partir de
 * ahí el sistema ignora lo que declare la app. Estos valores son solo el estado
 * inicial del canal.
 */
export async function setupAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    await Notifications.setNotificationChannelAsync(GENERAL_CHANNEL_ID, {
      name: 'General',
      description: 'Posts y eventos del calendario corporativo',
      // Importancia normal: informativo, no interrumpe lo que el usuario esté haciendo.
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });

    await Notifications.setNotificationChannelAsync(CHAT_CHANNEL_ID, {
      name: 'Mensajes de chat',
      description: 'Nuevos mensajes en tus conversaciones',
      // Alta: un mensaje directo sí interrumpe, y aparece en la pantalla bloqueada.
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 100, 100, 100],
      sound: 'default',
      enableLights: true,
      lightColor: '#5B97B4', // nun-sea (DESIGN.md)
    });
  } catch (e) {
    // Un fallo aquí deja las notificaciones en el canal por defecto del sistema:
    // molesto, pero no motivo para tumbar el arranque de la app.
    console.error('[push] no se pudieron configurar los canales de Android', e);
  }
}
