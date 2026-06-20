import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { dbEnabled, corregirGasto } from '../../../../../lib/db.js'
import { normalizarCategoria, recargarCategorias } from '../../../../../lib/categorias.js'

// POST /api/gastos/:id/corregir { descripcion, categoria } — aplica la corrección
// de la IA (solo desc + categoría) sobre un gasto recién creado. También deshace.
export async function POST(request, { params }) {
  try {
    const user = await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    await recargarCategorias()
    const { id } = await params
    const body = await request.json()
    const descripcion = (body?.descripcion ?? '').toString().trim()
    if (!descripcion) return NextResponse.json({ error: 'Descripción vacía' }, { status: 400 })
    const categoria = normalizarCategoria((body?.categoria ?? '').toString())
    await corregirGasto(user.id, id, { descripcion, categoria })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/gastos corregir]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
