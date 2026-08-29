// ALQ F4 · carga focalizada de índices oficiales para ajustes contractuales.
// No usa service_role: autentica al usuario, verifica que pueda leer la serie
// administrativa y persiste mediante un RPC que vuelve a validar todo.

const cors = Object.freeze({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
})

const jsonHeaders = Object.freeze({
  ...cors,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
})

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const IPC_SERIES_ID = '148.3_INIVELNAL_DICI_M_26'

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function response(status: number, body: JsonObject): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders })
}

function isoDate(value: unknown, name: string): string {
  const parsed = typeof value === 'string' && DATE_RE.test(value)
    ? new Date(`${value}T00:00:00Z`) : null
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} debe ser una fecha AAAA-MM-DD válida.`)
  }
  return value
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function fetchRawJson(url: string): Promise<{ raw: Uint8Array; json: unknown }> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'Accept-Language': 'es-AR' },
    signal: AbortSignal.timeout(15_000),
  })
  const raw = new Uint8Array(await res.arrayBuffer())
  if (!res.ok) throw new Error(`La fuente oficial respondió HTTP ${res.status}.`)
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(raw))
  } catch {
    throw new Error('La fuente oficial no devolvió JSON válido.')
  }
  return { raw, json }
}

function ipcValue(json: unknown, expectedDate: string): number {
  if (!isObject(json) || !Array.isArray(json.data)) {
    throw new Error('La respuesta oficial de IPC cambió de formato.')
  }
  const row = json.data.find((item) => Array.isArray(item) && String(item[0]).slice(0, 10) === expectedDate)
  const value = Array.isArray(row) ? Number(row[1]) : Number.NaN
  if (!Number.isFinite(value) || value <= 0) throw new Error(`IPC oficial no disponible para ${expectedDate}.`)
  return value
}

function iclValue(json: unknown, expectedDate: string): number {
  if (!isObject(json) || !Array.isArray(json.results)) {
    throw new Error('La respuesta oficial de ICL cambió de formato.')
  }
  const result = json.results.find((item) => isObject(item) && Number(item.idVariable) === 7988)
  const detail = isObject(result) && Array.isArray(result.detalle) ? result.detalle : []
  const row = detail.find((item) => isObject(item) && String(item.fecha).slice(0, 10) === expectedDate)
  const value = isObject(row) ? Number(row.valor) : Number.NaN
  if (!Number.isFinite(value) || value <= 0) throw new Error(`ICL oficial no disponible para ${expectedDate}.`)
  return value
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return response(405, { ok: false, code: 'METHOD_NOT_ALLOWED' })

  try {
    const authorization = req.headers.get('Authorization')?.trim() ?? ''
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return response(401, { ok: false, code: 'AUTH_REQUIRED', error: 'Falta una sesión válida.' })
    }
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !anonKey) {
      return response(500, { ok: false, code: 'SERVER_MISCONFIGURED' })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return response(400, { ok: false, code: 'INVALID_JSON' })
    }
    if (!isObject(body) || Object.keys(body).some((key) => ![
      'serie_id', 'fuente', 'periodo_desde', 'periodo_hasta_exclusivo',
    ].includes(key))) {
      return response(400, { ok: false, code: 'INVALID_BODY' })
    }
    const serieId = typeof body.serie_id === 'string' ? body.serie_id : ''
    const fuente = body.fuente
    if (!UUID_RE.test(serieId) || (fuente !== 'ipc' && fuente !== 'icl')) {
      return response(400, { ok: false, code: 'INVALID_SERIES' })
    }
    let desde: string
    let hasta: string
    try {
      desde = isoDate(body.periodo_desde, 'periodo_desde')
      hasta = isoDate(body.periodo_hasta_exclusivo, 'periodo_hasta_exclusivo')
    } catch (error) {
      return response(400, {
        ok: false,
        code: 'INVALID_DATE',
        error: error instanceof Error ? error.message : 'Fecha inválida.',
      })
    }
    if (hasta <= desde) return response(400, { ok: false, code: 'INVALID_PERIOD' })

    const callerHeaders = {
      apikey: anonKey,
      Authorization: authorization,
      'Content-Type': 'application/json',
    }
    // Esta lectura pasa por los permisos/RLS del caller. Si no es admin o la
    // serie no existe, no se permite usar la función como proxy de internet.
    const seriesCheck = await fetch(
      `${supabaseUrl}/rest/v1/alq_v_indice_serie?id=eq.${encodeURIComponent(serieId)}&select=id,organismo,codigo,granularidad`,
      { headers: callerHeaders },
    )
    const seriesRows = seriesCheck.ok ? await seriesCheck.json() : null
    if (!Array.isArray(seriesRows) || seriesRows.length !== 1 || !isObject(seriesRows[0])) {
      return response(403, { ok: false, code: 'ADMIN_SERIES_REQUIRED' })
    }
    const series = seriesRows[0]
    if (fuente === 'ipc' && (String(series.organismo).toUpperCase() !== 'INDEC' || String(series.codigo).toUpperCase() !== 'IPC' || series.granularidad !== 'mensual')) {
      return response(409, { ok: false, code: 'SERIES_SOURCE_MISMATCH' })
    }
    if (fuente === 'icl' && (String(series.organismo).toUpperCase() !== 'BCRA' || String(series.codigo).toUpperCase() !== 'ICL' || series.granularidad !== 'diaria')) {
      return response(409, { ok: false, code: 'SERIES_SOURCE_MISMATCH' })
    }

    const sourceUrl = fuente === 'ipc'
      ? `https://apis.datos.gob.ar/series/api/series/?ids=${IPC_SERIES_ID}&start_date=${desde}&end_date=${desde}&format=json&metadata=full`
      : `https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/7988?desde=${desde}&hasta=${desde}&limit=10`
    const fetchedAt = new Date().toISOString()
    const official = await fetchRawJson(sourceUrl)
    const value = fuente === 'ipc' ? ipcValue(official.json, desde) : iclValue(official.json, desde)
    const hash = bytesToHex(await crypto.subtle.digest('SHA-256', official.raw))
    const requestId = crypto.randomUUID()
    const payload = {
      schema_version: 1,
      serie_id: serieId,
      periodo_desde: desde,
      periodo_hasta_exclusivo: hasta,
      valor: String(value),
      // Las APIs consultadas no publican un timestamp de publicación por
      // observación. Se registra honestamente el instante de primera descarga.
      publicada_at: fetchedAt,
      fuente_url: sourceUrl,
      hash_insumo: hash,
      fecha_descarga: fetchedAt,
      origen: 'oficial_automatico',
    }
    const persisted = await fetch(`${supabaseUrl}/rest/v1/rpc/alq_admin_indice_observacion_importar`, {
      method: 'POST',
      headers: callerHeaders,
      body: JSON.stringify({ p_request_id: requestId, p_payload: payload }),
    })
    const persistedBody: unknown = await persisted.json().catch(() => null)
    if (!persisted.ok) {
      const detail = isObject(persistedBody) && typeof persistedBody.message === 'string'
        ? persistedBody.message : 'La base rechazó la observación oficial.'
      return response(409, { ok: false, code: 'PERSIST_REJECTED', error: detail })
    }
    return response(200, {
      ok: true,
      request_id: requestId,
      fuente,
      respuesta_oficial_sha256: hash,
      observacion: persistedBody,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error inesperado.'
    return response(502, { ok: false, code: 'OFFICIAL_SOURCE_FAILED', error: message })
  }
})
