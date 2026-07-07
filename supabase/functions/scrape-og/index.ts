import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function parseMeta(html: string, property: string): string | null {
  // handles both attribute orders: property-first and content-first
  return (
    html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*?)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']${property}["']`, 'i'))?.[1] ??
    null
  )
}

function parseOg(html: string, originalUrl: string) {
  const title =
    parseMeta(html, 'og:title') ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ??
    null
  return {
    title,
    description: parseMeta(html, 'og:description'),
    image: parseMeta(html, 'og:image'),
    url: parseMeta(html, 'og:url') ?? originalUrl,
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const token = authHeader.replace('Bearer ', '')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return json({ error: 'unauthorized' }, 401)

  let url: string
  try {
    const body = await req.json()
    url = body.url
  } catch {
    return json({ error: 'invalid_url' }, 400)
  }

  if (!url || typeof url !== 'string' || !url.startsWith('http://') && !url.startsWith('https://')) {
    return json({ error: 'invalid_url' }, 400)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NunIbizaBot/1.0)' },
    })
    clearTimeout(timer)
    const html = await res.text()
    return json(parseOg(html, url))
  } catch (e) {
    clearTimeout(timer)
    if ((e as Error).name === 'AbortError') return json({ error: 'timeout' }, 408)
    return json({ error: 'fetch_failed' }, 500)
  }
})
