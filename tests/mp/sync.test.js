import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sincronizarCuenta, crearSugeridor, MP_FALLAS_PARA_AVISAR } from '../../lib/mp/sync.js'

const OWNER = 'musiald@gmail.com'
const CUENTA = { owner: OWNER, mp_user_id: 2843637 }
const T = Date.parse('2026-10-13T15:00:00Z')

// DB en memoria con la misma interfaz que dbMp (lib/mp/db.js).
function dbFalsa() {
  const sync = new Map()
  const movs = new Map()
  const contactos = new Map()
  return {
    movs, contactos, sync,
    async leerSync(o) { return sync.get(o) ?? null },
    async guardarSync(o, campos) { const r = { ...(sync.get(o) ?? { owner: o }), ...campos }; sync.set(o, r); return r },
    async movimientosPorIds(ids) { return new Map(ids.filter((i) => movs.has(i)).map((i) => [i, movs.get(i)])) },
    async upsertMovimientos(filas) { for (const f of filas) movs.set(f.id, { ...(movs.get(f.id) ?? {}), ...f }) },
    async contactosExistentes(o, ids) { return new Set(ids.filter((i) => contactos.has(`${o}|${i}`))) },
    async insertarContactos(filas) { for (const c of filas) if (!contactos.has(`${c.owner}|${c.id}`)) contactos.set(`${c.owner}|${c.id}`, c) },
    async pendientesSinSugerencia(o, n) {
      return [...movs.values()].filter((m) => m.owner === o && m.estado === 'pendiente' && !m.categoria_sugerida).slice(0, n)
        .map((m) => ({ ...m, contacto: m.contacto_id ? contactos.get(`${o}|${m.contacto_id}`) ?? null : null }))
    },
    async actualizarMovimiento(id, campos) { movs.set(id, { ...movs.get(id), ...campos }) },
  }
}

const pago = (o) => ({
  id: 1, operation_type: 'regular_payment', payment_type_id: 'account_money', status: 'approved',
  date_created: '2026-10-13T10:00:00.000-04:00', transaction_amount: 100, transaction_details: { total_paid_amount: 100 },
  currency_id: 'ARS', description: 'Producto de panaderia', collector: { id: 9 }, ...o,
})

const CSV = 'DATE,SOURCE_ID,RECORD_TYPE,DESCRIPTION,NET_DEBIT_AMOUNT,CURRENCY,PAYOUT_BANK_ACCOUNT_NUMBER\n' +
  '2026-10-12T20:13:42.000-03:00,555,release,payout,24500.00,ARS,0720000000000000002440\n'

// MP falso: responde según método + ruta; `fallar` hace tirar a payments/search.
function mpFalso({ pagos = [], lista = [], fallar = false } = {}) {
  const llamadas = []
  return {
    llamadas,
    async get(ruta) {
      llamadas.push(['GET', ruta])
      if (ruta.startsWith('/v1/payments/search')) { if (fallar) throw new Error('MP caído'); return { results: pagos } }
      if (ruta === '/v1/account/release_report/config') return { file_name_prefix: 'x' }
      if (ruta === '/v1/account/release_report/list') return lista
      if (ruta.endsWith('.csv')) return CSV
      if (ruta.startsWith('/users/')) return { nickname: 'FEDERICOFRIGOLI' }
      throw new Error(`ruta inesperada ${ruta}`)
    },
    async post(ruta) { llamadas.push(['POST', ruta]); return {} },
    async put(ruta) { llamadas.push(['PUT', ruta]); return {} },
  }
}

const sugerirFijo = async (m) => ({ descripcion: `limpia:${m.descripcion_mp ?? 'transferencia'}`, categoria: 'cat-1' })

