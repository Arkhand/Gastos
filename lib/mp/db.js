import 'server-only'
import { getClient } from '../db.js'

// Acceso a las tablas de Mercado Pago. TODA lectura/escritura que viene de la UI
// filtra por `owner` (el email de la sesión): una persona nunca ve ni toca los
// movimientos de la otra.
const db = () => getClient()

function chequear({ data, error }) {
  if (error) throw error
  return data
}

// Pega el contacto (mp_contactos) a cada movimiento: { ...mov, contacto }.
async function adjuntarContactos(owner, filas) {
  const ids = [...new Set(filas.map((f) => f.contacto_id).filter(Boolean))]
  if (!ids.length) return filas.map((f) => ({ ...f, contacto: null }))
  const cs = chequear(await db().from('mp_contactos').select('*').eq('owner', owner).in('id', ids))
  const porId = new Map(cs.map((c) => [c.id, c]))
  return filas.map((f) => ({ ...f, contacto: porId.get(f.contacto_id) ?? null }))
}

const COLS_VISTA =
  'id, owner, fuente, medio, fecha_hora, fecha, monto, moneda, descripcion_mp, descripcion, categoria_sugerida, contacto_id, estado'

export const dbMp = {
  // ---- cuentas ----
  async listarCuentas() {
    return chequear(await db().from('mp_cuentas').select('*'))
  },
  async leerCuenta(owner) {
    return chequear(await db().from('mp_cuentas').select('*').eq('owner', owner).maybeSingle())
  },
  async guardarCuenta(fila) {
    return chequear(await db().from('mp_cuentas').upsert(fila, { onConflict: 'owner' }).select().single())
  },
  async borrarCuenta(owner) {
    chequear(await db().from('mp_cuentas').delete().eq('owner', owner))
  },
  async cuentaPorMpUser(mpUserId) {
    return chequear(await db().from('mp_cuentas').select('owner').eq('mp_user_id', mpUserId).maybeSingle())
  },
  // Guarda tokens renovados SOLO si nadie los rotó antes (compare-and-set sobre
  // el refresh token anterior).
  async guardarTokens(owner, campos, refreshAnterior) {
    chequear(await db().from('mp_cuentas').update(campos).eq('owner', owner).eq('refresh_token_enc', refreshAnterior))
  },
  async marcarReconectar(owner) {
    chequear(await db().from('mp_cuentas').update({ necesita_reconectar: true }).eq('owner', owner))
  },

  // ---- estado del sync ----
  async leerSync(owner) {
    return chequear(await db().from('mp_sync').select('*').eq('owner', owner).maybeSingle())
  },
  async guardarSync(owner, campos) {
    return chequear(await db().from('mp_sync').upsert({ owner, ...campos }, { onConflict: 'owner' }).select().single())
  },

  // ---- movimientos (sync) ----
  async movimientosPorIds(ids) {
    const filas = chequear(await db().from('mp_movimientos').select('id, estado, motivo').in('id', ids))
    return new Map(filas.map((f) => [f.id, f]))
  },
  async upsertMovimientos(filas) {
    chequear(await db().from('mp_movimientos').upsert(filas, { onConflict: 'id' }))
  },
  async pendientesSinSugerencia(owner, n) {
    const filas = chequear(
      await db().from('mp_movimientos').select(COLS_VISTA)
        .eq('owner', owner).eq('estado', 'pendiente').is('categoria_sugerida', null)
        .order('fecha_hora', { ascending: false }).limit(n),
    )
    return adjuntarContactos(owner, filas)
  },
  async actualizarMovimiento(id, campos) {
    chequear(await db().from('mp_movimientos').update({ ...campos, actualizado_at: new Date().toISOString() }).eq('id', id))
  },

  // ---- movimientos (UI) ----
  async listarPendientes(owner) {
    const filas = chequear(
      await db().from('mp_movimientos').select(COLS_VISTA)
        .eq('owner', owner).eq('estado', 'pendiente').order('fecha_hora', { ascending: false }),
    )
    return adjuntarContactos(owner, filas)
  },
  async leerMovimiento(owner, id) {
    return chequear(await db().from('mp_movimientos').select(COLS_VISTA).eq('owner', owner).eq('id', id).maybeSingle())
  },
  // Cambia el estado SOLO si la fila es de `owner` y está en `estadoActual`
  // (evita doble proceso). Devuelve la fila actualizada o null.
  async marcar(owner, id, campos, estadoActual = 'pendiente') {
    const filas = chequear(
      await db().from('mp_movimientos')
        .update({ ...campos, actualizado_at: new Date().toISOString() })
        .eq('owner', owner).eq('id', id).eq('estado', estadoActual).select('id'),
    )
    return filas[0] ?? null
  },
  async idsGastoVinculados() {
    const filas = chequear(await db().from('mp_movimientos').select('gasto_id').not('gasto_id', 'is', null))
    return new Set(filas.map((f) => f.gasto_id))
  },

  // ---- push ----
  async suscripciones(owner) {
    return chequear(await db().from('mp_push').select('endpoint,p256dh,auth').eq('owner', owner))
  },
  async contarSuscripciones(owner) {
    const { count, error } = await db().from('mp_push').select('endpoint', { count: 'exact', head: true }).eq('owner', owner)
    if (error) throw error
    return count ?? 0
  },
  async guardarSuscripcion(fila) {
    chequear(await db().from('mp_push').upsert(fila, { onConflict: 'endpoint' }))
  },
  async borrarSuscripcion(owner, endpoint) {
    chequear(await db().from('mp_push').delete().eq('owner', owner).eq('endpoint', endpoint))
  },
  async borrarSuscripcionPorEndpoint(endpoint) {
    chequear(await db().from('mp_push').delete().eq('endpoint', endpoint))
  },
  async pendientesSinAvisar(owner) {
    const filas = chequear(
      await db().from('mp_movimientos').select(COLS_VISTA)
        .eq('owner', owner).eq('estado', 'pendiente').is('notificado_at', null)
        .order('fecha_hora', { ascending: false }),
    )
    return adjuntarContactos(owner, filas)
  },
  async marcarAvisados(ids) {
    if (!ids.length) return
    chequear(await db().from('mp_movimientos').update({ notificado_at: new Date().toISOString() }).in('id', ids))
  },
  async marcarTodosAvisados(owner) {
    chequear(
      await db().from('mp_movimientos').update({ notificado_at: new Date().toISOString() })
        .eq('owner', owner).eq('estado', 'pendiente').is('notificado_at', null),
    )
  },

  // ---- contactos ----
  async contactosExistentes(owner, ids) {
    const filas = chequear(await db().from('mp_contactos').select('id').eq('owner', owner).in('id', ids))
    return new Set(filas.map((f) => f.id))
  },
  async insertarContactos(filas) {
    chequear(await db().from('mp_contactos').upsert(filas, { onConflict: 'owner,id', ignoreDuplicates: true }))
  },
  async guardarContacto(owner, id, campos) {
    const limpios = Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== undefined))
    chequear(
      await db().from('mp_contactos')
        .upsert({ owner, id, ...limpios, actualizado_at: new Date().toISOString() }, { onConflict: 'owner,id' }),
    )
  },
}
