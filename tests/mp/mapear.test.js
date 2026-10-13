import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearPago, fusionar } from '../../lib/mp/mapear.js'

const OWNER = 'musiald@gmail.com'
const pago = (o = {}) => ({
  id: 183796717410,
  operation_type: 'regular_payment',
  payment_type_id: 'account_money',
  status: 'approved',
  date_created: '2026-10-12T13:45:20.000-04:00',
  transaction_amount: 5000,
  transaction_details: { total_paid_amount: 5000 },
  currency_id: 'ARS',
  description: 'Producto de panaderia',
  collector: { id: 130790198 },
  ...o,
})

test('pago QR con saldo', () => {
  const f = mapearPago(pago(), OWNER)
  assert.equal(f.id, 'pay:183796717410')
  assert.equal(f.owner, OWNER)
  assert.equal(f.fuente, 'payment')
  assert.equal(f.medio, 'saldo')
  assert.equal(f.fecha, '2026-10-12')
  assert.equal(f.fecha_hora, '2026-10-12T17:45:20.000Z')
  assert.equal(f.monto, 5000)
  assert.equal(f.descripcion_mp, 'Producto de panaderia')
  assert.equal(f.contacto_id, null) // solo las transferencias llevan contacto
})

test('monto real con impuestos (total_paid_amount)', () => {
  const f = mapearPago(pago({ transaction_amount: 7569.82, transaction_details: { total_paid_amount: 9939.55 } }), OWNER)
  assert.equal(f.monto, 9939.55)
})

test('tarjeta y transferencia', () => {
  assert.equal(mapearPago(pago({ payment_type_id: 'credit_card' }), OWNER).medio, 'tarjeta')
  const t = mapearPago(pago({ operation_type: 'money_transfer', description: 'Varios', collector: { id: 172750527 } }), OWNER)
  assert.equal(t.medio, 'transferencia')
  assert.equal(t.contacto_id, 'mp:172750527')
})

test('descripción: statement_descriptor si no hay description', () => {
  assert.equal(mapearPago(pago({ description: null, statement_descriptor: 'MERPAGO*MCKING' }), OWNER).descripcion_mp, 'MERPAGO*MCKING')
})

test('pago a medianoche: fecha argentina', () => {
  assert.equal(mapearPago(pago({ date_created: '2026-10-12T23:30:00.000-04:00' }), OWNER).fecha, '2026-10-13')
})

test('fondeos e ingresos se ignoran', () => {
  assert.equal(mapearPago(pago({ operation_type: 'account_fund' }), OWNER), null)
  assert.equal(mapearPago(pago({ operation_type: 'operation_fund' }), OWNER), null)
  assert.equal(mapearPago(pago({ transaction_details: {}, transaction_amount: 0 }), OWNER), null)
})

const fila = (status) => mapearPago(pago({ status }), OWNER)

test('fusionar: fila nueva', () => {
  assert.equal(fusionar(undefined, fila('approved')).estado, 'pendiente')
  assert.equal(fusionar(undefined, fila('authorized')).estado, 'esperando')
  assert.equal(fusionar(undefined, fila('cancelled')), null)
  assert.equal(fusionar(undefined, fila('algo_raro')), null)
})

test('fusionar: esperando → pendiente al aprobarse; anulado → descartado', () => {
  assert.equal(fusionar({ estado: 'esperando' }, fila('approved')).estado, 'pendiente')
  assert.equal(fusionar({ estado: 'esperando' }, fila('authorized')).estado, 'esperando')
  const d = fusionar({ estado: 'pendiente' }, fila('refunded'))
  assert.equal(d.estado, 'descartado')
  assert.equal(d.motivo, 'mp_refunded')
})

test('fusionar: agregado y descartado quedan congelados', () => {
  assert.equal(fusionar({ estado: 'agregado' }, fila('approved')), null)
  assert.equal(fusionar({ estado: 'agregado' }, fila('refunded')), null)
  assert.equal(fusionar({ estado: 'descartado', motivo: 'usuario' }, fila('approved')), null)
})

test('fusionar: todas las filas tienen las mismas columnas (upsert en lote)', () => {
  const a = Object.keys(fusionar(undefined, fila('approved'))).sort()
  const b = Object.keys(fusionar({ estado: 'pendiente' }, fila('refunded'))).sort()
  assert.deepEqual(a, b)
  assert.ok(!a.includes('descripcion') && !a.includes('categoria_sugerida') && !a.includes('gasto_id'))
})