test('primera corrida: pagos nuevos por estado, fondeos fuera, pide reporte, sugiere', async () => {
  const db = dbFalsa()
  const mp = mpFalso({ pagos: [
    pago({ id: 1 }),
    pago({ id: 2, status: 'authorized' }),
    pago({ id: 3, operation_type: 'account_fund' }),
    pago({ id: 4, operation_type: 'money_transfer', description: 'Varios', collector: { id: 172750527 } }),
  ] })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.deepEqual(r.errores, [])
  assert.equal(db.movs.get('pay:1').estado, 'pendiente')
  assert.equal(db.movs.get('pay:2').estado, 'pendiente')
  assert.ok(!db.movs.has('pay:3'))
  assert.equal(db.contactos.get(`${OWNER}|mp:172750527`).sugerido, 'FEDERICOFRIGOLI')
  assert.equal(db.movs.get('pay:1').categoria_sugerida, 'cat-1')
  assert.equal(db.movs.get('pay:1').descripcion, 'limpia:Producto de panaderia')
  assert.ok(db.sync.get(OWNER).desde)
  assert.ok(db.sync.get(OWNER).reporte_configurado)
  assert.ok(mp.llamadas.some(([m, rta]) => m === 'POST' && rta === '/v1/account/release_report'))
  assert.equal(db.sync.get(OWNER).report_requested_at, new Date(T).toISOString())
})

test('segunda corrida: baja el reporte pedido y guarda payouts', async () => {
  const db = dbFalsa()
  await db.guardarSync(OWNER, { desde: new Date(T - 86400_000).toISOString(), reporte_configurado: true, report_requested_at: new Date(T - 5 * 60_000).toISOString() })
  const mp = mpFalso({ lista: [{ file_name: 'gastos-app-1.csv', date_created: new Date(T - 4 * 60_000).toISOString() }] })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.equal(r.payouts, 1)
  assert.equal(db.movs.get('payout:555').estado, 'pendiente')
  assert.equal(db.contactos.get(`${OWNER}|cbu:0720000000000000002440`).sugerido, 'Santander')
  assert.equal(db.sync.get(OWNER).report_requested_at, null)
  assert.equal(db.sync.get(OWNER).report_downloaded_at, new Date(T).toISOString())
})

test('payouts anteriores a `desde` no se importan (primera conexión sin historial)', async () => {
  const db = dbFalsa()
  // desde = 2026-10-12 21:00 AR: el payout del CSV (12/10 20:13 AR) es anterior.
  await db.guardarSync(OWNER, { desde: '2026-10-13T00:00:00.000Z', reporte_configurado: true, report_requested_at: new Date(T - 5 * 60_000).toISOString() })
  const mp = mpFalso({ lista: [{ file_name: 'gastos-app-1.csv', date_created: new Date(T - 4 * 60_000).toISOString() }] })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.equal(r.payouts, 0)
  assert.ok(!db.movs.has('payout:555'))
  assert.equal(db.sync.get(OWNER).report_requested_at, null) // el reporte igual se da por bajado
})

test('forzarReporte: pide el reporte aunque hoy ya se haya bajado (botón "traer transferencias")', async () => {
  const conReporteDeHoy = async () => {
    const db = dbFalsa()
    await db.guardarSync(OWNER, { desde: new Date(T - 86400_000).toISOString(), reporte_configurado: true, report_downloaded_at: new Date(T - 60_000).toISOString() })
    return db
  }
  const pidio = (mp) => mp.llamadas.some(([m, rta]) => m === 'POST' && rta === '/v1/account/release_report')

  const mpNormal = mpFalso()
  await sincronizarCuenta({ cuenta: CUENTA, mp: mpNormal, db: await conReporteDeHoy(), sugerir: sugerirFijo, ahora: T })
  assert.equal(pidio(mpNormal), false) // sin forzar: ya se bajó hoy

  const mpForzado = mpFalso()
  const db = await conReporteDeHoy()
  await sincronizarCuenta({ cuenta: CUENTA, mp: mpForzado, db, sugerir: sugerirFijo, forzarReporte: true, ahora: T })
  assert.equal(pidio(mpForzado), true)
  assert.equal(db.sync.get(OWNER).report_requested_at, new Date(T).toISOString())
})

test('forzarReporte con un pedido en curso: baja, no vuelve a pedir', async () => {
  const db = dbFalsa()
  await db.guardarSync(OWNER, { desde: new Date(T - 86400_000).toISOString(), reporte_configurado: true, report_requested_at: new Date(T - 60_000).toISOString() })
  const mp = mpFalso({ lista: [{ file_name: 'gastos-app-1.csv', date_created: new Date(T - 30_000).toISOString() }] })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, forzarReporte: true, ahora: T })
  assert.equal(r.payouts, 1)
  assert.ok(!mp.llamadas.some(([m, rta]) => m === 'POST' && rta === '/v1/account/release_report'))
})

