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
  // Se altera el PRIMER carácter: el último base64 lleva bits de relleno que se
  // descartan al decodificar (cambiarlo puede no cambiar ningún byte).
  const alterado = [iv, tag, (datos[0] === 'A' ? 'B' : 'A') + datos.slice(1)].join('.')
  assert.throws(() => descifrar(alterado, KEY))
})

test('clave inválida', () => {
  assert.throws(() => cifrar(TOKEN, 'abc'), /MP_TOKEN_KEY/)
  assert.throws(() => cifrar(TOKEN, undefined), /MP_TOKEN_KEY/)
})
