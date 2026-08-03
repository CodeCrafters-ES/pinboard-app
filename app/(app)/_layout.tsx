import { Redirect, Slot } from 'expo-router';
import { View } from 'react-native';

import { PushPermissionNotice } from '@/components/PushPermissionNotice';
import { useSession } from '@/hooks/useSession';

export default function AppLayout() {
  const { session, status } = useSession();

  if (status === 'loading') return null;

  if (status === 'unauthenticated' || !session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Los permisos de notificación se piden desde el registro del token
  // (useSession → registerPushToken): hacerlo aquí abría el diálogo del sistema
  // en paralelo y descartaba el resultado, así que el aviso de "denegado" nunca
  // llegaba a la UI.
  //
  // The role guard for the admin section lives in (tabs)/admin/_layout: redirecting
  // from here would replace the whole tab navigator with a <Redirect>, so the tab
  // switch never lands and the redirect fires again on every render.
  return (
    <View className="flex-1">
      <PushPermissionNotice />
      <Slot />
    </View>
  );
}
