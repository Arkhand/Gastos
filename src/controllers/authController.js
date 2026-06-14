// Controlador de autenticación: la lógica del login con Google.
// Las URLs que disparan estas funciones se definen en routes/auth.js.
import passport from '../config/passport.js'
import { config } from '../config/env.js'

// Inicia el flujo: redirige a la pantalla de Google.
export const iniciarGoogle = (req, res, next) => {
  if (!config.google.enabled) {
    res
      .status(503)
      .send('Login con Google no configurado: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.')
    return
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next)
}

// Google vuelve acá con el código; Passport lo intercambia por el perfil.
export const callbackGoogle = (req, res, next) => {
  if (!config.google.enabled) {
    res.redirect('/')
    return
  }
  passport.authenticate('google', { failureRedirect: '/?error=auth' })(req, res, next)
}

// Si el callback salió bien, mandamos al perfil.
export const callbackGoogleOk = (_req, res) => res.redirect('/perfil')

// Cierra la sesión (en Passport 0.6+ es asíncrono con callback).
export const logout = (req, res, next) => {
  req.logout((err) => {
    if (err) {
      next(err)
      return
    }
    res.redirect('/')
  })
}
