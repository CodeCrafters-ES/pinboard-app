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
const ROUTES: Record<PushTarget['type'], string | null> = {
  post: '/(app)/(tabs)/tablon/',
  event: '/(app)/(tabs)/calendario/',
  // Hito 3 (EPIC-N07 / F-N07-05): la pantalla `chat/[id]` todavía no existe y
  // navegar ahí dejaría al usuario en "Unmatched Route". Tampoco llega ningún push
  // de este tipo hasta entonces, así que se ignora en vez de romper.
  chat: null,
};

/**
 * Valida el `data` de una notificación. Devuelve null ante cualquier cosa que no sea
 * el contrato: el payload viene de fuera y un tap nunca debe tirar la app.
 */
export function parsePushTarget(data: unknown): PushTarget | null {
  const parsed = pushTargetSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** Ruta de destino, o null si ese tipo aún no tiene pantalla. */
export function routeForTarget(target: PushTarget): string | null {
  const prefix = ROUTES[target.type];
  return prefix ? `${prefix}${target.id}` : null;
}
