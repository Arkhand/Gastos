import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { config } from './env.js'

// supabase-js inicializa su componente Realtime (WebSocket) al crear el cliente,
// aunque acá solo usemos consultas REST. Node < 22 no trae `WebSocket` nativo
// (en local corremos Node 20; en Vercel, Node 24 sí lo tiene), así que le damos
// el de `ws` SOLO cuando falta el nativo. En producción no se toca nada.
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = ws

// Si faltan las variables, la DB queda deshabilitada pero la app NO crashea.
export const dbEnabled = config.supabase.enabled

let supabase = null

if (config.supabase.enabled) {
  // La service_role key se usa SOLO del lado servidor (Express). Omite RLS, así
  // que nunca debe exponerse al cliente.
  supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
} else {
  console.warn(
    '[db] Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
      'La base de datos está deshabilitada hasta configurar la integración de Supabase.'
  )
}

// Monedas soportadas.
export const MONEDAS = ['ARS', 'USD']

export function normalizarMoneda(valor) {
  return valor === 'USD' ? 'USD' : 'ARS' // por defecto ARS
}

function getClient() {
  if (!supabase) {
    throw new Error('Base de datos no configurada (faltan variables de Supabase).')
  }
  return supabase
}

// LIBRO COMPARTIDO + BORRADO LÓGICO:
// - La app es de la familia (acceso por lista blanca), así que se opera sobre TODOS
//   los gastos, sin filtrar por usuario (el primer parámetro `_userId` se ignora).
// - Borrar no es físico: `eliminado=true` marca de baja. Editar es un UPDATE en sitio
//   sobre la misma fila (conserva el id), así un doble-guardado nunca duplica.

