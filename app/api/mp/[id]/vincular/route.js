import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { obtenerGasto } from '../../../../../lib/db.js'
import { dbMp } from '../../../../../lib/mp/db.js'
import { ownerDe } from '../../../../../lib/mp/cuentas.js'

// POST /api/mp/:id/vincular { gasto_id } — "Es este": el movimiento ya estaba
// cargado como ese gasto. Se marca agregado y se guarda el vínculo.
export async function POST(request, { params }) {
  try {
    const owner = ownerDe(await requireUserApi())
    const id = decodeURIComponent((await params).id)
    const { gasto_id } = await request.json()
    const gasto = gasto_id ? await obtenerGasto(null, gasto_id) : null
    if (!gasto || gasto.eliminado) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
    if ((await dbMp.idsGastoVinculados()).has(gasto_id)) {
      return NextResponse.json({ error: 'Ese gasto ya está vinculado a otro movimiento' }, { status: 409 })
    }
    const r = await dbMp.marcar(owner, id, { estado: 'agregado', motivo: 'vinculado', gasto_id })
    if (!r) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/vincular]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
