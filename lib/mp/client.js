const API = 'https://api.mercadopago.com'

// LISTA BLANCA: lo ÚNICO que la app puede pedirle a Mercado Pago con el token de
// una persona. El token OAuth trae permisos de escritura que MP no deja quitar
// (cancelar, devolver, crear cobros); este filtro garantiza que ningún camino del
// código los use. Cualquier otra ruta tira antes de tocar la red.
const PERMITIDOS = [
  ['GET', /^\/users\/me$/],
  ['GET', /^\/users\/\d+$/],
  ['GET', /^\/v1\/payments\/search\?[^/]*$/],
  ['GET', /^\/v1\/account\/release_report\/config$/],
  ['POST', /^\/v1\/account\/release_report\/config$/],
  ['PUT', /^\/v1\/account\/release_report\/config$/],
  ['POST', /^\/v1\/account\/release_report$/],
  ['GET', /^\/v1\/account\/release_report\/list$/],
  ['GET', /^\/v1\/account\/release_report\/[\w-]+\.csv$/],
]

export function permitido(metodo, ruta) {
  return PERMITIDOS.some(([m, re]) => m === metodo && re.test(ruta))
}

export class ErrorMp extends Error {
  constructor(status, ruta, detalle) {
    super(`Mercado Pago respondió ${status} en ${ruta}`)
    this.status = status
    this.detalle = detalle
  }
}

export function crearClienteMp(token, fetchImpl = fetch) {
  async function pedir(metodo, ruta, body, { texto = false } = {}) {
    const rutaLog = ruta.split('?')[0]
    if (!permitido(metodo, ruta)) throw new Error(`Llamada a MP no permitida: ${metodo} ${rutaLog}`)
    const res = await fetchImpl(API + ruta, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    })
    const raw = await res.text()
    if (!res.ok) throw new ErrorMp(res.status, rutaLog, raw.slice(0, 200))
    if (texto) return raw
    return raw ? JSON.parse(raw) : null
  }
  return {
    get: (ruta, opts) => pedir('GET', ruta, undefined, opts),
    post: (ruta, body) => pedir('POST', ruta, body),
    put: (ruta, body) => pedir('PUT', ruta, body),
  }
}

// OAuth (canje del code y refresh). Usa las credenciales de la APP (client
// id/secret en el body), no el token de una persona.
export async function pedirTokenOauth(body, fetchImpl = fetch) {
  const res = await fetchImpl(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErrorMp(res.status, '/oauth/token', data?.message || data?.error)
  return data
}
