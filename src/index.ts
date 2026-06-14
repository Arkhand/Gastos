import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cookieSession from 'cookie-session'
import passport from 'passport'

import { authRouter, requireAuth } from './auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// Vercel corre detrás de un proxy. Necesario para detectar https/host real
// (lo usa la callbackURL relativa de Google) y para setear bien la cookie `secure`.
app.set('trust proxy', true)

// --- Sesión: cookie firmada, sin estado en el servidor (ideal para serverless) ---
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET ?? 'dev-secret-cambiame-en-produccion'],
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    httpOnly: true,
    sameSite: 'lax', // permite que la cookie viaje en el redirect de vuelta desde Google
    secure: process.env.NODE_ENV === 'production', // solo por HTTPS en producción
  })
)

// Passport 0.6+ llama a req.session.regenerate()/save(), que cookie-session no
// implementa. Este shim los agrega como no-op. Es seguro con cookie-session:
// la sesión vive firmada del lado del cliente, no hay session id que fijar.
app.use((req, _res, next) => {
  const session = req.session as unknown as {
    regenerate?: (cb: (err?: unknown) => void) => void
    save?: (cb: (err?: unknown) => void) => void
  } | null
  if (session) {
    if (typeof session.regenerate !== 'function') session.regenerate = (cb) => cb()
    if (typeof session.save !== 'function') session.save = (cb) => cb()
  }
  next()
})

app.use(passport.initialize())
app.use(passport.session())

// Rutas de autenticación: /auth/google, /auth/google/callback, /auth/logout
app.use('/auth', authRouter)

// --- Helpers de presentación ---
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ] as string
  )
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <nav>
      <a href="/">Inicio</a>
      <a href="/perfil">Perfil</a>
      <a href="/about">About</a>
      <a href="/api-data">API Data</a>
      <a href="/healthz">Health</a>
    </nav>
    ${body}
  </body>
</html>`
}

// --- Rutas públicas ---
app.get('/', (req, res) => {
  const user = req.user
  const authBox = user
    ? `<p>Hola, <strong>${escapeHtml(user.displayName)}</strong> 👋</p>
       ${user.photo ? `<img src="${escapeHtml(user.photo)}" alt="Tu avatar" width="64" style="border-radius:50%" />` : ''}
       <p><a href="/perfil">Ver mi perfil</a></p>
       <form method="post" action="/auth/logout">
         <button type="submit">Cerrar sesión</button>
       </form>`
    : `<p>No has iniciado sesión.</p>
       <p><a href="/auth/google">Iniciar sesión con Google</a></p>`

  res.type('html').send(
    page(
      'Gastos en Vercel',
      `<h1>Bienvenido a Gastos 🚀</h1>
       <p>Ejemplo de Express en Vercel con login de Google.</p>
       ${authBox}
       <img src="/logo.png" alt="Logo" width="120" />`
    )
  )
})

app.get('/about', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'components', 'about.htm'))
})

// Endpoint de API de ejemplo - JSON (público)
app.get('/api-data', (_req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
})

// Health check
app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// --- Rutas protegidas (requieren login con Google) ---
app.get('/perfil', requireAuth, (req, res) => {
  const user = req.user!
  res.type('html').send(
    page(
      'Mi perfil',
      `<h1>Mi perfil</h1>
       ${user.photo ? `<img src="${escapeHtml(user.photo)}" alt="Tu avatar" width="96" style="border-radius:50%" />` : ''}
       <ul>
         <li><strong>Nombre:</strong> ${escapeHtml(user.displayName)}</li>
         <li><strong>Email:</strong> ${escapeHtml(user.email ?? '—')}</li>
         <li><strong>ID de Google:</strong> ${escapeHtml(user.id)}</li>
       </ul>
       <form method="post" action="/auth/logout">
         <button type="submit">Cerrar sesión</button>
       </form>`
    )
  )
})

// API protegida: devuelve el usuario logueado en JSON.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

export default app
