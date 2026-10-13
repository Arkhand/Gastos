import 'server-only'
import { iaEnabled, revisarGasto } from '../ia.js'
import { recargarCategorias, otrosId } from '../categorias.js'
import { dbMp } from './db.js'
import { clienteParaCuenta } from './cuentas.js'
import { sincronizarCuenta, crearSugeridor } from './sync.js'

const PAUSA_SESION = 5 * 60_000

// Corre el sync para todas las cuentas conectadas (cron) o solo para `owner`
// (al abrir la app; con `respetarPausa` se saltea si sincronizó hace < 5 min).
// Cada cuenta aislada: un error queda en su mp_sync.last_error y se sigue.
export async function ejecutarSync({ owner = null, respetarPausa = false } = {}) {
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
      resultados.push(await sincronizarCuenta({ cuenta, mp, db: dbMp, sugerir }))
    } catch (e) {
      console.error('[mp sync]', cuenta.owner, e.message)
      await dbMp.guardarSync(cuenta.owner, { last_error: e.message, last_error_at: new Date().toISOString() }).catch(() => {})
      resultados.push({ owner: cuenta.owner, errores: [e.message] })
    }
  }
  return resultados
}
