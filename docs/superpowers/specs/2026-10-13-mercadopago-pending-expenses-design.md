# Mercado Pago → pending expenses — design

Date: 2026-10-13 · Status: approved to plan (2026-10-13)

## Goal

Almost every expense is paid through Mercado Pago (QR, debit, transfers) and some are
never entered in the app. The app should detect outgoing MP movements of the account
owner and, when the owner opens `/inicio`, offer to **add** each one (pre-filled sheet)
or **discard** it.

Success criteria:
- Every approved outgoing MP movement of the last days shows up once as pending, with
  the real debited amount (taxes included), the Argentina date, and a suggested category.
- Nothing shows up twice (two sources, retries, status changes).
- Movements already entered by hand or by voice are recognized ("Is it this one?").
- An MP outage or API change never breaks the app; it only stops new pendings.

Out of scope (phase 2): push notifications.

## Accounts and ownership

Each MP access token is one person's MP account. Pendings belong to that person and
are only ever shown to them.

- Each user connects **their own** MP account from `/config`; no redeploy, no env var
  per person. `owner` = the app login email, same canonical id stored in
  `gastos.a_nombre_de`.
- Two ways to connect, both ending in the same encrypted row in `mp_cuentas`:
  1. **"Conectar con Mercado Pago" (OAuth, primary).** Authorization-code flow against
     the owner's MP app. Anyone can connect without being an MP developer. The access
     token lasts 180 days; the sync refreshes it with the refresh token before it expires.
     **Validated 2026-10-13:** the app owner can authorize their own app; the token reads
     `/users/me`, payments/search and the release report (list, config, request → 202).
     **The token cannot be made read-only:** unchecking `write` in the panel removes only
     the legacy `write` scope; MP still grants 21 fine-grained `urn:mp:…/read-write`
     scopes tied to the app's product (Checkout Pro: payments, cancel, refunds,
     preferences, customers, cards, subscriptions, POS), and ignores a narrower `scope`
     in the authorization URL. The consent screen says "cancelar y devolver". None of
     these allows sending money to a third party. Hence the allowlist below is mandatory.
  2. **Paste an access token (fallback).** For when OAuth is not possible (e.g. MP does
     not let the app owner authorize their own app — unverified). The token must come
     from an app with `write` disabled.
- Tokens are **write-only from the UI**: validated on save with `GET /users/me`
  (rejects `TEST-…` and invalid tokens), encrypted at rest with AES-256-GCM using
  `MP_TOKEN_KEY` (server env), never returned to the browser. Reading the database
  alone does not expose tokens.
- Every MP row carries `owner`. Sync iterates the connected accounts and isolates
  them: one account failing never blocks the other.
- Visibility comes from the session: every `/api/mp/*` read or write is filtered by
  `owner = session email`; a user with no MP account simply sees nothing.
- `CRON_SECRET` is unrelated to people: it is the single key the cron uses to call
  the sync endpoint.

## Facts this design relies on (validated against the real account, 2026-10-13)

Source A — `GET /v1/payments/search?payer.id=<me>` (synchronous):
- Returns QR / in-store, debit card, online checkout, subscriptions, **credit card via
  MP**, and **transfers to other MP accounts** (`operation_type=money_transfer`).
- Keep `operation_type ∈ {regular_payment, money_transfer, recurring_payment}`. Drop
  `account_fund` and `operation_fund`: those are account top-ups (incl. the card/DEBIN
  top-up MP does to cover a bank transfer — the transfer itself is a payout, source B).
