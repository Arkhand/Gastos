// Categorías de los gastos. Antes eran fijas; ahora se administran desde la app
// (sección Configuración) y viven en la tabla `categorias` de Supabase. La CLAVE
// de cada categoría es un UUID; los gastos guardan ese UUID en `gastos.categoria`.
//
// Para no volver asíncrono medio código (los chips de la hoja, la lista de gastos,
// Resumen y los helpers catById/normalizarCategoria se usan de forma SÍNCRONA),
// mantenemos una CACHE en memoria, igual que la cotización del dólar
// (ver models/cotizacion.js): se refresca cada TTL y, si la BD falla, se conserva
// la última conocida. El SEED inicial (las 8 de siempre) es el fallback cuando la
// base está deshabilitada o todavía no respondió.
import {
  dbEnabled,
  listarCategorias as dbListarCategorias,
} from './db.js'

// Paleta pastel del diseño (chibi). De acá sale el color de las categorías nuevas:
// el usuario solo elige nombre + emoji. Cada entrada es [fondo, tinta].
export const PALETA = [
  ['#ffd9cf', '#c0492f'], // coral
  ['#cdeccf', '#2f7d46'], // verde
  ['#ffe6b3', '#9a6a16'], // ámbar
  ['#e6d6f7', '#6a3fa0'], // violeta
  ['#ffd6e2', '#b23a63'], // rosa
  ['#cfe6f7', '#2f6a9a'], // celeste
  ['#cdeef0', '#1f7d86'], // turquesa
  ['#d9efcf', '#4d7d2f'], // lima
  ['#ffe0cc', '#b5611f'], // durazno
  ['#dcdcf7', '#4a47a0'], // índigo
  ['#f7e2cf', '#8a5a2f'], // arena
  ['#e3e0ea', '#5a5570'], // gris (neutro, el de "Otros")
]

// SEED: las 8 categorías de siempre, con su color/pista actuales. Sirve de
// fallback en memoria. Sus `id` son legibles (no UUID) solo para este caso: si la
// BD nunca responde, igual hay categorías usables y "otros" sigue siendo el fallback.
const SEED = [
  cat('comida', 'Comida', '🍔', '#ffd9cf', '#c0492f', 10, false),
  cat('super', 'Súper', '🛒', '#cdeccf', '#2f7d46', 20, false),
  cat('transporte', 'Transporte', '🚕', '#ffe6b3', '#9a6a16', 30, false),
  cat('salidas', 'Salidas', '🍻', '#e6d6f7', '#6a3fa0', 40, false),
  cat('salud', 'Salud', '💊', '#ffd6e2', '#b23a63', 50, false),
  cat('hogar', 'Hogar', '🏠', '#cfe6f7', '#2f6a9a', 60, false),
  cat('servicios', 'Servicios', '💡', '#cdeef0', '#1f7d86', 70, false),
  cat('otros', 'Otros', '✨', '#e3e0ea', '#5a5570', 999, true),
]

// Forma interna uniforme de una categoría (la usan las vistas y la IA).
// `label` es alias de `nombre` para no tocar las vistas (usan c.label).
function cat(id, nombre, emoji, colorBg, colorInk, orden, esOtros) {
  return {
    id,
    nombre,
    label: nombre,
    emoji,
    color_bg: colorBg,
    color_ink: colorInk,
    orden,
    es_otros: !!esOtros,
  }
}

// Normaliza una fila cruda de Supabase a la forma interna (agrega `label`).
function desdeFila(row) {
  return cat(
    row.id,
    row.nombre,
    row.emoji || '✨',
    row.color_bg || '#e3e0ea',
    row.color_ink || '#5a5570',
    Number.isFinite(row.orden) ? row.orden : 100,
    !!row.es_otros,
  )
}

const TTL = 60 * 1000 // 1 min: las categorías casi nunca cambian.
// La cache arranca con el SEED para que la primera request (antes del primer
// ensure) ya tenga categorías. ts=0 fuerza la primera recarga real.
let _cache = SEED.slice()
let _ts = 0

