import { test } from 'node:test'
import assert from 'node:assert/strict'
import { permitido, crearClienteMp, ErrorMp } from '../../lib/mp/client.js'

test('lista blanca: lecturas y reporte sí', () => {
  assert.ok(permitido('GET', '/users/me'))
  assert.ok(permitido('GET', '/users/172750527'))
  assert.ok(permitido('GET', '/v1/payments/search?payer.id=1&limit=100'))
  assert.ok(permitido('GET', '/v1/account/release_report/config'))
  assert.ok(permitido('PUT', '/v1/account/release_report/config'))
  assert.ok(permitido('POST', '/v1/account/release_report'))
  assert.ok(permitido('GET', '/v1/account/release_report/list'))
  assert.ok(permitido('GET', '/v1/account/release_report/gastos-app-2026-10-13-130750.csv'))
})

test('lista blanca: escrituras del token NO', () => {
  assert.ok(!permitido('POST', '/checkout/preferences'))
  assert.ok(!permitido('POST', '/v1/payments/183796717410/refunds'))
  assert.ok(!permitido('PUT', '/v1/payments/183796717410'))
  assert.ok(!permitido('GET', '/v1/payments/183796717410'))
  assert.ok(!permitido('DELETE', '/v1/account/release_report/config'))
  assert.ok(!permitido('GET', '/v1/account/release_report/../../payments/1'))
})

function fetchFalso(respuestas) {
  const llamadas = []
  const f = async (url, init) => {
    llamadas.push({ url, init })
    const r = respuestas.shift() ?? { status: 200, body: '{}' }
    return { ok: r.status < 300, status: r.status, text: async () => r.body }
  }
  return { f, llamadas }
}

test('una ruta prohibida tira ANTES de llamar a la red', async () => {
  const { f, llamadas } = fetchFalso([])
  const mp = crearClienteMp('APP_USR-x', f)
  await assert.rejects(mp.post('/checkout/preferences', {}), /no permitida/)
  assert.equal(llamadas.length, 0)
})

test('manda el token y parsea JSON', async () => {
  const { f, llamadas } = fetchFalso([{ status: 200, body: '{"id":2843637}' }])
  const r = await crearClienteMp('APP_USR-x', f).get('/users/me')
  assert.equal(r.id, 2843637)
  assert.equal(llamadas[0].url, 'https://api.mercadopago.com/users/me')
  assert.equal(llamadas[0].init.headers.Authorization, 'Bearer APP_USR-x')
})

test('texto crudo para el CSV y ErrorMp con status', async () => {
  const { f } = fetchFalso([{ status: 200, body: 'A,B\n1,2' }, { status: 404, body: '{"message":"not found"}' }])
  const mp = crearClienteMp('APP_USR-x', f)
  assert.equal(await mp.get('/v1/account/release_report/x.csv', { texto: true }), 'A,B\n1,2')
  await assert.rejects(mp.get('/v1/account/release_report/config'), (e) => e instanceof ErrorMp && e.status === 404)
})
