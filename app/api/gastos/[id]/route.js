import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { dbEnabled, actualizarGasto, eliminarGasto } from '../../../../lib/db.js'
import { obtenerCotizacion, convertirMontos } from '../../../../lib/cotizacion.js'
import { normalizarPersona, personaPorDefecto } from '../../../../lib/personas.js'
import { normalizarCategoria, recargarCategorias } from '../../../../lib/categorias.js'

// PATCH /api/gastos/:id — edita en sitio (mismo id, sin baja+alta -> no duplica).
export async function PATCH(request, { params }) {
  try {
    const user = await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    await recargarCategorias()
    const { id } = await params

    const body = await request.json()
    const montoNum = Number(body?.monto)
    if (!body?.descripcion || !Number.isFinite(montoNum) || montoNum < 0) {
      return NextResponse.json({ error: 'Descripción y monto válidos son obligatorios' }, { status: 400 })
    }
    // Mismo armado que en POST /api/gastos: normaliza persona (cae en el logueado),
    // categoría (cae en "Otros") y `compartido` (true salvo el string 'false'), y
    // recalcula monto_ars/monto_usd con la cotización del momento.
    const rate = await obtenerCotizacion()
    const datos = {
      descripcion: String(body.descripcion),
      monto: montoNum,
      moneda: body.moneda,
      a_nombre_de: normalizarPersona(body.a_nombre_de) ?? personaPorDefecto(user.email),
      categoria: normalizarCategoria(body.categoria),
      fecha: body.fecha ? String(body.fecha) : null,
      compartido: String(body.compartido) !== 'false',
      ...convertirMontos(body.moneda, montoNum, rate),
    }
    const actualizado = await actualizarGasto(user.id, id, datos)
    if (!actualizado) return NextResponse.json({ error: 'No existe o ya no está activo' }, { status: 404 })
    return NextResponse.json({ ok: true, gasto: actualizado })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/gastos PATCH]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}

// DELETE /api/gastos/:id — baja lógica.
export async function DELETE(request, { params }) {
  try {
    const user = await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const { id } = await params
    await eliminarGasto(user.id, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/gastos DELETE]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
