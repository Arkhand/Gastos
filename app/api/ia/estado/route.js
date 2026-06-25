import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { iaEnabled, estadoModelos } from '../../../../lib/ia.js'

// GET /api/ia/estado -> { ok, enabled, modelos: [{ orden, provider, model, ok, error, cuota }] }
// Pingea cada modelo configurado (en orden de consumo) para reportar si la key
// funciona y, donde se puede (Groq), cuánta cuota queda. Siempre dinámico.
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await requireUserApi()
    if (!iaEnabled) {
      return NextResponse.json({ ok: true, enabled: false, modelos: [] })
    }
    const modelos = await estadoModelos()
    return NextResponse.json({ ok: true, enabled: true, modelos })
  } catch (err) {
    const status = err.status || 500
    if (status === 401) return NextResponse.json({ error: err.message }, { status })
    console.error('[api/ia/estado]', err.message)
    return NextResponse.json({ error: 'No pude consultar el estado de la IA.' }, { status: 502 })
  }
}
