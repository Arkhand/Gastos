import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarAviso } from '../../lib/mp/avisos.js'

const pago = { id: 'pay:1', medio: 'saldo', monto: 5000, moneda: 'ARS', descripcion: 'Panadería', descripcion_mp: 'Producto de panaderia', contacto: null }

test('un pago', () => {
  assert.deepEqual(armarAviso([pago]), { title: 'Pagaste $ 5.000', body: 'Panadería — ¿lo cargo?', url: '/inicio?mp=pay%3A1', tag: 'mp' })
})

test('sin descripción limpia usa el texto de MP; sin nada, genérico', () => {
  assert.equal(armarAviso([{ ...pago, descripcion: null }]).body, 'Producto de panaderia — ¿lo cargo?')
  assert.equal(armarAviso([{ ...pago, descripcion: null, descripcion_mp: null }]).body, 'Pago con Mercado Pago — ¿lo cargo?')
})

test('transferencia: nombre del contacto, si no la sugerencia', () => {
  const t = { ...pago, id: 'payout:9', medio: 'transferencia', monto: 24500, descripcion: 'Transferencia a Santander', contacto: { nombre: 'La nueva cocinita', sugerido: 'Santander' } }
  assert.deepEqual(armarAviso([t]), { title: 'Transferiste $ 24.500', body: 'La nueva cocinita — ¿lo cargo?', url: '/inicio?mp=payout%3A9', tag: 'mp' })
  assert.equal(armarAviso([{ ...t, contacto: { nombre: null, sugerido: 'Santander' } }]).body, 'Santander — ¿lo cargo?')
})

test('dos o más: resumen', () => {
  assert.deepEqual(armarAviso([pago, { ...pago, id: 'pay:2' }, { ...pago, id: 'pay:3' }]), { title: 'Mercado Pago', body: 'Tenés 3 pagos sin cargar', url: '/inicio?mp=lista', tag: 'mp' })
})

test('nada que avisar', () => {
  assert.equal(armarAviso([]), null)
})
