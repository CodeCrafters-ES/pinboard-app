import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { signOut as authSignOut } from '@/lib/auth';
import { registerPushToken } from '@/lib/notifications/pushToken';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';
import type { UserRole } from '@/lib/types';

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Session = { userId: string; role: UserRole };

type SessionContextValue = {
  session: Session | null;
  profile: Profile | null;
  status: SessionStatus;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

// The session lives in a single provider mounted at the root layout. Resolving it
// per-consumer would reset `status` to 'loading' on every mount, and a layout that
// renders null while loading unmounts its own <Redirect> before the navigation
// lands — the role guard in (app)/_layout then redirects forever.
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [status, setStatus] = useState<SessionStatus>('loading');
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session: s } }) => {
        if (s) {
          userIdRef.current = s.user.id;
          const resolved = await fetchProfile(s.user.id);
          setSession(resolved?.sessionInfo ?? null);
          setProfile(resolved?.profileData ?? null);
          setStatus(resolved ? 'authenticated' : 'unauthenticated');
        } else {
          setStatus('unauthenticated');
        }
      })
      .catch(() => setStatus('unauthenticated'));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (s) {
        userIdRef.current = s.user.id;
        const resolved = await fetchProfile(s.user.id);
        setSession(resolved?.sessionInfo ?? null);
        setProfile(resolved?.profileData ?? null);
        setStatus(resolved ? 'authenticated' : 'unauthenticated');

        if (event === 'SIGNED_IN') {
          // Fire-and-forget: errors must not block session setup
          registerPushToken(s.user.id).catch(() => null);
        }
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

  // Network failures are swallowed: supabase-js clears SecureStore before the
  // server call, so onAuthStateChange SIGNED_OUT always fires locally.
  const signOut = useCallback(async () => {
    try {
      await authSignOut();
    } catch {
      // Offline or push-token error: local session already wiped, redirect happens
      // via onAuthStateChange listener above.
    }
  }, []);

  return (
    <SessionContext.Provider value={{ session, profile, status, refreshProfile, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

async function fetchProfile(
  userId: string,
): Promise<{ sessionInfo: Session; profileData: Profile } | null> {
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
