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
