// División de los gastos compartidos: qué porcentaje del total le toca a cada
// integrante. Vive en la tabla `division` de Supabase (clave = email canónico,
// los mismos PERSONA_IDS de personas.js). Igual que las categorías y la cotización
// del dólar, mantenemos una CACHE en memoria para leerla de forma SÍNCRONA desde
// las vistas y los controladores: se refresca cada TTL y, si la BD falla, se
// conserva la última conocida. El fallback es 50/50 derivado de las personas.
import { dbEnabled, listarDivision as dbListarDivision } from './db.js'
import { PERSONAS, PERSONA_IDS, personaLabel } from './personas.js'

// Reparto equitativo entre las personas actuales (fallback si la BD no respondió).
function divisionEquitativa() {
  const n = PERSONA_IDS.length || 1
  const pct = Math.round((100 / n) * 100) / 100
  const map = {}
  PERSONA_IDS.forEach((id) => (map[id] = pct))
  return map
}

const TTL = 60 * 1000 // 1 min: el % casi nunca cambia.
let _cache = divisionEquitativa()
let _ts = 0

// Refresca la cache desde la BD si pasó el TTL. Si falla, conserva lo último
// (stale-on-fail). No-op si la DB está off. Solo considera a las personas
// actuales; ignora filas viejas de integrantes que ya no existen.
export async function ensureDivisionCargada() {
  if (!dbEnabled) return
  const now = Date.now()
  if (_ts && now - _ts < TTL) return
  try {
    const filas = await dbListarDivision()
    const map = {}
    for (const f of filas || []) {
      if (PERSONA_IDS.includes(f.persona)) map[f.persona] = Number(f.porcentaje) || 0
    }
    // Solo reemplazamos si vino al menos una persona conocida (una tabla vacía
    // dejaría el reparto en 0 y rompería el total).
    if (Object.keys(map).length > 0) {
      // Completar con 0 las personas sin fila, para que el mapa tenga a todas.
      PERSONA_IDS.forEach((id) => { if (!(id in map)) map[id] = 0 })
      _cache = map
    }
    _ts = now
  } catch (err) {
    console.error('[division]', err.message)
    // Conservamos _cache (última conocida o equitativa).
  }
}

// Fuerza un refresh inmediato (tras guardar desde Configuración).
export async function recargarDivision() {
  _ts = 0
  await ensureDivisionCargada()
}

// Mapa { email: porcentaje } de las personas actuales (lee la cache, no la red).
export function getDivision() {
  return { ..._cache }
}

// Aplica un mapa de % a los totales y arma las filas por persona para la vista.
// `divMap` puede ser el global (getDivision) o la foto congelada de un cierre.
// Devuelve solo las personas con % > 0 (las que participan del reparto).
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

// Saldo del ajuste de cuentas (para 2 integrantes). Compara lo que cada uno PAGÓ
// (suma de sus gastos compartidos) contra lo que le TOCABA según el %, y devuelve
// quién le debe a quién, por separado en ARS y USD.
//   - totalArs/totalUsd: total compartido del mes.
//   - pagado: { email: { ars, usd } } lo que efectivamente puso cada uno.
//   - divMap: { email: pct } el % a aplicar (global o foto del cierre).
// Devuelve { ars, usd } donde cada moneda es null (saldado / sin movimiento) o
// { deudor:{label,emoji}, acreedor:{label,emoji}, monto }.
export function calcularSaldo(totalArs, totalUsd, pagado, divMap) {
  // Tomamos las dos personas que participan (con % definido). El modelo asume 2.
  const partes = PERSONAS.filter((p) => divMap && p.id in divMap)
  function saldoMoneda(total, key) {
    if (partes.length !== 2 || !(Number(total) > 0)) return null
    // Balance de cada uno: lo que puso menos lo que le tocaba. Positivo = puso de
    // más (le prestó al otro); negativo = puso de menos (debe).
    const balance = partes.map((p) => {
      const puso = Number(pagado?.[p.id]?.[key]) || 0
      const tocaba = total * ((Number(divMap[p.id]) || 0) / 100)
      return { p, dif: puso - tocaba }
    })
    // Acreedor: balance positivo. Deudor: negativo. Si están a mano, no hay deuda.
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

// Etiqueta amable de un email (reexport práctico para las vistas del cierre).
export { personaLabel }
