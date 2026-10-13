# Mercado Pago push notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify the owner's Android phone when a new Mercado Pago pending appears; tapping opens the pre-filled sheet.

**Architecture:** A pure `armarAviso` builds the notification; a new isolated sync step `pasoAvisos` (deps injected) picks un-notified pendings, sends through `web-push` to the owner's subscriptions stored in Supabase, marks them notified and drops dead subscriptions. The service worker shows the notification and routes the click to `/inicio?mp=…`; `/config/mp` manages the per-device subscription.

**Tech Stack:** Next.js 15 (JS), Supabase, `web-push@3.6.7` (new), Web Push / VAPID, service worker, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-13-mercadopago-push-notifications-design.md` (builds on `2026-10-13-mercadopago-pending-expenses-design.md`).

## Global Constraints

- Git: commit/push/deploy only because Daniel asked for the full cycle ("dale" on 2026-10-13); live steps still need his OK: Supabase migration, Vercel env vars, phone test.
- Never print VAPID private key, tokens or secrets. The VAPID **public** key is not secret.
- Spanish identifiers/comments like the rest of the codebase; user copy in Rioplatense Spanish.
- Env only through `lib/env.js`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Missing keys → push disabled, app unaffected.
- `public/sw.js` image-only caching must stay exactly as is.
- Push never breaks the sync: its errors go to `errores` ("avisos: …").
- Cron stays `*/15`. One notification per movement; 2+ in one run → summary. `tag: 'mp'`.
- Build check: never run `npm run build` while `next dev` is running (they share `.next`).

## Review Focus

1. **Enabling on a second device** must not re-mark/notify anything twice nor flood: subscribing marks all current pendings notified — test in Task 2 (`marcarTodosAvisados` called on subscribe is route-level; covered by Task 4 manual step) and Task 2 test "nothing un-notified → nothing sent".
2. **Dead subscription (410)** while another device of the same owner is fine → dead row deleted, the live one still receives, movements marked — test in Task 2.
3. **Owner without subscriptions** → nothing sent, nothing marked (so they don't get lost) — test in Task 2.
4. **Notification tapped when the movement was already added/discarded** → `/inicio` just expands the card, no crash — Task 5 manual step.
5. **Push service down / network error** → sync still completes, `errores` has `avisos: …`, movements NOT marked (retry next run) — test in Task 2.

---

### Task 1: Notification content

**Files:** Create `lib/mp/avisos.js`; Test `tests/mp/avisos.test.js`

**Interfaces:**
- Consumes: `fmtMonto(moneda, valor)` from `lib/calculos.js`.
- Produces: `armarAviso(movs: Array<{id, medio, monto, moneda, descripcion, descripcion_mp, contacto}>) → { title, body, url, tag } | null`.

- [ ] **Step 1: failing test** `tests/mp/avisos.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarAviso } from '../../lib/mp/avisos.js'

const pago = { id: 'pay:1', medio: 'saldo', monto: 5000, moneda: 'ARS', descripcion: 'Panadería', descripcion_mp: 'Producto de panaderia', contacto: null }

test('un pago', () => {
  assert.deepEqual(armarAviso([pago]), { title: 'Pagaste $ 5.000', body: 'Panadería — ¿lo cargo?', url: '/inicio?mp=pay%3A1', tag: 'mp' })
})

test('sin descripción limpia usa el texto de MP; sin nada, genérico', () => {
  assert.equal(armarAviso([{ ...pago, descripcion: null }]).body, 'Producto de panaderia — ¿lo cargo?')
  assert.equal(armarAviso([{ ...pago, descripcion: null, descripcion_mp: null }]).body, 'Pago con Mercado Pago — ¿lo cargo?')
})

test('transferencia: nombre del contacto, si no la sugerencia', () => {
  const t = { ...pago, id: 'payout:9', medio: 'transferencia', monto: 24500, descripcion: 'Transferencia a Santander', contacto: { nombre: 'La nueva cocinita', sugerido: 'Santander' } }
  assert.deepEqual(armarAviso([t]), { title: 'Transferiste $ 24.500', body: 'La nueva cocinita — ¿lo cargo?', url: '/inicio?mp=payout%3A9', tag: 'mp' })
  assert.equal(armarAviso([{ ...t, contacto: { nombre: null, sugerido: 'Santander' } }]).body, 'Santander — ¿lo cargo?')
})

