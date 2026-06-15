import { Redirect, Slot, useSegments } from 'expo-router';

import { useSession } from '@/hooks/useSession';

export default function AppLayout() {
  const session = useSession();
  const segments = useSegments() as string[];

  if (session === null) {
    return <Redirect href="/(auth)/login" />;
  }

  const group = segments[1];

  if (session.role === 'staff' && (group === '(manager)' || group === '(admin)')) {
    return <Redirect href="/(app)/(staff)/" />;
  }

  if (session.role === 'manager' && group === '(admin)') {
    return <Redirect href="/(app)/(manager)/" />;
  }

  return <Slot />;
}
