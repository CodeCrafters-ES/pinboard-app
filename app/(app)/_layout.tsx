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
  // managers may reach post management and the (read-only) user list, but not
  // the admin panel index (invitations, role changes stay admin-only).
  if (tab === 'admin') {
    if (session.role === 'staff') {
      return <Redirect href="/(app)/(tabs)/tablon" />;
    }
    if (session.role === 'manager' && adminRoute !== 'posts' && adminRoute !== 'users') {
      return <Redirect href="/(app)/(tabs)/tablon" />;
    }
  }

  return <Slot />;
}
