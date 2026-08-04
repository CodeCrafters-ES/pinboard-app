// Resolución de destinatarios (I-F-N06-02-02).
//
// El cliente Supabase llega por parámetro en vez de crearse aquí: el módulo queda sin
// imports de Deno y los tests pueden ejercitarlo contra la base local con supabase-js
// de Node. `PushDb` describe solo lo que se usa — no es `any`, así que un cambio de
// columna o de método rompe la compilación.

import type { PushTokenRow } from './expo.ts'

type Result<T> = { data: T | null; error: { message: string } | null }

interface ProfilesQuery {
  select(columns: 'user_id'): {
    eq(
      column: 'id',
      value: string,
    ): { maybeSingle(): PromiseLike<Result<{ user_id: string }>> }
  }
}

interface PushTokensQuery {
  select(columns: string): PromiseLike<Result<PushTokenRow[]>> & {
    neq(column: 'user_id', value: string): PromiseLike<Result<PushTokenRow[]>>
  }
}

export interface PushDb {
  from(table: 'profiles'): ProfilesQuery
  from(table: 'push_tokens'): PushTokensQuery
}

/**
 * `posts.author_id` referencia `profiles.id`, pero `push_tokens.user_id` guarda
 * `auth.uid()`: sin esta traducción el autor recibiría su propia publicación.
 * `events.author_id` ya es `auth.users(id)` y no necesita el rodeo.
 */
export async function authorUserId(db: PushDb, profileId: string): Promise<string | null> {
  const { data, error } = await db.from('profiles').select('user_id').eq('id', profileId).maybeSingle()

  if (error) {
    // No se aborta el envío: es peor no notificar a nadie que notificar de más.
    console.error('send-push author lookup failed', { profile_id: profileId, error: error.message })
    return null
  }
  return data?.user_id ?? null
}

/**
 * Todos los tokens registrados menos los del autor. No hace falta filtrar por rol ni
 * por usuario activo: `push_tokens` cascadea desde `profiles`, así que un perfil
 * borrado se lleva sus tokens por delante.
 */
export async function recipientTokens(
  db: PushDb,
  excludeUserId: string | null,
): Promise<PushTokenRow[]> {
  const query = db.from('push_tokens').select('token, user_id, platform')
  const { data, error } = await (excludeUserId ? query.neq('user_id', excludeUserId) : query)

  if (error) {
    console.error('send-push recipients query failed', { error: error.message })
    return []
  }
  return data ?? []
}
