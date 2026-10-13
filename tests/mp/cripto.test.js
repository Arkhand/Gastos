import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { cifrar, descifrar } from '../../lib/mp/cripto.js'

const KEY = randomBytes(32).toString('hex')
const OTRA = randomBytes(32).toString('hex')
const TOKEN = 'APP_USR-1234567890-abcdef'

test('ida y vuelta', () => {
  assert.equal(descifrar(cifrar(TOKEN, KEY), KEY), TOKEN)
})

test('cada cifrado es distinto (IV aleatorio) y no contiene el token', () => {
  const a = cifrar(TOKEN, KEY)
  const b = cifrar(TOKEN, KEY)
  assert.notEqual(a, b)
  assert.ok(!a.includes('APP_USR'))
})

test('con otra clave falla', () => {
  assert.throws(() => descifrar(cifrar(TOKEN, KEY), OTRA))
})

test('si se altera el blob falla', () => {
  const [iv, tag, datos] = cifrar(TOKEN, KEY).split('.')
  const alterado = [iv, tag, datos.slice(0, -2) + (datos.endsWith('A') ? 'BB' : 'AA')].join('.')
  assert.throws(() => descifrar(alterado, KEY))
})

test('clave inválida', () => {
  assert.throws(() => cifrar(TOKEN, 'abc'), /MP_TOKEN_KEY/)
  assert.throws(() => cifrar(TOKEN, undefined), /MP_TOKEN_KEY/)
})
