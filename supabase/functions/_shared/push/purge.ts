// Borrado de tokens inválidos y cola de receipts (I-F-N06-02-03).
//
// El cliente Supabase llega por parámetro: el módulo queda sin imports de Deno y los
// tests lo ejercitan contra la base local. `PurgeDb` declara solo lo que se usa.

import {
  classifyTickets,
  type Classification,
  type ExpoTicket,
  type PendingReceipt,
  type TokenRef,
} from './tickets.ts'

type Result = { error: { message: string } | null }

// Se exportan para que process-push-receipts componga su propio tipo de cliente sin
// duplicar estas firmas ni recurrir a `any`.
export interface PushTokensTable {
  delete(): {
    eq(
      column: 'user_id',
      value: string,
    ): { eq(column: 'token', value: string): PromiseLike<Result> }
  }
}

export interface ReceiptsTable {
  insert(rows: PendingReceipt[]): PromiseLike<Result>
}

export interface PurgeDb {
  from(table: 'push_tokens'): PushTokensTable
  from(table: 'push_receipts_pending'): ReceiptsTable
}

/**
 * Borra las filas `(user_id, token)` indicadas.
 *
 * Par a par, no por `token`: dos usuarios pueden compartir token si alguien cerró
 * sesión sin red y otro inició sesión en ese mismo dispositivo, y borrar por token
 * dejaría sin push al que sí lo tiene registrado.
 *
 * Idempotente: borrar una fila que ya no existe no es un error para Postgres, así
 * que reprocesar un ticket no rompe nada.
 */
export async function purgeTokens(db: PurgeDb, refs: TokenRef[]): Promise<number> {
  if (refs.length === 0) return 0

  const results = await Promise.all(
    refs.map(async ({ user_id, token }): Promise<number> => {
      const { error } = await db.from('push_tokens').delete().eq('user_id', user_id).eq('token', token)
      if (error) {
        console.error('push purge failed', { user_id, error: error.message })
        return 0
      }
      return 1
    }),
  )

  return results.reduce((sum, n) => sum + n, 0)
}

/** Encola los tickets aceptados para comprobar su receipt más adelante. */
export async function enqueueReceipts(db: PurgeDb, pending: PendingReceipt[]): Promise<number> {
  if (pending.length === 0) return 0

  const { error } = await db.from('push_receipts_pending').insert(pending)
  if (error) {
    // Sin cola no se purga después, pero el push ya salió: no se aborta el envío.
    console.error('push receipts enqueue failed', { count: pending.length, error: error.message })
    return 0
  }
  return pending.length
}

export type PurgeSummary = {
  purged_count: number
  enqueued_count: number
  reasons: Record<string, number>
}

/** Recuento por motivo, que es lo que se mira en los logs para ver tendencias. */
function countReasons(classification: Classification): Record<string, number> {
  const reasons: Record<string, number> = {}
  const add = (key: string) => {
    reasons[key] = (reasons[key] ?? 0) + 1
  }

  classification.purge.forEach(() => add('purged'))
  classification.transient.forEach((t) => add(t.error))
  classification.unknown.forEach((u) => add(u.error))

  return reasons
}

/**
 * Procesa los acuses de un envío: purga lo que Expo da por perdido, registra lo
 * transitorio y encola el resto a la espera de receipt.
 */
export async function processTickets(db: PurgeDb, tickets: ExpoTicket[]): Promise<PurgeSummary> {
  const classification = classifyTickets(tickets)

  const [purged_count, enqueued_count] = await Promise.all([
    purgeTokens(db, classification.purge),
    enqueueReceipts(db, classification.pending),
  ])

  for (const { token, error } of classification.transient) {
    console.warn('push transient error', { error, token_suffix: token.slice(-8) })
  }
  for (const { token, error } of classification.unknown) {
    console.warn('push unknown error', { error, token_suffix: token.slice(-8) })
  }

  return { purged_count, enqueued_count, reasons: countReasons(classification) }
}
