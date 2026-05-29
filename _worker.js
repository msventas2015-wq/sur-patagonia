/**
 * Sur Patagonia — Cloudflare Worker
 * Maneja el routing de archivos estáticos sin redirect loops.
 *
 * Lógica:
 *  1. Intenta servir el archivo exacto (CSS, JS, imágenes, etc.)
 *  2. Si no existe, prueba agregando .html (para URLs sin extensión)
 *  3. Si tampoco existe, sirve 404.html con status 200
 *     (para slugs de proyectos tipo /cipreces-del-sur)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const { pathname } = url

    // ── 1. Archivo exacto ──────────────────────────────────────────────
    let res = await env.ASSETS.fetch(request)
    if (res.status !== 404) return res

    // ── 2. Agregar .html (ej: /admin/proyectos → /admin/proyectos.html) ─
    const reqHtml = new Request(url.origin + pathname.replace(/\/$/, '') + '.html', request)
    res = await env.ASSETS.fetch(reqHtml)
    if (res.status !== 404) return res

    // ── 3. Index dentro de carpeta (ej: /admin/ → /admin/index.html) ───
    if (!pathname.endsWith('.html')) {
      const reqIdx = new Request(url.origin + pathname.replace(/\/$/, '') + '/index.html', request)
      res = await env.ASSETS.fetch(reqIdx)
      if (res.status !== 404) return res
    }

    // ── 4. Fallback: 404.html con 200 (miniwebs de proyectos) ──────────
    const req404 = new Request(url.origin + '/404.html', request)
    res = await env.ASSETS.fetch(req404)
    return new Response(res.body, {
      status: 200,
      headers: res.headers,
    })
  },
}
