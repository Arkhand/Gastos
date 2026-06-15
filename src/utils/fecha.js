// Fechas en horario de Argentina (sin DST), centralizadas para que la IA y la
// agrupación de la lista coincidan en qué es "hoy" y "ayer".
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}) // en-CA da el formato YYYY-MM-DD

export function hoyAR() {
  return fmt.format(new Date())
}

export function ayerAR() {
  return fmt.format(new Date(Date.now() - 24 * 60 * 60 * 1000))
}

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// "2026-06" -> "Junio 2026"
export function mesLabel(mes) {
  const [y, m] = String(mes).split('-').map(Number)
  if (!y || !m || m < 1 || m > 12) return String(mes)
  return MESES_ES[m - 1].charAt(0).toUpperCase() + MESES_ES[m - 1].slice(1) + ' ' + y
}

// "2026-06" -> "2026-05"
export function mesAnterior(mes) {
  let [y, m] = String(mes).split('-').map(Number)
  m -= 1
  if (m < 1) { m = 12; y -= 1 }
  return `${y}-${String(m).padStart(2, '0')}`
}

// "2026-06" -> "2026-07"
export function mesSiguiente(mes) {
  let [y, m] = String(mes).split('-').map(Number)
  m += 1
  if (m > 12) { m = 1; y += 1 }
  return `${y}-${String(m).padStart(2, '0')}`
}
