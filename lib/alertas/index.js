import 'server-only'
import { after } from 'next/server'
import { getClient } from '../db.js'
import { dbMp } from '../mp/db.js'
import { enviarAviso, pushListo } from '../mp/push.js'
import { DESTINO_ALERTAS, debeAvisar, armarAvisoError } from './reglas.js'

// Avisos de error por push al celular de Dani Hombre. La tabla `alertas` guarda,
// por clave, cuándo se avisó por última vez (ver VENTANA_MS en reglas.js).
// Nada de esto tira: un aviso que falla nunca rompe lo que se estaba haciendo.

// Respaldo en memoria: frena avisos duplicados en la misma instancia (varias
// fallas iguales en una misma corrida) y si la tabla no responde.
const ultimoEnMemoria = new Map()

// Log + aviso si es un error del server (5xx o sin status). Para los catch de rutas.
export function reportarError(donde, err) {
  const mensaje = err?.message ?? String(err)
  console.error(`[${donde}]`, mensaje)
  if ((err?.status || 500) >= 500) avisarError(donde, mensaje)
}

// Se manda después de responder (after) para no demorar el request; fuera de un
// request (scripts) se manda en el momento.
export function avisarError(clave, mensaje) {
  const tarea = () => mandar(clave, mensaje).catch((e) => console.error('[alertas]', e.message))
  try {
    after(tarea)
  } catch {
    return tarea()
  }
}

async function mandar(clave, mensaje) {
  if (!pushListo) return
  const ahora = Date.now()
  if (!debeAvisar(ultimoEnMemoria.get(clave), ahora)) return
  ultimoEnMemoria.set(clave, new Date(ahora).toISOString())

  const tabla = () => getClient().from('alertas')
  const { data: previa, error } = await tabla().select('*').eq('clave', clave).maybeSingle()
  if (error) console.error('[alertas] tabla', error.message)
  if (previa && !debeAvisar(previa.ultimo_aviso_at, ahora)) {
    ultimoEnMemoria.set(clave, previa.ultimo_aviso_at)
    await tabla().update({ veces: (previa.veces || 0) + 1, ultimo_error: mensaje }).eq('clave', clave)
    return
  }

  const subs = await dbMp.suscripciones(DESTINO_ALERTAS)
  if (subs.length) {
    const r = await enviarAviso(subs, armarAvisoError(clave, mensaje, previa?.veces || 0))
    for (const ep of r.muertas) await dbMp.borrarSuscripcionPorEndpoint(ep)
  }
  await tabla().upsert({ clave, ultimo_aviso_at: new Date(ahora).toISOString(), ultimo_error: mensaje, veces: 0 })
}
