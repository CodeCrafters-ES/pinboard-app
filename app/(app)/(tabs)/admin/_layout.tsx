import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';

import { useSession } from '@/hooks/useSession';

// Staff can never enter the admin section; managers may reach post management and
// the (read-only) user list, but not the admin panel index — invitations and role
// changes stay admin-only.
function canEnter(role: string | undefined, adminRoute: string | undefined): boolean {
  if (role === 'admin') return true;
  if (role === 'manager') return adminRoute === 'posts' || adminRoute === 'users';
  return false;
}

export default function AdminLayout() {
  const { session } = useSession();
  const router = useRouter();
  const segments = useSegments() as string[];

  // Route shape: ['(app)', '(tabs)', 'admin', <subroute?>, ...]
  const allowed = canEnter(session?.role, segments[3]);
  const blocked = Boolean(session) && !allowed;

  // The tab navigator stays mounted while this fires, so the replace lands on the
  // Tablón tab and unmounts this layout. Using <Redirect> here would re-run its
  // router.replace on every render (its useFocusEffect callback is not memoized).
  useEffect(() => {
    if (blocked) router.replace('/(app)/(tabs)/tablon');
  }, [blocked, router]);

  if (blocked) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}
