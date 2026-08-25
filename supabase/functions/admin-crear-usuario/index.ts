import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonHeaders = { ...cors, 'Content-Type': 'application/json' }

const rolesPermitidos = new Set(['admin', 'agente', 'colaborador'])
const tiposColaboradorPermitidos = new Set(['pasivo', 'activo', 'desarrollador', 'propietario'])
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

function mapCreateUserError(error: { code?: string; message: string; status?: number }): Response {
  const authCode = error.code ?? ''

  if (authCode === 'email_exists' || authCode === 'user_already_exists') {
    return errorResponse(409, 'EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese email.')
  }

  if (authCode === 'weak_password') {
    return errorResponse(400, 'WEAK_PASSWORD', 'La contraseña no cumple la política de seguridad.')
  }

  if (authCode === 'email_address_invalid' || authCode === 'validation_failed') {
    return errorResponse(400, 'AUTH_VALIDATION_ERROR', error.message)
  }

  if (authCode === 'over_request_rate_limit' || error.status === 429) {
    return errorResponse(429, 'AUTH_RATE_LIMITED', 'Demasiadas solicitudes. Intentá nuevamente más tarde.')
  }

  if (error.status && error.status >= 400 && error.status < 500) {
    return errorResponse(error.status, 'CREATE_USER_REJECTED', error.message)
  }

  console.error('admin-crear-usuario: Auth Admin createUser falló', {
    code: authCode || null,
    status: error.status ?? null,
  })
  return errorResponse(502, 'CREATE_USER_FAILED', 'El servicio de autenticación no pudo crear el usuario.')
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
      console.error('admin-crear-usuario: faltan variables de entorno requeridas')
      return errorResponse(500, 'SERVER_MISCONFIGURED', 'La función no está configurada correctamente.')
    }

    // El cliente del caller usa únicamente su JWT. getUser() consulta Auth y
    // devuelve identidad verificada; no se confía en datos enviados en el body.
    const callerClient = createClient(supaUrl, supaAnon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser()

    if (authError || !caller) {
      return errorResponse(401, 'INVALID_SESSION', 'La sesión es inválida o expiró.')
    }

    // user_metadata es editable por el usuario. Sólo app_metadata puede
    // autorizar esta operación privilegiada.
    if (caller.app_metadata?.rol !== 'admin') {
      return errorResponse(403, 'ADMIN_REQUIRED', 'Sólo un administrador puede crear usuarios.')
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

    if (typeof rawBody.email !== 'string') {
      return errorResponse(400, 'EMAIL_REQUIRED', 'El email es requerido.')
    }
    if (typeof rawBody.password !== 'string') {
      return errorResponse(400, 'PASSWORD_REQUIRED', 'La contraseña es requerida.')
    }
    if (typeof rawBody.rol !== 'string') {
      return errorResponse(400, 'ROLE_REQUIRED', 'El rol es requerido.')
    }
    if (typeof rawBody.nombre !== 'string') {
      return errorResponse(400, 'NAME_REQUIRED', 'El nombre y apellido son requeridos.')
    }
    if (typeof rawBody.dni !== 'string' && typeof rawBody.dni !== 'number') {
      return errorResponse(400, 'DNI_REQUIRED', 'El DNI es requerido.')
    }
    if (rawBody.tipo_acceso != null && typeof rawBody.tipo_acceso !== 'string') {
      return errorResponse(400, 'INVALID_ACCESS_TYPE', 'tipo_acceso debe ser texto o null.')
    }
    if (rawBody.proyecto_slug != null && typeof rawBody.proyecto_slug !== 'string') {
      return errorResponse(400, 'INVALID_PROJECT_SLUG', 'proyecto_slug debe ser texto o null.')
    }

    const email = rawBody.email.trim().toLowerCase()
    const password = rawBody.password
    const rol = rawBody.rol.trim()
    const nombre = rawBody.nombre.trim().replace(/\s+/g, ' ')
    const dni = String(rawBody.dni).replace(/\D/g, '')
    const tipoAcceso = typeof rawBody.tipo_acceso === 'string'
      ? rawBody.tipo_acceso.trim()
      : ''
    const proyectoSlug = typeof rawBody.proyecto_slug === 'string'
      ? rawBody.proyecto_slug.trim()
      : ''

    if (!email || email.length > 254 || !emailPattern.test(email)) {
      return errorResponse(400, 'INVALID_EMAIL', 'Ingresá un email válido.')
    }
    if (password.length < 6) {
      return errorResponse(400, 'PASSWORD_TOO_SHORT', 'La contraseña debe tener al menos 6 caracteres.')
    }
    if (!rolesPermitidos.has(rol)) {
      return errorResponse(400, 'INVALID_ROLE', 'El rol debe ser admin, agente o colaborador.')
    }
    if (nombre.length < 2 || nombre.length > 160) {
      return errorResponse(400, 'INVALID_NAME', 'El nombre y apellido deben tener entre 2 y 160 caracteres.')
    }
    if (!/^\d{6,12}$/.test(dni)) {
      return errorResponse(400, 'INVALID_DNI', 'El DNI debe contener entre 6 y 12 dígitos.')
    }

    if (rol !== 'colaborador' && (tipoAcceso || proyectoSlug)) {
      return errorResponse(
        400,
        'ACCESS_FIELDS_NOT_APPLICABLE',
        'tipo_acceso y proyecto_slug sólo aplican al rol colaborador.',
      )
    }

    if (rol === 'colaborador' && !tiposColaboradorPermitidos.has(tipoAcceso)) {
      return errorResponse(
        400,
        'INVALID_ACCESS_TYPE',
        'El tipo de acceso debe ser pasivo, activo, desarrollador o propietario.',
      )
    }

    if (rol === 'colaborador' && tipoAcceso !== 'desarrollador' && proyectoSlug) {
      return errorResponse(
        400,
        'PROJECT_NOT_APPLICABLE',
        'proyecto_slug sólo aplica a colaboradores desarrolladores.',
      )
    }

    if (rol === 'colaborador' && tipoAcceso === 'desarrollador' && !proyectoSlug) {
      return errorResponse(
        400,
        'PROJECT_REQUIRED',
        'El proyecto es obligatorio para un colaborador desarrollador.',
      )
    }

    const adminClient = createClient(supaUrl, supaServiceRole, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (proyectoSlug) {
      const { data: proyectos, error: proyectoError } = await adminClient
        .from('proyectos')
        .select('slug')
        .eq('slug', proyectoSlug)
        .limit(1)

      if (proyectoError) {
        console.error('admin-crear-usuario: no se pudo validar el proyecto', {
          code: proyectoError.code,
        })
        return errorResponse(500, 'PROJECT_LOOKUP_FAILED', 'No se pudo validar el proyecto seleccionado.')
      }
      if (!proyectos?.length) {
        return errorResponse(400, 'PROJECT_NOT_FOUND', 'El proyecto seleccionado no existe.')
      }
    }

    const trustedMetadata: Record<string, string> = { rol }
    if (rol === 'colaborador') trustedMetadata.tipo_acceso = tipoAcceso
    if (tipoAcceso === 'desarrollador') trustedMetadata.proyecto_slug = proyectoSlug

    const { data, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: trustedMetadata,
      // Espejo transitorio para compatibilidad con la UI publicada. Ninguna
      // autorización debe leer estos datos editables por el usuario.
      user_metadata: { ...trustedMetadata },
    })

    if (createError) return mapCreateUserError(createError)
    if (!data.user?.id) {
      console.error('admin-crear-usuario: Auth Admin respondió sin user.id')
      return errorResponse(502, 'INVALID_AUTH_RESPONSE', 'Auth no devolvió el identificador del usuario.')
    }

    const userId = data.user.id
    if (!uuidPattern.test(userId)) {
      console.error('admin-crear-usuario: Auth Admin devolvió un user.id inválido')
      return errorResponse(502, 'INVALID_AUTH_RESPONSE', 'Auth devolvió un identificador inválido.')
    }

    // El perfil privado se guarda después de Auth. Si falla, se compensa el alta
    // para no dejar una cuenta incompleta que la interfaz no pueda administrar.
    const { error: perfilError } = await callerClient.rpc('admin_guardar_usuario_perfil_2f', {
      p_user_id: userId,
      p_nombre: nombre,
      p_dni: dni,
    })
    if (perfilError) {
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(userId)
      console.error('admin-crear-usuario: no se pudo crear el perfil privado', {
        code: perfilError.code,
        cleanup_failed: Boolean(cleanupError),
      })
      const duplicado = perfilError.code === '23505'
      return errorResponse(
        duplicado ? 409 : 500,
        duplicado ? 'DNI_ALREADY_EXISTS' : 'PROFILE_CREATE_FAILED',
        duplicado
          ? 'Ya existe un titular con ese DNI.'
          : cleanupError
            ? 'No se pudo completar el perfil ni revertir la cuenta. Revisá Auth antes de reintentar.'
            : 'No se pudo completar el perfil. La cuenta temporal fue revertida.',
      )
    }

    return jsonResponse(201, { ok: true, user_id: userId })
  } catch (error) {
    console.error(
      'admin-crear-usuario: error inesperado',
      error instanceof Error ? { name: error.name } : { type: typeof error },
    )
    return errorResponse(500, 'INTERNAL_ERROR', 'Ocurrió un error interno al crear el usuario.')
  }
})
