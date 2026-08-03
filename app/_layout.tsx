import { useEffect } from 'react';
import { Stack } from 'expo-router';

import '../global.css';
import '../lib/nativewind-setup';
import { startEngagementSync } from '@/lib/engagement';
import { configureNotifications } from '@/lib/notifications';
import { SessionProvider } from '@/hooks/useSession';

// Fuera del componente: el handler es global y basta con instalarlo una vez, antes
// de que llegue la primera notificación (un efecto correría después del render).
configureNotifications();

export default function RootLayout() {
  // Vacía la cola offline de engagement al recuperar conectividad, en cualquier
  // pantalla. Devuelve la desuscripción de NetInfo como cleanup del efecto.
  useEffect(() => startEngagementSync(), []);

  return (
    <SessionProvider>
      <Stack />
    </SessionProvider>
  );
}
