---
name: vercel-deployment
description: "GastosVercel — stack actual (Next.js 15 App Router en Vercel), deploy, login Google, variables de entorno, IA de voz, PWA y gotchas. Para la arquitectura interna ver [[app-arquitectura]]."
metadata:
  node_type: memory
  type: project
  originSessionId: 1f3c51ee-821e-4247-a3b3-e215857f855e
---

**Gastos** es una app de gastos familiares hecha en **Next.js 15 (App Router) + React 19**, en **JavaScript puro** (`.jsx`/`.js`, `package.json` `type:module`, sin TypeScript). `package.json` name `gastos`, version `2.0.0`.

> IMPORTANTE — historial: el proyecto **fue** una app Express + EJS (carpeta `src/`, vistas `.ejs`, `public/app.js`). Eso ya **no existe**: se reescribió por completo a Next.js (v2.0.0). Si una memoria vieja menciona `src/index.js`, `passport`, `cookie-session`, `res.render` o `partials/*.ejs`, está obsoleta — la realidad es la de abajo.

- **Deploy**: Vercel, framework **Next.js**. Auto-deploy en cada push a `main` (repo GitHub).
- **URL de producción**: **https://gastos-danis.vercel.app**.
- **Único gotcha de `vercel.json`**: `{ "framework": "nextjs" }`. El proyecto se creó desde un repo vacío, así que el Framework Preset quedó en "Other" y todas las rutas daban 404; esto lo fuerza. NO borrar. (Ya no hay `includeFiles` ni shims de Express — eso era del stack viejo.)

**Dependencias principales** (`package.json`): `next@15`, `react@19`, `@tanstack/react-query@5` (datos/cache en el cliente), `iron-session@8` (sesión por cookie firmada), `@supabase/supabase-js@2` (DB, ver [[supabase]]), `google-auth-library@9` (OAuth), `server-only`. Scripts: `next dev` / `next build` / `next start`.

**Estructura del repo** (detalle funcional en [[app-arquitectura]]):
- `app/` — rutas App Router: páginas en `app/(app)/...` (grupo privado), API en `app/api/...`, auth en `app/auth/...`, `layout.jsx`/`page.jsx` raíz, `legacy.css` (todo el CSS del diseño chibi), `providers.jsx`.
- `components/` — componentes React (`.jsx`): `AppShell`, `Sidebar`, `TabBar`, `Sheet` (hoja de carga/edición), `Mic` (voz), `Chubi` (mascota CSS), `GastoRow`, `CatColors`, `Prefetch`, `RegisterSW`, `Toasts`.
- `lib/` — lógica de servidor y helpers: `env.js` (centraliza process.env → `config`), `db.js` (Supabase, service_role), `session.js`/`google-oauth.js`/`acceso.js` (auth), `ia.js` (interpretación con LLM), `categorias.js`/`division.js`/`cotizacion.js` (catálogos con cache en memoria), `calculos.js` (cálculos puros, client-safe), `personas.js`, `fecha.js`, `api.js` (cliente fetch + hooks React Query, `'use client'`).
- `middleware.js` — barrera de auth liviana (presencia de cookie).
- `public/` — `sw.js` (service worker PWA), `manifest.webmanifest`, íconos, fotos `mama.jpg`/`papa.jpg`/`nena.jpg`, `logo.png`.
- `design-system/` — bundle de diseño sincronizable con Claude Design (ver [[claude-design]]).
- `apps-script/` — Google Apps Script auxiliar (clasp); no es parte del deploy de Vercel.

**Login con Google (LIVE).** OAuth con `google-auth-library` (NO passport) + sesión firmada con **iron-session** (NO cookie-session), cookie `gastos_session` (httpOnly, secure en prod, sameSite lax, 90 días). El perfil `{id,email,displayName,photo}` va en la cookie; no hay tabla de usuarios.
- Flujo: `GET /auth/google` (`lib/google-oauth.js` `authUrl`, redirectUri armado con el host real del request → anda en localhost y en Vercel sin hardcodear) → consent → `GET /auth/google/callback` intercambia el code, valida lista blanca, guarda sesión y redirige a `/inicio`. `POST /auth/logout` destruye la sesión.
- **Dos capas de auth**: (1) `middleware.js` — barrera liviana: solo chequea presencia de la cookie `gastos_session`; sin cookie redirige páginas privadas a `/` y responde 401 a `/api/*` (excepto `/api/me`). NO descifra nada. (2) Validación real en el server: `app/(app)/layout.jsx` (`getUser()` → redirect si no hay), y cada handler de API usa `requireUserApi()` (`lib/session.js`).
- **Acceso restringido a la familia (lista blanca)**: `lib/acceso.js` define `musiald@gmail.com` y `danielapaulacastelli@gmail.com` (override por env `ALLOWED_EMAILS`, csv). El callback rechaza el login con `?error=acceso` si el email no está. La landing muestra el aviso con `?error=acceso`/`?error=auth`.
- El consent screen sigue en **Testing** en Google Cloud → cada email permitido ADEMÁS debe estar como *test user*. Ambos ya están agregados.
- Redirect URI registrado: `https://gastos-danis.vercel.app/auth/google/callback`.

**Voz con IA (multi-modelo, Groq + Gemini).** El navegador transcribe con la Web Speech API (`es-AR`, en `components/Mic.jsx`) y postea el texto a `POST /api/voz/interpretar`. El servidor (`lib/ia.js`) prueba varios modelos EN ORDEN hasta que uno responda (failover): el orden sale de la env **`IA_MODELOS`** (csv `proveedor:modelo`), default `groq:llama-3.3-70b-versatile` primero y varios `gemini:*` de respaldo. Devuelve `{descripcion, monto, moneda, categoria(id), persona(email), fecha}`. La **moneda la fija el texto, no el modelo** (regla dura: USD solo si se nombran dólares y no pesos). También hay `POST /api/voz/revisar` (limpia descripción + valida categoría en la carga manual). Si la IA falla, la voz cae a modo manual (precarga la descripción con lo transcripto).
- Env del servidor: **`GROQ_API_KEY`** y/o **`GEMINI_API_KEY`** (`lib/ia.js` usa solo los proveedores con key). Históricamente la key de Gemini tenía cuota 0 (HTTP 429) en free tier; por eso se sumó **Groq como modelo primario** (gratis, rápido). Las keys viven SOLO en el servidor; el navegador nunca las ve.

**Variables de entorno** (todas en `lib/env.js` → `config`; nada lee `process.env` directo fuera de ahí): `SESSION_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `IA_MODELOS` (opcional), `ALLOWED_EMAILS` (opcional). Si faltan las de Supabase, la DB queda deshabilitada pero la app no crashea (`config.supabase.enabled`).

**PWA (instalable, cache solo de imágenes).** `public/manifest.webmanifest` (display standalone, theme coral `#f2895f`, bg `#fbf3ea`) + `public/sw.js` (cache `gastos-static-v3`: SOLO imágenes/íconos/manifest; CSS, JS, páginas y API van SIEMPRE a la red → nunca ves estilo/código viejo ni datos cruzados entre usuarios). El SW se registra desde `components/RegisterSW.jsx`; el manifest/theme/íconos se linkean en `app/layout.jsx` (metadata + viewport). Objetivo principal: instalable en Android.
