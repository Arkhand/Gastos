import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarDuplicado } from '../../lib/mp/duplicados.js'

const YO = 'musiald@gmail.com'
const ELLA = 'danielapaulacastelli@gmail.com'
const mov = { owner: YO, monto: 5000, fecha: '2026-10-12' }
const g = (o) => ({ id: 'g1', monto: 5000, moneda: 'ARS', monto_ars: 5000, fecha: '2026-10-12', a_nombre_de: YO, eliminado: false, ...o })

test('mismo monto y fecha', () => {
  assert.equal(buscarDuplicado(mov, [g()], new Set())?.id, 'g1')
})

test('tolerancia: ±1% y ±1 día', () => {
  assert.equal(buscarDuplicado(mov, [g({ monto_ars: 5049, fecha: '2026-10-13' })], new Set())?.id, 'g1')
  assert.equal(buscarDuplicado(mov, [g({ monto_ars: 5051 })], new Set()), null)
  assert.equal(buscarDuplicado(mov, [g({ fecha: '2026-10-14' })], new Set()), null)
})

test('montos chicos: tolerancia mínima de $1', () => {
  assert.equal(buscarDuplicado({ ...mov, monto: 50 }, [g({ monto_ars: 50.9 })], new Set())?.id, 'g1')
})

test('ignora eliminados y ya vinculados', () => {
  assert.equal(buscarDuplicado(mov, [g({ eliminado: true })], new Set()), null)
  assert.equal(buscarDuplicado(mov, [g()], new Set(['g1'])), null)
})

test('gana el monto más cercano; a igualdad, el del dueño', () => {
  const r = buscarDuplicado(mov, [g({ id: 'lejos', monto_ars: 5040 }), g({ id: 'cerca', monto_ars: 5001 })], new Set())
  assert.equal(r.id, 'cerca')
  const r2 = buscarDuplicado(mov, [g({ id: 'de-ella', a_nombre_de: ELLA }), g({ id: 'mio' })], new Set())
  assert.equal(r2.id, 'mio')
})

test('gasto en USD sin monto_ars no matchea; gasto sin fecha usa created_at', () => {
  assert.equal(buscarDuplicado(mov, [g({ moneda: 'USD', monto_ars: null, monto: 5 })], new Set()), null)
  assert.equal(buscarDuplicado(mov, [g({ fecha: null, created_at: '2026-10-12T18:00:00Z' })], new Set())?.id, 'g1')
})
