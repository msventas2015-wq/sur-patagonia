import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonHeaders = { ...cors, 'Content-Type': 'application/json' }
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type JsonRecord = Record<string, unknown>

function jsonResponse(status: number, body: JsonRecord): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse(status, { ok: false, code, error: message })
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ ok: false, code: 'METHOD_NOT_ALLOWED', error: 'Método no permitido.' }),
      { status: 405, headers: { ...jsonHeaders, Allow: 'POST, OPTIONS' } },
    )
  }

  try {
    const authHeader = req.headers.get('Authorization')?.trim() ?? ''
    if (!/^Bearer\s+\S+$/i.test(authHeader)) {
      return errorResponse(401, 'AUTH_REQUIRED', 'Falta una sesión autenticada válida.')
    }

    const supaUrl = Deno.env.get('SUPABASE_URL')
    const supaAnon = Deno.env.get('SUPABASE_ANON_KEY')
    const supaServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supaUrl || !supaAnon || !supaServiceRole) {
      console.error('admin-actualizar-email: faltan variables de entorno requeridas')
      return errorResponse(500, 'SERVER_MISCONFIGURED', 'La función no está configurada correctamente.')
    }

    const callerClient = createClient(supaUrl, supaAnon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()
    if (authError || !caller) {
      return errorResponse(401, 'INVALID_SESSION', 'La sesión es inválida o expiró.')
    }
    if (caller.app_metadata?.rol !== 'admin') {
      return errorResponse(403, 'ADMIN_REQUIRED', 'Sólo un administrador puede cambiar credenciales.')
    }

    let rawBody: unknown
    try {
      rawBody = await req.json()
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'El body debe ser JSON válido.')
    }
    if (!isJsonRecord(rawBody)) {
      return errorResponse(400, 'INVALID_BODY', 'El body debe ser un objeto JSON.')
    }
    if (typeof rawBody.userId !== 'string' || !uuidPattern.test(rawBody.userId)) {
      return errorResponse(400, 'INVALID_USER_ID', 'El identificador del usuario es inválido.')
    }
    if (typeof rawBody.newEmail !== 'string') {
      return errorResponse(400, 'EMAIL_REQUIRED', 'El email nuevo es requerido.')
    }
    if (typeof rawBody.expectedCurrentEmail !== 'string') {
      return errorResponse(400, 'CURRENT_EMAIL_REQUIRED', 'Falta confirmar el email actual.')
    }

    const userId = rawBody.userId
    const newEmail = rawBody.newEmail.trim().toLowerCase()
    const expectedCurrentEmail = rawBody.expectedCurrentEmail.trim().toLowerCase()
    if (!newEmail || newEmail.length > 254 || !emailPattern.test(newEmail)) {
      return errorResponse(400, 'INVALID_EMAIL', 'Ingresá un email válido.')
    }

    const adminClient = createClient(supaUrl, supaServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId)
    if (targetError || !targetData.user) {
      return errorResponse(targetError?.status === 404 ? 404 : 502, 'USER_LOOKUP_FAILED', 'No se pudo verificar el usuario.')
    }

    const currentEmail = String(targetData.user.email || '').trim().toLowerCase()
    if (!currentEmail || currentEmail !== expectedCurrentEmail) {
      return errorResponse(409, 'STALE_EMAIL', 'El email actual cambió. Recargá la lista antes de continuar.')
    }
    if (currentEmail === newEmail) {
      return jsonResponse(200, { ok: true, email: currentEmail, unchanged: true })
    }

    // Auth no ofrece una búsqueda exacta de email en Admin. Se recorre la lista
    // completa para dar un error claro antes de intentar la mutación privilegiada.
    const perPage = 1000
    for (let page = 1; page <= 100; page++) {
      const { data: usersPage, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage })
      if (listError) {
        console.error('admin-actualizar-email: no se pudo verificar unicidad', { status: listError.status ?? null })
        return errorResponse(502, 'EMAIL_LOOKUP_FAILED', 'No se pudo verificar si el email ya está en uso.')
      }
      const usuarios = usersPage.users || []
      const duplicado = usuarios.find(user =>
        user.id !== userId && String(user.email || '').trim().toLowerCase() === newEmail
      )
      if (duplicado) {
        return errorResponse(409, 'EMAIL_ALREADY_EXISTS', 'Ese email ya pertenece a otro usuario.')
      }
      if (usuarios.length < perPage) break
      if (page === 100) {
        return errorResponse(503, 'EMAIL_LOOKUP_INCOMPLETE', 'No se pudo completar la verificación de unicidad.')
      }
    }

    const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    })
    if (authUpdateError) {
      if (authUpdateError.code === 'email_exists' || authUpdateError.code === 'user_already_exists') {
        return errorResponse(409, 'EMAIL_ALREADY_EXISTS', 'Ese email ya pertenece a otro usuario.')
      }
      console.error('admin-actualizar-email: Auth rechazó el cambio', {
        code: authUpdateError.code ?? null,
        status: authUpdateError.status ?? null,
      })
      return errorResponse(502, 'AUTH_UPDATE_FAILED', 'No se pudo actualizar la credencial de acceso.')
    }

    // Los dos campos son espejos legacy usados por pantallas actuales. Se
    // actualizan por user_id; códigos, referencias, destinos y visitas no se tocan.
    const { error: canalesError } = await adminClient
      .from('canales')
      .update({ email: newEmail, colaborador_email: newEmail })
      .eq('user_id', userId)

    if (canalesError) {
      const { error: rollbackError } = await adminClient.auth.admin.updateUserById(userId, {
        email: currentEmail,
        email_confirm: true,
      })
      console.error('admin-actualizar-email: falló la sincronización de canales', {
        code: canalesError.code,
        rollback_failed: Boolean(rollbackError),
      })
      return errorResponse(
        500,
        rollbackError ? 'CHANNEL_SYNC_AND_ROLLBACK_FAILED' : 'CHANNEL_SYNC_FAILED',
        rollbackError
          ? 'La credencial cambió, pero no se pudo sincronizar ni revertir. Revisá Auth y Canales.'
          : 'No se pudo sincronizar el canal. La credencial fue revertida.',
      )
    }

    return jsonResponse(200, { ok: true, email: newEmail })
  } catch (error) {
    console.error(
      'admin-actualizar-email: error inesperado',
      error instanceof Error ? { name: error.name } : { type: typeof error },
    )
    return errorResponse(500, 'INTERNAL_ERROR', 'Ocurrió un error interno al cambiar el email.')
  }
})
