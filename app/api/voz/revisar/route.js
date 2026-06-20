import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { iaEnabled, revisarGasto } from '../../../../lib/ia.js'

// POST /api/voz/revisar { descripcion, categoria } -> { ok, descripcion, categoria }
export async function POST(request) {
  try {
    await requireUserApi()
    const body = await request.json()
    const descripcion = (body?.descripcion ?? '').toString().trim()
    const categoria = (body?.categoria ?? '').toString().trim()
    if (!descripcion) return NextResponse.json({ error: 'Descripción vacía' }, { status: 400 })
    if (!iaEnabled) return NextResponse.json({ error: 'IA no configurada' }, { status: 503 })
    const r = await revisarGasto(descripcion, categoria)
    return NextResponse.json({ ok: true, descripcion: r.descripcion, categoria: r.categoria })
  } catch (err) {
    // 401 (sin sesión) pasa tal cual y no se loguea; el resto -> 502 (la revisión
    // es opcional, el front sigue con la descripción/categoría que ya tenía).
    const status = err.status || 500
    if (status === 401) return NextResponse.json({ error: err.message }, { status })
    console.error('[api/voz revisar]', err.message)
    return NextResponse.json({ error: 'No pude revisar el gasto.' }, { status: 502 })
  }
}
