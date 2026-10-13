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
