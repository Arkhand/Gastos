import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// Cifrado de los tokens de Mercado Pago guardados en la DB (AES-256-GCM).
// Formato: "iv.tag.datos" en base64url. La clave son 32 bytes en hex
// (MP_TOKEN_KEY): con solo la DB no se pueden leer los tokens.
function clave(keyHex) {
  const k = Buffer.from(String(keyHex || ''), 'hex')
  if (k.length !== 32) throw new Error('MP_TOKEN_KEY inválida (se esperan 32 bytes en hex)')
  return k
}

export function cifrar(texto, keyHex) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', clave(keyHex), iv)
  const datos = Buffer.concat([c.update(String(texto), 'utf8'), c.final()])
  return [iv, c.getAuthTag(), datos].map((b) => b.toString('base64url')).join('.')
}

export function descifrar(blob, keyHex) {
  const [iv, tag, datos] = String(blob).split('.').map((s) => Buffer.from(s, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', clave(keyHex), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(datos), d.final()]).toString('utf8')
}
