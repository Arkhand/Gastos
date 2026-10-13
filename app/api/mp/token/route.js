import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { ownerDe, conectarConToken } from '../../../../lib/mp/cuentas.js'

// POST /api/mp/token { token } — conectar pegando un Access Token (plan B del OAuth).
export async function POST(request) {
  try {
    const owner = ownerDe(await requireUserApi())
    if (!config.mp.enabled) return NextResponse.json({ error: 'Mercado Pago no está configurado' }, { status: 503 })
    const { token } = await request.json()
    const c = await conectarConToken(owner, token)
    return NextResponse.json({ ok: true, mp_nickname: c.mp_nickname })
  } catch (err) {
    if (err.code) return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/token]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
