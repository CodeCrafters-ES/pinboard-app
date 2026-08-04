// Registros oficiales (jsr / npm) en lugar del CDN esm.sh: el arranque en frío del
// edge runtime resuelve estos imports mucho más rápido y de forma más fiable en CI.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { z } from 'npm:zod@3.23.8'

import { processTickets, type PurgeDb } from '../_shared/push/purge.ts'
import { EXPO_PUSH_URL, sendExpoBatch } from './expo.ts'
import { eventMessage, postMessage } from './messages.ts'
import { authorUserId, recipientTokens, type PushDb } from './recipients.ts'

// Punto de entrada de los Database Webhooks de Supabase.
// Transporte (autenticación, validación, idempotencia, respuesta rápida):
// I-F-N06-02-01. Destinatarios, composición y envío a Expo: I-F-N06-02-02.
// La purga de tokens inválidos a partir de los tickets es I-F-N06-02-03.

declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined

const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
// Redirigible para poder ejercitar el envío contra un doble en los tests.
const EXPO_URL = Deno.env.get('EXPO_PUSH_URL') ?? EXPO_PUSH_URL

// ─── Contrato de entrada ──────────────────────────────────────────────────────
// Payload de Supabase Database Webhooks. `record` trae la fila completa; aquí solo
// se validan los campos que el envío necesita, el resto se ignora sin fallar.

const PostRecord = z.object({
  id: z.string().uuid(),
  title: z.string(),
  author_id: z.string().uuid(),
  created_at: z.string(),
  status: z.string(),
  published_at: z.string().nullable().optional(),
})

const EventRecord = z.object({
  id: z.string().uuid(),
  title: z.string(),
  // events.author_id es nullable en el esquema (evento sin autor asignado).
  author_id: z.string().uuid().nullable(),
  created_at: z.string(),
  event_start_at: z.string(),
})

const MessageRecord = z.object({
  id: z.string().uuid(),
  chat_id: z.string().uuid(),
  sender_id: z.string().uuid(),
  created_at: z.string(),
})

const Operation = z.enum(['INSERT', 'UPDATE', 'DELETE'])

const Payload = z.discriminatedUnion('table', [
  z.object({
    type: Operation,
    table: z.literal('posts'),
    schema: z.literal('public'),
    record: PostRecord,
    old_record: PostRecord.partial().nullable().optional(),
  }),
  z.object({
    type: Operation,
    table: z.literal('events'),
    schema: z.literal('public'),
    record: EventRecord,
    old_record: EventRecord.partial().nullable().optional(),
  }),
  z.object({
    type: Operation,
    table: z.literal('messages'),
    schema: z.literal('public'),
    record: MessageRecord,
    old_record: MessageRecord.partial().nullable().optional(),
  }),
])

type Payload = z.infer<typeof Payload>

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── Autenticación ────────────────────────────────────────────────────────────
// El webhook es servidor-a-servidor: no hay JWT de usuario que verificar, solo un
// secreto compartido. Se acepta también la service_role key porque es lo que pone
// por defecto el asistente de webhooks de Studio.

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function isAuthorized(req: Request): boolean {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return false

  const presented = header.slice('Bearer '.length)
  const accepted = [WEBHOOK_SECRET, SERVICE_ROLE_KEY].filter((s) => s.length > 0)
  // Sin ningún secreto configurado no se acepta nada: una función desplegada sin
  // PUSH_WEBHOOK_SECRET quedaría abierta a cualquiera que conozca la URL.
  return accepted.some((secret) => timingSafeEqual(presented, secret))
}

// ─── Idempotencia ─────────────────────────────────────────────────────────────
// pg_net reintenta ante timeouts, así que el mismo INSERT puede llegar dos veces.
// Ventana corta en memoria del worker: suficiente para reintentos inmediatos y sin
// coste de BD. No cubre reintentos servidos por workers distintos; si el duplicado
// llega a ser un problema real, la alternativa es una tabla `push_sent`.

const DEDUPE_WINDOW_MS = 60_000
const seen = new Map<string, number>()

function isDuplicate(key: string, now = Date.now()): boolean {
  for (const [k, ts] of seen) if (now - ts > DEDUPE_WINDOW_MS) seen.delete(k)
  const previous = seen.get(key)
  seen.set(key, now)
  return previous !== undefined && now - previous <= DEDUPE_WINDOW_MS
}

// ─── Notificabilidad ──────────────────────────────────────────────────────────

type Skip = { notify: false; reason: string }
type Notify = { notify: true }

// Los posts nacen como borrador y se publican después con un UPDATE
// (hooks/usePosts.ts), así que el push no puede colgar solo del INSERT: se notifica
// al insertar ya publicado y en la transición draft → published. Republicar un post
// que ya estaba publicado no vuelve a notificar.
function shouldNotifyPost(p: Extract<Payload, { table: 'posts' }>): Notify | Skip {
  if (p.record.status !== 'published') return { notify: false, reason: 'post_not_published' }
  if (p.type === 'INSERT') return { notify: true }
  if (p.type === 'UPDATE' && p.old_record?.status !== 'published') return { notify: true }
  return { notify: false, reason: 'post_already_published' }
}

