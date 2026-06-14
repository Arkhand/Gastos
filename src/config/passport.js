// Configuración de Passport (estrategia de Google). Este módulo se importa una
// sola vez (desde index.js) y al importarse deja Passport listo para usar.
import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { config } from './env.js'
import { emailPermitido } from './acceso.js'

// Forma del usuario que guardamos en la sesión: { id, displayName, email, photo }.
// Sin base de datos de usuarios: guardamos el perfil completo en la cookie.
passport.serializeUser((user, done) => done(null, user))
passport.deserializeUser((user, done) => done(null, user))

if (config.google.enabled) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientID,
        clientSecret: config.google.clientSecret,
        // URL relativa: se resuelve contra el host real del request (localhost o
        // Vercel) gracias a `app.set('trust proxy', true)`. Así no hay que
        // hardcodear el dominio y funciona en local y en producción.
        callbackURL: '/auth/google/callback',
      },
      (_accessToken, _refreshToken, profile, done) => {
        const user = {
          id: profile.id,
          displayName: profile.displayName,
          email: profile.emails?.[0]?.value,
          photo: profile.photos?.[0]?.value,
        }
        // La app es solo para la familia: si el email no está permitido, no entra.
        if (!emailPermitido(user.email)) {
          return done(null, false, { message: 'no-autorizado' })
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

export default passport
