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

  const group = segments[1];

  if (session.role === 'staff' && (group === '(manager)' || group === '(admin)')) {
    return <Redirect href="/(app)/(staff)/" />;
  }

  if (session.role === 'manager' && group === '(admin)' && segments[2] !== 'users') {
    return <Redirect href="/(app)/(manager)/" />;
  }

  return <Slot />;
}
