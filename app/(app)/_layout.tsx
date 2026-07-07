import { useEffect } from 'react';
import { Redirect, Slot, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { useSession } from '@/hooks/useSession';

export default function AppLayout() {
  const { session, status } = useSession();
  const segments = useSegments() as string[];

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

  // Route shape: ['(app)', '(tabs)', <tab>, <subroute?>, ...]
  const tab = segments[2] as string | undefined;
  const adminRoute = segments[3] as string | undefined;

  // The admin section lives under the "admin" tab. Staff can never enter it;
  // managers may only reach post management (never user administration).
  if (tab === 'admin') {
    if (session.role === 'staff') {
      return <Redirect href="/(app)/(tabs)/tablon" />;
    }
    if (session.role === 'manager' && adminRoute !== 'posts') {
      return <Redirect href="/(app)/(tabs)/tablon" />;
    }
  }

  return <Slot />;
}
