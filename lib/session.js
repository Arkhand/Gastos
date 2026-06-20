import 'server-only'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { config } from './env.js'

// Sesión por cookie firmada (reemplaza cookie-session de la app Express). Guarda el
// perfil de Google { id, email, displayName, photo }, igual que antes. iron-session
// la cifra/firma con SESSION_SECRET. La cookie viaja sola porque Next sirve front y
// API en el mismo origen (no hace falta JWT ni CORS).
export const sessionOptions = {
  password: config.sessionSecret,
  cookieName: 'gastos_session',
  cookieOptions: {
    httpOnly: true,
    secure: config.isProduction, // solo HTTPS en prod
    sameSite: 'lax', // permite el redirect de vuelta desde Google
    maxAge: 90 * 24 * 60 * 60, // 90 días
    path: '/',
  },
}

// Lee/crea la sesión del request actual (App Router). Devuelve el objeto session;
// session.user existe si hay login. Llamar session.save() tras mutarlo.
export async function getSession() {
  const cookieStore = await cookies()
  return getIronSession(cookieStore, sessionOptions)
}

// Atajo: el usuario logueado (o null).
export async function getUser() {
  const session = await getSession()
  return session.user ?? null
}

// Para API routes: devuelve el user o lanza un objeto con status para responder
// 401. Uso: const user = await requireUserApi() dentro de un try/catch que mapee
// err.status. Evita repetir el chequeo en cada handler.
export async function requireUserApi() {
  const user = await getUser()
  if (!user) {
    const e = new Error('No autenticado')
    e.status = 401
    throw e
  }
  return user
}
