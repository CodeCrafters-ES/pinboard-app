import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/database.types';

const PAGE_SIZE = 25;

export interface ListProfilesOptions {
  search?: string;
  role?: UserRole | null;
  page?: number;
  pageSize?: number;
}

export async function listProfiles({
  search,
  role,
  page = 0,
  pageSize = PAGE_SIZE,
}: ListProfilesOptions = {}) {
  let query = supabase
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('name', { ascending: true })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,surname.ilike.%${search}%,email.ilike.%${search}%`
    );
  }

  if (role) {
    query = query.eq('role', role);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return { rows: data ?? [], total: count ?? 0 };
}

export async function updateUserRole(userId: string, newRole: UserRole) {
  const { error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('user_id', userId);
  if (error) throw error;
}
