import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { config } from '../../../../../lib/env.js'
import { dbMp } from '../../../../../lib/mp/db.js'
import { ownerDe } from '../../../../../lib/mp/cuentas.js'
import { enviarAviso } from '../../../../../lib/mp/push.js'

// POST — manda un aviso de prueba a los dispositivos del usuario.
export async function POST() {
  try {
    const owner = ownerDe(await requireUserApi())
    if (!config.push.enabled) return NextResponse.json({ error: 'Avisos no configurados' }, { status: 503 })
    const subs = await dbMp.suscripciones(owner)
    if (!subs.length) return NextResponse.json({ error: 'No hay dispositivos con avisos activos' }, { status: 400 })
    const r = await enviarAviso(subs, {
      title: 'Avisos de Mercado Pago activados ✓',
      body: 'Te vamos a avisar cuando pagues algo con Mercado Pago.',
      url: '/config/mp',
      tag: 'mp-prueba',
    })
    for (const ep of r.muertas) await dbMp.borrarSuscripcionPorEndpoint(ep)
    return NextResponse.json({ ok: r.ok > 0, enviados: r.ok })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/push/probar]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
