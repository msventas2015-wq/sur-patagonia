import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.5'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const DEFAULT_PROPERTY_ID = '553717417'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GA_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly'
const ALLOWED_ORIGIN = /^(https:\/\/(?:www\.)?(?:surpatagonian\.com|surpatagonia\.com\.ar)|http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/

type JsonObject = Record<string, unknown>
type TokenCache = { value: string; expiresAt: number } | null

let tokenCache: TokenCache = null

function corsHeaders(req: Request): Record<string, string> {
  const requested = req.headers.get('Origin') || ''
  const origin = ALLOWED_ORIGIN.test(requested) ? requested : 'https://surpatagonian.com'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function response(req: Request, status: number, body: JsonObject): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function dayDiff(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
}

function addDays(value: string, amount: number): string {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

function base64Url(bytes: Uint8Array | string): string {
  const raw = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  let binary = ''
  raw.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function pemBytes(pem: string): Uint8Array {
  const clean = pem.replaceAll('\\n', '\n')
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '')
  const binary = atob(clean)
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function serviceAccountToken(clientEmail: string, privateKey: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value

  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: GA_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }))
  const unsigned = `${header}.${claims}`
  const key = await crypto.subtle.importKey(
    'pkcs8', pemBytes(privateKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  )
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned),
  ))
  const assertion = `${unsigned}.${base64Url(signature)}`
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(15_000),
  })
  const tokenBody: unknown = await tokenResponse.json().catch(() => null)
  if (!tokenResponse.ok || !isObject(tokenBody) || typeof tokenBody.access_token !== 'string') {
    console.error('ga4-admin-report: Google rechazó el token', { status: tokenResponse.status })
    throw new Error('Google Analytics no aceptó la cuenta de servicio.')
  }
  const expiresIn = Number(tokenBody.expires_in || 3600)
  tokenCache = { value: tokenBody.access_token, expiresAt: Date.now() + expiresIn * 1000 }
  return tokenCache.value
}

type GaReport = {
  dimensionHeaders?: Array<{ name?: string }>
  metricHeaders?: Array<{ name?: string }>
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
}

function parseReport(report: GaReport | undefined): JsonObject[] {
  const dimensions = report?.dimensionHeaders?.map(item => item.name || '') || []
  const metrics = report?.metricHeaders?.map(item => item.name || '') || []
  return (report?.rows || []).map(row => {
    const parsed: JsonObject = {}
    dimensions.forEach((name, index) => { parsed[name] = row.dimensionValues?.[index]?.value || '' })
    metrics.forEach((name, index) => {
      const raw = row.metricValues?.[index]?.value || '0'
      const number = Number(raw)
      parsed[name] = Number.isFinite(number) ? number : 0
    })
    return parsed
  })
}

function runRequest(dateRanges: Array<{ startDate: string; endDate: string }>, dimensions: string[], metrics: string[], limit = 100, orderDimension = ''): JsonObject {
  const request: JsonObject = {
    dateRanges,
    metrics: metrics.map(name => ({ name })),
    limit: String(limit),
    keepEmptyRows: false,
    returnPropertyQuota: false,
  }
  if (dimensions.length) request.dimensions = dimensions.map(name => ({ name }))
  request.orderBys = orderDimension
    ? [{ dimension: { dimensionName: orderDimension, orderType: 'ALPHANUMERIC' }, desc: false }]
    : [{ metric: { metricName: metrics[0] }, desc: true }]
  return request
}

