import { NextResponse } from 'next/server'
import { getSession } from '../../../../lib/session.js'
import { ownerDe, conectarConCodigo } from '../../../../lib/mp/cuentas.js'

// GET /api/mp/callback?code&state — MP vuelve acá después de autorizar.
export async function GET(request) {
  const url = new URL(request.url)
  const origin = url.origin
  const session = await getSession()
  if (!session.user) return NextResponse.redirect(`${origin}/`)
  const esperado = session.mpState
  delete session.mpState
  await session.save()

  const code = url.searchParams.get('code')
  if (!code || !esperado || url.searchParams.get('state') !== esperado) {
    return NextResponse.redirect(`${origin}/config/mp?error=autorizacion`)
  }
  try {
    await conectarConCodigo(ownerDe(session.user), code, `${origin}/api/mp/callback`)
    return NextResponse.redirect(`${origin}/config/mp?ok=1`)
  } catch (err) {
    console.error('[api/mp/callback]', err.message)
    return NextResponse.redirect(`${origin}/config/mp?error=${err.code === 'cuenta-ajena' ? 'cuenta-ajena' : 'canje'}`)
  }
}
