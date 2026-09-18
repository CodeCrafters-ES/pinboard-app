import { z } from 'zod';

// Payload de deep-linking de las notificaciones (ADR-003). Lo compone `send-push` y
// lo consume `usePushNavigation`. Módulo puro: el parseo y el mapa de rutas se
// prueban sin tocar el router ni expo-notifications.

const pushTargetSchema = z.object({
  type: z.enum(['post', 'event', 'chat']),
  // `guid` y no `uuid`: zod v4 exige en `uuid()` la variante RFC 9562, y aquí solo
  // interesa que el id tenga forma de UUID para poder pasarlo a la ruta. Rechazar un
  // identificador que Postgres sí acepta se traduciría en un push que no abre nada.
  id: z.guid(),
});

export type PushTarget = z.infer<typeof pushTargetSchema>;

// Rutas completas, con los grupos incluidos, como en el resto de la app. Expo Router
// los omite en la URL, pero escribirlos evita ambigüedades si algún día se repite un
// segmento en otro grupo.
//
// El hilo de chat solo recibe el `chatId`, que es lo único que trae el payload de
// ADR-003. La pantalla acepta además `name` y `partnerId` de forma opcional, así que
// al llegar por push arranca sin el nombre en la cabecera ni el estado de presencia
// del interlocutor hasta que se resuelven.
const ROUTES: Record<PushTarget['type'], string> = {
  post: '/(app)/(tabs)/tablon/',
  event: '/(app)/(tabs)/calendario/',
  chat: '/(app)/(tabs)/chat/',
};

/**
 * Valida el `data` de una notificación. Devuelve null ante cualquier cosa que no sea
 * el contrato: el payload viene de fuera y un tap nunca debe tirar la app.
 */
export function parsePushTarget(data: unknown): PushTarget | null {
  const parsed = pushTargetSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/**
 * Ruta de destino. Todos los tipos del contrato tienen pantalla, y el `Record` con
 * claves exactas obliga a dar ruta a cualquier tipo que se añada.
 */
export function routeForTarget(target: PushTarget): string {
  return `${ROUTES[target.type]}${target.id}`;
}
