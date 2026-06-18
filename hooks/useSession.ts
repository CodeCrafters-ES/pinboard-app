import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { Database, UserRole } from '@/lib/database.types';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Session = { userId: string; role: UserRole };

export function useSession(): {
  session: Session | null;
  profile: Profile | null;
  status: SessionStatus;
  refreshProfile: () => Promise<void>;
} {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      if (s) {
        userIdRef.current = s.user.id;
        const resolved = await fetchProfile(s.user.id);
        setSession(resolved?.sessionInfo ?? null);
        setProfile(resolved?.profileData ?? null);
        setStatus(resolved ? 'authenticated' : 'unauthenticated');
      } else {
        setStatus('unauthenticated');
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, s) => {
      if (s) {
        userIdRef.current = s.user.id;
        const resolved = await fetchProfile(s.user.id);
        setSession(resolved?.sessionInfo ?? null);
        setProfile(resolved?.profileData ?? null);
        setStatus(resolved ? 'authenticated' : 'unauthenticated');
      } else {
        userIdRef.current = null;
        setSession(null);
        setProfile(null);
        setStatus('unauthenticated');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!userIdRef.current) return;
    const resolved = await fetchProfile(userIdRef.current);
    setSession(resolved?.sessionInfo ?? null);
    setProfile(resolved?.profileData ?? null);
  }, []);

  return { session, profile, status, refreshProfile };
}

async function fetchProfile(userId: string): Promise<{ sessionInfo: Session; profileData: Profile } | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (!data) return null;
  return {
    sessionInfo: { userId, role: data.role as UserRole },
    profileData: data,
  };
}
