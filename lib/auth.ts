import type { SupabaseClient } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';

import { supabase } from './supabase';
import type { Database } from './database.types';

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  // Remove device push token before invalidating session.
  // push_tokens table is created in a future migration; errors are silently swallowed.
  try {
    const token = (await Notifications.getExpoPushTokenAsync()).data;
    await (supabase as SupabaseClient<never>).from('push_tokens').delete().eq('token', token);
  } catch {
    // Non-fatal: push_tokens table may not exist yet or device token unavailable
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
