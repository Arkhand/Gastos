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
