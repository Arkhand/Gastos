// Cotización del dólar bolsa (MEP) desde dolarapi.com, para convertir montos.
// Usamos el PROMEDIO de compra y venta. Cacheamos en memoria (~30 min) para no
// pegarle a la API en cada gasto. Si falla, devolvemos la última conocida (o null).
const URL = 'https://dolarapi.com/v1/dolares/bolsa'
const TTL = 30 * 60 * 1000

let cache = { rate: null, ts: 0 }

export async function obtenerCotizacion() {
  const now = Date.now()
  if (cache.rate && now - cache.ts < TTL) return cache.rate
  try {
    const res = await fetch(URL)
    if (!res.ok) throw new Error('status ' + res.status)
    const data = await res.json()
    const rate = (Number(data.compra) + Number(data.venta)) / 2
    if (Number.isFinite(rate) && rate > 0) {
      cache = { rate, ts: now }
      return rate
    }
    throw new Error('cotización inválida')
  } catch (err) {
    console.error('[cotizacion]', err.message)
    return cache.rate // última conocida (o null si nunca hubo)
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}

// Dada la moneda y el monto ingresados, devuelve { monto_ars, monto_usd }.
export function convertirMontos(moneda, monto, rate) {
  const m = Number(monto) || 0
  if (!rate || rate <= 0) {
    // Sin cotización: guardamos el lado conocido; el otro queda null.
    return { monto_ars: moneda === 'USD' ? null : m, monto_usd: moneda === 'USD' ? m : null }
  }
  if (moneda === 'USD') {
    return { monto_usd: round2(m), monto_ars: round2(m * rate) }
  }
  return { monto_ars: round2(m), monto_usd: round2(m / rate) }
}
