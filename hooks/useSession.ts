export type Session = { role: 'staff' | 'manager' | 'admin' } | null;

export function useSession(): Session {
  // TODO: reemplazar por supabase.auth.getSession() en I-F-N01-01-01
  return { role: 'admin' };
}
