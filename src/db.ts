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

export interface Gasto {
  id: string
  user_id: string
  descripcion: string
  monto: number
  categoria: string | null
  fecha: string | null
  created_at: string
}

export interface NuevoGasto {
  descripcion: string
  monto: number
  categoria?: string | null
  fecha?: string | null
}

function getClient(): SupabaseClient {
  if (!supabase) {
    throw new Error('Base de datos no configurada (faltan variables de Supabase).')
  }
  return supabase
}

// Lista los gastos de un usuario, del más nuevo al más viejo.
export async function listarGastos(userId: string): Promise<Gasto[]> {
  const { data, error } = await getClient()
    .from('gastos')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Gasto[]
}

// Crea un gasto para un usuario.
export async function crearGasto(userId: string, gasto: NuevoGasto): Promise<Gasto> {
  const { data, error } = await getClient()
    .from('gastos')
    .insert({
      user_id: userId,
      descripcion: gasto.descripcion,
      monto: gasto.monto,
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
