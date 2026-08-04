// Cliente de la Expo Push API (I-F-N06-02-02).
//
// Módulo puro salvo por el `fetch` inyectado: así los tests comprueban el troceado y
// el manejo de errores parciales sin tocar la red ni el runtime de Deno.

// Extensión explícita porque Deno la exige en imports relativos; Jest y tsc la
// resuelven igual (`allowImportingTsExtensions` en tsconfig.json).
import type { PushMessage } from './messages.ts'

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/** Límite documentado de la Expo Push API: 100 mensajes por request. */
export const EXPO_BATCH_SIZE = 100

export type PushTokenRow = { token: string; user_id: string; platform: string }

/** Acuse por mensaje. `DeviceNotRegistered` lo consume la purga (I-F-N06-02-03). */
export type ExpoTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
  /** Añadido aquí, no por Expo: los tickets llegan en el orden de envío. */
  token?: string
}

export type SendResult = {
  sent_count: number
  failed_count: number
  tickets: ExpoTicket[]
}

export type SendOptions = {
  tokens: PushTokenRow[]
  message: PushMessage
  fetchImpl?: typeof fetch
  url?: string
}

export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

type ExpoResponseBody = { data?: ExpoTicket[]; errors?: { message?: string }[] }

function expoMessages(tokens: PushTokenRow[], message: PushMessage) {
  return tokens.map((t) => ({
    to: t.token,
    sound: 'default',
    title: message.title,
    body: message.body,
    data: message.data,
    channelId: message.channelId,
    priority: message.priority,
  }))
}

/**
 * Envía a Expo en lotes de 100 y devuelve los tickets con su token asociado.
 *
 * Un lote que falla **no aborta los demás**: sus tokens cuentan como fallidos y el
 * bucle continúa. Un incidente de red a mitad de tanda no debe dejar sin notificación
 * a la mitad de la plantilla.
 */
export async function sendExpoBatch({
  tokens,
  message,
  fetchImpl = fetch,
  url = EXPO_PUSH_URL,
}: SendOptions): Promise<SendResult> {
  // Sin destinatarios no se llama a Expo: un request vacío solo gasta latencia.
  if (tokens.length === 0) return { sent_count: 0, failed_count: 0, tickets: [] }

  const tickets: ExpoTicket[] = []
  let sent = 0
  let failed = 0

  for (const batch of chunk(tokens, EXPO_BATCH_SIZE)) {
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(expoMessages(batch, message)),
      })

      if (!res.ok) {
        failed += batch.length
        console.error('send-push expo http error', { status: res.status, size: batch.length })
        continue
      }

      const body = (await res.json()) as ExpoResponseBody
      const data = body.data ?? []

      batch.forEach((row, i) => {
        // Un ticket ausente es un fallo: Expo devuelve uno por mensaje enviado.
        const ticket: ExpoTicket = data[i] ?? { status: 'error', message: 'missing ticket' }
        tickets.push({ ...ticket, token: row.token })
        if (ticket.status === 'ok') sent += 1
        else failed += 1
      })
    } catch (e) {
      failed += batch.length
      console.error('send-push expo request failed', {
        size: batch.length,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return { sent_count: sent, failed_count: failed, tickets }
}
