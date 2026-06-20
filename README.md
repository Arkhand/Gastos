# Gastos danis 🧾

App familiar de gastos, **voice-first**: tocás el micrófono, decís *«gasté 4500 en el súper»* y una IA lo interpreta y guarda (o precarga el formulario para que confirmes). Pensada para el celular (es una PWA instalable) y para uso compartido entre dos personas de la familia.

Está hecha en **Next.js 15 (App Router)** sobre **Vercel**, con login de Google, datos en **Supabase** y transcripción de voz por **Groq / Gemini**.

> 🔒 La app es **privada para la familia**: solo entran los emails de una lista blanca (ver [Acceso](#acceso)).

> ℹ️ **Historial:** el proyecto fue originalmente una app **Express + EJS**. Se reescribió por completo a Next.js (v2.0.0); la carpeta `src/` y las vistas `.ejs` ya no existen.

---

## Stack técnico

| Capa | Tecnología |
|------|------------|
| Lenguaje | JavaScript (ESM, `"type": "module"`) — sin TypeScript |
| Framework | Next.js 15 (App Router) + React 19 |
| UI | Componentes React (`.jsx`) + CSS del diseño "chibi" (`app/legacy.css`) |
| Datos en el cliente | TanStack Query (cache + invalidación) |
| Auth | `google-auth-library` (OAuth) + `iron-session` (cookie firmada, sin estado) |
| Base de datos | Supabase (Postgres), accedida con la `service_role` key desde el servidor |
| IA de voz | Web Speech API (navegador) → Groq (preferido) / Google Gemini (respaldo) |
| Cotización | dólar bolsa/MEP de [dolarapi.com](https://dolarapi.com) |
| Hosting | Vercel (deploy automático desde GitHub) |
| PWA | `manifest.webmanifest` + service worker (`public/sw.js`) |

---

## Funcionalidades

### 🎤 Cargar (`/inicio`)
Pantalla principal. Mascota animada ("Chubi") + un **micrófono**: la voz se transcribe en el navegador (Web Speech API, `es-AR`) y se manda a `POST /api/voz/interpretar`, que llama a la IA y devuelve el gasto interpretado (`descripción`, `monto`, `moneda`, `categoría`, `persona`, `fecha`).

- Si el gasto sale **completo**, se **guarda directo** y aparece un toast con la opción de editarlo.
- Si **falta algo**, se **precarga la hoja inferior** para que lo completes y confirmes.
- También hay un botón **➕ (FAB)** para cargar a mano.

Debajo, los **últimos gastos agrupados por día** (Hoy / Ayer / fecha) con el total de cada día. Esta vista es **solo lectura**: la edición se hace en Resumen.

> La interpretación prueba varios modelos en orden (Groq primero, Gemini de respaldo; ver [`lib/ia.js`](lib/ia.js)): si uno se queda sin cuota, pasa al siguiente. Si **ninguno** está disponible, la voz cae a **modo manual** (rellena la descripción con lo transcripto y completás el resto a mano). La **moneda la decide el texto**, no el modelo (USD solo si se nombran dólares).

### 📊 Resumen (`/resumen`)
Tiene un **selector de mes** (marca 🤝 los meses cerrados) y un toggle **Gastos | Gráficos**:

- **Gastos**:
  - *En móvil:* la lista del mes agrupada por día, **editable** — cada fila tiene un lápiz ✏️ que abre la hoja para editar o borrar; arriba, filtros por texto/monto y por persona.
  - *En escritorio:* una **tabla completa** con KPIs (movimientos, total ARS, total USD, promedio), filtros (buscar, persona, categoría, moneda, agrupar por categoría/persona) y totales al pie.
- **Gráficos**: con un toggle **🤝 Compartidos / 👤 Mis gastos / Todos**:
  - Total del mes en ARS y **total por persona** (ARS y USD).
  - **Ajuste de cuentas** (solo en "compartidos"): total compartido, % de división, y el **saldo** de quién le debe a quién. Los meses pasados se pueden **cerrar** (🤝): el saldo queda congelado con la división de ese momento y no se reabre.
  - Gráfico de **torta** por categoría (`conic-gradient` CSS) y **ranking de barras**.

### 👨‍👩‍👧 Nosotros (`/nosotros`)
Pantalla estática con las fotos de la familia.

### ⚙️ Configuración (`/config`)
- **Categorías** (`/config/categorias`): crear, editar y quitar categorías (con emoji, color automático y una "pista para la IA"). Al quitar una que tiene gastos, se **archiva** (sus gastos se conservan); si no tiene, se borra. "Otros" es la categoría de respaldo y no se puede borrar.
- **División** (`/config/division`): el **porcentaje** de los gastos compartidos por integrante (deben sumar 100). Se usa al cerrar un mes.

### Carga / edición / borrado de un gasto
Todo pasa por la **hoja inferior** (bottom sheet): descripción, monto + **moneda (ARS/USD)**, **compartido/personal**, **persona** ("a nombre de quién"), **categoría** (con opción "Automático" que deja decidir a la IA) y **fecha** (Hoy / Ayer / Otro día).

- **Crear** → `POST /api/gastos`
- **Editar** → `PATCH /api/gastos/:id` (UPDATE **en sitio**, conserva el `id` → un doble-guardado nunca duplica)
- **Borrar** → `DELETE /api/gastos/:id` (borrado lógico: `eliminado=true`, pide confirmación)

Cada gasto guarda el monto en **ambas monedas** (`monto_ars` y `monto_usd`), convertido al dólar bolsa del momento. Un gasto **personal** (`compartido=false`) no entra en el ajuste de cuentas.

### Acceso
Login con **"Entrar con Google"**. La app valida el email contra una lista blanca en [`lib/acceso.js`](lib/acceso.js) (o la variable `ALLOWED_EMAILS`). Si el email no está permitido, no entra (aviso `🔒 Esa cuenta no tiene acceso`).

---

## Diseño / UX

- **Mobile-first**, look "chibi": fuentes Fredoka + Nunito, paleta coral, mascota CSS "Chubi", sonidos (WebAudio, sin archivos) al guardar.
- **Navegación** de 4 destinos — **Cargar** (`/inicio`), **Resumen** (`/resumen`), **Nosotros** (`/nosotros`), **Configuración** (`/config`) — vía **tab bar inferior** en móvil ([`components/TabBar.jsx`](components/TabBar.jsx)) y **sidebar lateral** en escritorio ([`components/Sidebar.jsx`](components/Sidebar.jsx)). La capa de escritorio es responsive (mismo código, `@media ≥900px`).
- **Bottom sheet** reutilizada para crear y editar; la fila de gasto es un único componente ([`components/GastoRow.jsx`](components/GastoRow.jsx)) compartido entre Inicio (solo lectura) y Resumen (editable).
- **Libro compartido**: no hay "mis gastos" vs "los tuyos" — todos ven y editan todos los gastos. Cada gasto registra quién lo **cargó** (`cargado_por`) y **a nombre de quién** fue (`a_nombre_de`, guardado como email, mostrado como label "Dani Hombre"/"Dani Mujer").
- **PWA instalable** en el celu (sobre todo Android). El service worker cachea **solo** imágenes/íconos; las páginas y los datos van siempre a la red para no servir nada viejo ni mezclar datos.

---

## Cómo correrlo localmente

### Requisitos
- **Node.js 20+** (en Vercel corre Node 24).
- Credenciales de Google OAuth, un proyecto de Supabase y, opcionalmente, una API key de Groq y/o Gemini.

### Pasos
```bash
npm install
cp .env.example .env     # completá las variables (ver abajo)
npm run dev              # → http://localhost:3000
```

> El redirect URI de Google se arma con el host real del request, así que `next dev` en `localhost:3000` funciona sin configuración extra.

### Variables de entorno
Ver [`.env.example`](.env.example). Se leen **todas** en un único lugar: [`lib/env.js`](lib/env.js) (expone `config`).

| Variable | Para qué | ¿Obligatoria? |
|----------|----------|----------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Login con Google | Sí (sin esto, el login queda deshabilitado) |
| `SESSION_SECRET` | Firmar la cookie de sesión | Sí en producción (en local hay un default inseguro) |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Base de datos (solo servidor) | Sí (sin esto, la DB queda deshabilitada pero la app no crashea) |
| `GROQ_API_KEY` | Interpretar la voz con IA (proveedor preferido) | No (sin esto, se usa Gemini) |
| `GEMINI_API_KEY` | Interpretar la voz con IA (respaldo de Groq) | No (sin esto, la voz cae a modo manual) |
| `IA_MODELOS` | Orden de modelos a probar (`proveedor:modelo` por coma) | No (default: Groq + 3 de Gemini) |
| `ALLOWED_EMAILS` | Lista blanca de emails (coma) | No (default: la familia, en `acceso.js`) |

> La app está hecha para **degradar con gracia**: si falta Supabase o la IA, no rompe — muestra avisos y deshabilita esa parte.

#### Google OAuth (resumen)
En [Google Cloud Console](https://console.cloud.google.com/) → OAuth client ID tipo *Web application*. Agregá como **Authorized redirect URIs**:
- `http://localhost:3000/auth/google/callback` (local)
- `https://TU-DOMINIO.vercel.app/auth/google/callback` (producción)

Si la consent screen está en *Testing*, cada email permitido debe estar además como **test user**.

#### Las tablas de Supabase
La app usa 4 tablas (esquema documentado en la memoria de Claude, [`memory/supabase.md`](memory/supabase.md)):
- **`gastos`** — `id`, `user_id`, `cargado_por`, `a_nombre_de`, `descripcion`, `monto`, `moneda` (ARS/USD), `monto_ars`, `monto_usd`, `categoria` (UUID de `categorias`), `fecha`, `created_at`, `eliminado`, `compartido`.
- **`categorias`** — `id` (uuid), `nombre`, `emoji`, `color_bg`, `color_ink`, `hint`, `orden`, `es_otros`, `eliminado`.
- **`division`** — `persona` (email), `porcentaje`.
- **`cierres`** — `mes` (`YYYY-MM`), `division` (jsonb), `cerrado_por`.

---

## Deployment

Conectado a GitHub: cada `git push` a `main` **despliega solo** en Vercel.

- **URL de producción:** https://gastos-danis.vercel.app
- Las variables de entorno se cargan en **Vercel → Settings → Environment Variables** (o con `vercel env add`).
- [`vercel.json`](vercel.json) solo fuerza `"framework": "nextjs"` (**no borrar**): el proyecto se creó desde un repo vacío y Vercel lo dejaba en "Other", lo que hacía 404 todas las rutas.

---

## Estructura del proyecto

```
app/
  layout.jsx               # layout raíz: <html>, metadata/PWA, fuentes, Providers
  page.jsx                 # landing / login (redirige a /inicio si ya hay sesión)
  providers.jsx            # TanStack Query + Toasts
  legacy.css               # todo el CSS del diseño "chibi"
  (app)/                   # grupo de rutas privadas (layout valida sesión)
    inicio/                # Cargar: page.jsx (server) + InicioClient.jsx
    resumen/               # Resumen: page.jsx (server) + ResumenClient.jsx
    nosotros/page.jsx      # estática
    config/                # índice + categorias/ + division/
  api/                     # endpoints (App Router route handlers)
    gastos/  categorias/  division/  cierres/  voz/  me/
  auth/google/  auth/logout/   # OAuth de Google
components/                 # AppShell, Sidebar, TabBar, Sheet, Mic, Chubi,
                            # GastoRow, CatColors, Prefetch, RegisterSW, Toasts
lib/                        # lógica de servidor + helpers
  env.js                   # ÚNICO lugar que lee process.env; expone `config`
  db.js                    # Supabase: CRUD de gastos/categorias/division/cierres
  session.js  google-oauth.js  acceso.js   # auth (cookie firmada + lista blanca)
  ia.js                    # interpretación de voz (Groq/Gemini, prompt + schema)
  categorias.js  division.js  cotizacion.js # catálogos con cache en memoria
  calculos.js              # cálculos puros (totales, torta, saldo) — client-safe
  personas.js  fecha.js    # personas (email↔label) y fechas en horario AR
  api.js                   # cliente de la API + hooks de React Query (cliente)
middleware.js              # barrera de auth liviana (presencia de cookie)
public/                    # sw.js, manifest, íconos, fotos de la familia
vercel.json                # fuerza framework=nextjs
.env.example               # plantilla de variables de entorno
```

> La carpeta `apps-script/` es de un experimento aparte (Google Apps Script) y no forma parte de la app.

---

## Notas de arquitectura

- **Página server + componente cliente**: las pantallas con datos tienen una `page.jsx` que valida la sesión en el servidor y delega el render a un `*Client.jsx` que consume la API con React Query. Detalle en [`memory/app-arquitectura.md`](memory/app-arquitectura.md).
- **Un endpoint central**: `GET /api/gastos` devuelve gastos + categorías + división + cierres + cotización en una sola llamada; el cliente hace todos los cálculos con `lib/calculos.js`.
- **Auth en dos capas**: `middleware.js` solo chequea que exista la cookie (barrera liviana); la validación real está en el layout privado y en cada handler de API (`requireUserApi`).
- **Sesión sin estado**: el perfil del usuario se guarda firmado en la cookie (`iron-session`), ideal para serverless — no hay tabla de usuarios.
- **Borrado lógico + edición en sitio**: nada se borra físico (`eliminado=true`). Editar es un UPDATE sobre la misma fila (conserva el `id`), así un doble-guardado nunca duplica.
- **Fechas en horario de Argentina** centralizadas en `lib/fecha.js` para que la IA y la lista coincidan en qué es "hoy".
