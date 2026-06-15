# Gastos danis 🧾

App familiar de gastos, **voice-first**: tocás el micrófono, decís *«gasté 4500 en el súper»* y una IA lo interpreta y precarga el formulario para que confirmes. Pensada para el celular (es una PWA instalable) y para uso compartido entre dos personas de la familia.

Está hecha en **Express** sobre **Vercel** (función serverless), con login de Google, datos en **Supabase** y transcripción de voz por **Gemini**.

> 🔒 La app es **privada para la familia**: solo entran los emails de una lista blanca (ver [Acceso](#acceso)).

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Lenguaje | JavaScript (ESM, `"type": "module"`) — sin build, sin TypeScript |
| Framework | Express 4 |
| Vistas | EJS (server-side rendering) + CSS y JS vanilla en `public/` |
| Auth | Passport.js (`passport-google-oauth20`) + `cookie-session` (sesión sin estado) |
| Base de datos | Supabase (Postgres), accedida con la `service_role` key desde el servidor |
| IA de voz | Web Speech API (navegador) → Google Gemini (`gemini-2.5-flash`) |
| Cotización | dólar bolsa/MEP de [dolarapi.com](https://dolarapi.com) |
| Hosting | Vercel (deploy automático desde GitHub) |
| PWA | `manifest.webmanifest` + service worker (`sw.js`) |

---

## Funcionalidades

### 🎤 Cargar (`/inicio`)
Pantalla principal. Mascota animada ("Chubi") + un **micrófono**: la voz se transcribe en el navegador (Web Speech API, `es-AR`) y se manda a `POST /api/interpretar`, que llama a Gemini y devuelve el gasto interpretado (`descripción`, `monto`, `moneda`, `categoría`, `persona`, `fecha`). Eso **precarga la hoja inferior** para que confirmes y guardes. También hay un botón **➕ (FAB)** para cargar a mano.

Debajo, los **últimos gastos agrupados por día** (Hoy / Ayer / fecha), con el total de cada día. Esta vista es **solo lectura**: no se edita acá.

> La interpretación prueba varios modelos en orden (Groq primero, Gemini de respaldo; ver `src/models/ia.js`): si uno se queda sin cuota, pasa al siguiente. Si **ninguno** está disponible, la voz cae a **modo manual**: rellena la descripción con lo transcripto y completás el resto a mano.

### 📊 Resumen (`/resumen`)
Tiene un **selector de mes** (‹ Junio 2026 ›; nunca futuro) y un toggle **Gastos | Gráficos**:

- **Gastos**: la lista del mes agrupada por día, esta vez **editable** — cada fila tiene un lápiz ✏️ que abre la hoja para editar o borrar.
- **Gráficos**: total del mes en ARS, **total por persona** (en ARS y USD), gráfico de **torta** por categoría (`conic-gradient` CSS) y **ranking de barras** por categoría.

### 👨‍👩‍👧 Nosotros (`/nosotros`)
Pantalla estática con las fotos de la familia.

### Carga / edición / borrado de un gasto
Todo pasa por la **hoja inferior** (bottom sheet): descripción, monto + **moneda (ARS/USD)**, **persona** ("a nombre de quién", segmented), **categoría** (chips) y **fecha** (Hoy / Ayer / Otro día).

- **Crear** → `POST /nuevo`
- **Editar** → `POST /gastos/:id/editar` (baja lógica del viejo + alta del nuevo → conserva historial)
- **Borrar** → `POST /gastos/:id/eliminar` (borrado lógico: `eliminado=true`, pide confirmación)

Cada gasto guarda el monto en **ambas monedas** (`monto_ars` y `monto_usd`), convertido al dólar bolsa del momento.

### Acceso
Login con **"Entrar con Google"**. La app valida el email contra una lista blanca en [`src/config/acceso.js`](src/config/acceso.js) (o la variable `ALLOWED_EMAILS`). Si el email no está permitido, no entra (aviso `🔒 Esa cuenta no tiene acceso`).

---

## Diseño / UX

- **Mobile-first**, look "chibi": fuentes Fredoka + Nunito, paleta coral, mascota CSS "Chubi", sonidos (WebAudio, sin archivos) al guardar.
- **Navegación por tab bar inferior** de 3 pestañas: **Cargar** (`/inicio`), **Resumen** (`/resumen`), **Nosotros** (`/nosotros`).
- **Bottom sheet** reutilizada para crear y editar; la fila de gasto es un único partial ([`partials/gasto-row.ejs`](src/views/partials/gasto-row.ejs)) compartido entre Inicio (solo lectura) y Resumen (editable).
- **Libro compartido**: no hay "mis gastos" vs "los tuyos" — todos ven y editan todos los gastos. Cada gasto registra quién lo **cargó** (`cargado_por`) y **a nombre de quién** fue (`a_nombre_de`, guardado como email, mostrado como label "Dani Hombre"/"Dani Mujer").
- **PWA instalable** en el celu (sobre todo Android). El service worker cachea **solo** estáticos (íconos/manifest); las páginas y los datos van siempre a la red para no servir nada viejo ni mezclar datos.

---

## Cómo correrlo localmente

### Requisitos
- **Node.js 20+** (en Vercel corre Node 24).
- **Vercel CLI**: `npm i -g vercel` (el dev server usa `vercel dev`, que replica el entorno serverless).
- Credenciales de Google OAuth, un proyecto de Supabase y, opcionalmente, una API key de Gemini.

### Pasos
```bash
npm install
cp .env.example .env     # completá las variables (ver abajo)
npm run watch            # = vercel dev --listen 3000  → http://localhost:3000
```

### Variables de entorno
Ver [`.env.example`](.env.example). Se leen **todas** en un único lugar: [`src/config/env.js`](src/config/env.js).

| Variable | Para qué | ¿Obligatoria? |
|----------|----------|----------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login con Google | Sí (sin esto, el login queda deshabilitado) |
| `SESSION_SECRET` | Firmar la cookie de sesión | Sí en producción (en local hay un default inseguro) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Base de datos (solo servidor) | Sí (sin esto, la DB queda deshabilitada pero la app no crashea) |
| `GROQ_API_KEY` | Interpretar la voz con IA (proveedor preferido) | No (sin esto, se usa Gemini) |
| `GEMINI_API_KEY` | Interpretar la voz con IA (respaldo de Groq) | No (sin esto, la voz cae a modo manual) |
| `IA_MODELOS` | Orden de modelos a probar (`proveedor:modelo` por coma) | No (default: Groq + 3 de Gemini) |
| `ALLOWED_EMAILS` | Lista blanca de emails (coma) | No (default: la familia, en `acceso.js`) |

> La app está hecha para **degradar con gracia**: si falta Supabase o Gemini, no rompe — muestra avisos y deshabilita esa parte.

#### Google OAuth (resumen)
En [Google Cloud Console](https://console.cloud.google.com/) → OAuth client ID tipo *Web application*. Agregá como **Authorized redirect URIs**:
- `http://localhost:3000/auth/google/callback` (local)
- `https://TU-DOMINIO.vercel.app/auth/google/callback` (producción)

Si la consent screen está en *Testing*, cada email permitido debe estar además como **test user**.

#### La tabla de Supabase
La app espera una tabla `public.gastos`. El esquema está documentado en [memoria de Claude](#deployment); en resumen: `id` (uuid), `user_id`, `cargado_por`, `a_nombre_de`, `descripcion`, `monto`, `moneda` (ARS/USD), `monto_ars`, `monto_usd`, `categoria`, `fecha`, `created_at`, `eliminado` (bool).

---

## Deployment

Conectado a GitHub: cada `git push` a `main` **despliega solo** en Vercel.

- **URL de producción:** https://gastos-danis.vercel.app
- Las variables de entorno se cargan en **Vercel → Settings → Environment Variables** (o con `vercel env add`).
- [`vercel.json`](vercel.json) hace dos cosas **imprescindibles** (no borrar):
  - `"framework": "express"` — el proyecto se creó desde un repo vacío y Vercel lo dejaba en "Other", lo que hacía 404 todas las rutas.
  - `functions["src/index.js"].includeFiles: "src/views/**"` — las plantillas EJS se leen por path en runtime y el bundler de Vercel no las traza solo; sin esto, `res.render` da 500.

---

## Estructura del proyecto

```
src/
  index.js                 # App Express: middlewares, sesión (cookie firmada), monta routers
  config/
    env.js                 # ÚNICO lugar que lee process.env; expone `config`
    passport.js            # Estrategia Google de Passport (valida lista blanca)
    acceso.js              # Lista blanca de emails (EMAILS_PERMITIDOS, emailPermitido)
    personas.js            # Personas del libro (email ↔ label "Dani Hombre/Mujer", alias)
    categorias.js          # 8 categorías fijas (comida, súper, transporte, ...)
  controllers/
    paginasController.js   # / (landing) y /healthz
    authController.js      # login/logout con Google
    gastosController.js    # home, resumen, crear, actualizar, eliminar, nosotros
    iaController.js        # POST /api/interpretar (voz → gasto)
  middlewares/
    auth.js                # requireAuth (logueado + email permitido)
    errorHandler.js        # manejador de errores global
  models/
    db.js                  # Supabase: listar/crear/actualizar/eliminar (borrado lógico)
    cotizacion.js          # Dólar bolsa de dolarapi.com (cache 30 min)
    ia.js                  # Llamada a Gemini + prompt + schema de salida
  routes/
    paginas.js  auth.js  gastos.js   # solo URLs → controllers
  utils/
    fecha.js               # hoy/ayer/labels de mes en horario de Argentina
  views/                   # EJS (SSR)
    landing.ejs  home.ejs  resumen.ejs  nosotros.ejs
    partials/              # header, footer, tabbar, chubi (mascota), sheet, gasto-row
public/                    # servido por la CDN de Vercel (no express.static)
  app.js                   # voz (Web Speech) + lógica de la hoja inferior
  style.css  sw.js  manifest.webmanifest  *.png  *.jpg
vercel.json                # fuerza framework=express + includeFiles de las vistas
.env.example               # plantilla de variables de entorno
```

> La carpeta `apps-script/` es de un experimento aparte (Google Apps Script) y no forma parte de la app Express.

---

## Notas de arquitectura

- **MVC por capas** (config → routes → controllers → models). Los routers solo declaran URLs; la lógica vive en `controllers/`; el acceso a datos en `models/`.
- **Sesión sin estado**: el perfil del usuario se guarda firmado en la cookie (`cookie-session`), ideal para serverless — no hay tabla de usuarios.
- **Borrado lógico + historial**: nada se borra físico. Editar = dar de baja el registro viejo (`eliminado=true`) + insertar uno nuevo.
- **Fechas en horario de Argentina** centralizadas en `utils/fecha.js` para que la IA y la lista coincidan en qué es "hoy".
