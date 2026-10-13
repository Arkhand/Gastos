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
