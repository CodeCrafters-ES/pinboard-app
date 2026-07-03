import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UserRole = 'staff' | 'manager' | 'admin'

interface RequestBody {
  email: string
  role?: UserRole
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

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const svc = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: callerProfile } = await svc
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (callerProfile?.role !== 'admin') {
    return new Response('Forbidden', { status: 403, headers: CORS })
  }

  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { email, role = 'staff' } = body

  if (!email || typeof email !== 'string') {
    return json({ error: 'email (string) is required' }, 400)
  }

  const validRoles: UserRole[] = ['staff', 'manager', 'admin']
  if (!validRoles.includes(role)) {
    return json({ error: `role must be one of: ${validRoles.join(', ')}` }, 400)
  }

  const { data: inviteData, error: inviteError } = await svc.auth.admin.inviteUserByEmail(
    email,
    {
      redirectTo: 'nun-ibiza://auth/set-password',
      data: { role },
    }
  )

  if (inviteError) {
    const status = inviteError.message?.toLowerCase().includes('already') ? 400 : 500
    return json({ error: inviteError.message }, status)
  }

  await svc
    .from('profiles')
    .upsert(
      { user_id: inviteData.user.id, email: inviteData.user.email ?? email, role },
      { onConflict: 'user_id', ignoreDuplicates: false }
    )

  return json({ id: inviteData.user.id, email: inviteData.user.email ?? email })
})