// Lista los gastos activos (no eliminados), del más nuevo al más viejo.
export async function listarGastos(_userId) {
  const { data, error } = await getClient()
    .from('gastos')
    .select('*')
    .eq('eliminado', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Trae un gasto por id (sin importar si está eliminado o no).
export async function obtenerGasto(_userId, id) {
  const { data, error } = await getClient().from('gastos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

// Crea un gasto. `userId`/`cargadoPor` identifican a quién lo cargó (desde la sesión).
export async function crearGasto(userId, cargadoPor, gasto) {
  const { data, error } = await getClient()
    .from('gastos')
    .insert({
      user_id: userId,
      cargado_por: cargadoPor,
      a_nombre_de: gasto.a_nombre_de ?? null,
      descripcion: gasto.descripcion,
      monto: gasto.monto,
      moneda: normalizarMoneda(gasto.moneda),
      monto_ars: gasto.monto_ars ?? null,
      monto_usd: gasto.monto_usd ?? null,
      categoria: gasto.categoria ?? null,
      fecha: gasto.fecha ?? null,
      compartido: gasto.compartido ?? true,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Editar EN SITIO: un UPDATE sobre la misma fila (mismo id). Antes hacíamos
// baja-lógica + alta, lo que cambiaba el id en cada edición y, ante un doble-submit,
// dejaba duplicados. Editando in situ el id no cambia: dos guardados seguidos hacen
// el mismo UPDATE y nunca duplican. `user_id`/`cargado_por`/`created_at` no se tocan.
export async function actualizarGasto(_userId, id, gasto) {
  const { data, error } = await getClient()
    .from('gastos')
    .update({
      a_nombre_de: gasto.a_nombre_de ?? null,
      descripcion: gasto.descripcion,
      monto: gasto.monto,
      moneda: normalizarMoneda(gasto.moneda),
      monto_ars: gasto.monto_ars ?? null,
      monto_usd: gasto.monto_usd ?? null,
      categoria: gasto.categoria ?? null,
      fecha: gasto.fecha ?? null,
      compartido: gasto.compartido ?? true,
    })
    .eq('id', id)
    .eq('eliminado', false)
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

// Corrección puntual de la IA (carga manual): actualiza SOLO descripción y
// categoría in situ (mismo id y created_at). actualizarGasto edita todos los
// campos; esta toca solo esos dos para no pisar lo que la persona ya había puesto.
export async function corregirGasto(_userId, id, { descripcion, categoria }) {
  const { error } = await getClient()
    .from('gastos')
    .update({ descripcion, categoria })
    .eq('id', id)
    .eq('eliminado', false)
  if (error) throw error
}

// Borrado lógico: marca el gasto como eliminado (no se borra físicamente).
export async function eliminarGasto(_userId, id) {
  const { error } = await getClient().from('gastos').update({ eliminado: true }).eq('id', id)
  if (error) throw error
}

// ===== Categorías =====
// Tabla `categorias`: la clave es un UUID; el `nombre` es texto único (entre las
// activas). Los gastos guardan el UUID en `gastos.categoria`. La capa de cache
// (config/categorias.js) consume listarCategorias() y mantiene helpers síncronos.

// Trae TODAS las categorías (activas y con marca de borrado), ordenadas. La cache
// se queda con las activas; la pantalla de Configuración muestra ambas.
export async function listarCategorias() {
  const { data, error } = await getClient()
    .from('categorias')
    .select('*')
    .order('orden', { ascending: true })
  if (error) throw error
  return data ?? []
}

// Alta de una categoría. El UUID lo genera la BD (default gen_random_uuid()).
export async function crearCategoria(cat) {
  const { data, error } = await getClient()
    .from('categorias')
    .insert({
      nombre: cat.nombre,
      emoji: cat.emoji ?? '✨',
      color_bg: cat.color_bg ?? '#e3e0ea',
      color_ink: cat.color_ink ?? '#5a5570',
      hint: cat.hint ?? null,
      orden: cat.orden ?? 100,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Edita campos visibles/de IA de una categoría (nombre, emoji, hint, color).
// No cambia el id (UUID), así los gastos asociados siguen apuntando a ella.
export async function actualizarCategoria(id, campos) {
  const { data, error } = await getClient()
    .from('categorias')
    .update(campos)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// Pone o saca la marca de borrado (soft-delete / revivir). Una categoría marcada
// no se ofrece en la UI ni a la IA, pero sus gastos viejos siguen resolviéndola.
export async function marcarCategoriaEliminada(id, eliminado) {
  const { error } = await getClient()
    .from('categorias')
    .update({ eliminado: !!eliminado })
    .eq('id', id)
  if (error) throw error
}

// Borrado físico (solo cuando la categoría NO tiene gastos asociados).
export async function eliminarCategoriaFisica(id) {
  const { error } = await getClient().from('categorias').delete().eq('id', id)
  if (error) throw error
}

// Cuántos gastos ACTIVOS usan esta categoría. Decide soft-delete vs borrado real.
export async function contarGastosDeCategoria(id) {
  const { count, error } = await getClient()
    .from('gastos')
    .select('id', { count: 'exact', head: true })
    .eq('categoria', id)
    .eq('eliminado', false)
  if (error) throw error
  return count ?? 0
}

// ===== División (config global de %) =====
// Tabla `division`: una fila por integrante (clave = email canónico). Define qué
// porcentaje del total compartido le toca a cada uno. La cache (config/division.js)
// la consume y mantiene helpers síncronos, igual que las categorías.

// Trae el % de cada integrante.
export async function listarDivision() {
  const { data, error } = await getClient().from('division').select('*')
  if (error) throw error
  return data ?? []
}

// Upsert del % de un integrante (alta o edición por email).
export async function guardarDivision(persona, porcentaje) {
  const { error } = await getClient()
    .from('division')
    .upsert({ persona, porcentaje, updated_at: new Date().toISOString() })
  if (error) throw error
}

// ===== Cierres (foto congelada por mes) =====
// Tabla `cierres`: una fila por mes cerrado (clave = 'YYYY-MM'). Guarda la foto del
// % acordado en `division` (jsonb { email: pct }). Si existe la fila, el mes está
// cerrado (🤝): el reparto usa esa foto y no el % global vigente.

// Trae todos los cierres (para marcar qué meses están cerrados en el selector).
export async function listarCierres() {
  const { data, error } = await getClient().from('cierres').select('*')
  if (error) throw error
  return data ?? []
}

// Trae el cierre de un mes (o null si está abierto).
export async function obtenerCierre(mes) {
  const { data, error } = await getClient().from('cierres').select('*').eq('mes', mes).maybeSingle()
  if (error) throw error
  return data
}

// Cierra un mes: congela la foto del % y quién lo cerró. Definitivo (no se reabre).
export async function crearCierre(mes, division, cerradoPor) {
  const { data, error } = await getClient()
    .from('cierres')
    .insert({ mes, division, cerrado_por: cerradoPor ?? null })
    .select()
    .single()
  if (error) throw error
  return data
}
