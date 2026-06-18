import express from 'express'
import path from 'path'
import cookieSession from 'cookie-session'

import { config } from './config/env.js'
import passport from './config/passport.js' // al importarse, configura Passport
import { authRouter } from './routes/auth.js'
import { paginasRouter } from './routes/paginas.js'
import { gastosRouter } from './routes/gastos.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { ensureCategoriasCargadas, cssVarsCategorias } from './config/categorias.js'

const app = express()

// Precargamos las categorías en cache al arrancar (best-effort: si la DB no está
// o falla, queda el SEED y la app no se cuelga).
ensureCategoriasCargadas().catch(() => {})

// Vercel corre detrás de un proxy. Necesario para detectar https/host real
// (lo usa la callbackURL relativa de Google) y para setear bien la cookie `secure`.
app.set('trust proxy', true)

// --- Motor de vistas (EJS): las vistas viven en src/views/*.ejs, separadas del
// código. Anclamos la ruta en process.cwd() (raíz del proyecto) porque es lo
// confiable dentro de la función serverless de Vercel.
app.set('view engine', 'ejs')
app.set('views', path.join(process.cwd(), 'src', 'views'))

// Parseo de bodies: JSON (API) y formularios HTML.
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// --- Sesión: cookie firmada, sin estado en el servidor (ideal para serverless) ---
app.use(
  cookieSession({
    name: 'session',
    keys: [config.sessionSecret],
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 días (3 meses)
    httpOnly: true,
    sameSite: 'lax', // permite que la cookie viaje en el redirect de vuelta desde Google
    secure: config.isProduction, // solo por HTTPS en producción
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

// Colores de las categorías inyectados en el <head> (después de style.css). Cada
// categoría define sus CSS vars por id; así una categoría nueva (UUID) tiene color
// sin tocar el CSS estático. Refrescamos la cache acá para no servir colores viejos.
app.use(async (_req, res, next) => {
  try {
    await ensureCategoriasCargadas()
    res.locals.catColorsStyle = cssVarsCategorias()
  } catch {
    res.locals.catColorsStyle = ''
  }
  next()
})

// --- Rutas (cada router define URLs; la lógica vive en controllers/) ---
app.use('/auth', authRouter) // login: /auth/google, /auth/google/callback, /auth/logout
app.use('/', paginasRouter) // públicas: / (landing) y /healthz
app.use('/', gastosRouter) // app: /inicio, /resumen, /nosotros, acciones y /api/interpretar

// --- Manejador de errores (último middleware) ---
app.use(errorHandler)

export default app
