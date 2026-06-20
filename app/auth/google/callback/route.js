import { NextResponse } from 'next/server'
import { perfilDesdeCode } from '../../../../lib/google-oauth.js'
import { emailPermitido } from '../../../../lib/acceso.js'
import { getSession } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'

// GET /auth/google/callback — Google vuelve acá con ?code=. Intercambiamos por el
// perfil, validamos lista blanca, guardamos la sesión y vamos al inicio.
export async function GET(request) {
  const url = new URL(request.url)
  const origin = url.origin
  const code = url.searchParams.get('code')

  if (!config.google.enabled || !code) {
    return NextResponse.redirect(`${origin}/?error=auth`)
  }

  try {
    const user = await perfilDesdeCode(origin, code)
    // La app es solo para la familia: si el email no está permitido, no entra.
    if (!emailPermitido(user.email)) {
      return NextResponse.redirect(`${origin}/?error=acceso`)
    }
    const session = await getSession()
    session.user = user
    await session.save()
    return NextResponse.redirect(`${origin}/inicio`)
  } catch (err) {
    console.error('[auth callback]', err.message)
    return NextResponse.redirect(`${origin}/?error=auth`)
  }
}
