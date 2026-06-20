import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../supabase';

type PushPlatform = 'ios' | 'android' | 'web';

function getPlatform(): PushPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export async function registerPushToken(userId: string): Promise<string | null> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;

  const { data: token } = await Notifications.getExpoPushTokenAsync();

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      { user_id: userId, token, platform: getPlatform() },
      { onConflict: 'user_id,token' },
    );

  if (error) throw error;
  return token;
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('push_tokens')
    .delete()
    .match({ user_id: userId, token });

  if (error) throw error;
}
