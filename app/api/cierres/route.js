import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../lib/session.js'
import { dbEnabled, obtenerCierre, crearCierre } from '../../../lib/db.js'
import { ensureDivisionCargada, getDivision } from '../../../lib/division.js'
import { hoyAR } from '../../../lib/fecha.js'

// POST /api/cierres { mes } — cierra un mes pasado (congela el % global vigente).
// Definitivo: rechaza mes ya cerrado, formato inválido, o mes no pasado.
export async function POST(request) {
  try {
    const user = await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    const body = await request.json()
    const mes = String(body?.mes || '')
    const mesActual = hoyAR().slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(mes) || mes >= mesActual) {
      return NextResponse.json({ error: 'mes-invalido' }, { status: 400 })
    }
    const yaCerrado = await obtenerCierre(mes)
    if (yaCerrado) return NextResponse.json({ error: 'ya-cerrado' }, { status: 409 })
    await ensureDivisionCargada()
    const foto = getDivision()
    const cierre = await crearCierre(mes, foto, user.displayName)
    return NextResponse.json({ ok: true, cierre })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/cierres POST]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
