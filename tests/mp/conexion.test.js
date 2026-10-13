import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenVigente, asegurarCuentaLibre } from '../../lib/mp/conexion.js'

const YO = 'musiald@gmail.com'
const ELLA = 'danielapaulacastelli@gmail.com'
const T = Date.parse('2026-10-13T15:00:00Z')
const DIA = 86400_000
const cripto = { cifrar: (s) => `enc:${s}`, descifrar: (s) => s.slice(4) }

function dbFalsa(fila) {
  const llamadas = []
  return {
    llamadas,
    fila,
    async guardarTokens(owner, campos, refreshAnterior) { llamadas.push(['guardarTokens', owner, refreshAnterior]); Object.assign(this.fila, campos) },
    async marcarReconectar(owner) { llamadas.push(['marcarReconectar', owner]); this.fila.necesita_reconectar = true },
    async leerCuenta() { return { ...this.fila } },
  }
}

const cuentaOauth = (venceEnDias) => ({
  owner: YO, metodo: 'oauth', access_token_enc: 'enc:AT-viejo', refresh_token_enc: 'enc:RT-viejo',
  expira_at: new Date(T + venceEnDias * DIA).toISOString(), necesita_reconectar: false,
})

test('lejos del vencimiento: usa el token actual, no renueva', async () => {
  const db = dbFalsa(cuentaOauth(30))
  let refrescos = 0
  const tok = await tokenVigente({ cuenta: cuentaOauth(30), db, cripto, refrescar: async () => { refrescos++ }, ahora: T })
  assert.equal(tok, 'AT-viejo')
  assert.equal(refrescos, 0)
})

test('cuenta por token pegado: nunca renueva', async () => {
  const cuenta = { owner: YO, metodo: 'token', access_token_enc: 'enc:APP', expira_at: null }
  assert.equal(await tokenVigente({ cuenta, db: dbFalsa(cuenta), cripto, refrescar: async () => { throw new Error('no') }, ahora: T }), 'APP')
})

test('cerca del vencimiento: renueva y guarda los dos tokens nuevos condicionado al refresh viejo', async () => {
  const db = dbFalsa(cuentaOauth(3))
  const tok = await tokenVigente({
    cuenta: cuentaOauth(3), db, cripto, ahora: T,
    refrescar: async (rt) => { assert.equal(rt, 'RT-viejo'); return { access_token: 'AT-nuevo', refresh_token: 'RT-nuevo', expires_in: 180 * 86400 } },
  })
  assert.equal(tok, 'AT-nuevo')
  assert.deepEqual(db.llamadas, [['guardarTokens', YO, 'enc:RT-viejo']])
  assert.equal(db.fila.refresh_token_enc, 'enc:RT-nuevo')
})

test('refresh falla porque otro proceso ya rotó: usa el token nuevo y NO marca reconectar ni pisa nada', async () => {
  const db = dbFalsa({ ...cuentaOauth(180), access_token_enc: 'enc:AT-otro', refresh_token_enc: 'enc:RT-otro' })
  const tok = await tokenVigente({ cuenta: cuentaOauth(3), db, cripto, ahora: T, refrescar: async () => { throw new Error('invalid_grant') } })
  assert.equal(tok, 'AT-otro')
  assert.deepEqual(db.llamadas, [])
  assert.equal(db.fila.refresh_token_enc, 'enc:RT-otro')
})

test('refresh falla de verdad y el token sigue vigente: marca reconectar y sigue con el actual', async () => {
  const db = dbFalsa(cuentaOauth(3))
  const tok = await tokenVigente({ cuenta: cuentaOauth(3), db, cripto, ahora: T, refrescar: async () => { throw new Error('invalid_grant') } })
  assert.equal(tok, 'AT-viejo')
  assert.deepEqual(db.llamadas, [['marcarReconectar', YO]])
})

test('refresh falla y el token ya venció: tira', async () => {
  const db = dbFalsa(cuentaOauth(-1))
  await assert.rejects(tokenVigente({ cuenta: cuentaOauth(-1), db, cripto, ahora: T, refrescar: async () => { throw new Error('x') } }), /venció/)
})

test('asegurarCuentaLibre: la misma cuenta de MP no se puede conectar desde dos usuarios', async () => {
  const db = { async cuentaPorMpUser(id) { return id === 2843637 ? { owner: YO } : null } }
  await asegurarCuentaLibre(db, 2843637, YO) // reconectar la propia: OK
  await asegurarCuentaLibre(db, 999, ELLA) // cuenta nueva: OK
  await assert.rejects(asegurarCuentaLibre(db, 2843637, ELLA), (e) => e.code === 'cuenta-ajena')
})
