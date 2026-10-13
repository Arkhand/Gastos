import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bancoDeCuenta } from '../../lib/mp/bancos.js'
import { detalleContacto } from '../../lib/mp/vista.js'

test('bancoDeCuenta reconoce el prefijo del CBU', () => {
  assert.equal(bancoDeCuenta('0720000000000000002440'), 'Santander')
  assert.equal(bancoDeCuenta('0000003100000000001790'), 'billetera virtual (CVU)')
})

test('bancoDeCuenta: prefijo desconocido → "banco NNN"; largo inválido → null', () => {
  assert.equal(bancoDeCuenta('9990000000000000000001'), 'banco 999')
  assert.equal(bancoDeCuenta('123'), null)
})

test('detalleContacto describe la cuenta sin exponerla entera', () => {
  assert.equal(detalleContacto({ id: 'cbu:0720000000000000002440', sugerido: 'Santander' }), 'Cuenta …2440 · Santander')
  assert.equal(detalleContacto({ id: 'mp:172750527', sugerido: 'FEDERICOFRIGOLI' }), 'Usuario de MP: FEDERICOFRIGOLI')
  assert.equal(detalleContacto(null), '')
})
