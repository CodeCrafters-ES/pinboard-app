import { supabase } from '../../supabase';
import type { Database } from '../../database.types';

type UserRole = Database['public']['Enums']['user_role'];

export type ProfileRow = Database['public']['Tables']['profiles']['Row'];
export type ProfilePublicRow = Database['public']['Views']['profiles_public']['Row'];

export interface ListProfilesParams {
  search?: string;
  role?: UserRole;
  /** 0-indexed page number. Default: 0. */
  page?: number;
  /** Rows per page. Default: 20. */
  pageSize?: number;
}

/**
 * For admin and manager callers only. Returns full profile data including email.
 * Queries `profiles` directly; RLS allows any authenticated user to read all rows.
 */
export async function listProfiles(
  params: ListProfilesParams = {}
): Promise<{ rows: ProfileRow[]; total: number }> {
  const { search, role, page = 0, pageSize = 20 } = params;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('profiles')
    .select('id, user_id, email, name, surname, avatar_url, role, created_at', {
      count: 'exact',
    })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (role) {
    query = query.eq('role', role);
  }
  if (search) {
    query = query.or(
      `name.ilike.%${search}%,surname.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { rows: (data as ProfileRow[]) ?? [], total: count ?? 0 };
}

/**
 * For staff callers and mention pickers. Returns limited fields — no email or title.
 * Queries `profiles_public` view; the view schema guarantees email is never exposed.
 */
export async function listProfilesPublic(
  params: ListProfilesParams = {}
): Promise<{ rows: ProfilePublicRow[]; total: number }> {
  const { search, role, page = 0, pageSize = 20 } = params;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('profiles_public')
    .select('id, user_id, full_name, name, surname, avatar_url, role, created_at', {
      count: 'exact',
    })
    .range(from, to)
    .order('created_at', { ascending: false });

  if (role) {
    query = query.eq('role', role);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,surname.ilike.%${search}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { rows: (data as ProfilePublicRow[]) ?? [], total: count ?? 0 };
}
