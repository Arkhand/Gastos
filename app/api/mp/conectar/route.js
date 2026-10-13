import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getSession } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'

// GET /api/mp/conectar — arranca el OAuth: guarda un `state` aleatorio en la sesión
// y manda a la pantalla de autorización de Mercado Pago.
export async function GET(request) {
  const origin = new URL(request.url).origin
  const session = await getSession()
  if (!session.user) return NextResponse.redirect(`${origin}/`)
  if (!config.mp.oauthEnabled || !config.mp.enabled) return NextResponse.redirect(`${origin}/config/mp?error=oauth-no-disponible`)
  const state = randomBytes(24).toString('base64url')
  session.mpState = state
  await session.save()
  const q = new URLSearchParams({
    client_id: config.mp.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: `${origin}/api/mp/callback`,
  })
  return NextResponse.redirect(`https://auth.mercadopago.com/authorization?${q}`)
}
