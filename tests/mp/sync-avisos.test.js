import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pasoAvisos } from '../../lib/mp/sync.js'

const YO = 'musiald@gmail.com'
const mov = (id) => ({ id, medio: 'saldo', monto: 100, moneda: 'ARS', descripcion: 'Kiosco', contacto: null })

function dbFalsa({ subs = [], pendientes = [] } = {}) {
  const s = { subs: [...subs], marcados: [], borradas: [] }
  return {
    s,
    async suscripciones() { return s.subs },
    async pendientesSinAvisar() { return pendientes },
    async marcarAvisados(ids) { s.marcados.push(...ids) },
    async borrarSuscripcionPorEndpoint(ep) { s.borradas.push(ep); s.subs = s.subs.filter((x) => x.endpoint !== ep) },
  }
}

test('sin suscripciones: no manda ni marca', async () => {
  const db = dbFalsa({ pendientes: [mov('pay:1')] })
  let llamadas = 0
  assert.equal(await pasoAvisos({ owner: YO, db, avisar: async () => { llamadas++; return { ok: 1, muertas: [] } } }), 0)
  assert.equal(llamadas, 0)
  assert.deepEqual(db.s.marcados, [])
})

test('nada sin avisar: no manda', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }] })
  let llamadas = 0
  await pasoAvisos({ owner: YO, db, avisar: async () => { llamadas++; return { ok: 1, muertas: [] } } })
  assert.equal(llamadas, 0)
})

test('manda un aviso para todos los nuevos y los marca', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }], pendientes: [mov('pay:1'), mov('pay:2')] })
  let aviso
  const n = await pasoAvisos({ owner: YO, db, avisar: async (subs, a) => { aviso = a; return { ok: subs.length, muertas: [] } } })
  assert.equal(n, 2)
  assert.equal(aviso.body, 'Tenés 2 pagos sin cargar')
  assert.deepEqual(db.s.marcados, ['pay:1', 'pay:2'])
})

test('suscripción muerta se borra; la viva recibe y se marca', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'muerta' }, { endpoint: 'viva' }], pendientes: [mov('pay:1')] })
  await pasoAvisos({ owner: YO, db, avisar: async () => ({ ok: 1, muertas: ['muerta'] }) })
  assert.deepEqual(db.s.borradas, ['muerta'])
  assert.deepEqual(db.s.marcados, ['pay:1'])
})

test('si el envío falla del todo, no marca (se reintenta en la próxima corrida)', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }], pendientes: [mov('pay:1')] })
  await assert.rejects(pasoAvisos({ owner: YO, db, avisar: async () => { throw new Error('push caído') } }), /push caído/)
  assert.deepEqual(db.s.marcados, [])
})

test('todas muertas (ningún envío OK): borra y no marca', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }], pendientes: [mov('pay:1')] })
  await pasoAvisos({ owner: YO, db, avisar: async () => ({ ok: 0, muertas: ['e1'] }) })
  assert.deepEqual(db.s.borradas, ['e1'])
  assert.deepEqual(db.s.marcados, [])
})
