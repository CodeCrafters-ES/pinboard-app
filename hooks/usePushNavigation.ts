import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter } from 'expo-router';

import { parsePushTarget, routeForTarget, type PushTarget } from '@/lib/notifications/pushTarget';
import { useSession } from '@/hooks/useSession';

// Navegación al tocar una notificación (I-F-N06-03-01), en los tres estados de la
// app. La captura y la entrega van separadas a propósito: al abrir desde cold start
// el destino se conoce antes de que existan el router y la sesión, así que se guarda
// y se navega cuando ambos están listos.

function targetOf(response: Notifications.NotificationResponse | null): PushTarget | null {
  if (!response) return null;
  return parsePushTarget(response.notification.request.content.data);
}

export function usePushNavigation(): void {
  const router = useRouter();
  const { status } = useSession();
  // `key` solo existe cuando el árbol de navegación está montado; navegar antes es
  // una operación perdida en silencio.
  const navigationState = useRootNavigationState();
  const isRouterReady = Boolean(navigationState?.key);

  const [pending, setPending] = useState<PushTarget | null>(null);
  // El tap que arranca la app llega por las dos vías (getLast y el listener): sin
  // recordar el identificador se navegaría dos veces al mismo sitio.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    function accept(response: Notifications.NotificationResponse | null): void {
      if (!response) return;
      const id = response.notification.request.identifier;
      if (handledRef.current === id) return;

      const target = targetOf(response);
      if (!target) {
        // Solo en dev: en producción un payload raro es ruido para el usuario, no un
        // fallo que pueda accionar.
        if (__DEV__) {
          console.warn('[push] payload no reconocido', {
            data: response.notification.request.content.data,
          });
        }
        return;
      }

      handledRef.current = id;
      setPending(target);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(accept);

    // Cold start: la app se abrió tocando la notificación, que ya no dispara listener.
    let active = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (active) accept(response);
      })
      .catch(() => null);

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!pending || !isRouterReady) return;
    // Sin sesión el destino espera: el guard de (app) redirigiría al login y el push
    // se perdería. Al autenticarse, este efecto vuelve a correr y navega.
    if (status !== 'authenticated') return;

    const route = routeForTarget(pending);
    setPending(null);
    if (!route) {
      if (__DEV__) console.warn('[push] tipo sin pantalla todavía', pending);
      return;
    }

    router.push(route as never);
  }, [pending, isRouterReady, status, router]);
}
