import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agregarDesdeMp } from '../../lib/mp/agregar.js'

const YO = 'musiald@gmail.com'

// DB falsa: `marcar` es un compare-and-set (como el UPDATE ... WHERE estado = x).
function dbFalsa(movs) {
  const contactos = []
  return {
    movs, contactos,
    async leerMovimiento(owner, id) { await null; const m = movs.get(id); return m && m.owner === owner ? { ...m } : null },
    async marcar(owner, id, campos, estadoActual = 'pendiente') {
      const m = movs.get(id)
      if (!m || m.owner !== owner || m.estado !== estadoActual) return null
      Object.assign(m, campos)
      return { id }
    },
    async guardarContacto(owner, id, campos) { contactos.push({ owner, id, ...campos }) },
  }
}

const mov = (o) => ({ id: 'pay:1', owner: YO, estado: 'pendiente', contacto_id: null, ...o })

test('dos altas simultáneas del mismo movimiento: un solo gasto, la otra 409', async () => {
  const db = dbFalsa(new Map([['pay:1', mov()]]))
  let creados = 0
  const crearGasto = async () => { creados++; return { id: `g${creados}` } }
  const args = { owner: YO, mpId: 'pay:1', db, crearGasto, datos: { categoria: 'c', compartido: true } }
  const [a, b] = await Promise.all([agregarDesdeMp(args), agregarDesdeMp(args)])
  assert.equal(creados, 1)
  assert.deepEqual([a.status, b.status].sort(), [200, 409])
  assert.equal(db.movs.get('pay:1').estado, 'agregado')
  assert.equal(db.movs.get('pay:1').gasto_id, 'g1')
})

test('movimiento de otra persona o inexistente: 404 y no crea nada', async () => {
  const db = dbFalsa(new Map([['pay:1', mov({ owner: 'danielapaulacastelli@gmail.com' })]]))
  let creados = 0
  const r = await agregarDesdeMp({ owner: YO, mpId: 'pay:1', db, crearGasto: async () => { creados++ }, datos: {} })
  assert.equal(r.status, 404)
  assert.equal(creados, 0)
  assert.equal(db.movs.get('pay:1').estado, 'pendiente')
})

test('ya agregado: 409', async () => {
  const db = dbFalsa(new Map([['pay:1', mov({ estado: 'agregado' })]]))
  const r = await agregarDesdeMp({ owner: YO, mpId: 'pay:1', db, crearGasto: async () => ({ id: 'g' }), datos: {} })
  assert.equal(r.status, 409)
})

test('si crear el gasto falla, el movimiento vuelve a pendiente', async () => {
  const db = dbFalsa(new Map([['pay:1', mov()]]))
  await assert.rejects(agregarDesdeMp({ owner: YO, mpId: 'pay:1', db, crearGasto: async () => { throw new Error('DB caída') }, datos: {} }), /DB caída/)
  assert.equal(db.movs.get('pay:1').estado, 'pendiente')
})

test('transferencia: guarda nombre, categoría y compartido del contacto', async () => {
  const db = dbFalsa(new Map([['payout:9', mov({ id: 'payout:9', contacto_id: 'cbu:0720000000000000002440' })]]))
  const r = await agregarDesdeMp({
    owner: YO, mpId: 'payout:9', db, crearGasto: async () => ({ id: 'g9' }),
    contactoNombre: '  Laura ', datos: { categoria: 'hogar', compartido: false },
  })
  assert.equal(r.status, 200)
  assert.deepEqual(db.contactos, [{ owner: YO, id: 'cbu:0720000000000000002440', nombre: 'Laura', categoria: 'hogar', compartido: false }])
})
