import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionReporte, rangoReporte, archivoNuevo } from '../../lib/mp/reporte.js'

const T = Date.parse('2026-10-13T15:00:00Z')
const hace = (min) => new Date(T - min * 60_000).toISOString()

// Hora argentina (UTC-3) → instante.
const ar = (fechaHora) => Date.parse(`${fechaHora}:00.000-03:00`)

test('una vez por día: pide desde las 20 AR si hoy todavía no bajó', () => {
  const ayer2130 = new Date(ar('2026-10-13T21:30')).toISOString()
  assert.equal(accionReporte({ report_downloaded_at: ayer2130 }, ar('2026-10-14T19:59')), 'nada')
  assert.equal(accionReporte({ report_downloaded_at: ayer2130 }, ar('2026-10-14T20:00')), 'pedir')
  assert.equal(accionReporte({ report_downloaded_at: ayer2130 }, ar('2026-10-14T23:45')), 'pedir')
})

test('una vez por día: si hoy ya bajó, no pide más (ni de madrugada)', () => {
  const hoy2130 = new Date(ar('2026-10-14T21:30')).toISOString()
  assert.equal(accionReporte({ report_downloaded_at: hoy2130 }, ar('2026-10-14T23:45')), 'nada')
  assert.equal(accionReporte({ report_downloaded_at: hoy2130 }, ar('2026-10-15T08:00')), 'nada')
})

test('nunca bajó: pide enseguida, a cualquier hora', () => {
  assert.equal(accionReporte({}, ar('2026-10-14T09:00')), 'pedir')
})

test('con pedido reciente: intenta bajar; pedido perdido (>40 min): vuelve a pedir', () => {
  assert.equal(accionReporte({ report_requested_at: hace(5), report_downloaded_at: hace(70) }, T), 'bajar')
  assert.equal(accionReporte({ report_requested_at: hace(41) }, T), 'pedir')
})

test('la corrida siguiente del cron (15 min + latencia) baja, no vuelve a pedir', () => {
  const pedido = new Date(T - 15 * 60_000 - 2_000).toISOString()
  assert.equal(accionReporte({ report_requested_at: pedido }, T), 'bajar')
})

test('rango: 3 días terminando 10 minutos antes, en UTC sin milisegundos', () => {
  assert.deepEqual(rangoReporte(T), { begin_date: '2026-10-10T14:50:00Z', end_date: '2026-10-13T14:50:00Z' })
})

test('archivoNuevo: el csv más nuevo creado después del pedido', () => {
  const lista = [
    { file_name: 'a.csv', date_created: '2026-10-13T10:59:00.000-04:00' },
    { file_name: 'b.csv', date_created: '2026-10-13T11:01:00.000-04:00' },
    { file_name: 'c.xlsx', date_created: '2026-10-13T11:02:00.000-04:00' },
  ]
  assert.equal(archivoNuevo(lista, '2026-10-13T15:00:30Z'), 'b.csv')
  assert.equal(archivoNuevo(lista, '2026-10-13T15:10:00Z'), null)
  assert.equal(archivoNuevo(null, '2026-10-13T15:00:00Z'), null)
})
