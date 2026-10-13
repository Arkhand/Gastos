import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { dbMp } from '../../../../lib/mp/db.js'
import { ownerDe, desconectar } from '../../../../lib/mp/cuentas.js'

export const dynamic = 'force-dynamic'

// GET /api/mp/cuenta — estado de la conexión del usuario. Nunca devuelve tokens.
export async function GET() {
  try {
    const owner = ownerDe(await requireUserApi())
    const [c, s] = await Promise.all([dbMp.leerCuenta(owner), dbMp.leerSync(owner)])
    return NextResponse.json({
      habilitado: config.mp.enabled,
      oauthDisponible: config.mp.oauthEnabled,
      cuenta: c && {
        mp_nickname: c.mp_nickname,
        metodo: c.metodo,
        conectado_at: c.conectado_at,
        necesita_reconectar: c.necesita_reconectar,
      },
      sync: s && {
        payments_sync_at: s.payments_sync_at,
        report_downloaded_at: s.report_downloaded_at,
        last_error: s.last_error,
        last_error_at: s.last_error_at,
      },
    })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/cuenta GET]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}

// DELETE /api/mp/cuenta — desconecta (borra tokens; movimientos y contactos quedan).
export async function DELETE() {
  try {
    await desconectar(ownerDe(await requireUserApi()))
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/cuenta DELETE]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
