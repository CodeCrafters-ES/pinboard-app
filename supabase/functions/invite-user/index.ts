import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_ROLES = ['staff', 'manager', 'admin'] as const
type UserRole = (typeof VALID_ROLES)[number]

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

  // Verify the caller's JWT via the anon client (never trust the payload alone)
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  // Service-role client: bypasses RLS for the admin check and the invitation call
  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: profile } = await svc
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return new Response('Forbidden', { status: 403, headers: CORS })
  }

  let email: string
  let role: UserRole
  try {
    const body = await req.json()
    email = body.email
    role = VALID_ROLES.includes(body.role) ? (body.role as UserRole) : 'staff'
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  if (!email || typeof email !== 'string') {
    return json({ error: 'email (string) is required' }, 400)
  }

  const { data, error: inviteError } = await svc.auth.admin.inviteUserByEmail(email, {
    // Route is /(auth)/set-password → transparent group → actual path: /set-password
    redirectTo: 'nun-ibiza://set-password',
    data: { role },
  })

  if (inviteError) {
    return json({ error: inviteError.message }, 400)
  }

  // Safety-net upsert: handle_new_user trigger already creates the profile on invite,
  // but we ensure the requested role is persisted in case the trigger defaulted to 'staff'.
  await svc.from('profiles').upsert(
    { user_id: data.user.id, email: data.user.email!, role },
    { onConflict: 'user_id' },
  )

  return json({ id: data.user.id, email: data.user.email })
})
