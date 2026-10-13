import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accionReporte, rangoReporte, archivoNuevo } from '../../lib/mp/reporte.js'

const T = Date.parse('2026-10-13T15:00:00Z')
const hace = (min) => new Date(T - min * 60_000).toISOString()

test('sin pedido: pide si nunca bajó o pasó 1 hora', () => {
  assert.equal(accionReporte({}, T), 'pedir')
  assert.equal(accionReporte({ report_downloaded_at: hace(30) }, T), 'nada')
  assert.equal(accionReporte({ report_downloaded_at: hace(61) }, T), 'pedir')
})

test('con pedido reciente: intenta bajar; pedido perdido (>15 min): vuelve a pedir', () => {
  assert.equal(accionReporte({ report_requested_at: hace(5), report_downloaded_at: hace(70) }, T), 'bajar')
  assert.equal(accionReporte({ report_requested_at: hace(16) }, T), 'pedir')
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
