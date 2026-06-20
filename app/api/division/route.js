import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../lib/session.js'
import { dbEnabled, guardarDivision } from '../../../lib/db.js'
import { ensureDivisionCargada, getDivision, recargarDivision } from '../../../lib/division.js'
import { PERSONAS, PERSONA_IDS } from '../../../lib/personas.js'

// GET /api/division — % por integrante (con label/emoji para la UI).
export async function GET() {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    await ensureDivisionCargada()
    const map = getDivision()
    const division = PERSONAS.map((p) => ({
      persona: p.id,
      label: p.label,
      emoji: p.emoji,
      porcentaje: Number(map[p.id]) || 0,
    }))
    return NextResponse.json({ division })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/division GET]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}

// PUT /api/division { "pct_<email>": n, ... } — guarda. Exige sumar 100.
export async function PUT(request) {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const body = await request.json()
    const valores = []
    for (const id of PERSONA_IDS) {
      const n = Number(body?.['pct_' + id])
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        return NextResponse.json({ error: 'division-suma' }, { status: 400 })
      }
      valores.push([id, Math.round(n * 100) / 100])
    }
    const suma = valores.reduce((s, [, n]) => s + n, 0)
    if (Math.abs(suma - 100) > 0.01) {
      return NextResponse.json({ error: 'division-suma' }, { status: 400 })
    }
    for (const [id, n] of valores) await guardarDivision(id, n)
    await recargarDivision()
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/division PUT]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
