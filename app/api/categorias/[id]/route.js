import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import {
  dbEnabled,
  listarCategorias,
  actualizarCategoria,
  marcarCategoriaEliminada,
  eliminarCategoriaFisica,
  contarGastosDeCategoria,
} from '../../../../lib/db.js'
import { recargarCategorias, normalizarNombre } from '../../../../lib/categorias.js'

const NOMBRE_MAX = 24

// PATCH /api/categorias/:id { nombre, emoji, hint } — edita. No toca el id.
export async function PATCH(request, { params }) {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const { id } = await params
    const body = await request.json()
    const nombre = (body?.nombre ?? '').toString().trim().replace(/\s+/g, ' ')
    const emoji = (body?.emoji ?? '').toString().trim() || '✨'
    const hint = (body?.hint ?? '').toString().trim()
    if (!nombre) return NextResponse.json({ error: 'nombre' }, { status: 400 })
    if (nombre.length > NOMBRE_MAX) return NextResponse.json({ error: 'largo' }, { status: 400 })

    // Rechaza el nombre si choca con OTRA categoría (excluye la propia por id, así
    // editar solo el emoji/hint sin cambiar el nombre no se autodetecta como duplicado).
    const todas = await listarCategorias()
    const norm = normalizarNombre(nombre)
    const choque = todas.find((c) => c.id !== id && normalizarNombre(c.nombre) === norm)
    if (choque) return NextResponse.json({ error: 'existe' }, { status: 409 })

    await actualizarCategoria(id, { nombre, emoji, hint: hint || null })
    await recargarCategorias()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/categorias PATCH]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}

// DELETE /api/categorias/:id — "Otros" imborrable; con gastos -> archiva; sin -> borra.
export async function DELETE(request, { params }) {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const { id } = await params
    const todas = await listarCategorias()
    const cat = todas.find((c) => c.id === id)
    if (!cat) return NextResponse.json({ error: 'no-existe' }, { status: 404 })
    if (cat.es_otros) return NextResponse.json({ error: 'otros-imborrable' }, { status: 409 })

    // Si tiene gastos asociados, archiva (baja lógica) para no romper esos gastos;
    // si no tiene ninguno, borra físico (no deja basura).
    const usados = await contarGastosDeCategoria(id)
    if (usados > 0) await marcarCategoriaEliminada(id, true)
    else await eliminarCategoriaFisica(id)
    await recargarCategorias()
    return NextResponse.json({ ok: true, resultado: usados > 0 ? 'archivada' : 'eliminada' })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/categorias DELETE]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
