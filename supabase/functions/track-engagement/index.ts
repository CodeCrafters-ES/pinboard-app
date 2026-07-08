import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_STATUSES = ['active', 'idle', 'closed'] as const
type SessionStatus = (typeof VALID_STATUSES)[number]

interface RequestBody {
  post_id: string
  link_clicked?: boolean
  status?: SessionStatus
  device?: string
}

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

  // Verify the caller's JWT using the anon client (never trust the payload alone)
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { post_id, link_clicked, status, device } = body

  if (!post_id || typeof post_id !== 'string') {
    return json({ error: 'post_id (string) is required' }, 400)
  }
  if (status !== undefined && !(VALID_STATUSES as readonly string[]).includes(status)) {
    return json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
  }

  // Service-role client bypasses RLS — the only path allowed to write engagement_sessions
  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Build the upsert payload. link_clicked is append-only: never revert true → false.
  const payload: Record<string, unknown> = {
    user_id: user.id,
    post_id,
    last_seen_at: new Date().toISOString(),
  }
  if (link_clicked === true) payload.link_clicked = true
  if (status !== undefined) payload.status = status
  if (device !== undefined) payload.device = device

  // UNIQUE(user_id, post_id) makes this idempotent: retries from the offline queue
  // update last_seen_at in-place without creating duplicate rows.
  const { data, error } = await svc
    .from('engagement_sessions')
    .upsert(payload, { onConflict: 'user_id,post_id', ignoreDuplicates: false })
    .select()
    .single()

  if (error) return json({ error: error.message }, 500)

  return json({ data })
})
