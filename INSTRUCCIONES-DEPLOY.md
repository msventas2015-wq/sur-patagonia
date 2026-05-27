# Sur Patagonia — Instrucciones de Deploy
## Pasos para poner el sitio online

---

## PASO 1 — Configurar Supabase (base de datos)

1. Ingresá a https://supabase.com y abrí tu proyecto
2. En el menú izquierdo, hacé clic en **SQL Editor**
3. Hacé clic en **New query**
4. Abrí el archivo `supabase-setup.sql` de este proyecto
5. Copiá todo el contenido y pegalo en el SQL Editor
6. Hacé clic en **Run** (o Ctrl+Enter)
7. Deberías ver "Success" — esto crea todas las tablas

### Crear tu usuario administrador:
1. En Supabase, ir a **Authentication → Users**
2. Hacer clic en **Add user**
3. Poner tu email y elegir una contraseña segura
4. Guardar — ese email y contraseña te van a servir para entrar al panel admin

---

## PASO 2 — Subir el código a GitHub

1. Abrí GitHub (github.com) y entrá a tu cuenta
2. Crear un nuevo repositorio:
   - Hacé clic en **New repository**
   - Nombre: `sur-patagonia` (o el que quieras)
   - Visibilidad: **Public** o Private (cualquiera sirve)
   - NO marques "Add README"
   - Hacer clic en **Create repository**

3. GitHub te va a mostrar instrucciones. Necesitás subir los archivos.
   La forma más fácil es usar **GitHub Desktop** (gratuito):
   - Descargalo en https://desktop.github.com
   - Instalalo y conectá tu cuenta de GitHub
   - Hacer clic en **Add → Add Existing Repository**
   - Seleccioná la carpeta donde guardaste estos archivos
   - Si pregunta, iniciá el repositorio
   - Commit con el mensaje "Sitio inicial"
   - **Push origin**

---

## PASO 3 — Publicar en Netlify

1. Ir a https://netlify.com y crear cuenta (es gratis)
2. Hacer clic en **Add new site → Import an existing project**
3. Seleccionar **GitHub**
4. Autorizar a Netlify para acceder a tus repos
5. Seleccionar el repositorio `sur-patagonia`
6. Configuración:
   - Build command: (dejar vacío)
   - Publish directory: `.` (solo un punto)
7. Hacer clic en **Deploy site**
8. En 1-2 minutos el sitio va a estar online con una URL como `https://surpatagonia.netlify.app`

---

## PASO 4 — Verificar que funciona

1. Abrí la URL que te dio Netlify
2. Probá navegar por el sitio
3. Entrá al panel admin: `tuurl.netlify.app/admin/login.html`
4. Usá el email y contraseña que creaste en Supabase
5. Cargá una propiedad de prueba desde el panel

---

## PASO 5 — Dominio propio (opcional)

Si querés usar `www.surpatagonia.com.ar`:
1. En Netlify → tu sitio → **Domain settings**
2. Hacer clic en **Add custom domain**
3. Ingresar tu dominio
4. Netlify te va a dar las DNS que tenés que configurar en donde compraste el dominio

---

## Estructura de archivos del proyecto

```
/
├── index.html              ← Página principal
├── propiedades.html        ← Listado de propiedades
├── propiedad.html          ← Detalle de propiedad
├── proyectos.html          ← Proyectos y audiovisual
├── css/
│   └── estilos.css         ← Todos los estilos
├── js/
│   └── config.js           ← Conexión Supabase
├── admin/
│   ├── login.html          ← Login del administrador
│   ├── dashboard.html      ← Panel principal
│   ├── propiedades.html    ← Gestión de propiedades
│   ├── nueva-propiedad.html← Crear/editar propiedad
│   ├── proyectos.html      ← Gestión de proyectos
│   ├── contactos.html      ← Ver consultas recibidas
└── supabase-setup.sql      ← Script de base de datos
```

---

## Cada vez que hagas cambios

1. Modificar los archivos en tu computadora
2. Abrir GitHub Desktop
3. Ver los cambios detectados
4. Escribir un mensaje de commit (ej: "Actualizo descripción")
5. Hacer clic en **Commit** y luego **Push**
6. Netlify detecta el cambio y republica automáticamente en ~30 segundos

---

## Si necesitás ayuda

Para cualquier problema con el sitio, el panel o las propiedades, podés volver a esta conversación y pedirme ayuda.
