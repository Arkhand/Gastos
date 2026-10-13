import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iniciarVapid } from '../../lib/mp/vapid.js'

const cfg = { enabled: true, subject: 'mailto:a@b.c', publicKey: 'PUB', privateKey: 'PRIV' }

test('claves válidas: configura y devuelve true', () => {
  let args
  assert.equal(iniciarVapid(cfg, (...a) => { args = a }), true)
  assert.deepEqual(args, ['mailto:a@b.c', 'PUB', 'PRIV'])
})

test('claves inválidas: NO tira (no rompe el sync de MP) y devuelve false', () => {
  const orig = console.error
  console.error = () => {}
  try {
    assert.equal(iniciarVapid(cfg, () => { throw new Error('Vapid public key should be 65 bytes long') }), false)
  } finally {
    console.error = orig
  }
})

test('sin claves: false sin llamar al setter', () => {
  let llamado = false
  assert.equal(iniciarVapid({ ...cfg, enabled: false }, () => { llamado = true }), false)
  assert.equal(llamado, false)
})
