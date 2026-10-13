import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getUser } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { ownerDe } from '../../../../lib/mp/cuentas.js'
import { ejecutarSync } from '../../../../lib/mp/ejecutar.js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// El cron (pg_cron en Supabase) manda "Authorization: Bearer <CRON_SECRET>".
function esCron(request) {
  const secreto = config.mp.cronSecret
  if (!secreto) return false
  const recibido = Buffer.from(request.headers.get('authorization') || '')
  const esperado = Buffer.from(`Bearer ${secreto}`)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

// POST /api/mp/sync — cron: todas las cuentas. Sesión: solo la propia, con pausa
// de 5 min (lo llama /inicio al abrir). Nunca devuelve 500: los errores quedan en
// mp_sync.last_error.
export async function POST(request) {
  if (!config.mp.enabled) return NextResponse.json({ ok: false, error: 'mp-deshabilitado' })
  try {
    if (esCron(request)) return NextResponse.json({ ok: true, resultados: await ejecutarSync({ avisar: true }) })
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const resultados = await ejecutarSync({ owner: ownerDe(user), respetarPausa: true })
    return NextResponse.json({ ok: true, resultados })
  } catch (err) {
    console.error('[api/mp/sync]', err.message)
    return NextResponse.json({ ok: false, error: 'sync-fallo' })
  }
}
