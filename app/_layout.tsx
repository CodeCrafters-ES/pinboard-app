import { useEffect } from 'react';
import { Stack } from 'expo-router';

import '../global.css';
import '../lib/nativewind-setup';
import { startEngagementSync } from '@/lib/engagement';
import { SessionProvider } from '@/hooks/useSession';

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
