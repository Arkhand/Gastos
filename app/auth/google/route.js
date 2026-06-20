import { NextResponse } from 'next/server'
import { authUrl } from '../../../lib/google-oauth.js'
import { config } from '../../../lib/env.js'

// GET /auth/google — inicia el login: redirige a la pantalla de Google.
export async function GET(request) {
  if (!config.google.enabled) {
    return new NextResponse(
      'Login con Google no configurado: faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.',
      { status: 503 }
    )
  }
  const origin = new URL(request.url).origin
  return NextResponse.redirect(authUrl(origin))
}