- Real debited amount is `transaction_details.total_paid_amount` (Google: 7,569.82
  `transaction_amount` vs 9,939.55 `total_paid_amount` = the report's debit).
- Dates are ISO with offset (`-04:00`); the instant is correct. Parse with the offset
  and convert to `America/Argentina/Buenos_Aires`. Never slice the string.
- Status can change days later (`authorized` → `approved` after 3 days for Rappi).
- `collector.id` → `GET /users/{id}` returns a `nickname` (sometimes a readable name,
  sometimes a code). Only useful as a suggestion.
- All currencies seen in 30 days: ARS.

Source B — release report (`/v1/account/release_report`, asynchronous CSV):
- Needed **only** for `DESCRIPTION=payout` rows (transfers to a CBU/CVU outside MP),
  which source A does not return. `PAYOUT_BANK_ACCOUNT_NUMBER` = destination; there is
  no way to get the holder's name.
- Every other row is ignored (`payment` rows are already covered by source A with the
  same id; `reserve_*`, `asset_management`, balances, totals are noise).
- Config / request / poll / download steps: see `memory/mercadopago.md`.

## Data model (Supabase, RLS enabled with no policies, like `gastos`)

```sql
create table mp_movimientos (
  id            text primary key,          -- 'pay:<payment_id>' | 'payout:<source_id>' (MP ids are global)
  owner         text not null,             -- app email of the MP account holder
  fuente        text not null,             -- 'payment' | 'payout'
  medio         text not null,             -- 'saldo' | 'tarjeta' | 'transferencia'
  mp_status     text,                      -- raw MP status (payout rows: 'approved')
  fecha_hora    timestamptz not null,
  fecha         date not null,             -- Argentina date
  monto         numeric not null,
  moneda        text not null default 'ARS',
  descripcion_mp text,                     -- raw: description / statement_descriptor
  descripcion   text,                      -- cleaned by the AI (falls back to raw)
  categoria_sugerida text,                 -- categorias.id as text, like gastos
  contacto_id   text,                      -- with owner → mp_contactos(owner, id)
  estado        text not null,             -- 'esperando' | 'pendiente' | 'agregado' | 'descartado'
  motivo        text,                      -- 'usuario' | 'mp_<status>' | 'vinculado'
  gasto_id      uuid,                      -- gastos.id once added or linked
  raw           jsonb,
  detectado_at  timestamptz not null default now(),
  actualizado_at timestamptz not null default now(),
  foreign key (owner, contacto_id) references mp_contactos(owner, id)
);
create index on mp_movimientos (owner, estado);

create table mp_contactos (
  owner     text not null,                 -- contacts are per person
  id        text not null,                 -- 'mp:<collector_id>' | 'cbu:<22 digits>'
  nombre    text,                          -- set by the owner on first confirmation
  sugerido  text,                          -- MP nickname or bank name from the CBU prefix
  categoria text,
  compartido boolean,
  actualizado_at timestamptz not null default now(),
  primary key (owner, id)
);

create table mp_cuentas (
  owner             text primary key,      -- app email; one MP account per person
  mp_user_id        bigint not null,       -- from GET /users/me
  mp_nickname       text,
  metodo            text not null,         -- 'oauth' | 'token'
  access_token_enc  text not null,         -- AES-256-GCM ("iv.tag.datos", base64url)
  refresh_token_enc text,                  -- oauth only
  expira_at         timestamptz,           -- oauth only
  necesita_reconectar boolean not null default false, -- refresh failed
  conectado_at      timestamptz not null default now()
);

create table mp_sync (
  owner                 text primary key references mp_cuentas(owner) on delete cascade,
  desde                 timestamptz,       -- nothing older is ever imported
  payments_sync_at      timestamptz,
  reporte_configurado   boolean not null default false,
  report_requested_at   timestamptz,
  report_downloaded_at  timestamptz,
  last_error            text,
  last_error_at         timestamptz
);
```

(`mp_contactos` is created before `mp_movimientos`, and `mp_cuentas` before `mp_sync`,
because of the FKs. Disconnecting deletes the `mp_cuentas` row and its `mp_sync` row;
movements and contacts are kept, so reconnecting does not re-propose old pendings.)

### State rules (applied on every upsert)

| MP status | row is new | row is `esperando` / `pendiente` | row is `agregado` / `descartado` |
|---|---|---|---|
| `approved` | `pendiente` | → `pendiente` | unchanged |
| `authorized`, `in_process`, `pending` | `pendiente` (UI chip "sin confirmar"; changed 2026-10-13 by Daniel: MP shows them as approved and Rappi can take days) | → `pendiente` | unchanged |
| `cancelled`, `rejected`, `refunded`, `charged_back` | not inserted | → `descartado`, `motivo='mp_<status>'` | unchanged |

Amount, date and raw data are refreshed while the row is `esperando`/`pendiente`, and
frozen afterwards (the expense row becomes the source of truth).

## Sync — `POST /api/mp/sync`

Auth: `Authorization: Bearer <CRON_SECRET>` (syncs **every** connected account) **or**
a session (syncs **only that user's** account, if they have one).
`middleware.js` lets `/api/mp/sync` through without a cookie (same `if` as `/api/me`).
`export const maxDuration = 60`.

Each run, per account, in sequence (errors are logged to that account's
`mp_sync.last_error` and never surface as a 500 to the UI):
0. OAuth accounts whose `expira_at` is less than 7 days away: refresh the token
   (`grant_type=refresh_token`) and store both new tokens encrypted (MP rotates the
   refresh token on every use). A failed refresh marks the account as needing
   reconnection in `/config`.
1. First run for an account: create the release report config and set
   `desde = now() - 1 day` (no backfill of old history).
2. Session-triggered runs are skipped if `payments_sync_at` is less than 5 minutes old.
3. **Payments**: search the last 7 days (bounded by `desde`), map with `mapearPago`,
   upsert following the state rules. For new `money_transfer` rows, upsert the contact
   `mp:<collector_id>` with `sugerido = nickname` (only if the contact is new).
4. **Payout report** (two phases, never waits inside the request):
   - if `report_requested_at` is set and a CSV newer than it is in the list → download,
     `parsearReleaseCsv` → upsert payouts (contact `cbu:<account>` with `sugerido` = bank
     from the prefix), set `report_downloaded_at`, clear `report_requested_at`;
   - else if nothing is pending and today (AR) has no download yet and it is 20:00 AR or later (changed 2026-10-14 from hourly: every report emails the user and MP offers no way to turn it off) → request a new
     report for the last 3 days (`end_date` = now − 5 min), set `report_requested_at`;
   - a request older than 15 min without a file is considered lost and re-requested.
5. **Suggestions**: for up to 10 `pendiente` rows with `categoria_sugerida is null`:
   contact category if the contact has one, else `revisarGasto(descripcion_mp)` from
   `lib/ia.js` (cleans description + picks category). AI failure → `otrosId`, raw
   description. Rows beyond 10 are picked up next run.

Triggers:
- Supabase `pg_cron` + `pg_net`, every 15 minutes, secret read from Vault:
  ```sql
  select cron.schedule('mp-sync', '*/15 * * * *', $$
    select net.http_post(
      url := 'https://gastos-danis.vercel.app/api/mp/sync',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
        'Content-Type', 'application/json'),
      body := '{}'::jsonb)
  $$);
  ```
- `/inicio` (owner only) fires the sync on mount; on success it invalidates the
  `['mp-pendientes']` query.

## Read and act

- `GET /api/mp/pendientes` (session) → that user's `pendiente` rows ordered by
  `fecha_hora` desc, each with its contact and an optional `duplicado` candidate.
  A user with no MP account gets `[]`.
- `POST /api/mp/:id/descartar` → `descartado`, `motivo='usuario'`.
- `POST /api/mp/:id/vincular` `{ gasto_id }` → `agregado`, `motivo='vinculado'`.
- Every write checks `owner = session email` (404 otherwise), including `mp_id` on
  `POST /api/gastos`.
- `POST /api/gastos` accepts optional `mp_id` and `mp_contacto_nombre`: creates the
  expense as today, then marks the movement `agregado` with `gasto_id`, and upserts the
  contact with `nombre`, `categoria` and `compartido` taken from the saved expense
  (that is how the next transfer to the same person comes pre-filled). If marking
  fails, the expense is still returned OK; the next listing offers it as the duplicate
  candidate, so the owner can link it in one tap.

Duplicate candidate (`buscarDuplicado`): an active expense, not already linked to any
movement, with `|monto_ars − monto| ≤ max(1% · monto, 1)` and `fecha` within ±1 day of
the movement; closest amount wins. Any `a_nombre_de` counts (the other person may have
entered it), but expenses entered for the owner rank first on ties.

`a_nombre_de` is pre-filled with the movement's owner.

## UI (`/inicio`)

- A card "Mercado Pago · N sin cargar" above the list (hidden when N = 0, which
  includes users with no MP account).
- Each row: date, description, amount, chips `💳 tarjeta` / `↗ transferencia`, contact
  name (or the suggestion in grey + "¿a quién?").
  - Duplicate candidate present → "¿Ya lo cargaste? <expense> · [Es este]".
  - **Agregar** → the existing `<Sheet/>` pre-filled (description, amount, currency, date,
    owner, suggested category, contact's `compartido` or the sheet default). For
    **transfers** the sheet always shows "¿A quién le transferiste?": **required** when the
    destination account has no saved name, **pre-filled and editable** when it has one;
    saving updates the name for next time. MP does not expose the recipient's CUIT, so the
    person is remembered per destination account (`cbu:<CBU/CVU>` or `mp:<user id>`).
  - **Descartar** → one tap, undo toast.

## Connecting (`/config` → "Mercado Pago")

- Not connected: **Conectar con Mercado Pago** button, and below it "o pegá un Access
  Token" (a field + Guardar).
- Connected: "Conectado como <nickname> · desde <fecha>", last sync time, last error if
  any, and **Desconectar**. Never shows the token.
- `GET /api/mp/conectar` (session) → creates a random `state` (stored in the iron
  session) and redirects to
  `https://auth.mercadopago.com/authorization?client_id=…&response_type=code&platform_id=mp&state=…&redirect_uri=<origin>/api/mp/callback`.
- `GET /api/mp/callback?code&state` (session) → checks `state`, exchanges the code at
  `POST /oauth/token` (`grant_type=authorization_code`, client id/secret from env),
  calls `/users/me`, upserts `mp_cuentas` (encrypted), redirects to `/config`.
- `POST /api/mp/token` `{ token }` (session) → validate with `/users/me`, encrypt, upsert.
- `DELETE /api/mp/cuenta` (session) → disconnect.
- Redirect URLs registered in the MP app: `https://gastos-danis.vercel.app/api/mp/callback`
  and `http://localhost:3000/api/mp/callback` (if MP accepts http for localhost;
  otherwise OAuth is tested only in production).

## Code layout

- `lib/mp/client.js` — fetch wrapper for the MP API, created per account token. **Hard
  allowlist** (method + path pattern): `GET /users/me`, `GET /v1/payments/search`,
  `GET /users/{id}`, `GET|POST|PUT /v1/account/release_report/config`,
  `POST /v1/account/release_report`, `GET /v1/account/release_report/list`,
  `GET /v1/account/release_report/{file}`, `POST /oauth/token`. Anything else throws
  before any network call, so no code path can use the token's write scopes.
- `lib/mp/mapear.js` — pure: `mapearPago(payment)` → row | null, status → state rules.
- `lib/mp/csv.js` — pure: `parsearReleaseCsv(text)` → payout rows.
- `lib/mp/duplicados.js` — pure: `buscarDuplicado(mov, gastos, linkedIds)`.
- `lib/mp/bancos.js` — CBU prefix → bank name.
- `lib/mp/sync.js` — orchestration (DB + client + AI).
- `lib/mp/cripto.js` — pure: `cifrar(texto)` / `descifrar(blob)` (AES-256-GCM, `node:crypto`).
- `lib/mp/cuentas.js` — connect / disconnect / load-and-decrypt / refresh.
- `lib/env.js` → `config.mp = { clientId, clientSecret, tokenKey, cronSecret, enabled }`.
- Routes under `app/api/mp/`; UI in `app/(app)/inicio/`, `app/(app)/config/` + a `mp`
  prop on `Sheet`.

New env vars (server only): `MP_CLIENT_ID`, `MP_CLIENT_SECRET` (the owner's MP app, for
OAuth), `MP_TOKEN_KEY` (32 random bytes, hex), `CRON_SECRET`.

## Testing

- **First step of the implementation — OAuth spike** with the owner's account: does MP
  let the app owner authorize their own app, what `scope` comes back, do
  payments/search and the release report (request + download) work with that token,
  and is a harmless write rejected (only with the owner's explicit OK). The result
  decides whether OAuth is the primary path or the paste-token fallback becomes it.
- `node --test` (built-in, no new dependency) on the pure modules, with fixtures taken
  from the real 2026-10-13 data, anonymized: the 9 operation/status combinations seen,
  Google (tax-inclusive amount), the `-04:00` → AR date conversion near midnight,
  report rows with `reserve_*` pairs and `asset_management`, duplicate matching edges.
- Manual end-to-end in `next dev`: call the sync with the secret, check rows in
  Supabase, add / discard / link from `/inicio`. Writing to the shared Supabase project
  and enabling `pg_cron` are live changes and are confirmed with the owner first.

## Risks

- The release report API is meant for sellers' reconciliation; MP can change it without
  notice. The sync isolates each source, so a broken report only stops payouts.
- Card payments via MP may duplicate what is later entered from the card statement;
  the 💳 chip and the duplicate check cover it.
