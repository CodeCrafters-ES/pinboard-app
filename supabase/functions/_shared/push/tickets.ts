// Acuses de Expo y su clasificación (I-F-N06-02-03).
//
// Vive en `_shared` porque lo usan dos funciones: `send-push` con los tickets del
// envío y `process-push-receipts` con los receipts diferidos. Los directorios con
// prefijo `_` no se despliegan como Edge Function, solo se importan.
//
// Módulo puro y sin imports: lo comparten el runtime Deno y los tests de Jest.

/**
 * Acuse de un mensaje. Expo devuelve `status` y, en los errores, `details.error`
 * con el código que decide qué hacer con el token.
 */
export type ExpoTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
  /** Los añade el emisor, no Expo: sin el par no se sabe qué fila purgar. */
  token?: string
  user_id?: string
}

export type TokenRef = { user_id: string; token: string }

export type PendingReceipt = TokenRef & { ticket_id: string }

/** El dispositivo ya no existe o las credenciales no valen: la fila sobra. */
export const PURGEABLE_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials'])

/**
 * El token es válido; el problema fue el mensaje o el ritmo de envío. Purgarlo sería
 * dejar sin notificaciones a un dispositivo sano.
 */
export const TRANSIENT_ERRORS = new Set(['MessageTooBig', 'MessageRateExceeded'])

export type Classification = {
  /** Filas a borrar de `push_tokens`. */
  purge: TokenRef[]
  /** Errores que no tocan el token; se registran para diagnóstico. */
  transient: { token: string; error: string }[]
  /** Aceptados por Expo: quedan a la espera de receipt. */
  pending: PendingReceipt[]
  /** Errores sin código conocido: no se purga por si acaso. */
  unknown: { token: string; error: string }[]
}

function ref(ticket: ExpoTicket): TokenRef | null {
  if (!ticket.token || !ticket.user_id) return null
  return { user_id: ticket.user_id, token: ticket.token }
}

/**
 * Reparte los acuses en lo que hay que hacer con cada uno. Ante un código
 * desconocido no se purga: es más barato reintentar un envío que perder el token de
 * alguien por un error nuevo de Expo.
 */
export function classifyTickets(tickets: ExpoTicket[]): Classification {
  const out: Classification = { purge: [], transient: [], pending: [], unknown: [] }

  for (const ticket of tickets) {
    const token = ticket.token ?? ''

    if (ticket.status === 'ok') {
      const base = ref(ticket)
      // Sin ticketId no hay receipt que consultar después.
      if (base && ticket.id) out.pending.push({ ...base, ticket_id: ticket.id })
      continue
    }

    const error = ticket.details?.error ?? ''

    if (PURGEABLE_ERRORS.has(error)) {
      const base = ref(ticket)
      if (base) out.purge.push(base)
      continue
    }

    if (TRANSIENT_ERRORS.has(error)) {
      out.transient.push({ token, error })
      continue
    }

    out.unknown.push({ token, error: error || ticket.message || 'unknown' })
  }

  return out
}

/** Receipts de `getReceipts`: mismo criterio, pero llegan indexados por ticketId. */
export function receiptsToTickets(
  receipts: Record<string, { status?: string; message?: string; details?: { error?: string } }>,
  pending: PendingReceipt[],
): ExpoTicket[] {
  const byTicket = new Map(pending.map((p) => [p.ticket_id, p]))

  return Object.entries(receipts).flatMap(([ticketId, receipt]) => {
    const row = byTicket.get(ticketId)
    if (!row) return []
    return [
      {
        status: receipt.status === 'ok' ? ('ok' as const) : ('error' as const),
        id: ticketId,
        message: receipt.message,
        details: receipt.details,
        token: row.token,
        user_id: row.user_id,
      },
    ]
  })
}
