import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { dbMp } from '../../../../../lib/mp/db.js'
import { ownerDe } from '../../../../../lib/mp/cuentas.js'
import { enviarAviso, pushListo } from '../../../../../lib/mp/push.js'
import { reportarError } from '../../../../../lib/alertas/index.js'

// POST — manda un aviso de prueba a los dispositivos del usuario.
export async function POST() {
  try {
    const owner = ownerDe(await requireUserApi())
    if (!pushListo) return NextResponse.json({ error: 'Avisos no configurados' }, { status: 503 })
    const subs = await dbMp.suscripciones(owner)
    if (!subs.length) return NextResponse.json({ error: 'No hay dispositivos con avisos activos' }, { status: 400 })
    const r = await enviarAviso(subs, {
      title: 'Avisos de Mercado Pago activados ✓',
      body: 'Te vamos a avisar cuando pagues algo con Mercado Pago.',
      url: '/config/mp',
      tag: 'mp-prueba',
    })
    for (const ep of r.muertas) await dbMp.borrarSuscripcionPorEndpoint(ep)
    if (!r.ok) return NextResponse.json({ error: 'El aviso no llegó a ningún dispositivo; desactivá y volvé a activar los avisos' }, { status: 502 })
    return NextResponse.json({ ok: true, enviados: r.ok })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) reportarError('api/mp/push/probar', err)
    return NextResponse.json({ error: err.message }, { status })
  }
}
