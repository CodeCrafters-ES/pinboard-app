// Comprobación diferida de los receipts de Expo (I-F-N06-02-03).
//
// El ticket que devuelve Expo al aceptar un mensaje solo dice "recibido"; el
// resultado real llega en un *receipt* unos minutos después, y es ahí donde aparece
// la mayoría de los `DeviceNotRegistered`. Esta función drena la cola
// `push_receipts_pending` y purga los tokens que Expo dé por perdidos.
//
// La invoca un cron (supabase/schedules/process_push_receipts.sql), no un usuario.
// El trabajo vive en `_shared/push/receipts.ts` para poder probarlo sin HTTP.

import { createClient } from 'jsr:@supabase/supabase-js@2'

import {
  EXPO_RECEIPTS_URL,
  processPendingReceipts,
  type QueueDb,
} from '../_shared/push/receipts.ts'

const WEBHOOK_SECRET = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const RECEIPTS_URL = Deno.env.get('EXPO_RECEIPTS_URL') ?? EXPO_RECEIPTS_URL

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Mismo secreto que send-push: quien llama es el propio proyecto, no un tercero.
function isAuthorized(req: Request): boolean {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return false

  const presented = header.slice('Bearer '.length)
  const accepted = [WEBHOOK_SECRET, SERVICE_ROLE_KEY].filter((s) => s.length > 0)
  return accepted.some((secret) => timingSafeEqual(presented, secret))
}

Deno.serve(async (req: Request) => {
  const startedAt = Date.now()

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!isAuthorized(req)) return json({ error: 'Unauthorized' }, 401)

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY) as unknown as QueueDb
  const summary = await processPendingReceipts(db, { url: RECEIPTS_URL })

  console.log('process-push-receipts', { ...summary, duration_ms: Date.now() - startedAt })
  return json({ ok: true, ...summary })
})
