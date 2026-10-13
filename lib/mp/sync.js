import { mapearPago, fusionar } from './mapear.js'
import { parsearReleaseCsv } from './csv.js'
import { bancoDeCuenta } from './bancos.js'
import { isoAR } from './fecha.js'
import { ErrorMp } from './client.js'
import { CONFIG_REPORTE, accionReporte, rangoReporte, archivoNuevo } from './reporte.js'
import { armarAviso } from './avisos.js'

// Sincronización de UNA cuenta de Mercado Pago. Las dependencias (cliente MP, DB,
// sugeridor de categoría) se inyectan para poder testearla sin red ni Supabase.
// Cada fuente va aislada: si falla una, la otra sigue; los errores se juntan en
// `errores` y quedan en mp_sync.last_error. Nunca tira hacia la UI.
export const PAGOS_DIAS = 7
export const MAX_SUGERENCIAS = 10
const DIA = 86400_000

export async function sincronizarCuenta({ cuenta, mp, db, sugerir, avisar, ahora = Date.now() }) {
  const owner = cuenta.owner
  const r = { owner, pagos: 0, payouts: 0, sugeridos: 0, avisados: 0, errores: [] }
  let sync = (await db.leerSync(owner)) ?? {}
  // Primera corrida: sin historial viejo (solo desde ayer).
  if (!sync.desde) sync = await db.guardarSync(owner, { desde: new Date(ahora - DIA).toISOString() })

  try {
    r.pagos = await pasoPagos({ cuenta, mp, db, sync, ahora })
  } catch (e) {
    r.errores.push(`pagos: ${e.message}`)
  }
  try {
    r.payouts = await pasoReporte({ owner, mp, db, sync, ahora })
  } catch (e) {
    r.errores.push(`reporte: ${e.message}`)
  }
  try {
    r.sugeridos = await pasoSugerencias({ owner, db, sugerir })
  } catch (e) {
    r.errores.push(`sugerencias: ${e.message}`)
  }
  // Después de las sugerencias, así el aviso lleva la descripción limpia.
  if (avisar) {
    try {
      r.avisados = await pasoAvisos({ owner, db, avisar })
    } catch (e) {
      r.errores.push(`avisos: ${e.message}`)
    }
  }

  await db.guardarSync(
    owner,
    r.errores.length
      ? { last_error: r.errores.join(' | '), last_error_at: new Date(ahora).toISOString() }
      : { last_error: null },
  )
  return r
}

// Pagos como pagador de los últimos 7 días (re-lee para ver cambios de estado).
async function pasoPagos({ cuenta, mp, db, sync, ahora }) {
  const desde = Math.max(Date.parse(sync.desde), ahora - PAGOS_DIAS * DIA)
  const q = new URLSearchParams({
    'payer.id': String(cuenta.mp_user_id),
    range: 'date_created',
    begin_date: isoAR(desde),
    end_date: 'NOW',
    sort: 'date_created',
    criteria: 'desc',
    limit: '100',
  })
  const data = await mp.get(`/v1/payments/search?${q}`)
  const filas = (data?.results ?? []).map((p) => mapearPago(p, cuenta.owner)).filter(Boolean)
  const n = await guardarMovimientos({ owner: cuenta.owner, filas, mp, db })
  await db.guardarSync(cuenta.owner, { payments_sync_at: new Date(ahora).toISOString() })
  return n
}

async function pasoReporte({ owner, mp, db, sync, ahora }) {
  if (!sync.reporte_configurado) {
    await configurarReporte(mp)
    await db.guardarSync(owner, { reporte_configurado: true })
  }
  const accion = accionReporte(sync, ahora)
  if (accion === 'pedir') {
    await mp.post('/v1/account/release_report', rangoReporte(ahora))
    await db.guardarSync(owner, { report_requested_at: new Date(ahora).toISOString() })
    return 0
  }
  if (accion !== 'bajar') return 0
  const archivo = archivoNuevo(await mp.get('/v1/account/release_report/list'), sync.report_requested_at)
  if (!archivo) return 0 // todavía no está: se reintenta en la próxima corrida
  const csv = await mp.get(`/v1/account/release_report/${archivo}`, { texto: true })
  // El reporte cubre 3 días: nada anterior a `desde` (la primera conexión no trae historial).
  const desde = Date.parse(sync.desde)
  const filas = parsearReleaseCsv(csv, owner).filter((f) => Date.parse(f.fecha_hora) >= desde)
  const n = await guardarMovimientos({ owner, filas, mp, db })
  await db.guardarSync(owner, { report_requested_at: null, report_downloaded_at: new Date(ahora).toISOString() })
  return n
}

