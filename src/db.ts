import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Si faltan las variables, la DB queda deshabilitada pero la app NO crashea.
export const dbEnabled = Boolean(supabaseUrl && supabaseServiceKey)

let supabase: SupabaseClient | null = null

if (supabaseUrl && supabaseServiceKey) {
  // La service_role key se usa SOLO del lado servidor (Express). Omite RLS, así
  // que nunca debe exponerse al cliente. El filtrado por usuario lo hacemos acá.
  supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
} else {
  console.warn(
    '[db] Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. ' +
      'La base de datos está deshabilitada hasta configurar la integración de Supabase.'
  )
}

// Monedas soportadas.
export const MONEDAS = ['ARS', 'USD'] as const
export type Moneda = (typeof MONEDAS)[number]

export function normalizarMoneda(valor: unknown): Moneda {
  return valor === 'USD' ? 'USD' : 'ARS' // por defecto ARS
}

export interface Gasto {
  id: string
  user_id: string // Google id de quien cargó (clave de propiedad)
  cargado_por: string // nombre legible de quien cargó
  a_nombre_de: string // a nombre de quién está el gasto
  descripcion: string
  monto: number
  moneda: Moneda
  categoria: string | null
  fecha: string | null
  created_at: string
}

export interface NuevoGasto {
  descripcion: string
  monto: number
  moneda?: unknown // se normaliza a 'ARS' | 'USD'
  a_nombre_de?: string | null // si falta, se usa el nombre de quien carga
  categoria?: string | null
  fecha?: string | null
}

function getClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Base de datos no configurada (faltan variables de Supabase).')
  }
  return supabase
}

// Lista los gastos cargados por un usuario, del más nuevo al más viejo.
export async function listarGastos(userId: string): Promise<Gasto[]> {
  const { data, error } = await getClient()
    .from('gastos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Gasto[]
}

// Crea un gasto. `userId`/`cargadoPor` identifican a quién lo cargó (desde la sesión).
export async function crearGasto(
  userId: string,
  cargadoPor: string,
  gasto: NuevoGasto
): Promise<Gasto> {
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
  return data as Gasto
}

// Borra un gasto, garantizando que pertenezca al usuario (doble filtro id + user_id).
export async function eliminarGasto(userId: string, id: string): Promise<void> {
  const { error } = await getClient()
    .from('gastos')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw error
}
