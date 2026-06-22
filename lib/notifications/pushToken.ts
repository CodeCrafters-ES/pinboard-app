import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { supabase } from '@/lib/supabase';

export async function requestPermissionsAndGetToken(): Promise<string | null> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  return token;
}

export async function registerPushToken(userId: string, token: string): Promise<void> {
  await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS as 'android' | 'ios',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
}

export async function deletePushToken(userId: string): Promise<void> {
  await supabase.from('push_tokens').delete().eq('user_id', userId);
}
