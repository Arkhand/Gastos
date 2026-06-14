import { createClient } from '@supabase/supabase-js'
import { config } from '../config/env.js'

// Si faltan las variables, la DB queda deshabilitada pero la app NO crashea.
export const dbEnabled = config.supabase.enabled

let supabase = null

if (config.supabase.enabled) {
  // La service_role key se usa SOLO del lado servidor (Express). Omite RLS, así
  // que nunca debe exponerse al cliente. El filtrado por usuario lo hacemos acá.
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

// Lista los gastos cargados por un usuario, del más nuevo al más viejo.
export async function listarGastos(userId) {
  const { data, error } = await getClient()
    .from('gastos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
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

// Borra un gasto, garantizando que pertenezca al usuario (doble filtro id + user_id).
export async function eliminarGasto(userId, id) {
  const { error } = await getClient()
    .from('gastos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}
