import { removeCurrentDevicePushToken } from './notifications/pushToken';
import { supabase } from './supabase';
import type { Database } from './database.types';

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // Solo el token de ESTE dispositivo, y antes de invalidar la sesión: el DELETE
  // necesita `auth.uid()` vivo (RLS own) y borrar por user_id dejaría sin push al
  // resto de dispositivos del usuario. Los errores no son fatales.
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) await removeCurrentDevicePushToken(session.user.id);
  } catch {
    // Sin sesión activa o sin red: el logout local sigue adelante.
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function resetPasswordForEmail(email: string) {
  // Route is /(auth)/reset-password → transparent group → actual path: /reset-password
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'nun-ibiza://reset-password',
  });
  if (error) throw error;
}

export async function getCurrentProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error) throw error;
  return data;
}

export type ProfilePatch = Pick<
  Database['public']['Tables']['profiles']['Update'],
  'name' | 'surname' | 'title' | 'avatar_url'
>;

export async function updateOwnProfile(userId: string, patch: ProfilePatch) {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('user_id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** @deprecated Use getCurrentProfile */
export const ensureProfile = getCurrentProfile;