// GET → si no existe (404) se crea con POST; si existe, se pisa con PUT.
async function configurarReporte(mp) {
  try {
    await mp.get('/v1/account/release_report/config')
  } catch (e) {
    if (e instanceof ErrorMp && e.status === 404) return mp.post('/v1/account/release_report/config', CONFIG_REPORTE)
    throw e
  }
  return mp.put('/v1/account/release_report/config', CONFIG_REPORTE)
}

// Upsert idempotente aplicando las reglas de estado. Antes asegura los contactos
// (la FK de mp_movimientos los necesita).
async function guardarMovimientos({ owner, filas, mp, db }) {
  if (!filas.length) return 0
  await asegurarContactos({ owner, filas, mp, db })
  const existentes = await db.movimientosPorIds(filas.map((f) => f.id))
  const aGuardar = filas.map((f) => fusionar(existentes.get(f.id), f)).filter(Boolean)
  if (aGuardar.length) await db.upsertMovimientos(aGuardar)
  return aGuardar.length
}

// Contactos nuevos con una sugerencia de nombre: el banco (CBU) o el nickname de MP.
async function asegurarContactos({ owner, filas, mp, db }) {
  const ids = [...new Set(filas.map((f) => f.contacto_id).filter(Boolean))]
  if (!ids.length) return
  const existentes = await db.contactosExistentes(owner, ids)
  const nuevos = []
  for (const id of ids) {
    if (existentes.has(id)) continue
    let sugerido = null
    if (id.startsWith('cbu:')) sugerido = bancoDeCuenta(id.slice(4))
    else {
      try {
        sugerido = (await mp.get(`/users/${id.slice(3)}`))?.nickname ?? null
      } catch {
        sugerido = null // el nickname es solo una ayuda
      }
    }
    nuevos.push({ owner, id, sugerido })
  }
  if (nuevos.length) await db.insertarContactos(nuevos)
}

async function pasoSugerencias({ owner, db, sugerir }) {
  const filas = await db.pendientesSinSugerencia(owner, MAX_SUGERENCIAS)
  for (const f of filas) {
    const s = await sugerir(f)
    await db.actualizarMovimiento(f.id, { descripcion: s.descripcion, categoria_sugerida: s.categoria })
  }
  return filas.length
}

// Push al celular: los pendientes todavía no avisados van en UN aviso (detalle si es
// uno, resumen si son varios). Solo se marcan si llegó a algún dispositivo; si no
// (sin suscripciones, todas muertas o push caído) se reintenta en la próxima corrida.
export async function pasoAvisos({ owner, db, avisar }) {
  const subs = await db.suscripciones(owner)
  if (!subs.length) return 0
  const movs = await db.pendientesSinAvisar(owner)
  const aviso = armarAviso(movs)
  if (!aviso) return 0
  const r = await avisar(subs, aviso)
  for (const ep of r.muertas) await db.borrarSuscripcionPorEndpoint(ep)
  if (!r.ok) return 0
  await db.marcarAvisados(movs.map((m) => m.id))
  return movs.length
}

// Descripción + categoría sugeridas para un pendiente.
// - Transferencias: "Transferencia a <nombre>" con la categoría del contacto (la
//   descripción de MP es "Varios", no aporta: no se gasta IA).
// - Pagos: la IA limpia la descripción y elige categoría; si falla, texto de MP en Otros.
export function crearSugeridor({ revisar, otros }) {
  return async (mov) => {
    if (mov.medio === 'transferencia') {
      const quien = mov.contacto?.nombre || mov.contacto?.sugerido || 'cuenta'
      return { descripcion: `Transferencia a ${quien}`, categoria: mov.contacto?.categoria || otros }
    }
    const base = mov.descripcion_mp || 'Pago con Mercado Pago'
    try {
      const r = await revisar(base, otros)
      return { descripcion: r.descripcion || base, categoria: r.categoria || otros }
    } catch {
      return { descripcion: base, categoria: otros }
    }
  }
}
