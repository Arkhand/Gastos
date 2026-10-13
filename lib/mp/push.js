import 'server-only'
import webpush from 'web-push'
import { config } from '../env.js'
import { iniciarVapid } from './vapid.js'

// true solo si las claves VAPID están y son válidas (si no, los avisos quedan apagados).
export const pushListo = iniciarVapid(config.push, webpush.setVapidDetails.bind(webpush))

// Manda el aviso a cada dispositivo. 404/410 = suscripción muerta (app desinstalada o
// permiso revocado) → se devuelve para borrarla. Tira solo si TODOS fallaron por
// otra razón (push caído), para que la corrida lo registre y se reintente.
// urgency 'high': si no, Android puede demorar la entrega con el celular en reposo.
export async function enviarAviso(subs, aviso) {
  const r = { ok: 0, muertas: [] }
  let otroError = null
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
        { TTL: 24 * 3600, urgency: 'high' },
      )
      r.ok++
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) r.muertas.push(s.endpoint)
      else otroError = e
    }
  }
  if (!r.ok && !r.muertas.length && otroError) {
    throw new Error(`push: ${otroError.statusCode ?? ''} ${otroError.message}`.trim())
  }
  return r
}
