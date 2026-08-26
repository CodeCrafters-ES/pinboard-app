import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { signOut as authSignOut } from '@/lib/auth';
import { registerPushToken, startPushTokenSync } from '@/lib/notifications';
import type { PushRegistrationStatus } from '@/lib/notifications';
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
  /** Resultado del registro del push token; null mientras no hay sesión o está en curso. */
  pushStatus: PushRegistrationStatus | null;
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
  const [pushStatus, setPushStatus] = useState<PushRegistrationStatus | null>(null);
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function resolveSession(userId: string) {
      userIdRef.current = userId;
      const resolved = await fetchProfile(userId);
      if (!active) return;
      setSession(resolved?.sessionInfo ?? null);
      setProfile(resolved?.profileData ?? null);
      setStatus(resolved ? 'authenticated' : 'unauthenticated');
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (!active) return;
        // getSession() ya soltó el lock de auth al resolver, así que consultar el
        // perfil aquí es seguro.
        if (s) void resolveSession(s.user.id);
        else setStatus('unauthenticated');
      })
      .catch(() => {
        if (active) setStatus('unauthenticated');
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      // supabase-js invoca este callback con su lock de auth tomado. Llamar aquí a
      // otra función de Supabase (fetchProfile → supabase.from) intenta re-adquirir
      // ese lock y provoca un deadlock: el perfil nunca llega, `status` se queda en
      // 'unauthenticated' y el login en caliente no redirige (solo "entra a la
      // segunda" al reabrir, cuando resuelve por la rama getSession()). Diferir con
      // setTimeout suelta el lock antes de tocar Postgres.
      if (s) {
        setTimeout(() => {
          if (active) void resolveSession(s.user.id);
        }, 0);
      } else {
        userIdRef.current = null;
        setSession(null);
        setProfile(null);
        setStatus('unauthenticated');
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  // El registro del push token cuelga del userId, no del evento SIGNED_IN: al abrir
  // la app con sesión persistida supabase-js emite INITIAL_SESSION, y sin esto el
  // dispositivo no se registraría nunca ni refrescaría `last_seen_at`.
  const userId = session?.userId ?? null;
  useEffect(() => {
    if (!userId) {
      setPushStatus(null);
      return;
    }

    let cancelled = false;
    registerPushToken(userId)
      .then((result) => {
        if (!cancelled) setPushStatus(result.status);
      })
      .catch(() => {
        if (!cancelled) setPushStatus('error');
      });

    // El getter lee la ref: la sesión puede cambiar sin desmontar el listener.
    const stopSync = startPushTokenSync(() => userIdRef.current);
    return () => {
      cancelled = true;
      stopSync();
    };
  }, [userId]);

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
    <SessionContext.Provider
      value={{ session, profile, status, pushStatus, refreshProfile, signOut }}
    >
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
