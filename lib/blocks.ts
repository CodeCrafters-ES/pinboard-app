import type { SupabaseClient } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';
import type { Database } from '@/lib/database.types';

// Estado de bloqueo respecto a un interlocutor 1:1.
export type BlockState = {
  // He bloqueado yo a este usuario (fila propia en user_blocks). Determina el toggle.
  iBlocked: boolean;
  // Hay bloqueo en cualquier sentido (yo → él o él → yo). Determina si puedo escribir.
  blocked: boolean;
};

// Un usuario que he bloqueado, con su perfil resuelto para la lista "Mis bloqueos".
export type BlockedUser = {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  createdAt: string;
};

/**
 * Bloquea a un usuario: el bloqueador siempre es el autenticado (la RLS exige
 * `blocker_user_id = auth.uid()`). Idempotente a nivel de UX; un par ya existente
 * violaría la PK, así que se ignora el conflicto.
 */
export async function blockUser({
  userId,
  client = supabase,
}: {
  userId: string;
  client?: SupabaseClient<Database>;
}): Promise<void> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await client
    .from('user_blocks')
    .upsert(
      { blocker_user_id: user.id, blocked_user_id: userId },
      { onConflict: 'blocker_user_id,blocked_user_id', ignoreDuplicates: true },
    );

  if (error) throw error;
}

/** Deshace mi bloqueo sobre un usuario. */
export async function unblockUser({
  userId,
  client = supabase,
}: {
  userId: string;
  client?: SupabaseClient<Database>;
}): Promise<void> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { error } = await client
    .from('user_blocks')
    .delete()
    .eq('blocker_user_id', user.id)
    .eq('blocked_user_id', userId);

  if (error) throw error;
}

/**
 * Estado de bloqueo con un interlocutor: si lo he bloqueado yo (fila propia, visible por
 * RLS) y si hay bloqueo en cualquier sentido (vía RPC `direct_chat_blocked`, acotada al
 * llamante para no revelar quién me ha bloqueado más allá de este par).
 */
export async function getBlockState({
  partnerId,
  client = supabase,
}: {
  partnerId: string;
  client?: SupabaseClient<Database>;
}): Promise<BlockState> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const [mine, either] = await Promise.all([
    client
      .from('user_blocks')
      .select('blocked_user_id')
      .eq('blocker_user_id', user.id)
      .eq('blocked_user_id', partnerId)
      .maybeSingle(),
    client.rpc('direct_chat_blocked', { other_user: partnerId }),
  ]);

  if (mine.error) throw mine.error;
  if (either.error) throw either.error;

  return { iBlocked: mine.data !== null, blocked: either.data === true };
}

/**
 * Lista los usuarios que he bloqueado (autoservicio), del más reciente al más antiguo.
 * La RLS `user_blocks_select` acota a mis filas; el nombre/avatar se resuelve vía
 * `profiles_public` (sin email) en una segunda consulta, ya que `user_blocks` no tiene
 * FK a `profiles` que PostgREST pueda embeber. Preserva el orden de bloqueo.
 */
export async function listMyBlocks({
  client = supabase,
}: {
  client?: SupabaseClient<Database>;
} = {}): Promise<BlockedUser[]> {
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error('No autenticado');

  const { data: blocks, error } = await client
    .from('user_blocks')
    .select('blocked_user_id, created_at')
    .eq('blocker_user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const rows = blocks ?? [];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.blocked_user_id);
  const { data: profiles, error: profilesError } = await client
    .from('profiles_public')
    .select('user_id, full_name, name, surname, avatar_url')
    .in('user_id', ids);

  if (profilesError) throw profilesError;

  const byId = new Map((profiles ?? []).map((p) => [p.user_id, p]));

  return rows.map((r) => {
    const p = byId.get(r.blocked_user_id);
    const fullName =
      p?.full_name || [p?.name, p?.surname].filter(Boolean).join(' ') || 'Usuario';
    return {
      userId: r.blocked_user_id,
      fullName,
      avatarUrl: p?.avatar_url ?? null,
      createdAt: r.created_at,
    };
  });
}
