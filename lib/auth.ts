import type { SupabaseClient } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';

import { supabase } from './supabase';

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
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'nun-ibiza://auth/reset-password',
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

/** @deprecated Use getCurrentProfile */
export const ensureProfile = getCurrentProfile;