test('dos o más: resumen', () => {
  assert.deepEqual(armarAviso([pago, { ...pago, id: 'pay:2' }, { ...pago, id: 'pay:3' }]), { title: 'Mercado Pago', body: 'Tenés 3 pagos sin cargar', url: '/inicio?mp=lista', tag: 'mp' })
})

test('nada que avisar', () => {
  assert.equal(armarAviso([]), null)
})
```
- [ ] **Step 2:** `npm test` → FAIL (module not found).
- [ ] **Step 3:** `lib/mp/avisos.js`:
```js
import { fmtMonto } from '../calculos.js'

// Texto de la notificación push para los pendientes nuevos de una corrida.
// 1 movimiento → detalle y abre su hoja; 2+ → resumen y abre la tarjeta.
// `tag: 'mp'` hace que un aviso nuevo reemplace al anterior en vez de apilarse.
export function armarAviso(movs) {
  if (!movs?.length) return null
  if (movs.length > 1) {
    return { title: 'Mercado Pago', body: `Tenés ${movs.length} pagos sin cargar`, url: '/inicio?mp=lista', tag: 'mp' }
  }
  const m = movs[0]
  const esTransferencia = m.medio === 'transferencia'
  const que = esTransferencia
    ? m.contacto?.nombre || m.contacto?.sugerido || m.descripcion || 'una cuenta'
    : m.descripcion || m.descripcion_mp || 'Pago con Mercado Pago'
  return {
    title: `${esTransferencia ? 'Transferiste' : 'Pagaste'} ${fmtMonto(m.moneda, m.monto)}`,
    body: `${que} — ¿lo cargo?`,
    url: `/inicio?mp=${encodeURIComponent(m.id)}`,
    tag: 'mp',
  }
}
```
- [ ] **Step 4:** `npm test` → PASS.

---

### Task 2: Sync step `pasoAvisos`

**Files:** Modify `lib/mp/sync.js`; Test `tests/mp/sync-avisos.test.js`

**Interfaces:**
- Consumes: `armarAviso` (Task 1).
- Produces: `sincronizarCuenta({ …, avisar? })` — when `avisar` is given runs `pasoAvisos` after suggestions; result gains `avisados: number`. Port used: `db.suscripciones(owner) → subs[]`, `db.pendientesSinAvisar(owner) → movs (with .contacto)`, `db.marcarAvisados(ids)`, `db.borrarSuscripcionPorEndpoint(endpoint)`; `avisar(subs, aviso) → Promise<{ ok: number, muertas: string[] }>` (throws only on a total failure).

- [ ] **Step 1: failing test** `tests/mp/sync-avisos.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pasoAvisos } from '../../lib/mp/sync.js'

const YO = 'musiald@gmail.com'
const mov = (id) => ({ id, medio: 'saldo', monto: 100, moneda: 'ARS', descripcion: 'Kiosco', contacto: null })

function dbFalsa({ subs = [], pendientes = [] } = {}) {
  const s = { subs: [...subs], marcados: [], borradas: [] }
  return {
    s,
    async suscripciones() { return s.subs },
    async pendientesSinAvisar() { return pendientes },
    async marcarAvisados(ids) { s.marcados.push(...ids) },
    async borrarSuscripcionPorEndpoint(ep) { s.borradas.push(ep); s.subs = s.subs.filter((x) => x.endpoint !== ep) },
  }
}

test('sin suscripciones: no manda ni marca', async () => {
  const db = dbFalsa({ pendientes: [mov('pay:1')] })
  let llamadas = 0
  assert.equal(await pasoAvisos({ owner: YO, db, avisar: async () => { llamadas++; return { ok: 1, muertas: [] } } }), 0)
  assert.equal(llamadas, 0)
  assert.deepEqual(db.s.marcados, [])
})

