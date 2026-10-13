---
name: mercadopago
description: "Feature IMPLEMENTADA (rama feat/mercadopago-pendientes, 2026-10-13): egresos de Mercado Pago como 'pendientes de cargar', por persona (cada uno con su token). Qué devuelve la API de MP (validado con datos reales 2026-10-13), qué no, y decisiones tomadas. Diseño completo en docs/superpowers/specs/2026-10-13-mercadopago-pending-expenses-design.md. Leer antes de tocar algo de MP."
metadata:
  node_type: memory
  type: project
---

# Mercado Pago → gastos pendientes de cargar

**Estado (2026-10-13):** implementado en la rama `feat/mercadopago-pendientes` (plan
`docs/superpowers/plans/2026-10-13-mercadopago-pending-expenses.md`, spec al lado). Tablas `mp_*`
creadas en Supabase (`supabase/migrations/20261013120000_mercadopago.sql`). Probado en local con la
cuenta real (Tasks 9–12 del plan). Backup previo de las tablas en
`C:\Users\musia\Desktop\Proyectos\_SinCliente\backups\gastos-2026-10-13\`. Pendiente: cron en Supabase
(`supabase/cron/mp-sync.sql`, el secreto lo carga Dani) y mergear la rama a main. Código en `lib/mp/`,
rutas en `app/api/mp/`, tests `npm test`. **MP_TOKEN_KEY tiene que ser IGUAL en local y en Vercel**
(la DB es la misma: con otra clave no se pueden descifrar las cuentas conectadas). Stack en
[[app-arquitectura]], DB en [[supabase]], deploy en [[vercel-deployment]].

## Decisiones tomadas
- **Por persona**: cada token de MP es la cuenta de una persona y sus pendientes se ven SOLO a ella
  (filtro por email de sesión). Cada uno conecta su cuenta desde `/config`: botón OAuth "Conectar con Mercado Pago" (principal; Dani Mujer no necesita ser developer) o pegando su token (plan B). Tokens cifrados AES-256-GCM en `mp_cuentas` con `MP_TOKEN_KEY`; nunca vuelven al navegador. (`MP_ACCOUNTS` quedó descartado.)
  Hoy solo Dani Hombre; Dani Mujer se suma agregando su par. `CRON_SECRET` es otra cosa: la llave del cron.
- **Incluir pagos con tarjeta vía MP**, con chip 💳 (el chequeo "¿ya lo cargaste?" cubre el duplicado con el resumen).
- **Disparador**: Supabase `pg_cron` + `pg_net` cada 15 min (secret en Vault) + sync al abrir `/inicio` (si > 5 min).
  Activar pg_cron y crear tablas = cambio en sistema vivo → confirmar con Dani antes.
- Sin backfill: la primera sync de cada cuenta importa desde ayer.
- Categoría: la IA (`revisarGasto` de `lib/ia.js`) se llama en el server al detectar el movimiento.
  OJO: hoy "Automático" en la hoja manual guarda "Otros" sin IA (`revisarVoz` en `lib/api.js` no lo usa nadie).
- Contactos aprendidos: al confirmar una transferencia se guarda nombre/categoría/compartido del destino
  (`mp:<collector_id>` o `cbu:<cuenta>`) y la próxima viene precargada.

## OAuth (spike 2026-10-13, script `MP/probar_oauth.py`)
- El dueño de la app SÍ puede autorizar su propia app. Redirect URL registrada: `https://gastos-danis.vercel.app/api/mp/callback`. Panel: read ☑, offline access ☑, write ☐.
- Token OAuth: 180 días + refresh token. Lee /users/me, payments/search y release report (list/config/POST → 202).
- **NO se puede hacer solo lectura**: desmarcar write saca solo el `write` genérico; MP igual da 21 scopes `urn:mp:…/read-write` según el PRODUCTO (Checkout Pro: payments, cancel, refunds, preference, customers, cards, subs, POS) e IGNORA `scope=read offline_access` en la URL. La pantalla de consentimiento dice "cancelar y devolver". Ninguno permite transferir a terceros.
- Decisión: aceptar y limitar del lado nuestro (allowlist de rutas en `lib/mp/client.js`, token cifrado). Sin probar: si otro producto (Pagos presenciales/Suscripciones) da menos scopes.
- **Punta a punta OK (2026-10-13, `MP/probar_e2e.py`)**: refresh_token → 200 (el refresh token ROTA, hay que guardarlo cada vez); payments/search mapeado (fecha AR correcta, monto total_paid_amount); release report pedido → CSV listo en 42 s → payouts parseados. Coincide con el CSV manual. `client_credentials` (solo ID+Secret) también da token con los mismos 25 scopes pero sin refresh y solo para la cuenta dueña de la app.
- Tokens de prueba en `MP/.env` (MP_OAUTH_ACCESS_TOKEN / MP_OAUTH_REFRESH_TOKEN), fuera del repo.

## Credenciales
- App en https://www.mercadopago.com.ar/developers/panel/app (cuenta personal de Dani Hombre). El "tipo de
  solución" da igual. Se usa solo el **Access Token de producción** (`APP_USR-…`); `TEST-…` da reportes vacíos.
