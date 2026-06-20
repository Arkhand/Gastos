import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../lib/session.js'
import { dbEnabled, listarCategorias, crearCategoria } from '../../../lib/db.js'
import { recargarCategorias, normalizarNombre, colorPara } from '../../../lib/categorias.js'

const NOMBRE_MAX = 24

function paraVista(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    label: row.nombre,
    emoji: row.emoji || '✨',
    color_bg: row.color_bg || '#e3e0ea',
    color_ink: row.color_ink || '#5a5570',
    hint: row.hint || '',
    es_otros: !!row.es_otros,
    eliminado: !!row.eliminado,
  }
}

// GET /api/categorias — activas + archivadas.
export async function GET() {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const todas = (await listarCategorias()).map(paraVista)
    return NextResponse.json({
      activas: todas.filter((c) => !c.eliminado),
      borradas: todas.filter((c) => c.eliminado),
    })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/categorias GET]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}

// POST /api/categorias { nombre, emoji, hint } — alta. Rechaza duplicados.
export async function POST(request) {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const body = await request.json()
    const nombre = (body?.nombre ?? '').toString().trim().replace(/\s+/g, ' ')
    const emoji = (body?.emoji ?? '').toString().trim() || '✨'
    const hint = (body?.hint ?? '').toString().trim()
    if (!nombre) return NextResponse.json({ error: 'nombre' }, { status: 400 })
    if (nombre.length > NOMBRE_MAX) return NextResponse.json({ error: 'largo' }, { status: 400 })

    const todas = await listarCategorias()
    const norm = normalizarNombre(nombre)
    const choque = todas.find((c) => normalizarNombre(c.nombre) === norm)
    if (choque) {
      return NextResponse.json(
        { error: choque.eliminado ? 'existe-borrada' : 'existe' },
        { status: 409 }
      )
    }
    const [bg, ink] = colorPara(nombre)
    const ordenes = todas.filter((c) => !c.es_otros).map((c) => c.orden ?? 0)
    const orden = (ordenes.length ? Math.max(...ordenes) : 0) + 10
    await crearCategoria({ nombre, emoji, color_bg: bg, color_ink: ink, hint: hint || null, orden })
    await recargarCategorias()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/categorias POST]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
