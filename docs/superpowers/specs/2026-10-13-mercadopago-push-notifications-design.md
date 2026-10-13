# Mercado Pago push notifications — design

Date: 2026-10-13 · Status: draft, awaiting review · Builds on
`2026-10-13-mercadopago-pending-expenses-design.md` (in production).

## Goal

When a new Mercado Pago movement shows up as pending, the owner's phone gets a
notification ("Pagaste $5.000 · Panadería — ¿lo cargo?"). Tapping it opens the app
with the sheet pre-filled for that movement, so the expense is entered at the moment
instead of days later. Each person only gets their own notifications.

Success criteria:
- A new pending movement produces exactly one notification per subscribed device of
  its owner, within one cron period (15 min) of being detected.
- Several new pendings in the same run produce one summary notification.
- Tapping a single-movement notification opens `/inicio` with that movement's sheet;
  tapping a summary opens `/inicio` with the Mercado Pago card expanded.
- Enabling notifications never floods the phone with already-existing pendings.
- A dead subscription (uninstalled app, revoked permission) is cleaned up and never
  breaks the sync.

## Decisions (agreed with Daniel)

- Devices: both Android, app installed as PWA (Chrome). No iOS work.
- Cron stays every 15 minutes (`mp-sync`). Notification latency 0–15 min for payments,
  up to ~1 h for bank transfers (release report).
- One notification per movement; two or more in the same run → one summary.
- No quiet hours (the phone's Do Not Disturb handles it).
- Standard Web Push with VAPID via the `web-push` npm package (one new dependency).
  Sending runs inside the existing Vercel sync; subscriptions live in Supabase; VAPID
  keys in Vercel env. Delivery goes through the browser's push service (Google for
  Chrome); payloads are end-to-end encrypted, no external account.

## Data model

```sql
create table if not exists public.mp_push (
  endpoint   text primary key,          -- push service URL of one browser/device
  owner      text not null,             -- app email (same as mp_cuentas.owner)
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  creado_at  timestamptz not null default now(),
  ultimo_ok_at timestamptz
);
create index if not exists mp_push_owner on public.mp_push (owner);
alter table public.mp_push enable row level security;

alter table public.mp_movimientos add column if not exists notificado_at timestamptz;
```

## Rules

- **What gets notified:** movements of the owner with `estado = 'pendiente'` and
  `notificado_at is null`. After sending (or attempting to) they get
  `notificado_at = now()`. If the owner has no subscription, nothing is sent and nothing
  is marked.
- **No flood on enable:** subscribing a device marks every current `pendiente` of that
  owner with `notificado_at = now()` (only movements detected later notify).
- **Content** (description is the AI-cleaned one, falling back to MP's text):
  - 1 movement, payment: title `Pagaste $5.000`, body `Panadería — ¿lo cargo?`.
  - 1 movement, transfer: title `Transferiste $24.500`, body `La nueva cocinita — ¿lo cargo?`
    (contact name, else suggestion).
  - 2+ movements: title `Mercado Pago`, body `Tenés 3 pagos sin cargar`.
  - Click URL: `/inicio?mp=<encoded id>` (1) or `/inicio?mp=lista` (2+). `tag: 'mp'`
    so a newer notification replaces an older one instead of stacking.
- **Dead subscriptions:** push service answers 404/410 → delete that `mp_push` row.
  Other errors are logged and recorded in the sync result; the sync never fails
  because of push.
- Order inside the sync: after suggestions (so the text is clean). Movements still
  without a suggestion (beyond the 10-per-run AI cap) use MP's raw text.

## Server

- `lib/mp/avisos.js` (pure): `armarAviso(movs) → { title, body, url, tag } | null`.
- `lib/mp/push.js` (server-only): web-push setup from `config.push`, `enviarAviso(subs, aviso)
  → { ok: n, muertas: [endpoint] }`.
- `lib/mp/sync.js`: new step `pasoAvisos({ owner, db, avisar })`, isolated like the
  others (`errores.push('avisos: …')`). `avisar` is injected (no network in tests).
- `dbMp`: `suscripciones(owner)`, `guardarSuscripcion(fila)`, `borrarSuscripcion(owner,
  endpoint)`, `borrarSuscripcionPorEndpoint(endpoint)`, `pendientesSinAvisar(owner)`,
  `marcarAvisados(ids)`, `marcarTodosAvisados(owner)`.
- Routes (session; middleware already requires the cookie):
  - `GET /api/mp/push` → `{ publicKey, dispositivos: n }`.
  - `POST /api/mp/push { subscription }` → upsert + `marcarTodosAvisados(owner)`.
  - `DELETE /api/mp/push { endpoint }` → only the caller's own row.
  - `POST /api/mp/push/probar` → sends "Avisos de Mercado Pago activados ✓" to the
    caller's devices.
- Env (`lib/env.js` → `config.push`): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT` (`mailto:musiald@gmail.com`). Push disabled (no-op) if missing.

## Client

- `public/sw.js`: add `push` (show the notification with app icon, `tag`, `data.url`) and
  `notificationclick` (focus an open app window and navigate it, else open one). The
  existing image-only caching stays untouched.
- `/config/mp` (connected account): "Avisos en este celular" block — Activar (asks
  Android's permission, `pushManager.subscribe` with the VAPID public key, POST),
  Desactivar (unsubscribe + DELETE), Probar aviso. Shows blocked-permission help when
  `Notification.permission === 'denied'`. Per device.
- `/inicio`: reads `?mp=` once pendings are loaded: an id → opens the sheet for that
  movement (same as tapping Agregar); `lista` → expands the card. Then cleans the URL.
  Unknown/already-processed id → just expands the card.

## Testing

- `node --test`: `armarAviso` (payment, transfer with/without contact name, 2+ summary,
  empty → null, money formatting), `pasoAvisos` with fakes (no subs → nothing marked;
  sends once and marks; dead endpoint deleted; push failure isolated in `errores`).
- Manual on Daniel's Android: enable, "Probar aviso" arrives; real MP payment →
  notification within one cron period → tap opens the pre-filled sheet; disable stops
  notifications.
