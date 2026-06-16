import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

const url = Constants.expoConfig!.extra!.supabaseUrl as string;
const key = Constants.expoConfig!.extra!.supabaseAnonKey as string;

export const supabase = createClient<Database>(url, key);
export type { Database };
