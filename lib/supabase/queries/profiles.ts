import { supabase } from '../../supabase';
import type { Database } from '../../database.types';

type UserRole = Database['public']['Enums']['user_role'];
export type ProfileRow = Database['public']['Tables']['profiles']['Row'];

export interface ListProfilesParams {
  search?: string;
  role?: UserRole;
  page?: number;
  pageSize?: number;
}

export async function listProfiles(params: ListProfilesParams = {}): Promise<{ rows: ProfileRow[]; total: number }> {
  const { search, role, page = 0, pageSize = 20 } = params;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('profiles')
    .select('id,user_id,email,name,surname,title,avatar_url,role,created_at,updated_at', { count: 'exact' });

  if (search) {
    query = query.or(`name.ilike.%${search}%,surname.ilike.%${search}%,email.ilike.%${search}%`);
  }

  if (role) {
    query = query.eq('role', role);
  }

  const { data, count, error } = await query
    .range(from, to)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function updateUserRole(profileId: string, newRole: UserRole): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: newRole })
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('No se pudo actualizar el rol: sin respuesta del servidor.');
  return data;
}
