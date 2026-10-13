import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { dbMp } from '../../../../../lib/mp/db.js'
import { ownerDe } from '../../../../../lib/mp/cuentas.js'

// POST /api/mp/:id/descartar { deshacer? } — descartar un pendiente, o deshacer
// un descarte propio (vuelve a pendiente). Solo sobre movimientos del usuario.
export async function POST(request, { params }) {
  try {
    const owner = ownerDe(await requireUserApi())
    const id = decodeURIComponent((await params).id)
    const { deshacer } = await request.json().catch(() => ({}))
    const r = deshacer
      ? await dbMp.marcar(owner, id, { estado: 'pendiente', motivo: null }, 'descartado')
      : await dbMp.marcar(owner, id, { estado: 'descartado', motivo: 'usuario' })
    if (!r) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/descartar]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
