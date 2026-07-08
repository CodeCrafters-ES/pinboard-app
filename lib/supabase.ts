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

const url = Constants.expoConfig!.extra!.supabaseUrl as string;
const key = Constants.expoConfig!.extra!.supabaseAnonKey as string;

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: secureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export type { Database };