test('reaparece anulado → descartado; agregado no se toca', async () => {
  const db = dbFalsa()
  await db.guardarSync(OWNER, { desde: new Date(T - 86400_000).toISOString(), reporte_configurado: true, report_downloaded_at: new Date(T).toISOString() })
  db.movs.set('pay:1', { id: 'pay:1', owner: OWNER, estado: 'pendiente', categoria_sugerida: 'c' })
  db.movs.set('pay:2', { id: 'pay:2', owner: OWNER, estado: 'agregado', gasto_id: 'g', monto: 100 })
  const mp = mpFalso({ pagos: [pago({ id: 1, status: 'refunded' }), pago({ id: 2, transaction_details: { total_paid_amount: 999 } })] })
  await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.equal(db.movs.get('pay:1').estado, 'descartado')
  assert.equal(db.movs.get('pay:1').motivo, 'mp_refunded')
  assert.equal(db.movs.get('pay:2').monto, 100)
})

test('si payments/search falla, el reporte sigue y queda last_error', async () => {
  const db = dbFalsa()
  const mp = mpFalso({ fallar: true })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.equal(r.errores.length, 1)
  assert.match(r.errores[0], /^pagos: MP caído/)
  assert.ok(mp.llamadas.some(([m, rta]) => m === 'POST' && rta === '/v1/account/release_report'))
  assert.match(db.sync.get(OWNER).last_error, /MP caído/)
})

test('errores_seguidos: suma por corrida con error y vuelve a 0 con una buena', async () => {
  const db = dbFalsa()
  const correr = (fallar) => sincronizarCuenta({ cuenta: CUENTA, mp: mpFalso({ fallar }), db, sugerir: sugerirFijo, ahora: T })
  const seguidos = []
  for (let i = 0; i < MP_FALLAS_PARA_AVISAR; i++) seguidos.push((await correr(true)).erroresSeguidos)
  assert.deepEqual(seguidos, [1, 2, 3, 4])
  assert.equal(db.sync.get(OWNER).errores_seguidos, 4)
  assert.equal((await correr(false)).erroresSeguidos, 0)
  assert.equal(db.sync.get(OWNER).errores_seguidos, 0)
})

test('sugerencias: máximo 10 por corrida', async () => {
  const db = dbFalsa()
  const pagos = Array.from({ length: 12 }, (_, i) => pago({ id: 100 + i }))
  let llamadas = 0
  await sincronizarCuenta({ cuenta: CUENTA, mp: mpFalso({ pagos }), db, sugerir: async (m) => { llamadas++; return sugerirFijo(m) }, ahora: T })
  assert.equal(llamadas, 10)
})

test('crearSugeridor: transferencia usa el contacto y no llama a la IA', async () => {
  let ia = 0
  const s = crearSugeridor({ revisar: async () => { ia++; return { descripcion: 'x', categoria: 'y' } }, otros: 'otros' })
  assert.deepEqual(await s({ medio: 'transferencia', contacto: { nombre: 'Mamá', categoria: 'hogar' } }), { descripcion: 'Transferencia a Mamá', categoria: 'hogar' })
  assert.deepEqual(await s({ medio: 'transferencia', contacto: { sugerido: 'Santander' } }), { descripcion: 'Transferencia a Santander', categoria: 'otros' })
  assert.equal(ia, 0)
})

test('crearSugeridor: pago pasa por la IA; si la IA falla, queda el texto de MP en Otros', async () => {
  const ok = crearSugeridor({ revisar: async () => ({ descripcion: 'Panadería', categoria: 'comida' }), otros: 'otros' })
  assert.deepEqual(await ok({ medio: 'saldo', descripcion_mp: 'Producto de panaderia' }), { descripcion: 'Panadería', categoria: 'comida' })
  const mal = crearSugeridor({ revisar: async () => { throw new Error('429') }, otros: 'otros' })
  assert.deepEqual(await mal({ medio: 'saldo', descripcion_mp: 'Producto de panaderia' }), { descripcion: 'Producto de panaderia', categoria: 'otros' })
})