- El token da acceso a la cuenta: solo servidor, nunca al repo. Si se filtra → "Renovar credenciales".
- Script de prueba (Python stdlib) + `.env` con el token: `C:\Users\musia\Desktop\Proyectos\_SinCliente\MP\`
  (fuera del repo). Ojo: `probar_mp.py` corta `date_created[:16]` y por eso parecía haber desfase horario.

## Qué devuelve la API (probado 2026-10-13, 30 días reales)

### Fuente principal — `GET /v1/payments/search?payer.id={GET /users/me → id}` (sincrónico)
- `operation_type` vistos (30 días, 54 resultados): `regular_payment` (QR/débito/checkout/tarjeta),
  `money_transfer` (**transferencias a cuentas MP**, desc "Varios"), `recurring_payment` (suscripciones)
  → **quedarse con esos 3**. `account_fund` (fondeo: "Bank Transfer" de 4M, cargas de saldo) y
  `operation_fund` (DEBIN/tarjeta que MP usa para completar un payout) → **excluir**.
  Ej.: payout de 4.500 = 2.954,83 de saldo + 1.545,17 fondeados con tarjeta (`account_fund`).
- **Monto real = `transaction_details.total_paid_amount`** (incluye impuestos: Google 7.569,82 → 9.939,55,
  igual al débito del reporte; tarjeta en cuotas: 21.500 → 22.033).
- Fechas ISO con offset `-04:00`: el instante es correcto (13:45-04 = 14:45-03 del reporte). Parsear con
  offset y pasar a `America/Argentina/Buenos_Aires`; nunca cortar el string.
- `status`: `approved` (normal), `authorized`/`pending_capture` (Rappi, se aprueba hasta 3 días después),
  `cancelled`/`by_payer`. Re-mirar los últimos 7 días en cada sync.
- Destinatario de `money_transfer`: `collector.id` → `GET /users/{id}` da `nickname` (a veces legible
  "FEDERICOFRIGOLI", a veces código "CADA1117180"). Sirve solo como sugerencia.
- Todo en ARS (los USD de Google ya vienen convertidos).
- El `id` coincide con `SOURCE_ID` de las filas `payment` del reporte.

### Release report (`release_report`, asincrónico) → SOLO para `payout`
`payout` = transferencia a CBU/CVU fuera de MP; payments/search no la trae. Todo lo demás del reporte
(payment, reserve_*, asset_management, balances, total) se ignora.
Docs: https://www.mercadopago.com.ar/developers/es/docs/reports/released-money/api
1. Config (una vez por cuenta; `GET` → `PUT` si existe, si no `POST`) `/v1/account/release_report/config`:
   ```json
   { "file_name_prefix": "prueba-gastos",
     "columns": [{"key":"DATE"},{"key":"SOURCE_ID"},{"key":"EXTERNAL_REFERENCE"},{"key":"RECORD_TYPE"},
                 {"key":"DESCRIPTION"},{"key":"NET_CREDIT_AMOUNT"},{"key":"NET_DEBIT_AMOUNT"},{"key":"GROSS_AMOUNT"},
                 {"key":"CURRENCY"},{"key":"PAYMENT_METHOD"},{"key":"PAYMENT_METHOD_TYPE"},{"key":"PAYER_NAME"},
                 {"key":"POS_NAME"},{"key":"STORE_NAME"},{"key":"TRANSACTION_DATE"},{"key":"BALANCE_AMOUNT"},
                 {"key":"PAYOUT_BANK_ACCOUNT_NUMBER"}],
     "separator": ",", "display_timezone": "GMT-03", "report_translation": "en",
     "include_withdrawal_at_end": false, "execute_after_withdrawal": false,
     "check_available_balance": true, "compensate_detail": true,
     "frequency": {"hour": 0, "type": "monthly", "value": 1} }
   ```
   (`frequency` obligatorio; rechaza `daily`.) El CSV sale con las columnas en **otro orden** que el
   pedido → parsear por nombre de header, no por posición.
2. `POST /v1/account/release_report` `{"begin_date","end_date"}` (UTC, `end_date` ≤ ahora−5 min) → 202.
3. `GET /v1/account/release_report/list` hasta que aparezca el `.csv` nuevo (segundos a ~2 min).
4. `GET /v1/account/release_report/{file_name}`.
- Filas: `RECORD_TYPE=release`, `DESCRIPTION=payout`, `NET_DEBIT_AMOUNT>0`,
  `PAYOUT_BANK_ACCOUNT_NUMBER` = destino (22 dígitos). Prefijo → banco (017 BBVA, 072 Santander,
  143 Brubank, `000…` CVU de billetera).

## Lo que NO se puede
- Nombre del titular de un CBU destino: `/v1/payouts/{id}` → 403, COELSA solo para entidades.
  → nombre lo carga la persona la primera vez (contactos aprendidos).
- Webhooks: solo avisan cobros, no pagos propios → polling.
- Es una API de conciliación de vendedores, uso no oficial: puede cambiar sin aviso → cada fuente y cada
  cuenta aislada, fallar suave, nunca romper la app.
- Antecedente: https://github.com/TomasJunor/registro-de-gastos usa el mismo reporte.

## Fase 2 (no ahora)
Push (VAPID + `public/sw.js` sin romper su regla de solo cachear imágenes): "Pagaste $X en Y — ¿lo cargo?".
