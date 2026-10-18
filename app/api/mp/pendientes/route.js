import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { listarGastos } from '../../../../lib/db.js'
import { dbMp } from '../../../../lib/mp/db.js'
import { ownerDe } from '../../../../lib/mp/cuentas.js'
import { buscarDuplicado } from '../../../../lib/mp/duplicados.js'
import { reportarError } from '../../../../lib/alertas/index.js'

export const dynamic = 'force-dynamic'

// GET /api/mp/pendientes — movimientos de MP del usuario que todavía no cargó,
// cada uno con su contacto y un posible gasto ya cargado ("¿Ya lo cargaste?").
export async function GET() {
  try {
    const owner = ownerDe(await requireUserApi())
    const cuenta = await dbMp.leerCuenta(owner)
    if (!cuenta) return NextResponse.json({ conectado: false, necesitaReconectar: false, pendientes: [] })
    const [pend, gastos, vinculados] = await Promise.all([
      dbMp.listarPendientes(owner),
      listarGastos(),
      dbMp.idsGastoVinculados(),
    ])
    const pendientes = pend.map((m) => {
      const d = buscarDuplicado(m, gastos, vinculados)
      return {
        ...m,
        duplicado: d && { id: d.id, descripcion: d.descripcion, monto: d.monto, moneda: d.moneda, fecha: d.fecha },
      }
    })
    return NextResponse.json({ conectado: true, necesitaReconectar: cuenta.necesita_reconectar, pendientes })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) reportarError('api/mp/pendientes', err)
    return NextResponse.json({ error: err.message }, { status })
  }
}
