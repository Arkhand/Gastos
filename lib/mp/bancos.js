// Banco a partir de los 3 primeros dígitos del CBU (CVU = 000). Sirve como
// sugerencia de "a quién" cuando todavía no le pusimos nombre a la cuenta.
const BANCOS = {
  '000': 'billetera virtual (CVU)',
  '007': 'Galicia',
  '011': 'Nación',
  '014': 'Provincia',
  '015': 'ICBC',
  '017': 'BBVA',
  '027': 'Supervielle',
  '034': 'Patagonia',
  '044': 'Hipotecario',
  '072': 'Santander',
  '143': 'Brubank',
  '150': 'HSBC',
  '191': 'Credicoop',
  '259': 'Itaú',
  '285': 'Macro',
  '299': 'Comafi',
}

export function bancoDeCuenta(cuenta) {
  const c = String(cuenta || '').replace(/\D/g, '')
  if (c.length !== 22) return null
  return BANCOS[c.slice(0, 3)] ?? `banco ${c.slice(0, 3)}`
}
