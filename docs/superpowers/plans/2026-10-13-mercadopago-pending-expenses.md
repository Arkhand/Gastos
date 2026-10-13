# Mercado Pago pending expenses — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each user connects their own Mercado Pago account; the app polls MP and offers every outgoing movement not yet entered as a "pending" item in `/inicio`, to add (pre-filled sheet) or discard.

**Architecture:** Pure modules in `lib/mp/` (mapping, CSV, duplicates, crypto, allowlisted MP client, sync orchestration with injected deps) tested with `node --test`; a thin server layer (`lib/mp/db.js`, `cuentas.js`, `ejecutar.js`) wires Supabase, encryption and the AI; Next.js route handlers under `app/api/mp/`; a card in `/inicio` and a screen in `/config/mp`. Supabase `pg_cron` calls the sync every 15 minutes; `/inicio` also syncs on open.

**Tech Stack:** Next.js 15 App Router (JS, no TS), React Query, Supabase (`@supabase/supabase-js`, service role), iron-session, Node 24 (`node:test`, `node:crypto`), Vercel.

**Spec:** `docs/superpowers/specs/2026-10-13-mercadopago-pending-expenses-design.md`. Validated API facts and the OAuth spike: `memory/mercadopago.md`. Reference scripts (outside the repo): `C:\Users\musia\Desktop\Proyectos\_SinCliente\MP\probar_e2e.py`, `probar_oauth.py`.

## Global Constraints

- **Git:** never commit, push or open a PR unless Daniel explicitly asks. Tasks end with a verification step, not a commit.
- **Live systems:** creating tables in Supabase, enabling `pg_cron`, adding Vercel env vars and deploying are live changes: list what will be touched and wait for Daniel's OK before each.
- **Secrets:** never print tokens, client secret, `MP_TOKEN_KEY` or `CRON_SECRET` in output, logs, tests or chat. Tokens never reach the browser.
- **Language:** follow the existing codebase — Spanish identifiers and comments (`listarGastos`, `crearGasto`…). User-facing copy in Rioplatense Spanish.
- **Env:** everything from `process.env` goes through `lib/env.js` → `config`. New: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TOKEN_KEY` (32 bytes hex), `CRON_SECRET`.
- **No new dependencies.** Tests use `node --test` (Node 24 runs the ESM `.js` files directly).
- **MP calls only through `lib/mp/client.js`**, whose allowlist is the only door to the API (the OAuth token carries write scopes that cannot be removed: cancel, refund, preferences).
- **Imports:** client components (`'use client'`) never import `lib/mp/*` except `lib/mp/vista.js` (pure, no Node APIs).
- MP ids are global; DB row ids are `pay:<payment_id>` / `payout:<source_id>`.
- Operation types kept: `regular_payment`, `money_transfer`, `recurring_payment`. Amount = `transaction_details.total_paid_amount`. Dates converted to `America/Argentina/Buenos_Aires`.
- First sync of an account imports from `now − 1 day`; payments re-read the last 7 days each run; release report at most once per hour, covering 3 days, two-phase.

## Review Focus

1. **Movement near midnight** (paid 23:30 or 00:30 Argentina time) → the pending shows the Argentina date, not the UTC/−04 date. Test in Task 3.
2. **Release CSV quirks** (BOM, column order different from the config, quoted commas in `STORE_NAME`, CRLF) → payouts still parsed correctly. Test in Task 4.
3. **Double tap on "Guardar gasto" for an MP pending** → only one expense is created; the second request gets 409. Server check in Task 10 (`mp-ya-procesado`), test of the state rule in Task 3 (`fusionar` never reopens `agregado`).
4. **MP down or token rejected for one account** → that account records `last_error`, the other account and the app keep working; `/inicio` never errors. Test in Task 7 (payments failure isolated from the report) + manual check in Task 9.
5. **User B touching user A's movement** (discard / link / add with someone else's `mp_id`) → 404, nothing changes. Every `dbMp` write filters by `owner`; manual curl check in Task 10.

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | add `"test"` script |
| `lib/env.js` | `config.mp` |
| `lib/db.js` | export `getClient` (one word change) |
| `lib/mp/fecha.js` | `fechaAR(iso)`, `isoAR(ms)` — pure |
| `lib/mp/bancos.js` | `bancoDeCuenta(cuenta)` — pure |
| `lib/mp/vista.js` | `detalleContacto(c)` — pure, client-safe |
| `lib/mp/cripto.js` | `cifrar`, `descifrar` (AES-256-GCM) |
| `lib/mp/mapear.js` | `mapearPago`, `fusionar` (state rules) |
| `lib/mp/csv.js` | `parsearCsv`, `parsearReleaseCsv` |
| `lib/mp/duplicados.js` | `buscarDuplicado` |
| `lib/mp/client.js` | `permitido`, `crearClienteMp`, `pedirTokenOauth`, `ErrorMp` |
| `lib/mp/reporte.js` | `CONFIG_REPORTE`, `accionReporte`, `rangoReporte`, `archivoNuevo` |
| `lib/mp/sync.js` | `sincronizarCuenta`, `crearSugeridor` (deps injected) |
| `lib/mp/db.js` | `dbMp` — Supabase queries for the 4 tables (server-only) |
| `lib/mp/cuentas.js` | `ownerDe`, `conectarConToken`, `conectarConCodigo`, `desconectar`, `clienteParaCuenta` |
| `lib/mp/ejecutar.js` | `ejecutarSync` — wires real deps, iterates accounts |
| `supabase/migrations/20261013120000_mercadopago.sql` | tables |
| `supabase/cron/mp-sync.sql` | pg_cron job (applied by hand) |
| `app/api/mp/sync/route.js` | POST sync (cron secret or session) |
| `app/api/mp/cuenta/route.js` | GET status, DELETE disconnect |
| `app/api/mp/token/route.js` | POST paste token |
| `app/api/mp/conectar/route.js` | GET → MP consent |
| `app/api/mp/callback/route.js` | GET OAuth callback |
| `app/api/mp/pendientes/route.js` | GET pendings |
| `app/api/mp/[id]/descartar/route.js` | POST discard / undo |
| `app/api/mp/[id]/vincular/route.js` | POST link to existing expense |
| `app/api/gastos/route.js` | POST accepts `mp_id`, `mp_contacto_nombre` |
| `middleware.js` | let `/api/mp/sync` through without cookie |
| `lib/api.js` | hooks |
| `app/(app)/config/mp/page.jsx`, `app/(app)/config/page.jsx` | connect screen + menu item |
| `components/MpPendientes.jsx` | card in `/inicio` |
| `components/Sheet.jsx` | `mp` prop: transfer recipient field, sends `mp_id` |
| `app/(app)/inicio/InicioClient.jsx` | card + sync on open |
| `app/legacy.css` | `.mp-*` styles |
| `tests/mp/*.test.js` | unit tests |

---

### Task 1: Test harness, dates and banks

**Files:**
- Modify: `package.json` (scripts)
- Create: `lib/mp/fecha.js`, `lib/mp/bancos.js`, `lib/mp/vista.js`
- Test: `tests/mp/fecha.test.js`, `tests/mp/bancos.test.js`

**Interfaces:**
- Produces: `fechaAR(iso: string) → 'YYYY-MM-DD'`, `isoAR(ms: number) → 'YYYY-MM-DDTHH:mm:ss.SSS-03:00'`, `bancoDeCuenta(cuenta: string) → string|null`, `detalleContacto(c: {id, nombre, sugerido}|null) → string`.

- [ ] **Step 1: Add the test script**

In `package.json` → `"scripts"`, add after `"lint"`:
```json
    "test": "node --test tests/**/*.test.js"
```

- [ ] **Step 2: Write the failing tests**

`tests/mp/fecha.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fechaAR, isoAR } from '../../lib/mp/fecha.js'

test('fechaAR convierte -04:00 a la fecha argentina', () => {
  // 13:45 -04 = 14:45 AR, mismo día
  assert.equal(fechaAR('2026-10-12T13:45:20.000-04:00'), '2026-10-12')
})

test('fechaAR: 23:30 -04 ya es el día siguiente en AR (00:30)', () => {
  assert.equal(fechaAR('2026-10-12T23:30:00.000-04:00'), '2026-10-13')
})

test('fechaAR: 23:30 AR sigue siendo el mismo día', () => {
  assert.equal(fechaAR('2026-10-12T23:30:00.000-03:00'), '2026-10-12')
})

test('isoAR formatea un instante en hora argentina con offset explícito', () => {
  assert.equal(isoAR(Date.parse('2026-10-13T03:00:00.000Z')), '2026-10-13T00:00:00.000-03:00')
})
```

`tests/mp/bancos.test.js`:
```js
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
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/lib/mp/fecha.js'`.

- [ ] **Step 4: Implement**

`lib/mp/fecha.js`:
```js
// Fechas de Mercado Pago → hora argentina. MP devuelve ISO con offset (-04:00 en
// payments/search, -03:00 en el reporte): el instante es correcto, solo hay que
// convertirlo. Nunca cortar el string (eso producía un falso desfase de 1 hora).
const fmtAR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}) // en-CA da YYYY-MM-DD

export function fechaAR(iso) {
  return fmtAR.format(new Date(iso))
}

// Instante → ISO en hora argentina con offset explícito (Argentina no tiene DST).
// Es el formato que MP acepta en begin_date de payments/search.
export function isoAR(ms) {
  return new Date(ms - 3 * 3600_000).toISOString().replace('Z', '-03:00')
}
```

`lib/mp/bancos.js`:
```js
// Banco a partir de los 3 primeros dígitos del CBU (CVU = 000). Sirve como
// sugerencia de "a quién" cuando todavía no le pusimos nombre a la cuenta.
const BANCOS = {
  '000': 'billetera virtual (CVU)',
  '007': 'Galicia',
  '011': 'Nación',
  '014': 'Provincia',
  '015': 'ICBC',
  '017': 'BBVA',
  '027': 'Supervielle',
  '034': 'Patagonia',
  '044': 'Hipotecario',
  '072': 'Santander',
  '143': 'Brubank',
  '150': 'HSBC',
  '191': 'Credicoop',
  '259': 'Itaú',
  '285': 'Macro',
  '299': 'Comafi',
}

export function bancoDeCuenta(cuenta) {
  const c = String(cuenta || '').replace(/\D/g, '')
  if (c.length !== 22) return null
  return BANCOS[c.slice(0, 3)] ?? `banco ${c.slice(0, 3)}`
}
```

`lib/mp/vista.js`:
```js
// Helpers de presentación de Mercado Pago. Puros y sin APIs de Node: los usan
// componentes cliente (la tarjeta de pendientes y la hoja).

// "Cuenta …2440 · Santander" / "Usuario de MP: NICK". Nunca muestra el CBU entero.
export function detalleContacto(c) {
  if (!c?.id) return ''
  if (c.id.startsWith('cbu:')) {
    const fin = c.id.slice(-4)
    return c.sugerido ? `Cuenta …${fin} · ${c.sugerido}` : `Cuenta …${fin}`
  }
  return c.sugerido ? `Usuario de MP: ${c.sugerido}` : 'Usuario de MP'
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: PASS (7 tests).

---

### Task 2: Token encryption

**Files:**
- Create: `lib/mp/cripto.js`
- Test: `tests/mp/cripto.test.js`

**Interfaces:**
- Produces: `cifrar(texto: string, keyHex: string) → string` (`iv.tag.datos`, base64url), `descifrar(blob: string, keyHex: string) → string`. Both throw on a key that is not 32 bytes hex; `descifrar` throws on tampering or wrong key.

- [ ] **Step 1: Write the failing test**

`tests/mp/cripto.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/mp/cripto.js`:
```js
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Cifrado de los tokens de Mercado Pago guardados en la DB (AES-256-GCM).
// Formato: "iv.tag.datos" en base64url. La clave son 32 bytes en hex
// (MP_TOKEN_KEY): con solo la DB no se pueden leer los tokens.
function clave(keyHex) {
  const k = Buffer.from(String(keyHex || ''), 'hex')
  if (k.length !== 32) throw new Error('MP_TOKEN_KEY inválida (se esperan 32 bytes en hex)')
  return k
}

export function cifrar(texto, keyHex) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', clave(keyHex), iv)
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64url')).join('.')
}

