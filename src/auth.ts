import { Router, type RequestHandler } from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy, type Profile } from 'passport-google-oauth20'

// Forma del usuario que guardamos en la sesión. Augmenta el tipo de Passport
// para que `req.user` tenga estos campos en todo el proyecto.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface User {
      id: string
      displayName: string
      email?: string
      photo?: string
    }
  }
}

const clientID = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET

if (!clientID || !clientSecret) {
  console.warn(
    '[auth] Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET. ' +
      'El login con Google no funcionará hasta configurar esas variables de entorno.'
  )
}

// Sin base de datos todavía: guardamos el perfil completo en la cookie de sesión.
passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user: Express.User, done) => done(null, user))

passport.use(
  new GoogleStrategy(
    {
      clientID: clientID ?? '',
      clientSecret: clientSecret ?? '',
      // URL relativa: se resuelve contra el host real del request (localhost o
      // Vercel) gracias a `app.set('trust proxy', true)` en index.ts. Así no hay
      // que hardcodear el dominio y funciona en local y en producción.
      callbackURL: '/auth/google/callback',
    },
    (_accessToken, _refreshToken, profile: Profile, done) => {
      const user: Express.User = {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value,
        photo: profile.photos?.[0]?.value,
      }
      done(null, user)
    }
  )
)

// Middleware para proteger rutas privadas.
export const requireAuth: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    next()
    return
  }
  // Para rutas de API devolvemos 401; para páginas redirigimos al inicio.
  if (req.path.startsWith('/api')) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  res.redirect('/')
}

// Router con las rutas de autenticación (se monta bajo /auth en index.ts).
export const authRouter = Router()

// Inicia el flujo: redirige a la pantalla de Google.
authRouter.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
)

// Google vuelve acá con el código; Passport lo intercambia por el perfil.
authRouter.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=auth' }),
  (_req, res) => res.redirect('/perfil')
)

// Cierra la sesión (en Passport 0.6+ es asíncrono con callback).
authRouter.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err)
      return
    }
    res.redirect('/')
  })
})
