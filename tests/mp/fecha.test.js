import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaAR, isoAR } from '../../lib/mp/fecha.js'

test('fechaAR convierte -04:00 a la fecha argentina', () => {
  // 13:45 -04 = 14:45 AR, mismo día
  assert.equal(fechaAR('2026-10-12T13:45:20.000-04:00'), '2026-10-12')
})

test('fechaAR: 23:30 -04 ya es el día siguiente en AR (00:30)', () => {
  assert.equal(fechaAR('2026-10-12T23:30:00.000-04:00'), '2026-10-13')
})

test('fechaAR: 23:30 AR sigue siendo el mismo día', () => {
  assert.equal(fechaAR('2026-10-12T23:30:00.000-03:00'), '2026-10-12')
})

test('isoAR formatea un instante en hora argentina con offset explícito', () => {
  assert.equal(isoAR(Date.parse('2026-10-13T03:00:00.000Z')), '2026-10-13T00:00:00.000-03:00')
})
