import { useEffect } from 'react';
import { Redirect, Slot } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { useSession } from '@/hooks/useSession';

export default function AppLayout() {
  const { session, status } = useSession();

  // Request push notification permissions once the user is authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      Notifications.requestPermissionsAsync();
    }
  }, [status]);

  if (status === 'loading') return null;

  if (status === 'unauthenticated' || !session) {
    return <Redirect href="/(auth)/login" />;
  }

  // The role guard for the admin section lives in (tabs)/admin/_layout: redirecting
  // from here would replace the whole tab navigator with a <Redirect>, so the tab
  // switch never lands and the redirect fires again on every render.
  return <Slot />;
}
