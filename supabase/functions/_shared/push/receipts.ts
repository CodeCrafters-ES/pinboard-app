// Drenaje de la cola de receipts (I-F-N06-02-03).
//
// La lógica vive aquí, fuera del `Deno.serve`, para que los tests la ejerciten contra
// la base local con un doble de Expo. `process-push-receipts/index.ts` solo aporta el
// HTTP y la autenticación.

import {
  purgeTokens,
  type PushTokensTable,
  type ReceiptsTable,
} from './purge.ts'
import { classifyTickets, receiptsToTickets, type PendingReceipt } from './tickets.ts'

export const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts'

/** Expo tarda unos minutos en tener el receipt listo; antes devuelve vacío. */
export const RECEIPT_DELAY_MS = 15 * 60 * 1000

/** Expo conserva los receipts ~24h: pasado ese punto ya no llegará ninguno. */
export const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000

/** Límite documentado de getReceipts. */
export const RECEIPTS_BATCH_SIZE = 1000

/** Tope por ejecución: el cron vuelve en una hora, el job no debe eternizarse. */
export const MAX_PER_RUN = 5000

/** Lo que guarda la cola: el par del token más cuándo se encoló. */
export type QueuedReceipt = PendingReceipt & { enqueued_at: string }

export type ReceiptMap = Record<
  string,
  { status?: string; message?: string; details?: { error?: string } }
>

type Result<T> = { data: T | null; error: { message: string } | null }

// El job además de encolar necesita leer y vaciar la cola, así que reusa las firmas
// de purge.ts y amplía la de `push_receipts_pending` (una intersección no serviría:
// la sobrecarga de PurgeDb ganaría y ocultaría select/delete).
export interface QueueDb {
  from(table: 'push_tokens'): PushTokensTable
  from(table: 'push_receipts_pending'): ReceiptsTable & {
    select(columns: string): {
      lte(
        column: 'enqueued_at',
        value: string,
      ): {
        order(
          column: 'enqueued_at',
          opts: { ascending: boolean },
        ): { limit(n: number): PromiseLike<Result<QueuedReceipt[]>> }
      }
    }
    delete(): {
      in(column: 'ticket_id', values: string[]): PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export type RunSummary = {
  processed: number
  purged_count: number
  expired_count: number
  reasons: Record<string, number>
}

export type RunOptions = {
  fetchImpl?: typeof fetch
  url?: string
  now?: () => number
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function fetchDue(db: QueueDb, now: number): Promise<QueuedReceipt[]> {
  const due = new Date(now - RECEIPT_DELAY_MS).toISOString()
  const { data, error } = await db
    .from('push_receipts_pending')
    .select('ticket_id, user_id, token, enqueued_at')
    .lte('enqueued_at', due)
    .order('enqueued_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (error) {
    console.error('process-push-receipts queue read failed', { error: error.message })
    return []
  }
  return data ?? []
}

async function fetchReceipts(
  ticketIds: string[],
  fetchImpl: typeof fetch,
  url: string,
): Promise<ReceiptMap> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ticketIds }),
  })

  if (!res.ok) {
    console.error('process-push-receipts expo http error', { status: res.status })
    return {}
  }

  const body = (await res.json()) as { data?: ReceiptMap }
  return body.data ?? {}
}

async function dequeue(db: QueueDb, ticketIds: string[]): Promise<void> {
  if (ticketIds.length === 0) return
  const { error } = await db.from('push_receipts_pending').delete().in('ticket_id', ticketIds)
  if (error) console.error('process-push-receipts dequeue failed', { error: error.message })
}

/**
 * Consulta los receipts vencidos, purga los tokens que Expo dé por perdidos y vacía
 * de la cola lo resuelto.
 *
 * Un lote cuya petición falle se deja en la cola para la siguiente pasada; solo se
 * descartan sin respuesta los tickets tan viejos que Expo ya no puede contestarlos,
 * porque si no la cola crecería sin límite.
 */
export async function processPendingReceipts(
  db: QueueDb,
  { fetchImpl = fetch, url = EXPO_RECEIPTS_URL, now = Date.now }: RunOptions = {},
): Promise<RunSummary> {
  const startedAt = now()
  const summary: RunSummary = { processed: 0, purged_count: 0, expired_count: 0, reasons: {} }

  const pending = await fetchDue(db, startedAt)
  if (pending.length === 0) return summary

  const expiredBefore = startedAt - RECEIPT_TTL_MS

  for (const batch of chunk(pending, RECEIPTS_BATCH_SIZE)) {
    let receipts: ReceiptMap
    try {
      receipts = await fetchReceipts(
        batch.map((p) => p.ticket_id),
        fetchImpl,
        url,
      )
    } catch (e) {
      console.error('process-push-receipts request failed', {
        error: e instanceof Error ? e.message : String(e),
      })
      continue
    }

    const classification = classifyTickets(receiptsToTickets(receipts, batch))
    summary.purged_count += await purgeTokens(db, classification.purge)
    summary.processed += Object.keys(receipts).length

    for (const { error } of [...classification.transient, ...classification.unknown]) {
      summary.reasons[error] = (summary.reasons[error] ?? 0) + 1
    }
    if (classification.purge.length > 0) {
      summary.reasons.purged = (summary.reasons.purged ?? 0) + classification.purge.length
    }

    const resolved = batch.filter((p) => p.ticket_id in receipts).map((p) => p.ticket_id)
    const expired = batch
      .filter((p) => !(p.ticket_id in receipts) && Date.parse(p.enqueued_at) < expiredBefore)
      .map((p) => p.ticket_id)

    summary.expired_count += expired.length
    await dequeue(db, [...resolved, ...expired])
  }

  return summary
}
