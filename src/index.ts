import express, { type RequestHandler } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cookieSession from 'cookie-session'
import passport from 'passport'

import { authRouter, requireAuth } from './auth.js'
import { dbEnabled, listarGastos, crearGasto, eliminarGasto } from './db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// Vercel corre detrás de un proxy. Necesario para detectar https/host real
// (lo usa la callbackURL relativa de Google) y para setear bien la cookie `secure`.
app.set('trust proxy', true)

// Parseo de bodies: JSON (API) y formularios HTML.
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

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

// --- Helpers ---
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

// Envuelve handlers async para que sus errores lleguen al manejador de errores.
const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next)

// --- Rutas públicas ---
app.get('/', (req, res) => {
  const user = req.user
  const authBox = user
    ? `<p>Hola, <strong>${escapeHtml(user.displayName)}</strong> 👋</p>
       ${user.photo ? `<img src="${escapeHtml(user.photo)}" alt="Tu avatar" width="64" style="border-radius:50%" />` : ''}
       <p><a href="/perfil">Ver mi perfil y gastos</a></p>
       <form method="post" action="/auth/logout">
         <button type="submit">Cerrar sesión</button>
       </form>`
    : `<p>No has iniciado sesión.</p>
       <p><a href="/auth/google">Iniciar sesión con Google</a></p>`

  res.type('html').send(
    page(
      'Gastos en Vercel',
      `<h1>Bienvenido a Gastos 🚀</h1>
       <p>Express en Vercel, con login de Google y base de datos Supabase.</p>
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

// --- Perfil + gastos (página privada) ---
app.get(
  '/perfil',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = req.user!

    let gastosHtml: string
    if (!dbEnabled) {
      gastosHtml = '<h2>Mis gastos</h2><p><em>Base de datos no configurada todavía.</em></p>'
    } else {
      const gastos = await listarGastos(user.id)
      const filas = gastos
        .map(
          (g) => `<tr>
        <td>${escapeHtml(g.fecha ?? '')}</td>
        <td>${escapeHtml(g.descripcion)}</td>
        <td>${escapeHtml(g.categoria ?? '')}</td>
        <td style="text-align:right">$${Number(g.monto).toFixed(2)}</td>
        <td><form method="post" action="/gastos/${g.id}/eliminar" onsubmit="return confirm('¿Borrar este gasto?')"><button type="submit">🗑</button></form></td>
      </tr>`
        )
        .join('')
      const total = gastos.reduce((sum, g) => sum + Number(g.monto), 0)
      gastosHtml = `
        <h2>Mis gastos</h2>
        <form method="post" action="/gastos">
          <input name="descripcion" placeholder="Descripción" required />
          <input name="monto" type="number" step="0.01" min="0" placeholder="Monto" required />
          <input name="categoria" placeholder="Categoría" />
          <input name="fecha" type="date" />
          <button type="submit">Agregar gasto</button>
        </form>
        <table border="1" cellpadding="6" style="border-collapse:collapse;margin-top:1rem">
          <thead>
            <tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Monto</th><th></th></tr>
          </thead>
          <tbody>${filas || '<tr><td colspan="5">Sin gastos todavía</td></tr>'}</tbody>
        </table>
        <p><strong>Total: $${total.toFixed(2)}</strong></p>`
    }

    res.type('html').send(
      page(
        'Mi perfil',
        `<h1>Mi perfil</h1>
         ${user.photo ? `<img src="${escapeHtml(user.photo)}" alt="Tu avatar" width="96" style="border-radius:50%" />` : ''}
         <ul>
           <li><strong>Nombre:</strong> ${escapeHtml(user.displayName)}</li>
           <li><strong>Email:</strong> ${escapeHtml(user.email ?? '—')}</li>
         </ul>
         ${gastosHtml}
         <form method="post" action="/auth/logout" style="margin-top:1.5rem">
           <button type="submit">Cerrar sesión</button>
         </form>`
      )
    )
  })
)

// --- Acciones de gastos vía formulario (redirigen a /perfil) ---
app.post(
  '/gastos',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const { descripcion, monto, categoria, fecha } = req.body ?? {}
    const montoNum = Number(monto)
    if (!descripcion || !Number.isFinite(montoNum)) {
      res.status(400).send('Faltan datos: descripción y monto son obligatorios.')
      return
    }
    await crearGasto(req.user!.id, {
      descripcion: String(descripcion),
      monto: montoNum,
      categoria: categoria ? String(categoria) : null,
      fecha: fecha ? String(fecha) : null,
    })
    res.redirect('/perfil')
  })
)

app.post(
  '/gastos/:id/eliminar',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    await eliminarGasto(req.user!.id, req.params.id)
    res.redirect('/perfil')
  })
)

// --- API JSON de gastos (privada) ---
app.get(
  '/api/gastos',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada' })
      return
    }
    res.json({ gastos: await listarGastos(req.user!.id) })
  })
)

app.post(
  '/api/gastos',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada' })
      return
    }
    const { descripcion, monto, categoria, fecha } = req.body ?? {}
    const montoNum = Number(monto)
    if (!descripcion || !Number.isFinite(montoNum)) {
      res.status(400).json({ error: 'descripcion y monto son obligatorios' })
      return
    }
    const gasto = await crearGasto(req.user!.id, {
      descripcion: String(descripcion),
      monto: montoNum,
      categoria: categoria ?? null,
      fecha: fecha ?? null,
    })
    res.status(201).json({ gasto })
  })
)

app.delete(
  '/api/gastos/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada' })
      return
    }
    await eliminarGasto(req.user!.id, req.params.id)
    res.status(204).end()
  })
)

// Endpoint privado de ejemplo: devuelve el usuario logueado.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// --- Manejador de errores (último middleware) ---
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[error]', err)
    if (res.headersSent) return
    if (req.path.startsWith('/api')) {
      res.status(500).json({ error: 'Error interno' })
    } else {
      res.status(500).send('Error interno')
    }
  }
)

export default app
