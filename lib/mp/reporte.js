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

// UNA vez por día, desde esta hora argentina: cada reporte le manda a la persona un mail
// de MP ("el reporte para conciliar tu dinero liberado está listo") que no se puede
// apagar por la API. A las 20 entran el mismo día las transferencias del día (Dani).
export const HORA_REPORTE_AR = 20
// Más de 2 períodos del cron (15 min): la corrida siguiente siempre cae adentro.
const VENTANA_BAJADA = 40 * 60_000

const AR = (ms) => new Date(ms - 3 * 3600_000) // Argentina = UTC-3, sin DST
const diaAR = (ms) => AR(ms).toISOString().slice(0, 10)

// 'bajar': hay un pedido reciente → buscar el archivo. 'pedir': no hay pedido (o se
// perdió: >40 min sin archivo) y hoy todavía no se bajó, ya pasadas las 20 AR (o
// nunca se bajó). 'nada': esperar.
export function accionReporte(sync, ahora = Date.now()) {
  const pedido = sync?.report_requested_at ? Date.parse(sync.report_requested_at) : null
  if (pedido && ahora - pedido < VENTANA_BAJADA) return 'bajar'
  if (pedido) return 'pedir'
  if (!sync?.report_downloaded_at) return 'pedir'
  const yaHoy = diaAR(Date.parse(sync.report_downloaded_at)) === diaAR(ahora)
  return !yaHoy && AR(ahora).getUTCHours() >= HORA_REPORTE_AR ? 'pedir' : 'nada'
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
