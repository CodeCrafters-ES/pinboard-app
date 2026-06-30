import { supabase } from './supabase';
import type { Database } from './database.types';

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // Remove all push tokens for this user before invalidating session so the
  // DELETE runs while the session is still active. Errors are non-fatal.
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      await supabase.from('push_tokens').delete().eq('user_id', session.user.id);
    }
  } catch {
    // Non-fatal: push_tokens table may not exist yet or no active session
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
