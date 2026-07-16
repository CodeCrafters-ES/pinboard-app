import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import type { SupportedStorage } from '@supabase/supabase-js';

import type { Database } from './database.types';

const secureStoreAdapter: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const url = Constants.expoConfig?.extra?.supabaseUrl as string | undefined;
const key = Constants.expoConfig?.extra?.supabaseAnonKey as string | undefined;

if (!url || !key) {
  throw new Error(
    'Faltan las credenciales de Supabase (supabaseUrl / supabaseAnonKey). ' +
      'Comprueba EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY en el .env ' +
      '(desarrollo) o en el bloque "env" del perfil de eas.json (builds EAS).'
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: secureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export type { Database };
