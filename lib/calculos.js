// Cálculos y formateo puros, extraídos de gastosController.js para reusar tanto en
// las API routes (server) como en los componentes (client). Sin acoplamiento a
// Express ni a las vistas. Los montos ARS/USD vienen ya convertidos desde la BD.
import { hoyAR, ayerAR, fechaCorta } from './fecha.js'
import { catById } from './categorias.js'
import { PERSONAS, normalizarPersona } from './personas.js'

// Formatea un monto con su signo de moneda (es-AR: el punto separa miles).
export function fmtMonto(moneda, valor) {
  const n = Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return moneda === 'USD' ? `US$ ${n}` : `$ ${n}`
}

// Total por moneda (ARS y USD no se suman entre sí).
export function totalesPorMoneda(gastos) {
  const t = gastos.reduce((acc, g) => {
    acc[g.moneda] = (acc[g.moneda] ?? 0) + Number(g.monto)
    return acc
  }, {})
  return (
    Object.entries(t)
      .map(([m, v]) => fmtMonto(m, v))
      .join(' · ') || '$ 0'
  )
}

// Agrupa los gastos por fecha, con etiqueta amigable (Hoy / Ayer / la fecha).
export function agruparPorDia(gastos) {
  const hoy = hoyAR()
  const ayer = ayerAR()
  const grupos = new Map()
  for (const g of gastos) {
    const fecha = g.fecha || hoy
    if (!grupos.has(fecha)) grupos.set(fecha, [])
    grupos.get(fecha).push(g)
  }
  return [...grupos.entries()].map(([fecha, items]) => ({
    fecha,
    etiqueta: fecha === hoy ? 'Hoy' : fecha === ayer ? 'Ayer' : fecha,
    items,
    totalStr: totalesPorMoneda(items),
  }))
}

// Descripciones más usadas, para el autocompletado (datalist) de la hoja.
export function sugerenciasDescripcion(gastos, limite = 20) {
  const cuenta = new Map()
  for (const g of gastos) {
    const d = (g.descripcion || '').trim()
    if (!d) continue
    cuenta.set(d, (cuenta.get(d) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([d]) => d)
}

// Construye una fila por gasto con TODO el display resuelto (la UI solo formatea
// números). Equivalente a filaMovimiento del controller viejo.
export function filaMovimiento(g, hoy = hoyAR()) {
  const fecha = g.fecha || hoy
  const cat = catById(g.categoria)
  const perId = normalizarPersona(g.a_nombre_de)
  const per = PERSONAS.find((p) => p.id === perId)
  const moneda = g.moneda === 'USD' ? 'USD' : 'ARS'
  return {
    id: g.id,
    fecha,
    fechaLabel: fechaCorta(fecha),
    per: perId || '',
    perLabel: per ? per.label : g.a_nombre_de || '—',
    perEmoji: per ? per.emoji : '👤',
    desc: g.descripcion || '',
    cat: cat.id,
    catLabel: cat.label,
    catEmoji: cat.emoji,
    cur: moneda,
    amt: Number(g.monto) || 0,
    ars: g.monto_ars != null ? Number(g.monto_ars) : moneda === 'ARS' ? Number(g.monto) : null,
    usd: g.monto_usd != null ? Number(g.monto_usd) : moneda === 'USD' ? Number(g.monto) : null,
    compartido: g.compartido !== false,
  }
}
