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