export function descifrar(blob, keyHex) {
  const [iv, tag, datos] = String(blob).split('.').map((s) => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', clave(keyHex), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

---

### Task 3: Payment mapping and state rules

**Files:**
- Create: `lib/mp/mapear.js`
- Test: `tests/mp/mapear.test.js`

**Interfaces:**
- Consumes: `fechaAR` (Task 1).
- Produces:
  - `mapearPago(p: MPPayment, owner: string) → Fila | null` where `Fila = { id, owner, fuente, medio, mp_status, fecha_hora, fecha, monto, moneda, descripcion_mp, contacto_id, raw }`.
  - `fusionar(existente: {estado, motivo}|undefined, nueva: Fila, ahora?: number) → (Fila & {estado, motivo, actualizado_at}) | null` (null = do not write).

- [ ] **Step 1: Write the failing test**

`tests/mp/mapear.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mapearPago, fusionar } from '../../lib/mp/mapear.js'

const OWNER = 'musiald@gmail.com'
const pago = (o = {}) => ({
  id: 183796717410,
  operation_type: 'regular_payment',
  payment_type_id: 'account_money',
  status: 'approved',
  date_created: '2026-10-12T13:45:20.000-04:00',
  transaction_amount: 5000,
  transaction_details: { total_paid_amount: 5000 },
  currency_id: 'ARS',
  description: 'Producto de panaderia',
  collector: { id: 130790198 },
  ...o,
})

test('pago QR con saldo', () => {
  const f = mapearPago(pago(), OWNER)
  assert.equal(f.id, 'pay:183796717410')
  assert.equal(f.owner, OWNER)
  assert.equal(f.fuente, 'payment')
  assert.equal(f.medio, 'saldo')
  assert.equal(f.fecha, '2026-10-12')
  assert.equal(f.fecha_hora, '2026-10-12T17:45:20.000Z')
  assert.equal(f.monto, 5000)
  assert.equal(f.descripcion_mp, 'Producto de panaderia')
  assert.equal(f.contacto_id, null) // solo las transferencias llevan contacto
})

test('monto real con impuestos (total_paid_amount)', () => {
  const f = mapearPago(pago({ transaction_amount: 7569.82, transaction_details: { total_paid_amount: 9939.55 } }), OWNER)
  assert.equal(f.monto, 9939.55)
})

test('tarjeta y transferencia', () => {
  assert.equal(mapearPago(pago({ payment_type_id: 'credit_card' }), OWNER).medio, 'tarjeta')
  const t = mapearPago(pago({ operation_type: 'money_transfer', description: 'Varios', collector: { id: 172750527 } }), OWNER)
  assert.equal(t.medio, 'transferencia')
  assert.equal(t.contacto_id, 'mp:172750527')
})

test('descripción: statement_descriptor si no hay description', () => {
  assert.equal(mapearPago(pago({ description: null, statement_descriptor: 'MERPAGO*MCKING' }), OWNER).descripcion_mp, 'MERPAGO*MCKING')
})

test('pago a medianoche: fecha argentina', () => {
  assert.equal(mapearPago(pago({ date_created: '2026-10-12T23:30:00.000-04:00' }), OWNER).fecha, '2026-10-13')
})

test('fondeos e ingresos se ignoran', () => {
  assert.equal(mapearPago(pago({ operation_type: 'account_fund' }), OWNER), null)
  assert.equal(mapearPago(pago({ operation_type: 'operation_fund' }), OWNER), null)
  assert.equal(mapearPago(pago({ transaction_details: {}, transaction_amount: 0 }), OWNER), null)
})

const fila = (status) => mapearPago(pago({ status }), OWNER)

test('fusionar: fila nueva', () => {
  assert.equal(fusionar(undefined, fila('approved')).estado, 'pendiente')
  assert.equal(fusionar(undefined, fila('authorized')).estado, 'esperando')
  assert.equal(fusionar(undefined, fila('cancelled')), null)
  assert.equal(fusionar(undefined, fila('algo_raro')), null)
})

test('fusionar: esperando → pendiente al aprobarse; anulado → descartado', () => {
  assert.equal(fusionar({ estado: 'esperando' }, fila('approved')).estado, 'pendiente')
  assert.equal(fusionar({ estado: 'esperando' }, fila('authorized')).estado, 'esperando')
  const d = fusionar({ estado: 'pendiente' }, fila('refunded'))
  assert.equal(d.estado, 'descartado')
  assert.equal(d.motivo, 'mp_refunded')
})

test('fusionar: agregado y descartado quedan congelados', () => {
  assert.equal(fusionar({ estado: 'agregado' }, fila('approved')), null)
  assert.equal(fusionar({ estado: 'agregado' }, fila('refunded')), null)
  assert.equal(fusionar({ estado: 'descartado', motivo: 'usuario' }, fila('approved')), null)
})

test('fusionar: todas las filas tienen las mismas columnas (upsert en lote)', () => {
  const a = Object.keys(fusionar(undefined, fila('approved'))).sort()
  const b = Object.keys(fusionar({ estado: 'pendiente' }, fila('refunded'))).sort()
  assert.deepEqual(a, b)
  assert.ok(!a.includes('descripcion') && !a.includes('categoria_sugerida') && !a.includes('gasto_id'))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/mp/mapear.js`:
```js
import { fechaAR } from './fecha.js'

// Pagos de payments/search → filas de mp_movimientos. Solo egresos propios: se
// descartan los fondeos (account_fund / operation_fund), que son plata que ENTRA a
// la cuenta (incluido el fondeo con tarjeta/DEBIN que MP hace para cubrir una
// transferencia; la transferencia en sí llega por el reporte como payout).
const OPERACIONES = new Set(['regular_payment', 'money_transfer', 'recurring_payment'])
const ESPERANDO = new Set(['authorized', 'in_process', 'pending'])
const ANULADOS = new Set(['cancelled', 'rejected', 'refunded', 'charged_back'])

export function mapearPago(p, owner) {
  if (!p || !OPERACIONES.has(p.operation_type)) return null
  // total_paid_amount incluye impuestos/percepciones: es lo que realmente se debitó.
  const monto = Number(p.transaction_details?.total_paid_amount ?? p.transaction_amount)
  if (!(monto > 0)) return null
  const esTransferencia = p.operation_type === 'money_transfer'
  const collector = p.collector?.id ?? p.collector_id
  return {
    id: `pay:${p.id}`,
    owner,
    fuente: 'payment',
    medio: p.payment_type_id === 'credit_card' ? 'tarjeta' : esTransferencia ? 'transferencia' : 'saldo',
    mp_status: p.status,
    fecha_hora: new Date(p.date_created).toISOString(),
    fecha: fechaAR(p.date_created),
    monto,
    moneda: p.currency_id || 'ARS',
    descripcion_mp: p.description || p.statement_descriptor || null,
    contacto_id: esTransferencia && collector ? `mp:${collector}` : null,
    raw: p,
  }
}

// Reglas de estado al volver a ver un movimiento (spec: "State rules").
// - agregado / descartado: congelados, la fila no se toca (null = no escribir).
// - approved → pendiente; authorized/in_process/pending → esperando (solo si es nueva).
// - cancelled/rejected/refunded/charged_back → descartado automático, o ni se inserta.
// Mientras está esperando/pendiente se refrescan monto, fecha y raw.
// Devuelve siempre las mismas columnas (sin descripcion / categoria_sugerida /
// gasto_id) para que el upsert en lote no pise lo que completó la IA.
export function fusionar(existente, nueva, ahora = Date.now()) {
  const actual = existente?.estado ?? null
  if (actual === 'agregado' || actual === 'descartado') return null
  const st = nueva.mp_status
  let estado
  let motivo = existente?.motivo ?? null
  if (st === 'approved') estado = 'pendiente'
  else if (ESPERANDO.has(st)) estado = actual ?? 'esperando'
  else if (ANULADOS.has(st)) {
    if (!actual) return null
    estado = 'descartado'
    motivo = `mp_${st}`
  } else if (actual) estado = actual
  else return null
  return { ...nueva, estado, motivo, actualizado_at: new Date(ahora).toISOString() }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

---

### Task 4: Release report CSV

**Files:**
- Create: `lib/mp/csv.js`
- Test: `tests/mp/csv.test.js`

**Interfaces:**
- Consumes: `fechaAR` (Task 1).
- Produces: `parsearCsv(texto) → string[][]`, `parsearReleaseCsv(texto, owner) → Fila[]` (same `Fila` shape as `mapearPago`, `fuente: 'payout'`, `mp_status: 'approved'`, `contacto_id: 'cbu:<22 digits>'`).

- [ ] **Step 1: Write the failing test**

`tests/mp/csv.test.js` (rows modelled on the real 2026-10-13 report, accounts anonymized):
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/mp/csv.js`:
```js
import { fechaAR } from './fecha.js'

// Parser CSV mínimo (RFC 4180): comillas dobles, "" escapado, comas y saltos de
// línea dentro de comillas, CRLF y BOM. Devuelve filas como arrays de strings.
export function parsearCsv(texto) {
  const t = String(texto ?? '').replace(/^\uFEFF/, '')
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (enComillas) {
      if (ch !== '"') campo += ch
      else if (t[i + 1] === '"') { campo += '"'; i++ }
      else enComillas = false
    } else if (ch === '"') enComillas = true
    else if (ch === ',') { fila.push(campo); campo = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      fila.push(campo)
      campo = ''
      if (fila.length > 1 || fila[0] !== '') filas.push(fila)
      fila = []
    } else campo += ch
  }
  if (campo !== '' || fila.length) {
    fila.push(campo)
    filas.push(fila)
  }
  return filas
}

// Release report → transferencias enviadas a CBU/CVU (DESCRIPTION=payout), que
// payments/search no devuelve. Todo lo demás del reporte se ignora: los payment ya
// llegan por payments/search, reserve_* son retenciones transitorias que duplican,
// asset_management son rendimientos. Se lee por NOMBRE de columna: MP no respeta el
// orden pedido en la config.
export function parsearReleaseCsv(texto, owner) {
  const [head, ...filas] = parsearCsv(texto)
  if (!head) return []
  const idx = Object.fromEntries(head.map((h, i) => [h.trim(), i]))
  const col = (f, k) => (idx[k] == null ? '' : String(f[idx[k]] ?? '').trim())
  const out = []
  for (const f of filas) {
    if (col(f, 'RECORD_TYPE') !== 'release' || col(f, 'DESCRIPTION') !== 'payout') continue
    const monto = Number(col(f, 'NET_DEBIT_AMOUNT'))
    const sourceId = col(f, 'SOURCE_ID')
    const fecha = col(f, 'DATE')
    if (!(monto > 0) || !sourceId || !fecha) continue
    const cuenta = col(f, 'PAYOUT_BANK_ACCOUNT_NUMBER').replace(/\D/g, '')
    out.push({
      id: `payout:${sourceId}`,
      owner,
      fuente: 'payout',
      medio: 'transferencia',
      mp_status: 'approved',
      fecha_hora: new Date(fecha).toISOString(),
      fecha: fechaAR(fecha),
      monto,
      moneda: col(f, 'CURRENCY') || 'ARS',
      descripcion_mp: null,
      contacto_id: cuenta ? `cbu:${cuenta}` : null,
      raw: Object.fromEntries(head.map((h, i) => [h.trim(), f[i] ?? ''])),
    })
  }
  return out
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

---

### Task 5: Duplicate candidate

**Files:**
- Create: `lib/mp/duplicados.js`
- Test: `tests/mp/duplicados.test.js`

**Interfaces:**
- Produces: `buscarDuplicado(mov: {owner, monto, fecha}, gastos: GastoRow[], vinculados: Set<string>) → GastoRow | null`.

- [ ] **Step 1: Write the failing test**

`tests/mp/duplicados.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscarDuplicado } from '../../lib/mp/duplicados.js'

const YO = 'musiald@gmail.com'
const ELLA = 'danielapaulacastelli@gmail.com'
const mov = { owner: YO, monto: 5000, fecha: '2026-10-12' }
const g = (o) => ({ id: 'g1', monto: 5000, moneda: 'ARS', monto_ars: 5000, fecha: '2026-10-12', a_nombre_de: YO, eliminado: false, ...o })

test('mismo monto y fecha', () => {
  assert.equal(buscarDuplicado(mov, [g()], new Set())?.id, 'g1')
})

test('tolerancia: ±1% y ±1 día', () => {
  assert.equal(buscarDuplicado(mov, [g({ monto_ars: 5049, fecha: '2026-10-13' })], new Set())?.id, 'g1')
  assert.equal(buscarDuplicado(mov, [g({ monto_ars: 5051 })], new Set()), null)
  assert.equal(buscarDuplicado(mov, [g({ fecha: '2026-10-14' })], new Set()), null)
})

test('montos chicos: tolerancia mínima de $1', () => {
  assert.equal(buscarDuplicado({ ...mov, monto: 50 }, [g({ monto_ars: 50.9 })], new Set())?.id, 'g1')
})

test('ignora eliminados y ya vinculados', () => {
  assert.equal(buscarDuplicado(mov, [g({ eliminado: true })], new Set()), null)
  assert.equal(buscarDuplicado(mov, [g()], new Set(['g1'])), null)
})

test('gana el monto más cercano; a igualdad, el del dueño', () => {
  const r = buscarDuplicado(mov, [g({ id: 'lejos', monto_ars: 5040 }), g({ id: 'cerca', monto_ars: 5001 })], new Set())
  assert.equal(r.id, 'cerca')
  const r2 = buscarDuplicado(mov, [g({ id: 'de-ella', a_nombre_de: ELLA }), g({ id: 'mio' })], new Set())
  assert.equal(r2.id, 'mio')
})

test('gasto en USD sin monto_ars no matchea; gasto sin fecha usa created_at', () => {
  assert.equal(buscarDuplicado(mov, [g({ moneda: 'USD', monto_ars: null, monto: 5 })], new Set()), null)
  assert.equal(buscarDuplicado(mov, [g({ fecha: null, created_at: '2026-10-12T18:00:00Z' })], new Set())?.id, 'g1')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/mp/duplicados.js`:
```js
// "¿Ya lo cargaste?": busca un gasto activo que probablemente sea este movimiento.
// Monto en ARS a ±1% (mínimo $1) y fecha a ±1 día. Se ignoran los gastos ya
// vinculados a otro movimiento. Gana el monto más cercano; a igual distancia, el
// cargado a nombre del dueño del movimiento (puede haberlo cargado la otra persona).
const dia = (ymd) => Date.parse(`${ymd}T00:00:00Z`) / 86400_000

export function buscarDuplicado(mov, gastos, vinculados) {
  const tol = Math.max(mov.monto * 0.01, 1)
  const dMov = dia(mov.fecha)
  let mejor = null
  for (const g of gastos) {
    if (g.eliminado || vinculados.has(g.id)) continue
    const fecha = g.fecha || String(g.created_at || '').slice(0, 10)
    if (!fecha) continue
    const montoArs = Number(g.monto_ars ?? (g.moneda === 'ARS' ? g.monto : NaN))
    const diff = Math.abs(montoArs - mov.monto)
    if (!(diff <= tol) || Math.abs(dia(fecha) - dMov) > 1) continue
    const ajeno = g.a_nombre_de === mov.owner ? 0 : 1
    if (!mejor || diff < mejor.diff || (diff === mejor.diff && ajeno < mejor.ajeno)) mejor = { g, diff, ajeno }
  }
  return mejor?.g ?? null
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

---

### Task 6: Allowlisted MP client

**Files:**
- Create: `lib/mp/client.js`
- Test: `tests/mp/client.test.js`

**Interfaces:**
- Produces:
  - `permitido(metodo: string, ruta: string) → boolean`
  - `crearClienteMp(token: string, fetchImpl = fetch) → { get(ruta, {texto?}), post(ruta, body), put(ruta, body) }` — throws `Error('Llamada a MP no permitida…')` before any network call for anything off the list; throws `ErrorMp {status}` on non-2xx.
  - `pedirTokenOauth(body: object, fetchImpl = fetch) → Promise<{access_token, refresh_token, expires_in, scope, user_id}>`
  - `class ErrorMp extends Error { status }`

- [ ] **Step 1: Write the failing test**

`tests/mp/client.test.js`:
```js
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`lib/mp/client.js`:
```js
const API = 'https://api.mercadopago.com'

// LISTA BLANCA: lo ÚNICO que la app puede pedirle a Mercado Pago con el token de
// una persona. El token OAuth trae permisos de escritura que MP no deja quitar
// (cancelar, devolver, crear cobros); este filtro garantiza que ningún camino del
// código los use. Cualquier otra ruta tira antes de tocar la red.
const PERMITIDOS = [
  ['GET', /^\/users\/me$/],
  ['GET', /^\/users\/\d+$/],
  ['GET', /^\/v1\/payments\/search\?[^/]*$/],
  ['GET', /^\/v1\/account\/release_report\/config$/],
  ['POST', /^\/v1\/account\/release_report\/config$/],
  ['PUT', /^\/v1\/account\/release_report\/config$/],
  ['POST', /^\/v1\/account\/release_report$/],
  ['GET', /^\/v1\/account\/release_report\/list$/],
  ['GET', /^\/v1\/account\/release_report\/[\w-]+\.csv$/],
]

export function permitido(metodo, ruta) {
  return PERMITIDOS.some(([m, re]) => m === metodo && re.test(ruta))
}

export class ErrorMp extends Error {
  constructor(status, ruta, detalle) {
    super(`Mercado Pago respondió ${status} en ${ruta}`)
    this.status = status
    this.detalle = detalle
  }
}

export function crearClienteMp(token, fetchImpl = fetch) {
  async function pedir(metodo, ruta, body, { texto = false } = {}) {
    const rutaLog = ruta.split('?')[0]
    if (!permitido(metodo, ruta)) throw new Error(`Llamada a MP no permitida: ${metodo} ${rutaLog}`)
    const res = await fetchImpl(API + ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const raw = await res.text()
    if (!res.ok) throw new ErrorMp(res.status, rutaLog, raw.slice(0, 200))
    if (texto) return raw
    return raw ? JSON.parse(raw) : null
  }
  return {
    get: (ruta, opts) => pedir('GET', ruta, undefined, opts),
    post: (ruta, body) => pedir('POST', ruta, body),
    put: (ruta, body) => pedir('PUT', ruta, body),
  }
}

// OAuth (canje del code y refresh). Usa las credenciales de la APP (client
// id/secret en el body), no el token de una persona.
export async function pedirTokenOauth(body, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErrorMp(res.status, '/oauth/token', data?.message || data?.error)
  return data
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: PASS.

---

### Task 7: Report scheduling and sync orchestration

**Files:**
- Create: `lib/mp/reporte.js`, `lib/mp/sync.js`
- Test: `tests/mp/reporte.test.js`, `tests/mp/sync.test.js`

**Interfaces:**
- Consumes: `mapearPago`, `fusionar` (Task 3), `parsearReleaseCsv` (Task 4), `bancoDeCuenta` (Task 1), `isoAR` (Task 1), `ErrorMp` (Task 6).
- Produces:
  - `CONFIG_REPORTE` (object), `accionReporte(sync, ahora) → 'bajar'|'pedir'|'nada'`, `rangoReporte(ahora, dias = 3) → {begin_date, end_date}`, `archivoNuevo(lista, pedidoIso) → string|null`.
  - `sincronizarCuenta({ cuenta: {owner, mp_user_id}, mp, db, sugerir, ahora? }) → Promise<{owner, pagos, payouts, sugeridos, errores: string[]}>`
  - `crearSugeridor({ revisar: (desc, catId) => Promise<{descripcion, categoria}>, otros: string }) → (mov) => Promise<{descripcion, categoria}>`
  - The `db` port used by sync (implemented for real in Task 8 as `dbMp`): `leerSync(owner)`, `guardarSync(owner, campos)`, `movimientosPorIds(ids) → Map`, `upsertMovimientos(filas)`, `contactosExistentes(owner, ids) → Set`, `insertarContactos(filas)`, `pendientesSinSugerencia(owner, n) → filas con .contacto`, `actualizarMovimiento(id, campos)`.

- [ ] **Step 1: Write the failing tests**

`tests/mp/reporte.test.js`:
```js
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
```

`tests/mp/sync.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sincronizarCuenta, crearSugeridor } from '../../lib/mp/sync.js'

const OWNER = 'musiald@gmail.com'
const CUENTA = { owner: OWNER, mp_user_id: 2843637 }
const T = Date.parse('2026-10-13T15:00:00Z')

// DB en memoria con la misma interfaz que dbMp (lib/mp/db.js).
function dbFalsa() {
  const sync = new Map()
  const movs = new Map()
  const contactos = new Map()
  return {
    movs, contactos, sync,
    async leerSync(o) { return sync.get(o) ?? null },
    async guardarSync(o, campos) { const r = { ...(sync.get(o) ?? { owner: o }), ...campos }; sync.set(o, r); return r },
    async movimientosPorIds(ids) { return new Map(ids.filter((i) => movs.has(i)).map((i) => [i, movs.get(i)])) },
    async upsertMovimientos(filas) { for (const f of filas) movs.set(f.id, { ...(movs.get(f.id) ?? {}), ...f }) },
    async contactosExistentes(o, ids) { return new Set(ids.filter((i) => contactos.has(`${o}|${i}`))) },
    async insertarContactos(filas) { for (const c of filas) if (!contactos.has(`${c.owner}|${c.id}`)) contactos.set(`${c.owner}|${c.id}`, c) },
    async pendientesSinSugerencia(o, n) {
      return [...movs.values()].filter((m) => m.owner === o && m.estado === 'pendiente' && !m.categoria_sugerida).slice(0, n)
        .map((m) => ({ ...m, contacto: m.contacto_id ? contactos.get(`${o}|${m.contacto_id}`) ?? null : null }))
    },
    async actualizarMovimiento(id, campos) { movs.set(id, { ...movs.get(id), ...campos }) },
  }
}

const pago = (o) => ({
  id: 1, operation_type: 'regular_payment', payment_type_id: 'account_money', status: 'approved',
  date_created: '2026-10-13T10:00:00.000-04:00', transaction_amount: 100, transaction_details: { total_paid_amount: 100 },
  currency_id: 'ARS', description: 'Producto de panaderia', collector: { id: 9 }, ...o,
})

const CSV = 'DATE,SOURCE_ID,RECORD_TYPE,DESCRIPTION,NET_DEBIT_AMOUNT,CURRENCY,PAYOUT_BANK_ACCOUNT_NUMBER\n' +
  '2026-10-12T20:13:42.000-03:00,555,release,payout,24500.00,ARS,0720000000000000002440\n'

// MP falso: responde según método + ruta; `fallar` hace tirar a payments/search.
function mpFalso({ pagos = [], lista = [], fallar = false } = {}) {
  const llamadas = []
  return {
    llamadas,
    async get(ruta, opts) {
      llamadas.push(['GET', ruta])
      if (ruta.startsWith('/v1/payments/search')) { if (fallar) throw new Error('MP caído'); return { results: pagos } }
      if (ruta === '/v1/account/release_report/config') return { file_name_prefix: 'x' }
      if (ruta === '/v1/account/release_report/list') return lista
      if (ruta.endsWith('.csv')) return CSV
      if (ruta.startsWith('/users/')) return { nickname: 'FEDERICOFRIGOLI' }
      throw new Error(`ruta inesperada ${ruta}`)
    },
    async post(ruta) { llamadas.push(['POST', ruta]); return {} },
    async put(ruta) { llamadas.push(['PUT', ruta]); return {} },
  }
}

const sugerirFijo = async (m) => ({ descripcion: `limpia:${m.descripcion_mp ?? 'transferencia'}`, categoria: 'cat-1' })

test('primera corrida: pagos nuevos por estado, fondeos fuera, pide reporte, sugiere', async () => {
  const db = dbFalsa()
  const mp = mpFalso({ pagos: [
    pago({ id: 1 }),
    pago({ id: 2, status: 'authorized' }),
    pago({ id: 3, operation_type: 'account_fund' }),
    pago({ id: 4, operation_type: 'money_transfer', description: 'Varios', collector: { id: 172750527 } }),
  ] })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.deepEqual(r.errores, [])
  assert.equal(db.movs.get('pay:1').estado, 'pendiente')
  assert.equal(db.movs.get('pay:2').estado, 'esperando')
  assert.ok(!db.movs.has('pay:3'))
  assert.equal(db.contactos.get(`${OWNER}|mp:172750527`).sugerido, 'FEDERICOFRIGOLI')
  assert.equal(db.movs.get('pay:1').categoria_sugerida, 'cat-1')
  assert.equal(db.movs.get('pay:1').descripcion, 'limpia:Producto de panaderia')
  assert.ok(db.sync.get(OWNER).desde)
  assert.ok(db.sync.get(OWNER).reporte_configurado)
  assert.ok(mp.llamadas.some(([m, rta]) => m === 'POST' && rta === '/v1/account/release_report'))
  assert.equal(db.sync.get(OWNER).report_requested_at, new Date(T).toISOString())
})

test('segunda corrida: baja el reporte pedido y guarda payouts', async () => {
  const db = dbFalsa()
  await db.guardarSync(OWNER, { desde: new Date(T - 86400_000).toISOString(), reporte_configurado: true, report_requested_at: new Date(T - 5 * 60_000).toISOString() })
  const mp = mpFalso({ lista: [{ file_name: 'gastos-app-1.csv', date_created: new Date(T - 4 * 60_000).toISOString() }] })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.equal(r.payouts, 1)
  assert.equal(db.movs.get('payout:555').estado, 'pendiente')
  assert.equal(db.contactos.get(`${OWNER}|cbu:0720000000000000002440`).sugerido, 'Santander')
  assert.equal(db.sync.get(OWNER).report_requested_at, null)
  assert.equal(db.sync.get(OWNER).report_downloaded_at, new Date(T).toISOString())
})

test('reaparece anulado → descartado; agregado no se toca', async () => {
  const db = dbFalsa()
  await db.guardarSync(OWNER, { desde: new Date(T - 86400_000).toISOString(), reporte_configurado: true, report_downloaded_at: new Date(T).toISOString() })
  db.movs.set('pay:1', { id: 'pay:1', owner: OWNER, estado: 'pendiente', categoria_sugerida: 'c' })
  db.movs.set('pay:2', { id: 'pay:2', owner: OWNER, estado: 'agregado', gasto_id: 'g', monto: 100 })
  const mp = mpFalso({ pagos: [pago({ id: 1, status: 'refunded' }), pago({ id: 2, transaction_details: { total_paid_amount: 999 } })] })
  await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.equal(db.movs.get('pay:1').estado, 'descartado')
  assert.equal(db.movs.get('pay:1').motivo, 'mp_refunded')
  assert.equal(db.movs.get('pay:2').monto, 100)
})

test('si payments/search falla, el reporte sigue y queda last_error', async () => {
  const db = dbFalsa()
  const mp = mpFalso({ fallar: true })
  const r = await sincronizarCuenta({ cuenta: CUENTA, mp, db, sugerir: sugerirFijo, ahora: T })
  assert.equal(r.errores.length, 1)
  assert.match(r.errores[0], /^pagos: MP caído/)
  assert.ok(mp.llamadas.some(([m, rta]) => m === 'POST' && rta === '/v1/account/release_report'))
  assert.match(db.sync.get(OWNER).last_error, /MP caído/)
})

test('sugerencias: máximo 10 por corrida', async () => {
  const db = dbFalsa()
  const pagos = Array.from({ length: 12 }, (_, i) => pago({ id: 100 + i }))
  let llamadas = 0
  await sincronizarCuenta({ cuenta: CUENTA, mp: mpFalso({ pagos }), db, sugerir: async (m) => { llamadas++; return sugerirFijo(m) }, ahora: T })
  assert.equal(llamadas, 10)
})

test('crearSugeridor: transferencia usa el contacto y no llama a la IA', async () => {
  let ia = 0
  const s = crearSugeridor({ revisar: async () => { ia++; return { descripcion: 'x', categoria: 'y' } }, otros: 'otros' })
  assert.deepEqual(await s({ medio: 'transferencia', contacto: { nombre: 'Mamá', categoria: 'hogar' } }), { descripcion: 'Transferencia a Mamá', categoria: 'hogar' })
  assert.deepEqual(await s({ medio: 'transferencia', contacto: { sugerido: 'Santander' } }), { descripcion: 'Transferencia a Santander', categoria: 'otros' })
  assert.equal(ia, 0)
})

test('crearSugeridor: pago pasa por la IA; si la IA falla, queda el texto de MP en Otros', async () => {
  const ok = crearSugeridor({ revisar: async (d) => ({ descripcion: 'Panadería', categoria: 'comida' }), otros: 'otros' })
  assert.deepEqual(await ok({ medio: 'saldo', descripcion_mp: 'Producto de panaderia' }), { descripcion: 'Panadería', categoria: 'comida' })
  const mal = crearSugeridor({ revisar: async () => { throw new Error('429') }, otros: 'otros' })
  assert.deepEqual(await mal({ medio: 'saldo', descripcion_mp: 'Producto de panaderia' }), { descripcion: 'Producto de panaderia', categoria: 'otros' })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `lib/mp/reporte.js`**

```js
// Release report de Mercado Pago: solo lo usamos para las transferencias a
// CBU/CVU (payouts). Es asincrónico: se pide, MP lo genera (~40 s) y después se
// baja. Para no esperar dentro de un request, va en dos fases: una corrida pide y
// la siguiente (≈15 min después, o al abrir la app) baja.

// Config validada contra la API real (2026-10-13). `frequency` es obligatorio
// aunque no se programe nada (y MP rechaza "daily").
export const CONFIG_REPORTE = {
  file_name_prefix: 'gastos-app',
  columns: [
    'DATE', 'SOURCE_ID', 'EXTERNAL_REFERENCE', 'RECORD_TYPE', 'DESCRIPTION', 'NET_CREDIT_AMOUNT',
    'NET_DEBIT_AMOUNT', 'GROSS_AMOUNT', 'CURRENCY', 'PAYMENT_METHOD', 'PAYMENT_METHOD_TYPE',
    'PAYER_NAME', 'POS_NAME', 'STORE_NAME', 'TRANSACTION_DATE', 'BALANCE_AMOUNT', 'PAYOUT_BANK_ACCOUNT_NUMBER',
  ].map((key) => ({ key })),
  separator: ',',
  display_timezone: 'GMT-03',
  report_translation: 'en',
  include_withdrawal_at_end: false,
  execute_after_withdrawal: false,
  check_available_balance: true,
  compensate_detail: true,
  frequency: { hour: 0, type: 'monthly', value: 1 },
}

const UNA_HORA = 3600_000
const QUINCE_MIN = 15 * 60_000

// 'bajar': hay un pedido reciente → buscar el archivo. 'pedir': no hay pedido (o se
// perdió: >15 min sin archivo) y pasó 1 h desde la última bajada. 'nada': esperar.
export function accionReporte(sync, ahora = Date.now()) {
  const pedido = sync?.report_requested_at ? Date.parse(sync.report_requested_at) : null
  if (pedido && ahora - pedido < QUINCE_MIN) return 'bajar'
  if (pedido) return 'pedir'
  const bajado = sync?.report_downloaded_at ? Date.parse(sync.report_downloaded_at) : 0
  return ahora - bajado >= UNA_HORA ? 'pedir' : 'nada'
}

// Últimos `dias` días, terminando 10 min antes (MP exige end_date ≤ ahora − 5 min).
export function rangoReporte(ahora = Date.now(), dias = 3) {
  const fin = new Date(ahora - 10 * 60_000)
  const ini = new Date(fin.getTime() - dias * 86400_000)
  const f = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')
  return { begin_date: f(ini), end_date: f(fin) }
}

// El .csv más nuevo creado después del pedido (con 1 min de margen de relojes).
export function archivoNuevo(lista, pedidoIso) {
  const desde = Date.parse(pedidoIso) - 60_000
  const candidatos = (lista || []).filter(
    (a) => a?.file_name?.endsWith('.csv') && Date.parse(a.date_created) >= desde,
  )
  candidatos.sort((a, b) => Date.parse(b.date_created) - Date.parse(a.date_created))
  return candidatos[0]?.file_name ?? null
}
```

- [ ] **Step 4: Implement `lib/mp/sync.js`**

```js
import { mapearPago, fusionar } from './mapear.js'
import { parsearReleaseCsv } from './csv.js'
import { bancoDeCuenta } from './bancos.js'
import { isoAR } from './fecha.js'
import { ErrorMp } from './client.js'
import { CONFIG_REPORTE, accionReporte, rangoReporte, archivoNuevo } from './reporte.js'

// Sincronización de UNA cuenta de Mercado Pago. Las dependencias (cliente MP, DB,
// sugeridor de categoría) se inyectan para poder testearla sin red ni Supabase.
// Cada fuente va aislada: si falla una, la otra sigue; los errores se juntan en
// `errores` y quedan en mp_sync.last_error. Nunca tira hacia la UI.
export const PAGOS_DIAS = 7
export const MAX_SUGERENCIAS = 10
const DIA = 86400_000

export async function sincronizarCuenta({ cuenta, mp, db, sugerir, ahora = Date.now() }) {
  const owner = cuenta.owner
  const r = { owner, pagos: 0, payouts: 0, sugeridos: 0, errores: [] }
  let sync = (await db.leerSync(owner)) ?? {}
  // Primera corrida: sin historial viejo (solo desde ayer).
  if (!sync.desde) sync = await db.guardarSync(owner, { desde: new Date(ahora - DIA).toISOString() })

  try {
    r.pagos = await pasoPagos({ cuenta, mp, db, sync, ahora })
  } catch (e) {
    r.errores.push(`pagos: ${e.message}`)
  }
  try {
    r.payouts = await pasoReporte({ owner, mp, db, sync, ahora })
  } catch (e) {
    r.errores.push(`reporte: ${e.message}`)
  }
  try {
    r.sugeridos = await pasoSugerencias({ owner, db, sugerir })
  } catch (e) {
    r.errores.push(`sugerencias: ${e.message}`)
  }

  await db.guardarSync(
    owner,
    r.errores.length
      ? { last_error: r.errores.join(' | '), last_error_at: new Date(ahora).toISOString() }
      : { last_error: null },
  )
  return r
}

// Pagos como pagador de los últimos 7 días (re-lee para ver cambios de estado).
async function pasoPagos({ cuenta, mp, db, sync, ahora }) {
  const desde = Math.max(Date.parse(sync.desde), ahora - PAGOS_DIAS * DIA)
  const q = new URLSearchParams({
    'payer.id': String(cuenta.mp_user_id),
    range: 'date_created',
    begin_date: isoAR(desde),
    end_date: 'NOW',
    sort: 'date_created',
    criteria: 'desc',
    limit: '100',
  })
  const data = await mp.get(`/v1/payments/search?${q}`)
  const filas = (data?.results ?? []).map((p) => mapearPago(p, cuenta.owner)).filter(Boolean)
  const n = await guardarMovimientos({ owner: cuenta.owner, filas, mp, db })
  await db.guardarSync(cuenta.owner, { payments_sync_at: new Date(ahora).toISOString() })
  return n
}

async function pasoReporte({ owner, mp, db, sync, ahora }) {
  if (!sync.reporte_configurado) {
    await configurarReporte(mp)
    await db.guardarSync(owner, { reporte_configurado: true })
  }
  const accion = accionReporte(sync, ahora)
  if (accion === 'pedir') {
    await mp.post('/v1/account/release_report', rangoReporte(ahora))
    await db.guardarSync(owner, { report_requested_at: new Date(ahora).toISOString() })
    return 0
  }
  if (accion !== 'bajar') return 0
  const archivo = archivoNuevo(await mp.get('/v1/account/release_report/list'), sync.report_requested_at)
  if (!archivo) return 0 // todavía no está: se reintenta en la próxima corrida
  const csv = await mp.get(`/v1/account/release_report/${archivo}`, { texto: true })
  const n = await guardarMovimientos({ owner, filas: parsearReleaseCsv(csv, owner), mp, db })
  await db.guardarSync(owner, { report_requested_at: null, report_downloaded_at: new Date(ahora).toISOString() })
  return n
}

// GET → si no existe (404) se crea con POST; si existe, se pisa con PUT.
async function configurarReporte(mp) {
  try {
    await mp.get('/v1/account/release_report/config')
  } catch (e) {
    if (e instanceof ErrorMp && e.status === 404) return mp.post('/v1/account/release_report/config', CONFIG_REPORTE)
    throw e
  }
  return mp.put('/v1/account/release_report/config', CONFIG_REPORTE)
}

// Upsert idempotente aplicando las reglas de estado. Antes asegura los contactos
// (la FK de mp_movimientos los necesita).
async function guardarMovimientos({ owner, filas, mp, db }) {
  if (!filas.length) return 0
  await asegurarContactos({ owner, filas, mp, db })
  const existentes = await db.movimientosPorIds(filas.map((f) => f.id))
  const aGuardar = filas.map((f) => fusionar(existentes.get(f.id), f)).filter(Boolean)
  if (aGuardar.length) await db.upsertMovimientos(aGuardar)
  return aGuardar.length
}

// Contactos nuevos con una sugerencia de nombre: el banco (CBU) o el nickname de MP.
async function asegurarContactos({ owner, filas, mp, db }) {
  const ids = [...new Set(filas.map((f) => f.contacto_id).filter(Boolean))]
  if (!ids.length) return
  const existentes = await db.contactosExistentes(owner, ids)
  const nuevos = []
  for (const id of ids) {
    if (existentes.has(id)) continue
    let sugerido = null
    if (id.startsWith('cbu:')) sugerido = bancoDeCuenta(id.slice(4))
    else {
      try {
        sugerido = (await mp.get(`/users/${id.slice(3)}`))?.nickname ?? null
      } catch {
        sugerido = null // el nickname es solo una ayuda
      }
    }
    nuevos.push({ owner, id, sugerido })
  }
  if (nuevos.length) await db.insertarContactos(nuevos)
}

async function pasoSugerencias({ owner, db, sugerir }) {
  const filas = await db.pendientesSinSugerencia(owner, MAX_SUGERENCIAS)
  for (const f of filas) {
    const s = await sugerir(f)
    await db.actualizarMovimiento(f.id, { descripcion: s.descripcion, categoria_sugerida: s.categoria })
  }
  return filas.length
}

// Descripción + categoría sugeridas para un pendiente.
// - Transferencias: "Transferencia a <nombre>" con la categoría del contacto (la
//   descripción de MP es "Varios", no aporta: no se gasta IA).
// - Pagos: la IA limpia la descripción y elige categoría; si falla, texto de MP en Otros.
export function crearSugeridor({ revisar, otros }) {
  return async (mov) => {
    if (mov.medio === 'transferencia') {
      const quien = mov.contacto?.nombre || mov.contacto?.sugerido || 'cuenta'
      return { descripcion: `Transferencia a ${quien}`, categoria: mov.contacto?.categoria || otros }
    }
    const base = mov.descripcion_mp || 'Pago con Mercado Pago'
    try {
      const r = await revisar(base, otros)
      return { descripcion: r.descripcion || base, categoria: r.categoria || otros }
    } catch {
      return { descripcion: base, categoria: otros }
    }
  }
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `npm test`
Expected: PASS (all suites).

---

### Task 8: Database tables, env config and the DB layer

**Files:**
- Create: `supabase/migrations/20261013120000_mercadopago.sql`, `lib/mp/db.js`
- Modify: `lib/db.js:37` (`function getClient` → `export function getClient`), `lib/env.js` (add `mp`), `.env` (local, by hand)

**Interfaces:**
- Consumes: Supabase client from `lib/db.js`.
- Produces: `dbMp` with the port of Task 7 plus: `listarCuentas()`, `leerCuenta(owner)`, `guardarCuenta(fila)`, `borrarCuenta(owner)`, `leerMovimiento(owner, id)`, `marcar(owner, id, campos, estadoActual = 'pendiente') → fila|null`, `listarPendientes(owner)`, `idsGastoVinculados() → Set<string>`, `guardarContacto(owner, id, campos)`. `config.mp = { clientId, clientSecret, tokenKey, cronSecret, enabled, oauthEnabled }`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/20261013120000_mercadopago.sql`:
```sql
-- Mercado Pago → gastos pendientes de cargar. RLS activado SIN políticas (como
-- gastos/categorias): solo el server con service_role accede.

create table if not exists public.mp_cuentas (
  owner               text primary key,            -- email de login (= gastos.a_nombre_de)
  mp_user_id          bigint not null,
  mp_nickname         text,
  metodo              text not null check (metodo in ('oauth', 'token')),
  access_token_enc    text not null,               -- AES-256-GCM (lib/mp/cripto.js)
  refresh_token_enc   text,                        -- solo oauth
  expira_at           timestamptz,                 -- solo oauth
  necesita_reconectar boolean not null default false,
  conectado_at        timestamptz not null default now()
);

create table if not exists public.mp_sync (
  owner                text primary key references public.mp_cuentas(owner) on delete cascade,
  desde                timestamptz,
  payments_sync_at     timestamptz,
  reporte_configurado  boolean not null default false,
  report_requested_at  timestamptz,
  report_downloaded_at timestamptz,
  last_error           text,
  last_error_at        timestamptz
);

create table if not exists public.mp_contactos (
  owner          text not null,
  id             text not null,                    -- 'mp:<collector_id>' | 'cbu:<22 dígitos>'
  nombre         text,
  sugerido       text,
  categoria      text,
  compartido     boolean,
  actualizado_at timestamptz not null default now(),
  primary key (owner, id)
);

create table if not exists public.mp_movimientos (
  id                 text primary key,             -- 'pay:<id>' | 'payout:<id>'
  owner              text not null,
  fuente             text not null,
  medio              text not null,
  mp_status          text,
  fecha_hora         timestamptz not null,
  fecha              date not null,
  monto              numeric not null,
  moneda             text not null default 'ARS',
  descripcion_mp     text,
  descripcion        text,
  categoria_sugerida text,
  contacto_id        text,
  estado             text not null check (estado in ('esperando', 'pendiente', 'agregado', 'descartado')),
  motivo             text,
  gasto_id           uuid,
  raw                jsonb,
  detectado_at       timestamptz not null default now(),
  actualizado_at     timestamptz not null default now(),
  foreign key (owner, contacto_id) references public.mp_contactos(owner, id)
);

create index if not exists mp_movimientos_owner_estado on public.mp_movimientos (owner, estado);
create index if not exists mp_movimientos_gasto on public.mp_movimientos (gasto_id) where gasto_id is not null;

alter table public.mp_cuentas enable row level security;
alter table public.mp_sync enable row level security;
alter table public.mp_contactos enable row level security;
alter table public.mp_movimientos enable row level security;
```

- [ ] **Step 2: Apply the migration (live change — ask Daniel first)**

Tell Daniel: "Voy a crear 4 tablas nuevas (`mp_cuentas`, `mp_sync`, `mp_contactos`, `mp_movimientos`) en el Supabase `eagnsivzummrzqvzubkv`. No toca tablas existentes. ¿Dale?" After the OK, apply with the Supabase MCP `apply_migration` (name `mercadopago`, the SQL above). If the MCP is not authorized, Daniel pastes the file into the Supabase SQL editor.
Verify: MCP `list_tables` (or SQL `select table_name from information_schema.tables where table_name like 'mp_%'`) shows the 4 tables.

- [ ] **Step 3: Env config**

`lib/env.js`, inside `config`, after `gemini`:
```js
  // Mercado Pago. MP_TOKEN_KEY cifra los tokens de cada persona en la DB; client
  // id/secret son de la app de MP (botón "Conectar con Mercado Pago"); CRON_SECRET
  // autentica al cron que llama a /api/mp/sync.
  mp: {
    clientId: process.env.MP_CLIENT_ID,
    clientSecret: process.env.MP_CLIENT_SECRET,
    tokenKey: process.env.MP_TOKEN_KEY,
    cronSecret: process.env.CRON_SECRET,
    enabled: Boolean(process.env.MP_TOKEN_KEY),
    oauthEnabled: Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET),
  },
```
Local `.env` (Daniel or the agent, without printing values): copy `MP_CLIENT_ID`/`MP_CLIENT_SECRET` from `MP/.env`, generate `MP_TOKEN_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` written straight into the file, remove the obsolete `MP_ACCOUNTS` line. Verify with a SET/EMPTY listing only.

- [ ] **Step 4: Export the Supabase client**

`lib/db.js:37`: change `function getClient() {` to `export function getClient() {`.

- [ ] **Step 5: Write `lib/mp/db.js`**

```js
import 'server-only'
import { getClient } from '../db.js'

// Acceso a las tablas de Mercado Pago. TODA lectura/escritura que viene de la UI
// filtra por `owner` (el email de la sesión): una persona nunca ve ni toca los
// movimientos de la otra.
const db = () => getClient()

function chequear({ data, error }) {
  if (error) throw error
  return data
}

// Pega el contacto (mp_contactos) a cada movimiento: { ...mov, contacto }.
async function adjuntarContactos(owner, filas) {
  const ids = [...new Set(filas.map((f) => f.contacto_id).filter(Boolean))]
  if (!ids.length) return filas.map((f) => ({ ...f, contacto: null }))
  const cs = chequear(await db().from('mp_contactos').select('*').eq('owner', owner).in('id', ids))
  const porId = new Map(cs.map((c) => [c.id, c]))
  return filas.map((f) => ({ ...f, contacto: porId.get(f.contacto_id) ?? null }))
}

const COLS_VISTA =
  'id, owner, fuente, medio, fecha_hora, fecha, monto, moneda, descripcion_mp, descripcion, categoria_sugerida, contacto_id, estado'

export const dbMp = {
  // ---- cuentas ----
  async listarCuentas() {
    return chequear(await db().from('mp_cuentas').select('*'))
  },
  async leerCuenta(owner) {
    return chequear(await db().from('mp_cuentas').select('*').eq('owner', owner).maybeSingle())
  },
  async guardarCuenta(fila) {
    return chequear(await db().from('mp_cuentas').upsert(fila, { onConflict: 'owner' }).select().single())
  },
  async borrarCuenta(owner) {
    chequear(await db().from('mp_cuentas').delete().eq('owner', owner))
  },

  // ---- estado del sync ----
  async leerSync(owner) {
    return chequear(await db().from('mp_sync').select('*').eq('owner', owner).maybeSingle())
  },
  async guardarSync(owner, campos) {
    return chequear(await db().from('mp_sync').upsert({ owner, ...campos }, { onConflict: 'owner' }).select().single())
  },

  // ---- movimientos (sync) ----
  async movimientosPorIds(ids) {
    const filas = chequear(await db().from('mp_movimientos').select('id, estado, motivo').in('id', ids))
    return new Map(filas.map((f) => [f.id, f]))
  },
  async upsertMovimientos(filas) {
    chequear(await db().from('mp_movimientos').upsert(filas, { onConflict: 'id' }))
  },
  async pendientesSinSugerencia(owner, n) {
    const filas = chequear(
      await db().from('mp_movimientos').select(COLS_VISTA)
        .eq('owner', owner).eq('estado', 'pendiente').is('categoria_sugerida', null)
        .order('fecha_hora', { ascending: false }).limit(n),
    )
    return adjuntarContactos(owner, filas)
  },
  async actualizarMovimiento(id, campos) {
    chequear(await db().from('mp_movimientos').update({ ...campos, actualizado_at: new Date().toISOString() }).eq('id', id))
  },

  // ---- movimientos (UI) ----
  async listarPendientes(owner) {
    const filas = chequear(
      await db().from('mp_movimientos').select(COLS_VISTA)
        .eq('owner', owner).eq('estado', 'pendiente').order('fecha_hora', { ascending: false }),
    )
    return adjuntarContactos(owner, filas)
  },
  async leerMovimiento(owner, id) {
    return chequear(await db().from('mp_movimientos').select(COLS_VISTA).eq('owner', owner).eq('id', id).maybeSingle())
  },
  // Cambia el estado SOLO si la fila es de `owner` y está en `estadoActual`
  // (evita doble proceso). Devuelve la fila actualizada o null.
  async marcar(owner, id, campos, estadoActual = 'pendiente') {
    const filas = chequear(
      await db().from('mp_movimientos')
        .update({ ...campos, actualizado_at: new Date().toISOString() })
        .eq('owner', owner).eq('id', id).eq('estado', estadoActual).select('id'),
    )
    return filas[0] ?? null
  },
  async idsGastoVinculados() {
    const filas = chequear(await db().from('mp_movimientos').select('gasto_id').not('gasto_id', 'is', null))
    return new Set(filas.map((f) => f.gasto_id))
  },

  // ---- contactos ----
  async contactosExistentes(owner, ids) {
    const filas = chequear(await db().from('mp_contactos').select('id').eq('owner', owner).in('id', ids))
    return new Set(filas.map((f) => f.id))
  },
  async insertarContactos(filas) {
    chequear(await db().from('mp_contactos').upsert(filas, { onConflict: 'owner,id', ignoreDuplicates: true }))
  },
  async guardarContacto(owner, id, campos) {
    const limpios = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined))
    chequear(
      await db().from('mp_contactos')
        .upsert({ owner, id, ...limpios, actualizado_at: new Date().toISOString() }, { onConflict: 'owner,id' }),
    )
  },
}
```

- [ ] **Step 6: Verify**

Run: `npm test` → PASS (nothing changed in pure modules).
Run: `npm run build` → compiles (no route imports `lib/mp/db.js` yet, so this only checks `env.js`/`db.js`).

---

### Task 9: Accounts, sync runner and connection routes

**Files:**
- Create: `lib/mp/cuentas.js`, `lib/mp/ejecutar.js`, `app/api/mp/sync/route.js`, `app/api/mp/cuenta/route.js`, `app/api/mp/token/route.js`, `app/api/mp/conectar/route.js`, `app/api/mp/callback/route.js`
- Modify: `middleware.js:17`

**Interfaces:**
- Consumes: `cifrar`/`descifrar` (Task 2), `crearClienteMp`/`pedirTokenOauth` (Task 6), `sincronizarCuenta`/`crearSugeridor` (Task 7), `dbMp` (Task 8), `revisarGasto`/`iaEnabled` (`lib/ia.js`), `recargarCategorias`/`otrosId` (`lib/categorias.js`), `normalizarPersona` (`lib/personas.js`), `getUser`/`getSession` (`lib/session.js`).
- Produces: `ownerDe(user) → string`, `conectarConToken(owner, token)`, `conectarConCodigo(owner, code, redirectUri)`, `desconectar(owner)`, `clienteParaCuenta(cuenta, ahora?)`, `ejecutarSync({ owner?, respetarPausa? }) → resultados[]`. HTTP: `POST /api/mp/sync`, `GET|DELETE /api/mp/cuenta`, `POST /api/mp/token`, `GET /api/mp/conectar`, `GET /api/mp/callback`.

- [ ] **Step 1: `lib/mp/cuentas.js`**

```js
import 'server-only'
import { config } from '../env.js'
import { normalizarPersona } from '../personas.js'
import { cifrar, descifrar } from './cripto.js'
import { crearClienteMp, pedirTokenOauth } from './client.js'
import { dbMp } from './db.js'

const SIETE_DIAS = 7 * 86400_000

// Dueño de las filas de MP = email canónico del usuario logueado.
export function ownerDe(user) {
  return normalizarPersona(user?.email) ?? String(user?.email || '').toLowerCase()
}

function errorConCodigo(mensaje, code) {
  return Object.assign(new Error(mensaje), { code })
}

// Valida un token contra MP (/users/me). Rechaza los de prueba (TEST-…).
async function perfil(token) {
  if (token.startsWith('TEST-')) throw errorConCodigo('Es un token de prueba: usá el de producción (APP_USR-…)', 'token-prueba')
  try {
    return await crearClienteMp(token).get('/users/me')
  } catch {
    throw errorConCodigo('Mercado Pago rechazó el token', 'token-invalido')
  }
}

export async function conectarConToken(owner, tokenCrudo) {
  const token = String(tokenCrudo || '').trim()
  if (!token) throw errorConCodigo('Pegá un Access Token', 'token-vacio')
  const me = await perfil(token)
  return dbMp.guardarCuenta({
    owner,
    mp_user_id: me.id,
    mp_nickname: me.nickname ?? null,
    metodo: 'token',
    access_token_enc: cifrar(token, config.mp.tokenKey),
    refresh_token_enc: null,
    expira_at: null,
    necesita_reconectar: false,
    conectado_at: new Date().toISOString(),
  })
}

function filaOauth(owner, me, t) {
  return {
    owner,
    mp_user_id: me.id,
    mp_nickname: me.nickname ?? null,
    metodo: 'oauth',
    access_token_enc: cifrar(t.access_token, config.mp.tokenKey),
    refresh_token_enc: cifrar(t.refresh_token, config.mp.tokenKey),
    expira_at: new Date(Date.now() + Number(t.expires_in) * 1000).toISOString(),
    necesita_reconectar: false,
  }
}

export async function conectarConCodigo(owner, code, redirectUri) {
  const t = await pedirTokenOauth({
    client_id: config.mp.clientId,
    client_secret: config.mp.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  const me = await perfil(t.access_token)
  return dbMp.guardarCuenta({ ...filaOauth(owner, me, t), conectado_at: new Date().toISOString() })
}

export async function desconectar(owner) {
  await dbMp.borrarCuenta(owner)
}

// Cliente MP de la cuenta, renovando el token OAuth si vence en < 7 días. MP rota el
// refresh token en cada uso: se guardan los dos nuevos. Si la renovación falla y el
// token todavía no venció, se sigue con el actual y se marca para reconectar.
export async function clienteParaCuenta(cuenta, ahora = Date.now()) {
  const key = config.mp.tokenKey
  let token = descifrar(cuenta.access_token_enc, key)
  const vence = cuenta.expira_at ? Date.parse(cuenta.expira_at) : null
  if (cuenta.metodo === 'oauth' && vence && vence - ahora < SIETE_DIAS) {
    try {
      const t = await pedirTokenOauth({
        client_id: config.mp.clientId,
        client_secret: config.mp.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: descifrar(cuenta.refresh_token_enc, key),
      })
      await dbMp.guardarCuenta({ ...cuenta, ...filaOauth(cuenta.owner, { id: cuenta.mp_user_id, nickname: cuenta.mp_nickname }, t) })
      token = t.access_token
    } catch (e) {
      await dbMp.guardarCuenta({ ...cuenta, necesita_reconectar: true })
      if (vence <= ahora) throw new Error('El acceso a Mercado Pago venció: reconectá la cuenta')
      console.warn('[mp] no se pudo renovar el token de', cuenta.owner, e.message)
    }
  }
  return crearClienteMp(token)
}
```

- [ ] **Step 2: `lib/mp/ejecutar.js`**

```js
import 'server-only'
import { iaEnabled, revisarGasto } from '../ia.js'
import { recargarCategorias, otrosId } from '../categorias.js'
import { dbMp } from './db.js'
import { clienteParaCuenta } from './cuentas.js'
import { sincronizarCuenta, crearSugeridor } from './sync.js'

const PAUSA_SESION = 5 * 60_000

// Corre el sync para todas las cuentas conectadas (cron) o solo para `owner`
// (al abrir la app; con `respetarPausa` se saltea si sincronizó hace < 5 min).
// Cada cuenta aislada: un error queda en su mp_sync.last_error y se sigue.
export async function ejecutarSync({ owner = null, respetarPausa = false } = {}) {
  const cuentas = owner ? [await dbMp.leerCuenta(owner)].filter(Boolean) : await dbMp.listarCuentas()
  if (!cuentas.length) return []
  await recargarCategorias()
  const otros = otrosId()
  const sugerir = crearSugeridor({
    revisar: (desc, cat) => (iaEnabled ? revisarGasto(desc, cat) : Promise.reject(new Error('IA no configurada'))),
    otros,
  })
  const resultados = []
  for (const cuenta of cuentas) {
    try {
      if (respetarPausa) {
        const s = await dbMp.leerSync(cuenta.owner)
        if (s?.payments_sync_at && Date.now() - Date.parse(s.payments_sync_at) < PAUSA_SESION) {
          resultados.push({ owner: cuenta.owner, salteado: true })
          continue
        }
      }
      const mp = await clienteParaCuenta(cuenta)
      resultados.push(await sincronizarCuenta({ cuenta, mp, db: dbMp, sugerir }))
    } catch (e) {
      console.error('[mp sync]', cuenta.owner, e.message)
      await dbMp.guardarSync(cuenta.owner, { last_error: e.message, last_error_at: new Date().toISOString() }).catch(() => {})
      resultados.push({ owner: cuenta.owner, errores: [e.message] })
    }
  }
  return resultados
}
```

- [ ] **Step 3: Middleware**

`middleware.js:17`, change the condition to:
```js
  if (pathname.startsWith('/api/') && pathname !== '/api/me' && pathname !== '/api/mp/sync') {
```
and update the comment above it: `// API privada sin cookie -> 401. (Excluye /api/me, que maneja su propio 401; /api/mp/sync, que llama el cron con CRON_SECRET; y /api/auth/*.)`

- [ ] **Step 4: `app/api/mp/sync/route.js`**

```js
import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getUser } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { ownerDe } from '../../../../lib/mp/cuentas.js'
import { ejecutarSync } from '../../../../lib/mp/ejecutar.js'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// El cron (pg_cron en Supabase) manda "Authorization: Bearer <CRON_SECRET>".
function esCron(request) {
  const secreto = config.mp.cronSecret
  if (!secreto) return false
  const recibido = Buffer.from(request.headers.get('authorization') || '')
  const esperado = Buffer.from(`Bearer ${secreto}`)
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado)
}

// POST /api/mp/sync — cron: todas las cuentas. Sesión: solo la propia, con pausa
// de 5 min (lo llama /inicio al abrir). Nunca devuelve 500: los errores quedan en
// mp_sync.last_error.
export async function POST(request) {
  if (!config.mp.enabled) return NextResponse.json({ ok: false, error: 'mp-deshabilitado' })
  try {
    if (esCron(request)) return NextResponse.json({ ok: true, resultados: await ejecutarSync() })
    const user = await getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const resultados = await ejecutarSync({ owner: ownerDe(user), respetarPausa: true })
    return NextResponse.json({ ok: true, resultados })
  } catch (err) {
    console.error('[api/mp/sync]', err.message)
    return NextResponse.json({ ok: false, error: 'sync-fallo' })
  }
}
```

- [ ] **Step 5: `app/api/mp/cuenta/route.js`**

```js
import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { dbMp } from '../../../../lib/mp/db.js'
import { ownerDe, desconectar } from '../../../../lib/mp/cuentas.js'

export const dynamic = 'force-dynamic'

// GET /api/mp/cuenta — estado de la conexión del usuario. Nunca devuelve tokens.
export async function GET() {
  try {
    const owner = ownerDe(await requireUserApi())
    const [c, s] = await Promise.all([dbMp.leerCuenta(owner), dbMp.leerSync(owner)])
    return NextResponse.json({
      habilitado: config.mp.enabled,
      oauthDisponible: config.mp.oauthEnabled,
      cuenta: c && {
        mp_nickname: c.mp_nickname,
        metodo: c.metodo,
        conectado_at: c.conectado_at,
        necesita_reconectar: c.necesita_reconectar,
      },
      sync: s && {
        payments_sync_at: s.payments_sync_at,
        report_downloaded_at: s.report_downloaded_at,
        last_error: s.last_error,
        last_error_at: s.last_error_at,
      },
    })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/cuenta GET]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}

// DELETE /api/mp/cuenta — desconecta (borra tokens; movimientos y contactos quedan).
export async function DELETE() {
  try {
    await desconectar(ownerDe(await requireUserApi()))
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/cuenta DELETE]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
```

- [ ] **Step 6: `app/api/mp/token/route.js`**

```js
import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { ownerDe, conectarConToken } from '../../../../lib/mp/cuentas.js'

// POST /api/mp/token { token } — conectar pegando un Access Token (plan B del OAuth).
export async function POST(request) {
  try {
    const owner = ownerDe(await requireUserApi())
    if (!config.mp.enabled) return NextResponse.json({ error: 'Mercado Pago no está configurado' }, { status: 503 })
    const { token } = await request.json()
    const c = await conectarConToken(owner, token)
    return NextResponse.json({ ok: true, mp_nickname: c.mp_nickname })
  } catch (err) {
    if (err.code) return NextResponse.json({ error: err.message, code: err.code }, { status: 400 })
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/token]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
```

- [ ] **Step 7: `app/api/mp/conectar/route.js` and `app/api/mp/callback/route.js`**

`app/api/mp/conectar/route.js`:
```js
import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getSession } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'

// GET /api/mp/conectar — arranca el OAuth: guarda un `state` aleatorio en la sesión
// y manda a la pantalla de autorización de Mercado Pago.
export async function GET(request) {
  const origin = new URL(request.url).origin
  const session = await getSession()
  if (!session.user) return NextResponse.redirect(`${origin}/`)
  if (!config.mp.oauthEnabled || !config.mp.enabled) return NextResponse.redirect(`${origin}/config/mp?error=oauth-no-disponible`)
  const state = randomBytes(24).toString('base64url')
  session.mpState = state
  await session.save()
  const q = new URLSearchParams({
    client_id: config.mp.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: `${origin}/api/mp/callback`,
  })
  return NextResponse.redirect(`https://auth.mercadopago.com/authorization?${q}`)
}
```

`app/api/mp/callback/route.js`:
```js
import { NextResponse } from 'next/server'
import { getSession } from '../../../../lib/session.js'
import { ownerDe, conectarConCodigo } from '../../../../lib/mp/cuentas.js'

// GET /api/mp/callback?code&state — MP vuelve acá después de autorizar.
export async function GET(request) {
  const url = new URL(request.url)
  const origin = url.origin
  const session = await getSession()
  if (!session.user) return NextResponse.redirect(`${origin}/`)
  const esperado = session.mpState
  delete session.mpState
  await session.save()

  const code = url.searchParams.get('code')
  if (!code || !esperado || url.searchParams.get('state') !== esperado) {
    return NextResponse.redirect(`${origin}/config/mp?error=autorizacion`)
  }
  try {
    await conectarConCodigo(ownerDe(session.user), code, `${origin}/api/mp/callback`)
    return NextResponse.redirect(`${origin}/config/mp?ok=1`)
  } catch (err) {
    console.error('[api/mp/callback]', err.message)
    return NextResponse.redirect(`${origin}/config/mp?error=canje`)
  }
}
```

- [ ] **Step 8: Verify (local, live DB writes only to `mp_*` — tell Daniel before running)**

1. `npm test` → PASS; `npm run build` → OK.
2. Start `next dev` (preview tool or `npm run dev`), log in with Google at `http://localhost:3000` (Daniel logs in himself; `http://localhost:3000/auth/google/callback` must be an authorized redirect URI in Google Cloud).
3. In the browser devtools console (logged in): `await (await fetch('/api/mp/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'TEST-1'})})).json()` → `{ code: 'token-prueba' }` (400).
4. Connect with the real token **without printing it**: a one-off Node script reads `MP_OAUTH_ACCESS_TOKEN` from `MP/.env` and POSTs it to `/api/mp/token` with Daniel's session cookie copied from the browser — or Daniel pastes it into `/config/mp` once Task 11 exists (preferred; then do this step after Task 11).
5. `curl -s -X POST http://localhost:3000/api/mp/sync -H "Authorization: Bearer <CRON_SECRET from .env>"` (built by a script that reads `.env`, not typed) → `{ ok: true, resultados: [{ owner, pagos: N, payouts: 0, errores: [] }] }`; second call ~1 min later → payouts > 0 or `0` with the report requested.
6. `curl -s -X POST http://localhost:3000/api/mp/sync` without auth → 401 (cookie-less, cron secret absent).
7. Supabase: `select estado, count(*) from mp_movimientos group by 1` → rows `pendiente`/`esperando`; `select owner, last_error from mp_sync` → `last_error` null.
8. Failure isolation: temporarily set the account's `access_token_enc` to `cifrar('APP_USR-invalido')` via a script → sync returns `errores` for that account, HTTP 200, `/inicio` still loads. Restore by reconnecting.

---

### Task 10: Pendings API and adding from MP

**Files:**
- Create: `app/api/mp/pendientes/route.js`, `app/api/mp/[id]/descartar/route.js`, `app/api/mp/[id]/vincular/route.js`
- Modify: `app/api/gastos/route.js` (POST)

**Interfaces:**
- Consumes: `dbMp` (Task 8), `ownerDe` (Task 9), `buscarDuplicado` (Task 5), `listarGastos`/`obtenerGasto` (`lib/db.js`).
- Produces:
  - `GET /api/mp/pendientes → { conectado: boolean, necesitaReconectar: boolean, pendientes: Array<{ id, medio, fecha, fecha_hora, monto, moneda, descripcion, descripcion_mp, categoria_sugerida, contacto: {id, nombre, sugerido, categoria, compartido}|null, duplicado: {id, descripcion, monto, moneda, fecha}|null }> }`
  - `POST /api/mp/:id/descartar { deshacer?: boolean } → { ok }` | 404
  - `POST /api/mp/:id/vincular { gasto_id } → { ok }` | 404
  - `POST /api/gastos` accepts `mp_id`, `mp_contacto_nombre`; 409 `{ error: 'Ese movimiento ya se procesó' }` if not pending.

- [ ] **Step 1: `app/api/mp/pendientes/route.js`**

```js
import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { listarGastos } from '../../../../lib/db.js'
import { dbMp } from '../../../../lib/mp/db.js'
import { ownerDe } from '../../../../lib/mp/cuentas.js'
import { buscarDuplicado } from '../../../../lib/mp/duplicados.js'

export const dynamic = 'force-dynamic'

// GET /api/mp/pendientes — movimientos de MP del usuario que todavía no cargó,
// cada uno con su contacto y un posible gasto ya cargado ("¿Ya lo cargaste?").
export async function GET() {
  try {
    const owner = ownerDe(await requireUserApi())
    const cuenta = await dbMp.leerCuenta(owner)
    if (!cuenta) return NextResponse.json({ conectado: false, necesitaReconectar: false, pendientes: [] })
    const [pend, gastos, vinculados] = await Promise.all([
      dbMp.listarPendientes(owner),
      listarGastos(),
      dbMp.idsGastoVinculados(),
    ])
    const pendientes = pend.map((m) => {
      const d = buscarDuplicado(m, gastos, vinculados)
      return {
        ...m,
        duplicado: d && { id: d.id, descripcion: d.descripcion, monto: d.monto, moneda: d.moneda, fecha: d.fecha },
      }
    })
    return NextResponse.json({ conectado: true, necesitaReconectar: cuenta.necesita_reconectar, pendientes })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/pendientes]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
```

- [ ] **Step 2: `app/api/mp/[id]/descartar/route.js`**

```js
import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { dbMp } from '../../../../../lib/mp/db.js'
import { ownerDe } from '../../../../../lib/mp/cuentas.js'

// POST /api/mp/:id/descartar { deshacer? } — descartar un pendiente, o deshacer
// un descarte propio (vuelve a pendiente). Solo sobre movimientos del usuario.
export async function POST(request, { params }) {
  try {
    const owner = ownerDe(await requireUserApi())
    const id = decodeURIComponent((await params).id)
    const { deshacer } = await request.json().catch(() => ({}))
    const r = deshacer
      ? await dbMp.marcar(owner, id, { estado: 'pendiente', motivo: null }, 'descartado')
      : await dbMp.marcar(owner, id, { estado: 'descartado', motivo: 'usuario' })
    if (!r) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/descartar]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
```

- [ ] **Step 3: `app/api/mp/[id]/vincular/route.js`**

```js
import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { obtenerGasto } from '../../../../../lib/db.js'
import { dbMp } from '../../../../../lib/mp/db.js'
import { ownerDe } from '../../../../../lib/mp/cuentas.js'

// POST /api/mp/:id/vincular { gasto_id } — "Es este": el movimiento ya estaba
// cargado como ese gasto. Se marca agregado y se guarda el vínculo.
export async function POST(request, { params }) {
  try {
    const owner = ownerDe(await requireUserApi())
    const id = decodeURIComponent((await params).id)
    const { gasto_id } = await request.json()
    const gasto = gasto_id ? await obtenerGasto(null, gasto_id) : null
    if (!gasto || gasto.eliminado) return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 })
    if ((await dbMp.idsGastoVinculados()).has(gasto_id)) {
      return NextResponse.json({ error: 'Ese gasto ya está vinculado a otro movimiento' }, { status: 409 })
    }
    const r = await dbMp.marcar(owner, id, { estado: 'agregado', motivo: 'vinculado', gasto_id })
    if (!r) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/vincular]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
```

- [ ] **Step 4: `POST /api/gastos` with `mp_id`**

In `app/api/gastos/route.js` add imports:
```js
import { dbMp } from '../../../lib/mp/db.js'
import { ownerDe } from '../../../lib/mp/cuentas.js'
```
Update the header comment of `POST` to mention `mp_id, mp_contacto_nombre`. Inside `POST`, right after the 400 validation and before `const rate = …`:
```js
    // Alta desde un pendiente de Mercado Pago: tiene que ser del usuario y seguir
    // pendiente (evita duplicar ante doble tap).
    const owner = ownerDe(user)
    const mov = body.mp_id ? await dbMp.leerMovimiento(owner, String(body.mp_id)) : null
    if (body.mp_id && mov?.estado !== 'pendiente') {
      return NextResponse.json({ error: 'Ese movimiento ya se procesó' }, { status: 409 })
    }
```
Replace `const nuevo = await crearGasto(user.id, user.displayName, datos)` + the return with:
```js
    const nuevo = await crearGasto(user.id, user.displayName, datos)
    if (mov) {
      // El gasto ya existe: si marcar falla no se rompe el alta; el próximo listado
      // lo ofrece como "¿Ya lo cargaste?" y se vincula con un toque.
      try {
        await dbMp.marcar(owner, mov.id, { estado: 'agregado', motivo: null, gasto_id: nuevo.id })
        if (mov.contacto_id) {
          const nombre = String(body.mp_contacto_nombre ?? '').trim()
          await dbMp.guardarContacto(owner, mov.contacto_id, {
            nombre: nombre || undefined,
            categoria: datos.categoria,
            compartido: datos.compartido,
          })
        }
      } catch (e) {
        console.error('[api/gastos POST] marcar mp', e.message)
      }
    }
    return NextResponse.json({ ok: true, gasto: nuevo })
```

- [ ] **Step 5: Verify (local, with Daniel's OK — creates one real expense he can delete)**

1. `npm run build` → OK.
2. Logged in, devtools: `await (await fetch('/api/mp/pendientes')).json()` → `conectado: true`, `pendientes` with `contacto` on transfers and `duplicado` where an expense matches.
3. Discard + undo: POST `/api/mp/<encodeURIComponent(id)>/descartar` → `{ok:true}`; again with `{deshacer:true}` → back in the list.
4. Double add: POST `/api/gastos` twice with the same `mp_id` → first `ok`, second **409**; only one expense exists; the movement is `agregado` with `gasto_id`.
5. Owner isolation: with a made-up id `pay:999` → 404 on descartar/vincular; with Dani Mujer's session (if available) on Daniel's id → 404.

---

### Task 11: Client hooks and the connect screen

**Files:**
- Modify: `lib/api.js`, `app/(app)/config/page.jsx`, `app/legacy.css`
- Create: `app/(app)/config/mp/page.jsx`

**Interfaces:**
- Consumes: Task 9/10 endpoints.
- Produces (in `lib/api.js`): `useMpPendientes()`, `useMpCuenta()`, `useSyncMpAlAbrir()`, `useDescartarMp()` (`mutate({ id, deshacer? })`), `useVincularMp()` (`mutate({ id, gasto_id })`), `useConectarMpToken()` (`mutateAsync(token)`), `useDesconectarMp()`. `useCrearGasto` also invalidates `['mp-pendientes']`.

- [ ] **Step 1: Hooks in `lib/api.js`**

Change the first import to:
```js
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
```
In `useCrearGasto`, change `useInvalidate(['gastos'])` to `useInvalidate(['gastos', 'mp-pendientes'])`.
Append at the end of the queries section:
```js
// ---- Mercado Pago ----
export function useMpPendientes() {
  return useQuery({ queryKey: ['mp-pendientes'], queryFn: () => req('/api/mp/pendientes'), staleTime: 60_000 })
}

export function useMpCuenta() {
  return useQuery({ queryKey: ['mp-cuenta'], queryFn: () => req('/api/mp/cuenta'), retry: false })
}

// Al abrir /inicio: sincroniza con MP (el server se saltea si fue hace < 5 min) y
// refresca los pendientes. Silencioso: si falla, se ve lo que ya había.
export function useSyncMpAlAbrir() {
  const qc = useQueryClient()
  useEffect(() => {
    req('/api/mp/sync', { method: 'POST' })
      .then(() => qc.invalidateQueries({ queryKey: ['mp-pendientes'] }))
      .catch(() => {})
  }, [qc])
}
```
Append at the end of the mutations section:
```js
const urlMov = (id) => `/api/mp/${encodeURIComponent(id)}`

export function useDescartarMp() {
  const inval = useInvalidate(['mp-pendientes'])
  return useMutation({
    mutationFn: ({ id, deshacer }) =>
      req(`${urlMov(id)}/descartar`, { method: 'POST', body: JSON.stringify({ deshacer: !!deshacer }) }),
    onSuccess: inval,
  })
}

export function useVincularMp() {
  const inval = useInvalidate(['mp-pendientes', 'gastos'])
  return useMutation({
    mutationFn: ({ id, gasto_id }) =>
      req(`${urlMov(id)}/vincular`, { method: 'POST', body: JSON.stringify({ gasto_id }) }),
    onSuccess: inval,
  })
}

export function useConectarMpToken() {
  const inval = useInvalidate(['mp-cuenta', 'mp-pendientes'])
  return useMutation({
    mutationFn: (token) => req('/api/mp/token', { method: 'POST', body: JSON.stringify({ token }) }),
    onSuccess: inval,
  })
}

export function useDesconectarMp() {
  const inval = useInvalidate(['mp-cuenta', 'mp-pendientes'])
  return useMutation({ mutationFn: () => req('/api/mp/cuenta', { method: 'DELETE' }), onSuccess: inval })
}
```

- [ ] **Step 2: Menu item in `app/(app)/config/page.jsx`**

After the "Estado de la IA" `<Link>`:
```jsx
          <Link className="cfg-menu-item" href="/config/mp">
            <span className="cfg-menu-ico">🟦</span>
            <span className="cfg-menu-txt">
              <span className="cfg-menu-name">Mercado Pago</span>
              <span className="cfg-menu-sub">Conectá tu cuenta para ver lo que pagaste y no cargaste</span>
            </span>
            <span className="cfg-menu-arrow">›</span>
          </Link>
```

- [ ] **Step 3: `app/(app)/config/mp/page.jsx`**

```jsx
'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import AppShell from '../../../../components/AppShell.jsx'
import LoadingDots from '../../../../components/LoadingDots.jsx'
import { useToast } from '../../../../components/Toasts.jsx'
import { useMpCuenta, useConectarMpToken, useDesconectarMp } from '../../../../lib/api.js'

const ERRORES = {
  autorizacion: 'Mercado Pago no confirmó la autorización. Probá de nuevo.',
  canje: 'No se pudo completar la conexión con Mercado Pago.',
  'oauth-no-disponible': 'La conexión con el botón no está configurada; pegá un Access Token.',
}

const fmtFecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// Configuración → Mercado Pago. Cada persona conecta SU cuenta: con el botón
// (OAuth) o pegando un Access Token. El token nunca vuelve al navegador.
export default function ConfigMpPage() {
  const { data, isLoading } = useMpCuenta()
  const conectar = useConectarMpToken()
  const desconectar = useDesconectarMp()
  const toast = useToast()
  const [token, setToken] = useState('')

  // Resultado del OAuth (?ok=1 / ?error=...). Sin useSearchParams para no exigir Suspense.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('ok')) toast('success', 'Mercado Pago conectado ✓')
    const e = q.get('error')
    if (e) toast('error', ERRORES[e] || 'No se pudo conectar')
    if (q.toString()) window.history.replaceState(null, '', '/config/mp')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onPegar(e) {
    e.preventDefault()
    try {
      const r = await conectar.mutateAsync(token)
      setToken('')
      toast('success', `Conectado como ${r.mp_nickname} ✓`)
    } catch (err) {
      toast('error', err.message || 'No se pudo conectar')
    }
  }

  async function onDesconectar() {
    if (!confirm('¿Desconectar Mercado Pago? Dejás de ver los pendientes nuevos.')) return
    try {
      await desconectar.mutateAsync()
      toast('success', 'Mercado Pago desconectado')
    } catch (err) {
      toast('error', err.message || 'No se pudo desconectar')
    }
  }

  const cuenta = data?.cuenta
  const sync = data?.sync

  return (
    <AppShell pageClass="page-config">
      <div className="config">
        <Link className="cfg-back" href="/config">‹ Configuración</Link>
        <h1>Mercado Pago</h1>
        <p className="cfg-intro">La app revisa tus pagos y transferencias de Mercado Pago y te muestra los que todavía no cargaste.</p>

        {isLoading ? (
          <LoadingDots label="Cargando…" />
        ) : !data?.habilitado ? (
          <section className="cfg-card"><p className="ia-error">Mercado Pago no está configurado en el servidor.</p></section>
        ) : cuenta ? (
          <section className="cfg-card">
            <div className="cfg-card-title">Conectado como {cuenta.mp_nickname || 'tu cuenta'}</div>
            <ul className="mp-cfg-datos">
              <li>Desde {fmtFecha(cuenta.conectado_at)} · {cuenta.metodo === 'oauth' ? 'con Mercado Pago' : 'con Access Token'}</li>
              <li>Última revisión de pagos: {fmtFecha(sync?.payments_sync_at)}</li>
              <li>Última revisión de transferencias: {fmtFecha(sync?.report_downloaded_at)}</li>
            </ul>
            {cuenta.necesita_reconectar && <p className="ia-error">Hay que volver a conectar la cuenta.</p>}
            {sync?.last_error && <p className="ia-error">Último error ({fmtFecha(sync.last_error_at)}): {sync.last_error}</p>}
            <div className="mp-cfg-acciones">
              {cuenta.necesita_reconectar && data.oauthDisponible && (
                <a className="btn-save" href="/api/mp/conectar">Reconectar</a>
              )}
              <button type="button" className="btn-ghost" onClick={onDesconectar} disabled={desconectar.isPending}>
                Desconectar
              </button>
            </div>
          </section>
        ) : (
          <section className="cfg-card">
            {data.oauthDisponible && (
              <a className="btn-save mp-cfg-conectar" href="/api/mp/conectar">Conectar con Mercado Pago</a>
            )}
            <form className="mp-cfg-token" onSubmit={onPegar}>
              <label htmlFor="mp-token">{data.oauthDisponible ? 'O pegá un Access Token de producción' : 'Pegá un Access Token de producción'}</label>
              <input
                id="mp-token"
                className="inp"
                type="password"
                autoComplete="off"
                placeholder="APP_USR-…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button type="submit" className="btn-ghost" disabled={!token.trim() || conectar.isPending}>Guardar</button>
            </form>
          </section>
        )}
      </div>
    </AppShell>
  )
}
```

- [ ] **Step 4: Styles** — append to `app/legacy.css`:

```css
/* ---- Mercado Pago: configuración ---- */
.mp-cfg-datos { margin:0 0 12px; padding-left:18px; color:var(--ink-soft); font-size:14px; line-height:1.6; }
.mp-cfg-acciones { display:flex; gap:10px; }
.mp-cfg-conectar { display:block; margin-bottom:16px; text-decoration:none; }
.mp-cfg-token { display:flex; flex-direction:column; gap:8px; }
.mp-cfg-token label { font-size:14px; color:var(--ink-soft); }
```

- [ ] **Step 5: Verify in the browser (local)**

`npm run build` → OK. In `next dev`, logged in:
1. `/config` shows the "Mercado Pago" item; `/config/mp` shows the connect card.
2. Paste `TEST-123` → toast "Es un token de prueba…".
3. Daniel pastes his production token (from `MP/.env`, `MP_ACCESS_TOKEN` or `MP_OAUTH_ACCESS_TOKEN`) → "Conectado como ARKHAND1990 ✓"; the card shows dates. (OAuth button: only testable in production, Task 13 — the registered redirect URL is the production one.)
4. Desconectar → back to the connect card; reconnect afterwards.
5. Screenshot both states.

---

### Task 12: Pendings card in /inicio and the MP-aware sheet

**Files:**
- Create: `components/MpPendientes.jsx`
- Modify: `components/Sheet.jsx`, `app/(app)/inicio/InicioClient.jsx`, `app/legacy.css`

**Interfaces:**
- Consumes: hooks from Task 11, `detalleContacto` (Task 1), `fmtMonto` (`lib/calculos.js`), `useToast`.
- Produces: `<MpPendientes onAgregar={(mov) => void} />`; `<Sheet mp={mov|null} … />` — when `mp` is set, the sheet sends `mp_id` (+ `mp_contacto_nombre` for transfers) and, for transfers, shows a required "¿A quién le transferiste?" field pre-filled with the saved name (editable).

- [ ] **Step 1: `components/MpPendientes.jsx`**

```jsx
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useMpPendientes, useDescartarMp, useVincularMp } from '../lib/api.js'
import { fmtMonto } from '../lib/calculos.js'
import { detalleContacto } from '../lib/mp/vista.js'
import { useToast } from './Toasts.jsx'

const CHIP = { tarjeta: '💳 tarjeta', transferencia: '↗ transferencia' }
const ddmm = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`

// Tarjeta "Mercado Pago · N sin cargar" en /inicio. Solo aparece si hay pendientes
// (o si hay que reconectar la cuenta). Agregar abre la hoja precargada.
export default function MpPendientes({ onAgregar }) {
  const { data } = useMpPendientes()
  const descartar = useDescartarMp()
  const vincular = useVincularMp()
  const toast = useToast()
  const [abierta, setAbierta] = useState(false)

  if (data?.necesitaReconectar) {
    return (
      <Link className="mp-card mp-card-aviso" href="/config/mp">
        🟦 Mercado Pago necesita que vuelvas a conectar tu cuenta ›
      </Link>
    )
  }
  const lista = data?.pendientes ?? []
  if (!lista.length) return null

  function onDescartar(m) {
    descartar.mutate(
      { id: m.id },
      {
        onSuccess: () =>
          toast('success', 'Descartado', { label: 'Deshacer', onClick: () => descartar.mutate({ id: m.id, deshacer: true }) }),
        onError: (e) => toast('error', e.message || 'No se pudo descartar'),
      },
    )
  }

  function onEsEste(m) {
    vincular.mutate(
      { id: m.id, gasto_id: m.duplicado.id },
      {
        onSuccess: () => toast('success', 'Listo, quedó vinculado ✓'),
        onError: (e) => toast('error', e.message || 'No se pudo vincular'),
      },
    )
  }

  return (
    <section className="mp-card">
      <button type="button" className="mp-card-head" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
        <span>🟦 Mercado Pago · <strong>{lista.length}</strong> sin cargar</span>
        <span className="mp-card-arrow">{abierta ? '▾' : '▸'}</span>
      </button>
      {abierta && (
        <ul className="mp-list">
          {lista.map((m) => (
            <li className="mp-item" key={m.id}>
              <div className="mp-item-top">
                <div className="mp-item-desc">{m.descripcion || m.descripcion_mp || 'Pago con Mercado Pago'}</div>
                <div className="mp-item-monto">{fmtMonto(m.moneda, m.monto)}</div>
              </div>
              <div className="mp-item-meta">
                <span>{ddmm(m.fecha)}</span>
                {CHIP[m.medio] && <span className="mp-chip">{CHIP[m.medio]}</span>}
                {m.contacto && <span>{m.contacto.nombre || detalleContacto(m.contacto)}</span>}
              </div>
              {m.duplicado && (
                <div className="mp-dup">
                  ¿Ya lo cargaste? {m.duplicado.descripcion} · {fmtMonto(m.duplicado.moneda, m.duplicado.monto)}
                  <button type="button" className="mp-link" onClick={() => onEsEste(m)}>Es este</button>
                </div>
              )}
              <div className="mp-item-acts">
                <button type="button" className="mp-btn-ghost" onClick={() => onDescartar(m)}>Descartar</button>
                <button type="button" className="mp-btn" onClick={() => onAgregar(m)}>Agregar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
```

- [ ] **Step 2: `components/Sheet.jsx` — `mp` prop and recipient field**

a) Import the helper (top):
```js
import { detalleContacto } from '../lib/mp/vista.js'
```
b) In `VACIO`, add `contactoNombre: '',`.
c) Add `mp = null, // pendiente de Mercado Pago que se está cargando (o null)` to the props, after `onSaved`.
d) After `const autoDisponible = …`:
```js
  // Transferencia de MP: pedimos a quién fue (se recuerda por cuenta destino).
  const pideContacto = !!(mp && mp.medio === 'transferencia' && mp.contacto)
```
e) In the open effect, inside `if (initial) { setF({ … }) }`, add to the object: `contactoNombre: mp?.contacto?.nombre ?? '',`. In the `else` branch nothing changes (`VACIO` already has it). Add `mp` to the effect's dependency comment line (keep the eslint-disable).
f) In `camposFaltantes`, before `return falta`:
```js
    if (pideContacto && !f.contactoNombre.trim()) falta.push('a quién')
```
g) In `onSubmit`, extend `body` after `compartido: f.compartido,`:
```js
      ...(mp ? { mp_id: mp.id, mp_contacto_nombre: pideContacto ? f.contactoNombre.trim() : undefined } : {}),
```
h) A helper next to `set`:
```js
  // Si la descripción es la automática ("Transferencia a …"), la actualizamos con el nombre.
  function setContactoNombre(nombre) {
    setF((prev) => ({
      ...prev,
      contactoNombre: nombre,
      descripcion: prev.descripcion.startsWith('Transferencia a ') && nombre.trim()
        ? `Transferencia a ${nombre.trim()}`
        : prev.descripcion,
    }))
  }
```
i) In the form, right after the "¿Qué fue?" field:
```jsx
          {pideContacto && (
            <div className="field">
              <label htmlFor="f-contacto">¿A quién le transferiste?</label>
              <input
                className="inp"
                id="f-contacto"
                placeholder={mp.contacto.sugerido || 'Nombre'}
                autoComplete="off"
                value={f.contactoNombre}
                onChange={(e) => setContactoNombre(e.target.value)}
              />
              <div className="field-hint">{detalleContacto(mp.contacto)} · se recuerda para la próxima</div>
            </div>
          )}
```
j) CSS (Step 4) adds `.field-hint`.

- [ ] **Step 3: `app/(app)/inicio/InicioClient.jsx`**

a) Imports: add `import MpPendientes from '../../../components/MpPendientes.jsx'` and extend the api import to `import { useGastos, useCrearGasto, useSyncMpAlAbrir } from '../../../lib/api.js'`.
b) After `const [sheetInitial, setSheetInitial] = useState(null)`:
```js
  const [mpMov, setMpMov] = useState(null) // pendiente de MP que se está cargando
  useSyncMpAlAbrir()
```
c) Add `setMpMov(null)` as the first line of `abrirNuevo`, `editar` and `abrirPrecargada`.
d) New handler after `abrirPrecargada`:
```js
  // Mercado Pago: abrir la hoja precargada con el movimiento (lo marca el server al guardar).
  function agregarDesdeMp(m) {
    setMpMov(m)
    setSheetInitial({
      descripcion: m.descripcion || m.descripcion_mp || '',
      monto: m.monto,
      moneda: m.moneda || 'ARS',
      a_nombre_de: personaDefault,
      categoria: m.categoria_sugerida || otrosId,
      fecha: m.fecha,
      compartido: m.contacto?.compartido ?? true,
    })
    setSheetOpen(true)
  }
```
e) In the JSX, inside `<section className="recent">` right before `<div className="recent-head">`:
```jsx
          <MpPendientes onAgregar={agregarDesdeMp} />
```
f) Pass the movement to the sheet: add `mp={mpMov}` to `<Sheet …/>`.

- [ ] **Step 4: Styles** — append to `app/legacy.css`:

```css
/* ---- Mercado Pago: pendientes en /inicio ---- */
.mp-card { display:block; background:var(--card); border-radius:22px; padding:4px 14px; margin-bottom:14px; box-shadow:0 6px 16px rgba(120,90,60,.08); border:2px solid #cfe3f7; color:var(--ink); text-decoration:none; }
.mp-card-aviso { padding:14px; font-weight:600; }
.mp-card-head { width:100%; display:flex; justify-content:space-between; align-items:center; padding:12px 0; background:none; border:none; font-family:var(--font-d); font-size:16px; color:var(--ink); cursor:pointer; }
.mp-card-arrow { color:var(--ink-soft); }
.mp-list { list-style:none; margin:0; padding:0 0 8px; }
.mp-item { padding:12px 0; border-top:1px solid #f0e6d9; }
.mp-item-top { display:flex; justify-content:space-between; gap:10px; }
.mp-item-desc { font-weight:600; overflow-wrap:anywhere; }
.mp-item-monto { font-family:var(--font-d); font-weight:700; white-space:nowrap; }
.mp-item-meta { display:flex; flex-wrap:wrap; gap:8px; margin-top:4px; font-size:13px; color:var(--ink-soft); }
.mp-chip { background:#eef4fb; color:#2f6a9a; border-radius:999px; padding:1px 8px; }
.mp-dup { margin-top:8px; font-size:13px; background:var(--butter); border-radius:12px; padding:8px 10px; }
.mp-link { margin-left:8px; background:none; border:none; padding:0; color:var(--coral-deep); font-weight:700; text-decoration:underline; cursor:pointer; }
.mp-item-acts { display:flex; justify-content:flex-end; gap:8px; margin-top:10px; }
.mp-btn, .mp-btn-ghost { border:none; border-radius:14px; padding:9px 16px; font-family:var(--font-d); font-weight:600; font-size:14px; cursor:pointer; }
.mp-btn { background:linear-gradient(165deg,#ffb27a,#ef7a4e); color:#fff; }
.mp-btn-ghost { background:#f0e6d9; color:var(--ink-soft); }
.field-hint { margin-top:6px; font-size:12px; color:var(--ink-soft); }
```

- [ ] **Step 5: Verify in the browser (local; creates real expenses only when Daniel taps Guardar)**

`npm test` → PASS; `npm run build` → OK. In `next dev`, logged in with the MP account connected and pendings present:
1. `/inicio` shows "🟦 Mercado Pago · N sin cargar"; tapping expands the list with dates, chips, contact names and "¿Ya lo cargaste?" where applicable.
2. **Agregar a payment** → sheet pre-filled (description cleaned by the AI, amount, date, suggested category); save → toast, the row disappears, the expense shows in "Últimos gastos".
3. **Agregar a transfer to an unnamed account** → the sheet shows "¿A quién le transferiste?" empty with the bank/nickname hint; saving empty → "Te falta: a quién"; type "Mamá" → description becomes "Transferencia a Mamá"; save.
4. **Next transfer to the same account** (or reload and open another pending to the same CBU) → field pre-filled with "Mamá", editable; changing it updates the saved name.
5. Descartar → toast with "Deshacer" → undo brings it back.
6. "Es este" → row disappears; nothing new in "Últimos gastos".
7. Mobile width (375px): card and sheet fit with no horizontal scroll. Screenshots of 1, 3, 4.

---

### Task 13: Production — env vars, deploy, cron

**Files:**
- Create: `supabase/cron/mp-sync.sql`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Cron SQL (template, no secrets in the repo)**

`supabase/cron/mp-sync.sql`:
```sql
-- Cron de Mercado Pago: cada 15 min llama a /api/mp/sync con CRON_SECRET.
-- Correr UNA vez en el SQL editor de Supabase. El secreto se carga a mano en Vault
-- (reemplazar <CRON_SECRET> por el valor de la env de Vercel; no commitearlo).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('<CRON_SECRET>', 'mp_cron_secret');

select cron.schedule(
  'mp-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://gastos-danis.vercel.app/api/mp/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'mp_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

- [ ] **Step 2: Vercel env vars (live — ask Daniel first)**

List for Daniel: add to **Production** in project `arkhand/gastos`, as Sensitive: `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TOKEN_KEY`, `CRON_SECRET` (same values as the local `.env`; `MP_TOKEN_KEY` must match or connected accounts become unreadable — use a fresh one only if nobody connected in production yet). After the OK, add each with `vercel env add <NAME> production` feeding the value from `.env` through stdin by a script (never echoed). Verify: `vercel env ls production` lists the four names.

- [ ] **Step 3: Deploy (live — ask Daniel first)**

`vercel --prod` from the repo (the working tree must contain only the intended changes; check `git status`). **Auto-promotion is off since the 2026-10-13 rollback**: after the deploy finishes, run `vercel promote <deployment-url> --yes`. Verify: `curl -s -o /dev/null -w "%{http_code}" https://gastos-danis.vercel.app/` → 200; `curl -s -X POST https://gastos-danis.vercel.app/api/mp/sync` → 401.

- [ ] **Step 4: OAuth in production**

Daniel opens `https://gastos-danis.vercel.app/config/mp` → "Conectar con Mercado Pago" → accepts → back on `/config/mp` with "Mercado Pago conectado ✓" and his nickname. (If he connected by pasting a token, disconnect first to test the button.)

- [ ] **Step 5: Cron (live — ask Daniel first)**

Daniel runs `supabase/cron/mp-sync.sql` in the Supabase SQL editor with the real `CRON_SECRET`. Verify after ≥15 min: `select status, return_message, start_time from cron.job_run_details order by start_time desc limit 3` → `succeeded`; `select * from net._http_response order by created desc limit 1` → status 200; `select owner, payments_sync_at, last_error from mp_sync` → recent `payments_sync_at`, no error.

- [ ] **Step 6: End-to-end on the phone**

Make a small real MP payment (or wait for one) → within 15 min (or on opening the app) the card shows it; add it from the phone. Record in `memory/mercadopago.md`: state = implemented, date, what was verified, cron job name `mp-sync`.
