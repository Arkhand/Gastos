import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { dbEnabled, listarCategorias, marcarCategoriaEliminada } from '../../../../../lib/db.js'
import { recargarCategorias, normalizarNombre } from '../../../../../lib/categorias.js'

// POST /api/categorias/:id/revivir — saca la marca de borrado (revalida choque).
export async function POST(request, { params }) {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const { id } = await params
    const todas = await listarCategorias()
    const cat = todas.find((c) => c.id === id)
    if (!cat) return NextResponse.json({ error: 'no-existe' }, { status: 404 })
    const norm = normalizarNombre(cat.nombre)
    const choque = todas.find((c) => c.id !== id && !c.eliminado && normalizarNombre(c.nombre) === norm)
    if (choque) return NextResponse.json({ error: 'revivir-choca' }, { status: 409 })
    await marcarCategoriaEliminada(id, false)
    await recargarCategorias()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/categorias revivir]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
