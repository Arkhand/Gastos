// Reglas puras de los avisos de error por push (sin DB ni red, para poder testearlas).

// Solo le llegan a Dani Hombre (sus celulares suscriptos en mp_push).
export const DESTINO_ALERTAS = 'musiald@gmail.com'

// El mismo error (misma clave) avisa como mucho una vez cada 6 h: el cron corre
// cada 15 min y sin esto un error persistente mandaría ~100 avisos por día.
export const VENTANA_MS = 6 * 3600_000

export function debeAvisar(ultimoAvisoAt, ahora, ventanaMs = VENTANA_MS) {
  if (!ultimoAvisoAt) return true
  const t = Date.parse(ultimoAvisoAt)
  return !Number.isFinite(t) || ahora - t >= ventanaMs
}

// `repetidos`: cuántas veces volvió a pasar sin avisar desde el último aviso.
export function armarAvisoError(clave, mensaje, repetidos = 0) {
  const extra = repetidos > 0 ? ` (se repitió ${repetidos} ${repetidos === 1 ? 'vez' : 'veces'} más)` : ''
  const texto = String(mensaje ?? '').replace(/\s+/g, ' ').trim()
  return {
    title: `⚠️ Error en Gastos: ${clave}`,
    body: `${texto.slice(0, 180)}${texto.length > 180 ? '…' : ''}${extra}`,
    url: '/inicio',
    tag: `error:${clave}`,
  }
}
