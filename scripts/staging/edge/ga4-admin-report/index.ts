// QA-only endpoint. A separate Analytics property must be configured before use.
// No Google credentials or production Analytics property is copied to staging.
Deno.serve((request: Request) => {
  const headers = {
    'Access-Control-Allow-Origin': 'https://staging.surpatagonian.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
  if (Deno.env.get('SUPABASE_URL') !== 'https://rsjwqmpseknvydistgfr.supabase.co') {
    return new Response(JSON.stringify({error: 'Entorno de pruebas incorrecto.'}), {status:503,headers});
  }
  if (request.method === 'OPTIONS') return new Response('ok', {headers});
  return new Response(JSON.stringify({ok:false,code:'STAGING_ANALYTICS_DISABLED',
    error:'Analytics está deshabilitado en pruebas hasta configurar una propiedad independiente.'}),
    {status:503,headers});
});
