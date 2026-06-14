import { createClient } from '@supabase/supabase-js'
import { config } from '../config/env.js'

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

// LIBRO COMPARTIDO: la app es de la familia (acceso restringido por lista blanca,
// ver config/acceso.js), así que listar / editar / borrar operan sobre TODOS los
// gastos, sin filtrar por usuario. Igual guardamos en cada gasto quién lo cargó
// (cargado_por) y a nombre de quién es (a_nombre_de = quién hizo el gasto).
// El primer parámetro `_userId` se ignora a propósito (se mantiene por compatibilidad).

// Lista todos los gastos de la familia, del más nuevo al más viejo.
export async function listarGastos(_userId) {
  const { data, error } = await getClient()
    .from('gastos')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Trae un solo gasto por id (para precargar el formulario de edición).
export async function obtenerGasto(_userId, id) {
  const { data, error } = await getClient().from('gastos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data // null si no existe
}

// Crea un gasto. `userId`/`cargadoPor` identifican a quién lo cargó (desde la sesión).
export async function crearGasto(userId, cargadoPor, gasto) {
  const aNombreDe = gasto.a_nombre_de ? String(gasto.a_nombre_de) : cargadoPor
  const { data, error } = await getClient()
    .from('gastos')
    .insert({
      user_id: userId,
      cargado_por: cargadoPor,
      a_nombre_de: aNombreDe,
      descripcion: gasto.descripcion,
      monto: gasto.monto,
      moneda: normalizarMoneda(gasto.moneda),
      categoria: gasto.categoria ?? null,
      fecha: gasto.fecha ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Actualiza un gasto por id (libro compartido: cualquiera de la familia puede editarlo).
export async function actualizarGasto(_userId, id, gasto) {
  const { data, error } = await getClient()
    .from('gastos')
    .update({
      descripcion: gasto.descripcion,
      monto: gasto.monto,
      moneda: normalizarMoneda(gasto.moneda),
      a_nombre_de: gasto.a_nombre_de,
      categoria: gasto.categoria ?? null,
      fecha: gasto.fecha ?? null,
    })
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) throw error
  return data
}

// Borra un gasto por id (libro compartido).
export async function eliminarGasto(_userId, id) {
  const { error } = await getClient().from('gastos').delete().eq('id', id)
  if (error) throw error
}