test('nada sin avisar: no manda', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }] })
  let llamadas = 0
  await pasoAvisos({ owner: YO, db, avisar: async () => { llamadas++; return { ok: 1, muertas: [] } } })
  assert.equal(llamadas, 0)
})

test('manda un aviso para todos los nuevos y los marca', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }], pendientes: [mov('pay:1'), mov('pay:2')] })
  let aviso
  const n = await pasoAvisos({ owner: YO, db, avisar: async (subs, a) => { aviso = a; return { ok: subs.length, muertas: [] } } })
  assert.equal(n, 2)
  assert.equal(aviso.body, 'Tenés 2 pagos sin cargar')
  assert.deepEqual(db.s.marcados, ['pay:1', 'pay:2'])
})

test('suscripción muerta se borra; la viva recibe y se marca', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'muerta' }, { endpoint: 'viva' }], pendientes: [mov('pay:1')] })
  await pasoAvisos({ owner: YO, db, avisar: async () => ({ ok: 1, muertas: ['muerta'] }) })
  assert.deepEqual(db.s.borradas, ['muerta'])
  assert.deepEqual(db.s.marcados, ['pay:1'])
})

test('si el envío falla del todo, no marca (se reintenta en la próxima corrida)', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }], pendientes: [mov('pay:1')] })
  await assert.rejects(pasoAvisos({ owner: YO, db, avisar: async () => { throw new Error('push caído') } }), /push caído/)
  assert.deepEqual(db.s.marcados, [])
})

test('todas muertas (ningún envío OK): borra y no marca', async () => {
  const db = dbFalsa({ subs: [{ endpoint: 'e1' }], pendientes: [mov('pay:1')] })
  await pasoAvisos({ owner: YO, db, avisar: async () => ({ ok: 0, muertas: ['e1'] }) })
  assert.deepEqual(db.s.borradas, ['e1'])
  assert.deepEqual(db.s.marcados, [])
})
```
- [ ] **Step 2:** `npm test` → FAIL (`pasoAvisos` not exported).
- [ ] **Step 3:** in `lib/mp/sync.js` add import `import { armarAviso } from './avisos.js'`; change the signature to `sincronizarCuenta({ cuenta, mp, db, sugerir, avisar, ahora = Date.now() })`; result `{ owner, pagos: 0, payouts: 0, sugeridos: 0, avisados: 0, errores: [] }`; after the suggestions try-block add:
```js
  if (avisar) {
    try {
      r.avisados = await pasoAvisos({ owner, db, avisar })
    } catch (e) {
      r.errores.push(`avisos: ${e.message}`)
    }
  }
