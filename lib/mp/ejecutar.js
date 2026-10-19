import 'server-only'
import { iaEnabled, revisarGasto } from '../ia.js'
import { recargarCategorias, otrosId } from '../categorias.js'
import { dbMp } from './db.js'
import { clienteParaCuenta } from './cuentas.js'
import { sincronizarCuenta, crearSugeridor, MP_FALLAS_PARA_AVISAR } from './sync.js'
import { enviarAviso, pushListo } from './push.js'
import { avisarError } from '../alertas/index.js'

const PAUSA_SESION = 5 * 60_000

// Corre el sync para todas las cuentas conectadas (cron) o solo para `owner`
// (al abrir la app; con `respetarPausa` se saltea si sincronizó hace < 5 min).
// Cada cuenta aislada: un error queda en su mp_sync.last_error y se sigue.
// `avisar`: solo el cron manda push (si sincroniza al abrir la app ya estás mirando
// la tarjeta, y así no se duplican avisos entre cron y apertura).
export async function ejecutarSync({ owner = null, respetarPausa = false, avisar = false, forzarReporte = false } = {}) {
  const cuentas = owner ? [await dbMp.leerCuenta(owner)].filter(Boolean) : await dbMp.listarCuentas()
  if (!cuentas.length) return []
  await recargarCategorias()
  const otros = otrosId()
  const sugerir = crearSugeridor({
    revisar: (desc, cat) => (iaEnabled ? revisarGasto(desc, cat) : Promise.reject(new Error('IA no configurada'))),
    otros,
  })
  const resultados = []
  for (const cuenta of cuentas) {
    try {
      if (respetarPausa) {
        const s = await dbMp.leerSync(cuenta.owner)
        if (s?.payments_sync_at && Date.now() - Date.parse(s.payments_sync_at) < PAUSA_SESION) {
          resultados.push({ owner: cuenta.owner, salteado: true })
          continue
        }
      }
      const mp = await clienteParaCuenta(cuenta)
      const r = await sincronizarCuenta({ cuenta, mp, db: dbMp, sugerir, avisar: avisar && pushListo ? enviarAviso : undefined, forzarReporte })
      // Cada error viene como "<fuente>: <mensaje>" (pagos, reporte, sugerencias, avisos).
      // Push recién a la 4ª corrida seguida con error: los tropiezos sueltos de MP se arreglan solos.
      if (r.erroresSeguidos >= MP_FALLAS_PARA_AVISAR) {
        for (const err of r.errores) avisarError(`mp ${cuenta.owner} ${err.split(':')[0]}`, err)
      }
      resultados.push(r)
    } catch (e) {
      console.error('[mp sync]', cuenta.owner, e.message)
      const previo = await dbMp.leerSync(cuenta.owner).catch(() => null)
      const seguidos = (previo?.errores_seguidos ?? 0) + 1
      if (seguidos >= MP_FALLAS_PARA_AVISAR) avisarError(`mp ${cuenta.owner}`, e.message)
      await dbMp
        .guardarSync(cuenta.owner, { last_error: e.message, last_error_at: new Date().toISOString(), errores_seguidos: seguidos })
        .catch(() => {})
      resultados.push({ owner: cuenta.owner, errores: [e.message] })
    }
  }
  return resultados
}
