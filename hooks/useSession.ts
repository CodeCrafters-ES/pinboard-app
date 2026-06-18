import { useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/database.types';

export type Session = { role: UserRole; userId: string } | null;

export function useSession(): { session: Session; loading: boolean } {
  const [session, setSession] = useState<Session>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s ? await resolveProfile(s.user.id) : null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s ? await resolveProfile(s.user.id) : null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { session, loading };
}

async function resolveProfile(userId: string): Promise<Session> {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .single();
  return data ? { role: data.role, userId } : null;
}
