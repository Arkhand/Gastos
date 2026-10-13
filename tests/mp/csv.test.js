import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearCsv, parsearReleaseCsv } from '../../lib/mp/csv.js'

const OWNER = 'musiald@gmail.com'
const HEAD = 'DATE,SOURCE_ID,EXTERNAL_REFERENCE,RECORD_TYPE,DESCRIPTION,NET_CREDIT_AMOUNT,NET_DEBIT_AMOUNT,GROSS_AMOUNT,PAYMENT_METHOD,POS_NAME,STORE_NAME,CURRENCY,PAYER_NAME,BALANCE_AMOUNT,PAYOUT_BANK_ACCOUNT_NUMBER,PAYMENT_METHOD_TYPE,TRANSACTION_DATE'
const fila = (date, src, type, desc, credit, debit, store, acct) =>
  [date, src, '', type, desc, credit, debit, debit, '', '', store, 'ARS', '', '0.00', acct, '', date].join(',')

const CSV = [
  HEAD,
  fila('2026-10-12T00:00:00.000-03:00', '', 'initial_available_balance', '', '0.00', '0.00', '', ''),
  fila('2026-10-12T20:13:40.000-03:00', '182824356475', 'release', 'reserve_for_payout', '0.00', '24500.00', '', '0720000000000000002440'),
  fila('2026-10-12T20:13:42.000-03:00', '182824356475', 'release', 'payout', '0.00', '24500.00', '', '0720000000000000002440'),
  fila('2026-10-12T14:45:20.000-03:00', '183796717410', 'release', 'payment', '0.00', '5000.00', 'Sabor casero', ''),
  fila('2026-10-08T10:02:36.000-03:00', '183054215968', 'release', 'payment', '3993469.57', '0.00', '', ''),
  fila('2026-10-13T00:04:56.000-03:00', '1751418505100', 'release', 'asset_management', '8039.99', '0.00', '', ''),
  fila('2026-10-13T00:30:00.000-03:00', '', 'total', '', '0.00', '0.00', '', ''),
].join('\n')

test('solo payouts con débito', () => {
  const r = parsearReleaseCsv(CSV, OWNER)
  assert.equal(r.length, 1)
  const p = r[0]
  assert.equal(p.id, 'payout:182824356475')
  assert.equal(p.owner, OWNER)
  assert.equal(p.fuente, 'payout')
  assert.equal(p.medio, 'transferencia')
  assert.equal(p.mp_status, 'approved')
  assert.equal(p.monto, 24500)
  assert.equal(p.fecha, '2026-10-12')
  assert.equal(p.contacto_id, 'cbu:0720000000000000002440')
})

test('BOM, CRLF y columnas en otro orden', () => {
  const cols = HEAD.split(',')
  const valores = fila('2026-10-11T20:14:15.000-03:00', '182673275065', 'release', 'payout', '0.00', '23700.00', '', '0000003100000000001790').split(',')
  const orden = [...cols.keys()].reverse()
  const csv = '\uFEFF' + orden.map((i) => cols[i]).join(',') + '\r\n' + orden.map((i) => valores[i]).join(',') + '\r\n'
  const r = parsearReleaseCsv(csv, OWNER)
  assert.equal(r.length, 1)
  assert.equal(r[0].monto, 23700)
  assert.equal(r[0].contacto_id, 'cbu:0000003100000000001790')
})

test('comillas con comas adentro', () => {
  assert.deepEqual(parsearCsv('a,"b, c","d ""x"""\n1,2,3'), [['a', 'b, c', 'd "x"'], ['1', '2', '3']])
})

test('CSV vacío o sin header', () => {
  assert.deepEqual(parsearReleaseCsv('', OWNER), [])
  assert.deepEqual(parsearReleaseCsv(HEAD + '\n', OWNER), [])
})
