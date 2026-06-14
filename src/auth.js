import { Router } from 'express'
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'

// Forma del usuario que guardamos en la sesión: { id, displayName, email, photo }.

const clientID = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET

// Si faltan las credenciales el login queda deshabilitado, pero la app NO crashea:
// las rutas públicas siguen funcionando y /auth/google devuelve un 503 claro.
export const googleEnabled = Boolean(clientID && clientSecret)

// Sin base de datos de usuarios: guardamos el perfil completo en la cookie de sesión.
passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

if (clientID && clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID,
        clientSecret,
        // URL relativa: se resuelve contra el host real del request (localhost o
        // Vercel) gracias a `app.set('trust proxy', true)` en index.js. Así no hay
        // que hardcodear el dominio y funciona en local y en producción.
        callbackURL: '/auth/google/callback',
      },
      (_accessToken, _refreshToken, profile, done) => {
        const user = {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value,
          photo: profile.photos?.[0]?.value,
        }
        done(null, user)
      }
    )
  )
} else {
  console.warn(
    '[auth] Faltan GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET. ' +
      'El login con Google está deshabilitado hasta configurar esas variables de entorno.'
  )
}

// Middleware para proteger rutas privadas.
export const requireAuth = (req, res, next) => {
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

// Router con las rutas de autenticación (se monta bajo /auth en index.js).
export const authRouter = Router()

// Inicia el flujo: redirige a la pantalla de Google.
authRouter.get('/google', (req, res, next) => {
  if (!googleEnabled) {
    res
      .status(503)
      .send('Login con Google no configurado: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.')
    return
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next)
})

// Google vuelve acá con el código; Passport lo intercambia por el perfil.
authRouter.get(
  '/google/callback',
  (req, res, next) => {
    if (!googleEnabled) {
      res.redirect('/')
      return
    }
    passport.authenticate('google', { failureRedirect: '/?error=auth' })(req, res, next)
  },
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