function shouldNotify(payload: Payload): Notify | Skip {
  if (payload.table === 'posts') return shouldNotifyPost(payload)
  if (payload.type !== 'INSERT') return { notify: false, reason: 'operation_not_notifiable' }
  return { notify: true }
}

// ─── Handlers por tabla ───────────────────────────────────────────────────────

type DispatchResult = {
  /**
   * Destinatarios resueltos antes de enviar. Sin este dato, "no había a quién
   * notificar" y "se intentó y falló todo" se leen igual en los logs: ambos dejan
   * sent_count y failed_count a cero.
   */
  recipients_count: number
  sent_count: number
  failed_count: number
  purged_count?: number
  pending?: true
}

// service_role para saltarse RLS: los tokens son "own" y ningún usuario puede leer
// los del resto, que es justo lo que hace falta aquí.
function adminClient(): PushDb & PurgeDb {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as unknown as PushDb & PurgeDb
}

async function deliver(
  db: PushDb & PurgeDb,
  excludeUserId: string | null,
  message: ReturnType<typeof postMessage>,
): Promise<DispatchResult> {
  const tokens = await recipientTokens(db, excludeUserId)
  const { sent_count, failed_count, tickets } = await sendExpoBatch({
    tokens,
    message,
    url: EXPO_URL,
  })

  // Expo ya dice aquí qué tokens no existen; el resto se sabrá con los receipts,
  // que consulta process-push-receipts a partir de la cola.
  const { purged_count, enqueued_count, reasons } = await processTickets(db, tickets)
  if (purged_count > 0 || Object.keys(reasons).length > 0) {
    console.log('send-push purge', { purged_count, enqueued_count, reasons })
  }

  return { recipients_count: tokens.length, sent_count, failed_count, purged_count }
}

async function handlePostInsert(
  record: z.infer<typeof PostRecord>,
): Promise<DispatchResult> {
  const db = adminClient()
  // posts.author_id es profiles.id; push_tokens.user_id es auth.uid().
  const author = await authorUserId(db, record.author_id)
  return deliver(db, author, postMessage(record))
}

async function handleEventInsert(
  record: z.infer<typeof EventRecord>,
): Promise<DispatchResult> {
  const db = adminClient()
  // events.author_id ya es auth.users(id): sin rodeo por profiles.
  return deliver(db, record.author_id, eventMessage(record))
}

// Hito 3 (EPIC-N07 / F-N07-05): el contrato queda cerrado desde ahora para que
// activar el push de chat sea solo configurar el webhook de `messages`.
async function handleMessageInsert(
  record: z.infer<typeof MessageRecord>,
): Promise<DispatchResult> {
  console.log('send-push handler deferred', {
    table: 'messages',
    record_id: record.id,
    chat_id: record.chat_id,
    milestone: 'hito-3',
  })
  return { recipients_count: 0, sent_count: 0, failed_count: 0, pending: true }
}

async function dispatch(payload: Payload): Promise<DispatchResult> {
  switch (payload.table) {
    case 'posts':
      return handlePostInsert(payload.record)
    case 'events':
      return handleEventInsert(payload.record)
    case 'messages':
      return handleMessageInsert(payload.record)
  }
}

// El webhook corre dentro de la transacción de pg_net: devolver rápido evita que
// un fallo del envío bloquee el INSERT o encadene reintentos. El trabajo real se
// completa en segundo plano y sus errores se loguean, nunca se propagan.
function runInBackground(payload: Payload, startedAt: number): void {
  const work = dispatch(payload)
    .then((result) => {
      console.log('send-push', {
        table: payload.table,
        type: payload.type,
        record_id: payload.record.id,
        ...result,
        duration_ms: Date.now() - startedAt,
      })
    })
    .catch((e) => {
      console.error('send-push dispatch failed', {
        table: payload.table,
        record_id: payload.record.id,
        error: e instanceof Error ? e.message : String(e),
      })
    })

  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(work)
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now()

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = Payload.safeParse(raw)
  if (!parsed.success) {
    return json({ error: 'Invalid payload', issues: parsed.error.issues }, 400)
  }
  const payload = parsed.data

  const decision = shouldNotify(payload)
  if (!decision.notify) {
    console.log('send-push ignored', {
      table: payload.table,
      type: payload.type,
      record_id: payload.record.id,
      reason: decision.reason,
    })
    return json({ ok: true, dispatched: false, reason: decision.reason })
  }

  if (isDuplicate(`${payload.table}:${payload.record.id}`)) {
    console.log('send-push deduplicated', {
      table: payload.table,
      record_id: payload.record.id,
    })
    return json({ ok: true, dispatched: false, deduplicated: true })
  }

  runInBackground(payload, startedAt)
  return json({ ok: true, dispatched: true })
})