// Refresca la cache desde la BD si pasó el TTL. Si falla, conserva lo último
// (stale-on-fail) y loguea, igual que la cotización. No-op si la DB está off.
export async function ensureCategoriasCargadas() {
  if (!dbEnabled) return
  const now = Date.now()
  if (_ts && now - _ts < TTL) return
  try {
    const filas = await dbListarCategorias()
    // Solo reemplazamos si vino algo (una tabla vacía dejaría la app sin "otros").
    const activas = (filas || []).filter((f) => !f.eliminado)
    if (activas.length > 0) {
      _cache = activas.map(desdeFila).sort((a, b) => a.orden - b.orden)
      _ts = now
    } else {
      _ts = now // marcamos el intento; seguimos con el SEED.
    }
  } catch (err) {
    console.error('[categorias]', err.message)
    // Conservamos _cache (última conocida o SEED).
  }
}

// Fuerza un refresh inmediato (se llama tras crear/editar/borrar para que el
// redirect siguiente ya muestre lo nuevo, sin esperar el TTL).
export async function recargarCategorias() {
  _ts = 0
  await ensureCategoriasCargadas()
}

// --- Helpers SÍNCRONOS (leen la cache; no tocan la red) ---

// Todas las categorías activas, ordenadas (las que ve el usuario y la IA).
export function getCategorias() {
  return _cache
}

export function getCategoriaIds() {
  return _cache.map((c) => c.id)
}

// La categoría fallback ("Otros"). Siempre existe: si por algún motivo no está en
// la cache, cae en la última (que en el SEED es justamente "otros").
export function categoriaOtros() {
  return _cache.find((c) => c.es_otros) ?? _cache[_cache.length - 1]
}

// Id de "Otros": el default de la hoja y el destino de lo que la IA no mapea.
export function otrosId() {
  return categoriaOtros().id
}

// Devuelve la categoría por id (cae en "Otros" si no la encuentra: cubre gastos
// cuya categoría fue borrada o quedó fuera de sync).
export function catById(id) {
  return _cache.find((c) => c.id === id) ?? categoriaOtros()
}

// Normaliza un id recibido del formulario o de la IA a uno válido y activo.
export function normalizarCategoria(id) {
  return _cache.some((c) => c.id === id) ? id : otrosId()
}

// --- Utilidades para la sección de Configuración ---

// Normaliza un nombre para compararlo (sin acentos, minúsculas, espacios
// colapsados). Sirve para detectar duplicados de forma robusta ("Súper" == "super").
export function normalizarNombre(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // saca acentos (marcas diacríticas combinantes)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

// Elige una dupla [fondo, tinta] de la paleta de forma estable a partir del
// nombre (mismo nombre -> mismo color). Evita el gris (último) para categorías
// nuevas: ese queda reservado para "Otros".
export function colorPara(nombre) {
  const txt = normalizarNombre(nombre)
  let h = 0
  for (let i = 0; i < txt.length; i++) h = (h * 31 + txt.charCodeAt(i)) >>> 0
  const n = PALETA.length - 1 // -1 para excluir el gris neutro
  return PALETA[h % n]
}

// Genera el <style> que define las CSS vars de cada categoría por id. Se inyecta
// en el <head> DESPUÉS de style.css, así pisa por cascada los colores viejos y
// cualquier categoría (incluida una recién creada con UUID) tiene color. Las
// vistas siguen usando la clase .cat-<id> sin enterarse del cambio.
export function cssVarsCategorias() {
  const reglas = _cache
    .map(
      (c) =>
        `.cat-${cssEscapeId(c.id)}{--bg:${c.color_bg};--ink:${c.color_ink};}`,
    )
    .join('')
  return `<style id="cat-colors">${reglas}</style>`
}

// Los ids son UUIDs o slugs simples; por las dudas escapamos para selector CSS.
function cssEscapeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}