```
and the exported step:
```js
// Push al celular: los pendientes todavía no avisados van en UN aviso (detalle si es
// uno, resumen si son varios). Solo se marcan si llegó a algún dispositivo; si no
// (sin suscripciones, todas muertas o push caído) se reintenta en la próxima corrida.
export async function pasoAvisos({ owner, db, avisar }) {
  const subs = await db.suscripciones(owner)
  if (!subs.length) return 0
  const movs = await db.pendientesSinAvisar(owner)
  const aviso = armarAviso(movs)
  if (!aviso) return 0
  const r = await avisar(subs, aviso)
  for (const ep of r.muertas) await db.borrarSuscripcionPorEndpoint(ep)
  if (!r.ok) return 0
  await db.marcarAvisados(movs.map((m) => m.id))
  return movs.length
}
```
- [ ] **Step 4:** `npm test` → PASS (all suites; existing sync tests don't pass `avisar`).

---

### Task 3: Storage, env, sender

**Files:** Create `supabase/migrations/20261013180000_mercadopago_push.sql`, `lib/mp/push.js`; Modify `lib/env.js`, `lib/mp/db.js`, `package.json` (dep), `.env.example`, local `.env`.

**Interfaces:**
- Produces: `config.push = { publicKey, privateKey, subject, enabled }`; `enviarAviso(subs, aviso) → { ok, muertas }` (`lib/mp/push.js`, server-only); `dbMp.suscripciones(owner)`, `dbMp.guardarSuscripcion(fila)`, `dbMp.borrarSuscripcion(owner, endpoint)`, `dbMp.borrarSuscripcionPorEndpoint(endpoint)`, `dbMp.contarSuscripciones(owner)`, `dbMp.pendientesSinAvisar(owner)`, `dbMp.marcarAvisados(ids)`, `dbMp.marcarTodosAvisados(owner)`.

- [ ] **Step 1:** migration SQL (verbatim from the spec's Data model section) into `supabase/migrations/20261013180000_mercadopago_push.sql`.
- [ ] **Step 2 (live — Daniel's OK):** back up `mp_movimientos` to JSON outside the repo, then apply via the Supabase SQL editor (Monaco `setValue` + Run, as in the first migration). Verify with supabase-js: `select('endpoint,owner,p256dh,auth,user_agent,creado_at,ultimo_ok_at')` on `mp_push` and `select('notificado_at')` on `mp_movimientos` → no error.
- [ ] **Step 3:** `npm install web-push@3.6.7` (exact version in package.json). Generate keys with `node -e "const w=require('web-push');const k=w.generateVAPIDKeys();…"` writing `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:musiald@gmail.com` straight into `.env` (print only SET/EMPTY). Add the three names (empty) to `.env.example` with a comment.
- [ ] **Step 4:** `lib/env.js` inside `config`, after `mp`:
```js
  // Push (Web Push con VAPID) para avisar pendientes de Mercado Pago al celular.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT || 'mailto:musiald@gmail.com',
    enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  },
```
- [ ] **Step 5:** `lib/mp/push.js`:
```js
import 'server-only'
import webpush from 'web-push'
import { config } from '../env.js'

if (config.push.enabled) webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey)

// Manda el aviso a cada dispositivo. 404/410 = suscripción muerta (app desinstalada o
// permiso revocado) → se devuelve para borrarla. Tira solo si TODOS fallaron por
// otra razón (push caído), para que la corrida lo registre y se reintente.
export async function enviarAviso(subs, aviso) {
  const r = { ok: 0, muertas: [] }
  let otroError = null
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
        { TTL: 24 * 3600 },
      )
      r.ok++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) r.muertas.push(s.endpoint)
      else otroError = e
    }
  }
  if (!r.ok && !r.muertas.length && otroError) throw new Error(`push: ${otroError.statusCode ?? ''} ${otroError.message}`.trim())
  return r
}
```
- [ ] **Step 6:** `lib/mp/db.js`, inside `dbMp` (new section before `// ---- contactos ----`):
```js
  // ---- push ----
  async suscripciones(owner) {
    return chequear(await db().from('mp_push').select('endpoint,p256dh,auth').eq('owner', owner))
  },
  async contarSuscripciones(owner) {
    const { count, error } = await db().from('mp_push').select('endpoint', { count: 'exact', head: true }).eq('owner', owner)
    if (error) throw error
    return count ?? 0
  },
  async guardarSuscripcion(fila) {
    chequear(await db().from('mp_push').upsert(fila, { onConflict: 'endpoint' }))
  },
  async borrarSuscripcion(owner, endpoint) {
    chequear(await db().from('mp_push').delete().eq('owner', owner).eq('endpoint', endpoint))
  },
  async borrarSuscripcionPorEndpoint(endpoint) {
    chequear(await db().from('mp_push').delete().eq('endpoint', endpoint))
  },
  async pendientesSinAvisar(owner) {
    const filas = chequear(
      await db().from('mp_movimientos').select(COLS_VISTA)
        .eq('owner', owner).eq('estado', 'pendiente').is('notificado_at', null)
        .order('fecha_hora', { ascending: false }),
    )
    return adjuntarContactos(owner, filas)
  },
  async marcarAvisados(ids) {
    if (!ids.length) return
    chequear(await db().from('mp_movimientos').update({ notificado_at: new Date().toISOString() }).in('id', ids))
  },
  async marcarTodosAvisados(owner) {
    chequear(
      await db().from('mp_movimientos').update({ notificado_at: new Date().toISOString() })
        .eq('owner', owner).eq('estado', 'pendiente').is('notificado_at', null),
    )
  },
```
- [ ] **Step 7:** `npm test` → PASS; with dev server stopped, `npm run build` → OK.