async function fetchGaReports(propertyId: string, token: string, requests: JsonObject[]): Promise<GaReport[]> {
  const result = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:batchRunReports`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(25_000),
    },
  )
  const body: unknown = await result.json().catch(() => null)
  if (!result.ok || !isObject(body) || !Array.isArray(body.reports)) {
    console.error('ga4-admin-report: Data API falló', { status: result.status })
    throw new Error('Google Analytics no pudo generar el informe solicitado.')
  }
  return body.reports as GaReport[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return response(req, 405, { ok: false, code: 'METHOD_NOT_ALLOWED' })

  try {
    const authorization = req.headers.get('Authorization')?.trim() || ''
    if (!/^Bearer\s+\S+$/i.test(authorization)) {
      return response(req, 401, { ok: false, code: 'AUTH_REQUIRED', error: 'Falta una sesión válida.' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const clientEmail = Deno.env.get('GA4_CLIENT_EMAIL')
    const privateKey = Deno.env.get('GA4_PRIVATE_KEY')
    const propertyId = Deno.env.get('GA4_PROPERTY_ID') || DEFAULT_PROPERTY_ID
    if (!supabaseUrl || !anonKey || !clientEmail || !privateKey) {
      console.error('ga4-admin-report: faltan variables requeridas')
      return response(req, 503, {
        ok: false,
        code: 'GA4_NOT_CONFIGURED',
        error: 'La conexión segura con GA4 todavía no está configurada.',
      })
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authorization } },
    })
    const { data: { user }, error: authError } = await callerClient.auth.getUser()
    if (authError || !user) return response(req, 401, { ok: false, code: 'INVALID_SESSION', error: 'La sesión es inválida o expiró.' })
    if (user.app_metadata?.rol !== 'admin') {
      return response(req, 403, { ok: false, code: 'ADMIN_REQUIRED', error: 'Sólo un administrador puede consultar GA4.' })
    }

    let body: unknown
    try { body = await req.json() } catch { return response(req, 400, { ok: false, code: 'INVALID_JSON' }) }
    if (!isObject(body) || Object.keys(body).some(key => !['desde', 'hasta'].includes(key)) || !validDate(body.desde) || !validDate(body.hasta)) {
      return response(req, 400, { ok: false, code: 'INVALID_RANGE', error: 'El rango debe contener desde y hasta en formato AAAA-MM-DD.' })
    }
    const desde = body.desde as string
    const hasta = body.hasta as string
    const days = dayDiff(desde, hasta)
    const today = new Date().toISOString().slice(0, 10)
    if (days < 1 || days > 366 || hasta > today) {
      return response(req, 400, { ok: false, code: 'INVALID_RANGE', error: 'El rango debe tener entre 1 y 366 días y no puede terminar en el futuro.' })
    }
    const previousHasta = addDays(desde, -1)
    const previousDesde = addDays(desde, -days)
    const currentRange = [{ startDate: desde, endDate: hasta }]
    const previousRange = [{ startDate: previousDesde, endDate: previousHasta }]
    const summaryMetrics = ['totalUsers', 'activeUsers', 'sessions', 'screenPageViews', 'engagedSessions', 'engagementRate', 'averageSessionDuration']
    const token = await serviceAccountToken(clientEmail, privateKey)
    // batchRunReports admite como máximo cinco informes por solicitud.
    const [primaryReports, detailReports] = await Promise.all([
      fetchGaReports(propertyId, token, [
      runRequest(currentRange, [], summaryMetrics, 1),
      runRequest(previousRange, [], summaryMetrics, 1),
      runRequest(currentRange, ['date'], ['activeUsers', 'sessions', 'screenPageViews'], 366, 'date'),
      runRequest(currentRange, ['country', 'region', 'city'], ['activeUsers', 'sessions', 'screenPageViews'], 150),
      runRequest(currentRange, ['sessionSource', 'sessionMedium'], ['activeUsers', 'sessions'], 100),
      ]),
      fetchGaReports(propertyId, token, [
      runRequest(currentRange, ['pagePath', 'pageTitle'], ['screenPageViews', 'activeUsers'], 100),
      runRequest(currentRange, ['deviceCategory'], ['activeUsers', 'sessions', 'screenPageViews'], 10),
      runRequest(currentRange, ['eventName'], ['eventCount'], 100),
      ]),
    ])
    return response(req, 200, {
      ok: true,
      propertyId,
      measurementId: 'G-EWLCEV4Y6Q',
      generatedAt: new Date().toISOString(),
      range: { desde, hasta, previousDesde, previousHasta },
      summary: parseReport(primaryReports[0])[0] || {},
      previous: parseReport(primaryReports[1])[0] || {},
      series: parseReport(primaryReports[2]),
      geo: parseReport(primaryReports[3]),
      acquisition: parseReport(primaryReports[4]),
      pages: parseReport(detailReports[0]),
      devices: parseReport(detailReports[1]),
      events: parseReport(detailReports[2]),
    })
  } catch (error) {
    console.error('ga4-admin-report: error', error instanceof Error ? error.message : 'unknown')
    return response(req, 502, {
      ok: false,
      code: 'GA4_REPORT_FAILED',
      error: error instanceof Error ? error.message : 'No se pudo obtener el informe de GA4.',
    })
  }
})
