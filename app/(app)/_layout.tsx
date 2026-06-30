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
  const adminRoute = segments[2] as string | undefined;

  if (session.role === 'staff' && (group === '(manager)' || group === '(admin)')) {
    return <Redirect href="/(app)/(staff)/" />;
  }

  // Manager can access (admin)/users (user list) but not other admin-only routes
  if (session.role === 'manager' && group === '(admin)' && adminRoute !== 'users') {
    return <Redirect href="/(app)/(manager)/" />;
  }

  return <Slot />;
}
