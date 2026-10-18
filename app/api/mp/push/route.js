import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { dbMp } from '../../../../lib/mp/db.js'
import { ownerDe } from '../../../../lib/mp/cuentas.js'
import { pushListo } from '../../../../lib/mp/push.js'
import { reportarError } from '../../../../lib/alertas/index.js'

export const dynamic = 'force-dynamic'

function responderError(err, donde) {
  const status = err.status || 500
  if (status !== 401) reportarError(`api/mp/push ${donde}`, err)
  return NextResponse.json({ error: err.message }, { status })
}

// GET — clave pública VAPID y cuántos dispositivos tiene avisos activos el usuario.
export async function GET() {
  try {
    const owner = ownerDe(await requireUserApi())
    return NextResponse.json({
      habilitado: pushListo,
      publicKey: config.push.publicKey ?? null,
      dispositivos: pushListo ? await dbMp.contarSuscripciones(owner) : 0,
    })
  } catch (err) {
    return responderError(err, 'GET')
  }
}

// POST { subscription } — registra este dispositivo. Los pendientes que ya existían
// se marcan como avisados: solo se avisan los que aparezcan desde ahora.
export async function POST(request) {
  try {
    const owner = ownerDe(await requireUserApi())
    if (!pushListo) return NextResponse.json({ error: 'Avisos no configurados' }, { status: 503 })
    const { subscription: s } = await request.json()
    if (!s?.endpoint?.startsWith('https://') || !s?.keys?.p256dh || !s?.keys?.auth) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }
    await dbMp.guardarSuscripcion({
      endpoint: s.endpoint,
      owner,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? null,
    })
    await dbMp.marcarTodosAvisados(owner)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return responderError(err, 'POST')
  }
}

// DELETE { endpoint } — desactiva los avisos en este dispositivo (solo el propio).
export async function DELETE(request) {
  try {
    const owner = ownerDe(await requireUserApi())
    const { endpoint } = await request.json().catch(() => ({}))
    if (endpoint) await dbMp.borrarSuscripcion(owner, String(endpoint))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return responderError(err, 'DELETE')
  }
}
