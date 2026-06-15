import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { config } from '../config/env.js'

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
// - Nada se borra físicamente: `eliminado=true` marca de baja. Editar = baja lógica
//   del registro anterior + alta de uno nuevo, así queda el historial completo.

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
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Editar = baja lógica del registro anterior + alta de uno nuevo (mantiene historial).
export async function actualizarGasto(_userId, id, gasto) {
  const sb = getClient()
  // 1. Traemos el registro anterior (para conservar quién lo cargó).
  const { data: anterior, error: e0 } = await sb.from('gastos').select('*').eq('id', id).maybeSingle()
  if (e0) throw e0
  if (!anterior) return null
  // 2. Baja lógica del anterior (queda en el historial).
  const { error: e1 } = await sb.from('gastos').update({ eliminado: true }).eq('id', id)
  if (e1) throw e1
  // 3. Alta del nuevo con los datos editados.
  const { data, error: e2 } = await sb
    .from('gastos')
    .insert({
      user_id: anterior.user_id,
      cargado_por: anterior.cargado_por,
      a_nombre_de: gasto.a_nombre_de ?? anterior.a_nombre_de,
      descripcion: gasto.descripcion,
      monto: gasto.monto,
      moneda: normalizarMoneda(gasto.moneda),
      monto_ars: gasto.monto_ars ?? null,
      monto_usd: gasto.monto_usd ?? null,
      categoria: gasto.categoria ?? null,
      fecha: gasto.fecha ?? null,
    })
    .select()
    .single()
  if (e2) throw e2
  return data
}

// Corrección puntual de la IA (carga manual): actualiza SOLO descripción y
// categoría in situ. A diferencia de actualizarGasto (baja+alta), mantiene el id
// y el created_at, así la fila no se reordena y se puede deshacer con el mismo id.
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
