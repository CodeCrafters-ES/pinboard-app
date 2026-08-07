// Composición del contenido de las notificaciones (I-F-N06-02-02).
//
// Módulo puro y sin imports: lo comparten el runtime Deno de la Edge Function y los
// tests de Jest, que no pueden resolver los especificadores `npm:` / `jsr:`.
//
// El copy va fijo en español (decisión cerrada del EPIC-N06). Toda la construcción de
// texto vive aquí para que añadir idiomas más adelante sea cambiar un módulo, no
// perseguir literales por los handlers.

/** `data` que viaja en la notificación. Contrato de ADR-003 (deep-linking). */
export type PushData = { type: 'post' | 'event' | 'chat'; id: string }

export type PushMessage = {
  title: string
  body: string
  data: PushData
  channelId: 'general' | 'chat'
  priority: 'default' | 'high'
}

/** APNs/FCM cortan por su cuenta; el límite propio mantiene el payload predecible. */
export const BODY_MAX_CHARS = 120

const EVENT_TIME_ZONE = 'Europe/Madrid'

export function truncate(text: string, max = BODY_MAX_CHARS): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  // El carácter de elipsis cuenta dentro del límite, no encima.
  return `${clean.slice(0, max - 1).trimEnd()}…`
}

/**
 * «vie 24 jul, 17:00» — el restaurante opera en Ibiza, así que la hora se muestra
 * siempre en Europe/Madrid, sea cual sea la zona del servidor que envía el push.
 */
export function formatEventDate(iso: string, timeZone = EVENT_TIME_ZONE): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? ''

  // Se ensambla a mano porque el patrón de es-ES varía entre runtimes (comas, "de",
  // el punto de las abreviaturas) y el copy acordado es fijo.
  const weekday = get('weekday').replace('.', '')
  const month = get('month').replace('.', '')

  return `${weekday} ${get('day')} ${month}, ${get('hour')}:${get('minute')}`
}

export function postMessage(record: { id: string; title: string }): PushMessage {
  return {
    title: 'Nuevo post',
    body: truncate(record.title) || 'Nuevo contenido en el tablón',
    data: { type: 'post', id: record.id },
    channelId: 'general',
    priority: 'default',
  }
}

/**
 * Notificación de un mensaje de chat 1:1 (F-N07-05). El título es el nombre del
 * remitente (fallback genérico si no se pudo resolver); el cuerpo es el contenido
 * recortado a 80 caracteres (AC de #289, más corto que el general para que quepa en la
 * preview de la notificación). El deep-link apunta al **chat**, no al mensaje.
 */
export function chatMessage(
  record: { chat_id: string; content: string },
  senderName: string | null,
): PushMessage {
  return {
    title: senderName?.trim() || 'Nuevo mensaje',
    body: truncate(record.content, 80) || 'Te ha enviado un mensaje',
    data: { type: 'chat', id: record.chat_id },
    channelId: 'chat',
    priority: 'high',
  }
}

export function eventMessage(record: {
  id: string
  title: string
  event_start_at: string
}): PushMessage {
  const when = formatEventDate(record.event_start_at)
  // El título se recorta antes de añadir la fecha: es lo que se puede perder sin
  // dejar la notificación inútil.
  const title = truncate(record.title, when ? BODY_MAX_CHARS - when.length - 3 : BODY_MAX_CHARS)

  return {
    title: 'Nuevo evento',
    body: when ? `${title} · ${when}` : title,
    data: { type: 'event', id: record.id },
    channelId: 'general',
    priority: 'default',
  }
}
