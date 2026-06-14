# Gastos — Express en Vercel con login de Google

App de ejemplo en **Express** desplegada en **Vercel** como función serverless,
con autenticación **"Iniciar sesión con Google"** vía Passport.js.

## Rutas

| Ruta | Acceso | Qué hace |
|------|--------|----------|
| `/` | público | Home; muestra login o tu perfil según estés logueado |
| `/about` | público | Página estática de ejemplo |
| `/api-data` | público | JSON de ejemplo |
| `/healthz` | público | Health check |
| `/auth/google` | público | Inicia el login con Google |
| `/auth/google/callback` | público | Callback de Google (lo usa Passport) |
| `/auth/logout` | POST | Cierra la sesión |
| `/perfil` | **privado** | Muestra tu nombre, email y foto |
| `/api/me` | **privado** | Devuelve el usuario logueado en JSON |

## Estructura

```
src/
  index.ts   # App Express: middlewares, sesión, rutas
  auth.ts    # Passport (estrategia de Google), router de /auth y requireAuth
public/      # Estáticos servidos por la CDN de Vercel (style.css, logo.png)
components/  # Fragmentos HTML (about.htm)
vercel.json  # Fuerza framework "express"
```

La sesión se guarda en una **cookie firmada** (`cookie-session`), sin estado en el
servidor, porque en Vercel cada request puede correr en una instancia distinta.

## Variables de entorno

Ver [`.env.example`](.env.example). Hacen falta:

- `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` — credenciales OAuth de Google Cloud.
- `SESSION_SECRET` — secreto aleatorio para firmar la cookie de sesión.

Cargalas en **Vercel → Settings → Environment Variables** (Production, Preview y
Development) y, para desarrollo local, en un archivo `.env`.

## Configurar Google OAuth

1. [Google Cloud Console](https://console.cloud.google.com/) → creá/elegí un proyecto.
2. **APIs & Services → OAuth consent screen** → tipo *External* → completá los datos
   y agregá tu email como *test user* (si la app está en modo testing).
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** →
   tipo **Web application**.
4. **Authorized redirect URIs**, agregá:
   - `https://TU-DOMINIO.vercel.app/auth/google/callback`
   - `http://localhost:3000/auth/google/callback` (para desarrollo)
5. Copiá el **Client ID** y el **Client Secret** a las variables de entorno.

## Desarrollo local

```bash
npm install
npm run typecheck   # chequea tipos de TypeScript
vercel dev          # corre la app en http://localhost:3000
```

## Deploy

Está conectado a GitHub: cada `git push` a `main` despliega solo en Vercel.
