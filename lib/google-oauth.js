import 'server-only'
import { OAuth2Client } from 'google-auth-library'
import { config } from './env.js'

// Cliente OAuth2 de Google. El redirectUri se arma con el host real del request
// (igual que el callbackURL relativo de Passport, que se resolvía por trust proxy),
// así funciona en localhost y en Vercel sin hardcodear el dominio.
function client(origin) {
  return new OAuth2Client({
    clientId: config.google.clientID,
    clientSecret: config.google.clientSecret,
    redirectUri: `${origin}/auth/google/callback`,
  })
}

// URL a la que redirigir para iniciar el login (consent screen de Google).
export function authUrl(origin) {
  return client(origin).generateAuthUrl({
    access_type: 'online',
    scope: ['profile', 'email'],
    prompt: 'select_account',
  })
}

// Intercambia el `code` del callback por el perfil del usuario.
// Devuelve { id, email, displayName, photo } o lanza si algo falla.
export async function perfilDesdeCode(origin, code) {
  const c = client(origin)
  const { tokens } = await c.getToken(code)
  const ticket = await c.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientID,
  })
  const p = ticket.getPayload()
  return {
    id: p.sub,
    email: p.email,
    displayName: p.name || p.email,
    photo: p.picture || null,
  }
}
