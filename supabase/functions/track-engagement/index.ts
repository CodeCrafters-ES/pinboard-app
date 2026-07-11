import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://esm.sh/zod@3.23.8'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Contrato de entrada = LOTE (array). El cliente (lib/engagement/queue.ts) envía
// JSON.stringify(batch). Aceptamos tanto un array top-level como { events: [...] };
// esto arregla el bug por el que la cola offline descartaba todo en silencio.
const Event = z.object({
  session_id: z.string().uuid(),
  post_id: z.string().uuid(),
  link_clicked: z.boolean().optional(),
  focused_seconds_delta: z.number().int().min(0).max(3600).optional(),
  max_scroll_pct: z.number().min(0).max(1).optional(),
  client_ts: z.string().datetime().optional(),
})
const Body = z.union([
  z.array(Event).min(1).max(50),
  z.object({ events: z.array(Event).min(1).max(50) }).transform((b) => b.events),
])

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  // Verify the caller's JWT — user.id (auth.uid()) is the only source of user_id.
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const parsed = Body.safeParse(raw)
  if (!parsed.success) {
    return json({ error: 'Invalid payload', issues: parsed.error.issues }, 400)
  }
  const events = parsed.data

  // service_role bypasses RLS — the only path allowed to write engagement_sessions.
  // The RPC does the atomic per-post aggregation + append-only UPSERT.
  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  const { data, error } = await svc.rpc('apply_engagement_events', {
    p_user_id: user.id,
    p_events: events,
  })

  if (error) {
    // FK (post_id inexistente) o CHECK → payload inválido; el resto es fallo interno.
    const badRequest = error.code === '23503' || error.code === '23514'
    console.error('track-engagement rpc error', { code: error.code, message: error.message })
    return json({ error: error.message }, badRequest ? 400 : 500)
  }

  // Logs estructurados por post afectado. La RPC agrega por post_id, así que
  // recuperamos los session_id del lote entrante agrupados por post.
  const sessionsByPost = new Map<string, string[]>()
  for (const e of events) {
    sessionsByPost.set(e.post_id, [...(sessionsByPost.get(e.post_id) ?? []), e.session_id])
  }
  for (const row of data ?? []) {
    console.log('track-engagement', {
      user_id: user.id,
      post_id: row.post_id,
      session_id: sessionsByPost.get(row.post_id),
      link_clicked: row.link_clicked,
      new_status: row.status,
    })
  }

  return json({ ok: true, sessions: data })
})
