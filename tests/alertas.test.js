import { test } from 'node:test'
import assert from 'node:assert/strict'
import { debeAvisar, armarAvisoError, VENTANA_MS } from '../lib/alertas/reglas.js'

test('debeAvisar: sin aviso previo, avisa', () => {
  assert.equal(debeAvisar(null, Date.now()), true)
})

test('debeAvisar: dentro de la ventana no repite, pasada la ventana sí', () => {
  const ahora = Date.parse('2026-10-18T12:00:00Z')
  const hace1h = new Date(ahora - 3600_000).toISOString()
  const haceMas = new Date(ahora - VENTANA_MS).toISOString()
  assert.equal(debeAvisar(hace1h, ahora), false)
  assert.equal(debeAvisar(haceMas, ahora), true)
})

test('debeAvisar: fecha ilegible cuenta como sin aviso', () => {
  assert.equal(debeAvisar('basura', Date.now()), true)
})

test('armarAvisoError: título con la clave, cuerpo recortado y repeticiones', () => {
  const a = armarAvisoError('ia:groq/x', 'x'.repeat(300), 3)
  assert.equal(a.title, '⚠️ Error en Gastos: ia:groq/x')
  assert.ok(a.body.startsWith('x'.repeat(180) + '…'))
  assert.ok(a.body.endsWith('(se repitió 3 veces más)'))
  assert.equal(a.tag, 'error:ia:groq/x')
  assert.equal(armarAvisoError('k', 'falló', 1).body, 'falló (se repitió 1 vez más)')
  assert.equal(armarAvisoError('k', 'falló').body, 'falló')
})