---

### Task 4: Routes and wiring

**Files:** Create `app/api/mp/push/route.js`, `app/api/mp/push/probar/route.js`; Modify `lib/mp/ejecutar.js`.

**Interfaces:**
- Consumes: Task 3 (`dbMp.*`, `enviarAviso`, `config.push`), `ownerDe`.
- Produces: `GET /api/mp/push → { habilitado, publicKey, dispositivos }`; `POST /api/mp/push { subscription }` → `{ ok }` (400 if malformed); `DELETE /api/mp/push { endpoint }` → `{ ok }`; `POST /api/mp/push/probar` → `{ ok, enviados }`.

- [ ] **Step 1:** `lib/mp/ejecutar.js`: import `{ config } from '../env.js'` and `{ enviarAviso } from './push.js'`; pass `avisar: config.push.enabled ? enviarAviso : undefined` to `sincronizarCuenta`.
- [ ] **Step 2:** `app/api/mp/push/route.js`:
```js
import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../lib/session.js'
import { config } from '../../../../lib/env.js'
import { dbMp } from '../../../../lib/mp/db.js'
import { ownerDe } from '../../../../lib/mp/cuentas.js'

export const dynamic = 'force-dynamic'

function responderError(err, donde) {
  const status = err.status || 500
  if (status !== 401) console.error(`[api/mp/push ${donde}]`, err.message)
  return NextResponse.json({ error: err.message }, { status })
}

// GET — clave pública VAPID y cuántos dispositivos tiene avisos activos el usuario.
export async function GET() {
  try {
    const owner = ownerDe(await requireUserApi())
    return NextResponse.json({
      habilitado: config.push.enabled,
      publicKey: config.push.publicKey ?? null,
      dispositivos: config.push.enabled ? await dbMp.contarSuscripciones(owner) : 0,
    })
  } catch (err) {
    return responderError(err, 'GET')
  }
}

// POST { subscription } — registra este dispositivo. Los pendientes que ya existían
// se marcan como avisados: solo se avisan los que aparezcan desde ahora.
export async function POST(request) {
  try {
    const owner = ownerDe(await requireUserApi())
    if (!config.push.enabled) return NextResponse.json({ error: 'Avisos no configurados' }, { status: 503 })
    const { subscription: s } = await request.json()
    if (!s?.endpoint?.startsWith('https://') || !s?.keys?.p256dh || !s?.keys?.auth) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
    }
    await dbMp.guardarSuscripcion({
      endpoint: s.endpoint,
      owner,
      p256dh: s.keys.p256dh,
      auth: s.keys.auth,
      user_agent: request.headers.get('user-agent')?.slice(0, 200) ?? null,
    })
    await dbMp.marcarTodosAvisados(owner)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return responderError(err, 'POST')
  }
}

// DELETE { endpoint } — desactiva los avisos en este dispositivo (solo el propio).
export async function DELETE(request) {
  try {
    const owner = ownerDe(await requireUserApi())
    const { endpoint } = await request.json().catch(() => ({}))
    if (endpoint) await dbMp.borrarSuscripcion(owner, String(endpoint))
    return NextResponse.json({ ok: true })
  } catch (err) {
    return responderError(err, 'DELETE')
  }
}
```
- [ ] **Step 3:** `app/api/mp/push/probar/route.js`:
```js
import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../../../lib/session.js'
import { config } from '../../../../../lib/env.js'
import { dbMp } from '../../../../../lib/mp/db.js'
import { ownerDe } from '../../../../../lib/mp/cuentas.js'
import { enviarAviso } from '../../../../../lib/mp/push.js'

// POST — manda un aviso de prueba a los dispositivos del usuario.
export async function POST() {
  try {
    const owner = ownerDe(await requireUserApi())
    if (!config.push.enabled) return NextResponse.json({ error: 'Avisos no configurados' }, { status: 503 })
    const subs = await dbMp.suscripciones(owner)
    if (!subs.length) return NextResponse.json({ error: 'No hay dispositivos con avisos activos' }, { status: 400 })
    const r = await enviarAviso(subs, {
      title: 'Avisos de Mercado Pago activados ✓',
      body: 'Te vamos a avisar cuando pagues algo con Mercado Pago.',
      url: '/config/mp',
      tag: 'mp-prueba',
    })
    for (const ep of r.muertas) await dbMp.borrarSuscripcionPorEndpoint(ep)
    return NextResponse.json({ ok: r.ok > 0, enviados: r.ok })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/mp/push/probar]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
```
- [ ] **Step 4:** `npm test` → PASS; build (dev stopped) → OK. With `next dev`: `GET /api/mp/push` (logged in) → `habilitado: true, publicKey`, `dispositivos: 0`; malformed POST → 400.

