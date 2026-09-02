# Deploy — Sur Patagonia
**Fuente de verdad para el proceso de deploy. Codex debe leer este archivo antes de cualquier auditoría de infraestructura.**

---

## Stack de producción

| Capa | Tecnología | Detalle |
|---|---|---|
| Frontend | HTML + JS vanilla | Sin bundler, sin build step, sin framework |
| Hosting | Cloudflare Pages | Auto-deploy desde rama `main` de GitHub |
| Base de datos | Supabase | PostgreSQL + RLS + Auth |
| Librerías frontend | Leaflet.js, Chart.js, QRCode.js, GSAP | CDN, sin npm |
| Dominio | `surpatagonia.com.ar` | DNS apuntando a Cloudflare Pages |

**No se usa Netlify. No se usa Vercel. No hay servidor propio.**

---

## Flujo de deploy

```
Cambio en archivo local
        ↓
git add + git commit
        ↓
git push origin main
        ↓
Cloudflare Pages detecta el push automáticamente
        ↓
Deploy en ~30 segundos
        ↓
https://surpatagonia.com.ar actualizado
```

No hay paso de build. Los archivos HTML/JS/CSS se sirven tal cual están en el repo.

---

## Estructura del repositorio

```
/
├── index.html                  ← Landing pública
├── proximamente.html           ← Landing "próximamente" (video + logo)
├── propiedades.html            ← Listado de propiedades
├── propiedad.html              ← Detalle de propiedad
├── proyectos.html              ← Proyectos y audiovisual
├── 404.html                    ← Maneja redirecciones /r/{codigo} + tracking
├── _headers                    ← Cache-Control headers para Cloudflare Pages
├── assets/                     ← Logos, imágenes estáticas
├── admin/
│   ├── login.html
│   ├── dashboard.html
│   ├── canales.html            ← ⚠️ NO TOCAR
│   ├── nuevo-canal.html
│   ├── contactos.html          ← ⚠️ NO TOCAR
│   ├── crm.html                ← ⚠️ NO TOCAR
│   └── propiedades.html
├── colaboradores/
│   ├── index.html              ← Panel pasivo y activo de aliados
│   ├── desarrollador.html      ← Panel técnico / métricas avanzadas
│   └── sw.js                   ← Service Worker (cache v2, network-first HTML)
└── docs/
    └── gobernanza/
        ├── gobernanza-visual.md
        ├── deploy.md           ← este archivo
        └── _archivo-2026-09-02/
            ├── gobernanza-visual-v1.0-DEROGADA.md
            └── paleta-canales-DEROGADA.md
```

---

## Archivos con restricciones absolutas

Estos archivos **nunca se tocan** sin aprobación explícita de Mariano:

- `admin/crm.html`
- `admin/contactos.html`
- `admin/canales.html`
- `crm.html`
- `contactos.html`

---

## Base de datos — Supabase

**Tablas principales:**

| Tabla | Descripción |
|---|---|
| `canales` | Cada aliado/canal con `codigo`, `color_index`, `latitud`, `longitud`, etc. |
| `referencias` | QRs físicos asociados a canales (`codigo`, `canal_id`) |
| `visitas` | Registra cada interacción (`canal_ref`, `canal_via`, `dispositivo`, `referrer`) |
| `contactos` | Leads generados por canal |
| `proyectos` | Proyectos inmobiliarios con `slug` |

**Reglas de operación con Supabase:**
- Nunca ejecutar `ALTER / CREATE / UPDATE / DELETE / INSERT` sin aprobación explícita de Mariano
- No modificar RLS
- No crear triggers ni funciones sin aprobación
- No tocar datos productivos

---

## Flujo de redirección /r/{codigo}

1. Usuario escanea QR físico → va a `surpatagonia.com.ar/r/{codigo}`
2. `404.html` captura la ruta (Cloudflare Pages sirve 404.html para rutas no encontradas)
3. `404.html` resuelve el código contra tabla `referencias` en Supabase
4. Si hay campaña activa → redirige a URL de campaña; si no → destino base del canal
5. Si el destino **no está instrumentado** (URL personalizada, `/proximamente`, externa) → registra visita en `visitas` antes de redirigir
6. Si el destino **sí está instrumentado** (`/`, `/proyectos.html`, slugs de proyecto) → NO registra en `404.html` para evitar doble conteo

**`canal_via`:** `'qr'` (escaneo QR físico) vs `'link'` (link compartido, viene con `?via=link`)

---

## Reglas de sesión para agentes

1. **Antes de hacer → comentar primero. Después ejecutamos.**
2. **Brief descargable para ChatGPT** va junto con cualquier propuesta técnica.
3. No subir sin aprobación. No hacer commit automático.
4. No ejecutar SQL destructivo sin aprobación.
5. No tocar los archivos con restricción absoluta listados arriba.
