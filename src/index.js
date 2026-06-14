import express from 'express'
import path from 'path'
import cookieSession from 'cookie-session'
import passport from 'passport'

import { authRouter } from './routes/auth.js'
import { paginasRouter } from './routes/paginas.js'
import { gastosRouter } from './routes/gastos.js'

const app = express()

// Vercel corre detrás de un proxy. Necesario para detectar https/host real
// (lo usa la callbackURL relativa de Google) y para setear bien la cookie `secure`.
app.set('trust proxy', true)

// --- Motor de vistas (EJS): las vistas viven en src/views/*.ejs, separadas del código.
// Anclamos la ruta en process.cwd() (raíz del proyecto) porque es lo confiable
// dentro de la función serverless de Vercel.
app.set('view engine', 'ejs')
app.set('views', path.join(process.cwd(), 'src', 'views'))

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
  const session = req.session
  if (session) {
    if (typeof session.regenerate !== 'function') session.regenerate = (cb) => cb()
    if (typeof session.save !== 'function') session.save = (cb) => cb()
  }
  next()
})

app.use(passport.initialize())
app.use(passport.session())

// --- Controladores (routers) ---
app.use('/auth', authRouter) // login: /auth/google, /auth/google/callback, /auth/logout
app.use('/', paginasRouter) // páginas: /, /about, /perfil, /api-data, /healthz
app.use('/', gastosRouter) // gastos: /gastos, /api/gastos, /api/me

// --- Manejador de errores (último middleware) ---
app.use((err, req, res, _next) => {
  console.error('[error]', err)
  if (res.headersSent) return
  if (req.path.startsWith('/api')) {
    res.status(500).json({ error: 'Error interno' })
  } else {
    res.status(500).send('Error interno')
  }
})

export default app
