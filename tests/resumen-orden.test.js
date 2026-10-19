import { test } from 'node:test'
import assert from 'node:assert/strict'
import { porFechaDesc, agruparPorDia } from '../lib/calculos.js'

test('porFechaDesc: día más nuevo primero aunque se haya cargado antes', () => {
  const gastos = [
    { id: 'ayer-cargado-ultimo', fecha: '2026-10-17', created_at: '2026-10-18T21:00:00Z', monto: 1, moneda: 'ARS' },
    { id: 'hoy-1', fecha: '2026-10-18', created_at: '2026-10-18T10:00:00Z', monto: 1, moneda: 'ARS' },
    { id: 'hoy-2', fecha: '2026-10-18', created_at: '2026-10-18T12:00:00Z', monto: 1, moneda: 'ARS' },
  ]
  const orden = gastos.slice().sort(porFechaDesc)
  assert.deepEqual(orden.map((g) => g.id), ['hoy-2', 'hoy-1', 'ayer-cargado-ultimo'])
  assert.deepEqual(agruparPorDia(orden).map((g) => g.fecha), ['2026-10-18', '2026-10-17'])
})
