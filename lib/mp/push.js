import 'server-only'
import webpush from 'web-push'
import { config } from '../env.js'

if (config.push.enabled) webpush.setVapidDetails(config.push.subject, config.push.publicKey, config.push.privateKey)

// Manda el aviso a cada dispositivo. 404/410 = suscripción muerta (app desinstalada o
// permiso revocado) → se devuelve para borrarla. Tira solo si TODOS fallaron por
// otra razón (push caído), para que la corrida lo registre y se reintente.
export async function enviarAviso(subs, aviso) {
  const r = { ok: 0, muertas: [] }
  let otroError = null
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(aviso),
        { TTL: 24 * 3600 },
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
