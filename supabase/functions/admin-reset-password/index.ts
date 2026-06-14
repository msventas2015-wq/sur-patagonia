import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response('Unauthorized', { status: 401, headers: cors })

    const SUPA_URL  = Deno.env.get('SUPABASE_URL')!
    const SUPA_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
    const SUPA_SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Verificar que quien llama es admin
    const callerClient = createClient(SUPA_URL, SUPA_ANON, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: caller }, error: authErr } = await callerClient.auth.getUser()
    if (authErr || !caller) return new Response('Unauthorized', { status: 401, headers: cors })

    const rol = caller.user_metadata?.rol
    if (rol !== 'admin') return new Response('Forbidden', { status: 403, headers: cors })

    // 2. Leer body
    const { userId, newPassword } = await req.json()
    if (!userId || !newPassword || newPassword.length < 6) {
      return new Response(
        JSON.stringify({ error: 'userId y newPassword (mínimo 6 caracteres) son requeridos.' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Cambiar contraseña con service_role
    const adminClient = createClient(SUPA_URL, SUPA_SVC, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) throw error

    return new Response(
      JSON.stringify({ ok: true }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message ?? 'Error interno' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})