---

### Task 5: Service worker, config UI, deep link

**Files:** Modify `public/sw.js`, `lib/api.js`, `app/(app)/config/mp/page.jsx`, `components/MpPendientes.jsx`, `app/(app)/inicio/InicioClient.jsx`, `app/legacy.css`.

**Interfaces:**
- Consumes: Task 4 routes.
- Produces: `usePushEstado()`, `activarPush()`, `desactivarPush()`, `probarPush()` in `lib/api.js`; `<MpPendientes abrirInicial />`; `/inicio?mp=<id|lista>` handling.

- [ ] **Step 1: `public/sw.js`** — append (leave everything above untouched):
```js
// Push de Mercado Pago: muestra el aviso y, al tocarlo, abre/enfoca la app en la URL
// del aviso (/inicio?mp=<id> abre la hoja de ese pago; ?mp=lista, la tarjeta).
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { title: 'Gastos', body: event.data?.text() } }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Gastos', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || 'mp',
      renotify: true,
      data: { url: d.url || '/inicio' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/inicio', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((w) => new URL(w.url).origin === self.location.origin)
      if (abierta) return abierta.navigate(url).then((w) => (w || abierta).focus())
      return self.clients.openWindow(url)
    })
  )
})
```
- [ ] **Step 2: `lib/api.js`** — after `useDesconectarMp`:
```js
// ---- Push (avisos al celular) ----
const b64AUint8 = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

// Estado de los avisos EN ESTE dispositivo (permiso + suscripción del navegador).
export function usePushEstado() {
  return useQuery({
    queryKey: ['mp-push'],
    queryFn: async () => {
      const server = await req('/api/mp/push')
      const soportado = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
      if (!soportado) return { ...server, soportado, activo: false, permiso: 'default' }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      return { ...server, soportado, activo: !!sub, permiso: Notification.permission }
    },
    retry: false,
  })
}

export async function activarPush(publicKey) {
  const permiso = await Notification.requestPermission()
  if (permiso !== 'granted') throw new Error('Sin permiso para notificaciones')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64AUint8(publicKey) }))
  await req('/api/mp/push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) })
}

export async function desactivarPush() {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  await req('/api/mp/push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) })
  await sub.unsubscribe()
}

export function probarPush() {
  return req('/api/mp/push/probar', { method: 'POST' })
}
```
- [ ] **Step 3: `/config/mp`** — import `useQueryClient` from `@tanstack/react-query`, `usePushEstado, activarPush, desactivarPush, probarPush` from api; inside the connected-account card, after `mp-cfg-acciones`, render `<AvisosCelular />` defined in the same file:
```jsx
function AvisosCelular() {
  const { data: p, isLoading } = usePushEstado()
  const qc = useQueryClient()
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  if (isLoading || !p?.habilitado) return null

  async function correr(fn, ok) {
    setOcupado(true)
    try {
      await fn()
      if (ok) toast('success', ok)
    } catch (e) {
      toast('error', e.message || 'No se pudo')
    } finally {
      setOcupado(false)
      qc.invalidateQueries({ queryKey: ['mp-push'] })
    }
  }

  return (
    <div className="mp-cfg-push">
      <div className="mp-cfg-push-title">Avisos en este celular</div>
      {!p.soportado ? (
        <p className="ia-nota">Este navegador no soporta avisos. Abrí la app instalada en el celular.</p>
      ) : p.permiso === 'denied' ? (
        <p className="ia-error">Las notificaciones están bloqueadas para esta app. Habilitalas en Ajustes → Apps → Gastos → Notificaciones.</p>
      ) : p.activo ? (
        <div className="mp-cfg-acciones">
          <button type="button" className="btn-save" disabled={ocupado} onClick={() => correr(probarPush, 'Aviso de prueba enviado')}>Probar aviso</button>
          <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => correr(desactivarPush, 'Avisos desactivados en este celular')}>Desactivar</button>
        </div>
      ) : (
        <button type="button" className="btn-save" disabled={ocupado} onClick={() => correr(() => activarPush(p.publicKey), 'Avisos activados ✓')}>
          Avisarme cuando pague con Mercado Pago
        </button>
      )}
      {p.dispositivos > 0 && <p className="ia-nota">Dispositivos con avisos: {p.dispositivos}</p>}
    </div>
  )
}
```
(and `import { useEffect, useState } from 'react'`).
- [ ] **Step 4: deep link** — `components/MpPendientes.jsx`: signature `MpPendientes({ onAgregar, abrirInicial = false })`, `useState(abrirInicial)`, plus `useEffect(() => { if (abrirInicial) setAbierta(true) }, [abrirInicial])` (import `useEffect`). `InicioClient.jsx`: import `useEffect` and `useMpPendientes`; add
```js
  // Deep link desde el push: ?mp=<id> abre la hoja de ese pago; ?mp=lista (o un id que
  // ya no está pendiente) despliega la tarjeta. Se procesa una sola vez.
  const mpData = useMpPendientes().data
  const [mpAbrirLista, setMpAbrirLista] = useState(false)
  useEffect(() => {
    if (!mpData) return
    const q = new URLSearchParams(window.location.search)
    const id = q.get('mp')
    if (!id) return
    window.history.replaceState(null, '', '/inicio')
    const m = id !== 'lista' && mpData.pendientes?.find((p) => p.id === id)
    if (m) agregarDesdeMp(m)
    else setMpAbrirLista(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpData])
```
and `<MpPendientes onAgregar={agregarDesdeMp} abrirInicial={mpAbrirLista} />`.
- [ ] **Step 5: CSS** append to `app/legacy.css`:
```css
.mp-cfg-push { margin-top:16px; padding-top:14px; border-top:1px solid #f0e6d9; display:flex; flex-direction:column; gap:10px; }
.mp-cfg-push-title { font-family:var(--font-d); font-weight:700; font-size:15px; }
```
- [ ] **Step 6:** `npm test` → PASS; build (dev stopped) → OK; in `next dev`: `/inicio?mp=lista` expands the card; `/inicio?mp=pay%3A999` expands the card without errors; `/config/mp` shows the "Avisos en este celular" block (on desktop Chrome: button visible).

---

### Task 6: Production

- [ ] **Step 1 (live — Daniel's OK):** add `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` to Vercel production (`vercel env add <NAME> production --sensitive --force`, value via stdin from `.env`, never printed).
- [ ] **Step 2:** final whole-branch review (fresh reviewer, most capable model), fix Critical/Important test-first.
- [ ] **Step 3:** commit + push `main`; deploy from a clean worktree (`vercel --prod`); smoke: `/` 200, `GET /api/mp/push` without cookie 401, `POST /api/mp/sync` without auth 401.
- [ ] **Step 4 (Daniel, on the phone):** open the installed app → Configuración → Mercado Pago → "Avisarme…" → allow → "Probar aviso" arrives → tap opens `/config/mp`. Then a real MP payment → notification within 15 min → tap opens the pre-filled sheet.
- [ ] **Step 5:** verify in DB: `mp_push` has his device; the paid movement has `notificado_at`. Update `memory/mercadopago.md` (push in production, how to debug: `mp_push`, `notificado_at`, sync `errores`).
