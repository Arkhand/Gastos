// Cálculos y formateo PUROS, extraídos de gastosController.js, para reusar en las
// API routes (server) y en los componentes (client). Sin dependencias del cliente
// de Supabase ni de la cache server: la resolución de categoría se pasa como
// función (catLookup), así este módulo es seguro de importar en cualquier lado.
import { hoyAR, ayerAR, fechaCorta } from './fecha.js'
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

// Construye una fila por gasto con TODO el display resuelto. `catLookup(id)` debe
// devolver la categoría { id, label, emoji } (cae en "Otros" si no existe). En el
// cliente se arma desde las categorías de la API; en el server, desde catById.
export function filaMovimiento(g, catLookup, hoy = hoyAR()) {
  const fecha = g.fecha || hoy
  const cat = catLookup(g.categoria)
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

// Helper para el cliente: arma un catLookup desde una lista de categorías de la API.
// Cae en "Otros" (o un placeholder) si el id no está.
export function hacerCatLookup(categorias, otrosId) {
  const byId = new Map(categorias.map((c) => [c.id, c]))
  const otros = byId.get(otrosId) || { id: otrosId, label: 'Otros', emoji: '✨' }
  return (id) => byId.get(id) || otros
}

// --- Reparto / saldo (para el ajuste de cuentas), puro y client-safe ---

// Mapa { email: porcentaje } -> filas por persona con lo que le toca pagar.
export function repartir(totalArs, totalUsd, divMap) {
  return PERSONAS.filter((p) => Number(divMap?.[p.id]) > 0).map((p) => {
    const pct = Number(divMap[p.id]) || 0
    return {
      persona: p.id,
      label: p.label,
      emoji: p.emoji,
      pctNum: pct,
      ars: (Number(totalArs) || 0) * (pct / 100),
      usd: (Number(totalUsd) || 0) * (pct / 100),
    }
  })
}

// Saldo del ajuste (2 integrantes): pagó vs. lo que tocaba -> quién debe a quién.
export function calcularSaldo(totalArs, totalUsd, pagado, divMap) {
  const partes = PERSONAS.filter((p) => divMap && p.id in divMap)
  function saldoMoneda(total, key) {
    if (partes.length !== 2 || !(Number(total) > 0)) return null
    const balance = partes.map((p) => {
      const puso = Number(pagado?.[p.id]?.[key]) || 0
      const tocaba = total * ((Number(divMap[p.id]) || 0) / 100)
      return { p, dif: puso - tocaba }
    })
    const acreedor = balance.find((b) => b.dif > 0.005)
    const deudor = balance.find((b) => b.dif < -0.005)
    if (!acreedor || !deudor) return null
    return {
      deudor: { label: deudor.p.label, emoji: deudor.p.emoji },
      acreedor: { label: acreedor.p.label, emoji: acreedor.p.emoji },
      monto: Math.round(Math.abs(deudor.dif) * 100) / 100,
    }
  }
  return { ars: saldoMoneda(totalArs, 'ars'), usd: saldoMoneda(totalUsd, 'usd') }
}
