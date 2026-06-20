// División de los gastos compartidos: qué porcentaje del total le toca a cada
// integrante. Vive en la tabla `division` de Supabase (clave = email canónico,
// los mismos PERSONA_IDS de personas.js). Igual que las categorías y la cotización
// del dólar, mantenemos una CACHE en memoria para leerla de forma SÍNCRONA desde
// las vistas y los controladores: se refresca cada TTL y, si la BD falla, se
// conserva la última conocida. El fallback es 50/50 derivado de las personas.
import { dbEnabled, listarDivision as dbListarDivision } from './db.js'
import { PERSONA_IDS } from './personas.js'

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

// Nota: `repartir` y `calcularSaldo` (cálculo puro del ajuste de cuentas) viven
// ahora en lib/calculos.js, que es client-safe (este módulo importa db.js y es
// server-only). El cliente calcula el saldo con los datos que recibe de la API.
