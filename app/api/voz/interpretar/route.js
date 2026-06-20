import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { iaEnabled, interpretarGasto } from '../../../../lib/ia.js'

// POST /api/voz/interpretar { texto } -> { ok, gasto } | { error }
export async function POST(request) {
  try {
    await requireUserApi()
    const body = await request.json()
    const texto = (body?.texto ?? '').toString().trim()
    if (!texto) return NextResponse.json({ error: 'Texto vacío' }, { status: 400 })
    if (!iaEnabled) return NextResponse.json({ error: 'IA no configurada' }, { status: 503 })
    const gasto = await interpretarGasto(texto)
    return NextResponse.json({ ok: true, gasto })
  } catch (err) {
    // 401 (sin sesión) se devuelve tal cual y NO se loguea (es esperado). Cualquier
    // otro fallo de la IA se traduce a un 502 con mensaje amigable: el front cae a
    // modo manual (precarga la descripción con lo transcripto).
    const status = err.status || 500
    if (status === 401) return NextResponse.json({ error: err.message }, { status })
    console.error('[api/voz interpretar]', err.message)
    return NextResponse.json(
      { error: 'No pude interpretar lo que dijiste. Probá de nuevo o cargalo a mano.' },
      { status: 502 }
    )
  }
}
