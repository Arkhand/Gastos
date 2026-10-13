import 'server-only'
import { config } from '../env.js'
import { normalizarPersona } from '../personas.js'
import { cifrar, descifrar } from './cripto.js'
import { crearClienteMp, pedirTokenOauth } from './client.js'
import { dbMp } from './db.js'

const SIETE_DIAS = 7 * 86400_000

// Dueño de las filas de MP = email canónico del usuario logueado.
export function ownerDe(user) {
  return normalizarPersona(user?.email) ?? String(user?.email || '').toLowerCase()
}

function errorConCodigo(mensaje, code) {
  return Object.assign(new Error(mensaje), { code })
}

// Valida un token contra MP (/users/me). Rechaza los de prueba (TEST-…).
async function perfil(token) {
  if (token.startsWith('TEST-')) throw errorConCodigo('Es un token de prueba: usá el de producción (APP_USR-…)', 'token-prueba')
  try {
    return await crearClienteMp(token).get('/users/me')
  } catch {
    throw errorConCodigo('Mercado Pago rechazó el token', 'token-invalido')
  }
}

export async function conectarConToken(owner, tokenCrudo) {
  const token = String(tokenCrudo || '').trim()
  if (!token) throw errorConCodigo('Pegá un Access Token', 'token-vacio')
  const me = await perfil(token)
  return dbMp.guardarCuenta({
    owner,
    mp_user_id: me.id,
    mp_nickname: me.nickname ?? null,
    metodo: 'token',
    access_token_enc: cifrar(token, config.mp.tokenKey),
    refresh_token_enc: null,
    expira_at: null,
    necesita_reconectar: false,
    conectado_at: new Date().toISOString(),
  })
}

function filaOauth(owner, me, t) {
  return {
    owner,
    mp_user_id: me.id,
    mp_nickname: me.nickname ?? null,
    metodo: 'oauth',
    access_token_enc: cifrar(t.access_token, config.mp.tokenKey),
    refresh_token_enc: cifrar(t.refresh_token, config.mp.tokenKey),
    expira_at: new Date(Date.now() + Number(t.expires_in) * 1000).toISOString(),
    necesita_reconectar: false,
  }
}

export async function conectarConCodigo(owner, code, redirectUri) {
  const t = await pedirTokenOauth({
    client_id: config.mp.clientId,
    client_secret: config.mp.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  const me = await perfil(t.access_token)
  return dbMp.guardarCuenta({ ...filaOauth(owner, me, t), conectado_at: new Date().toISOString() })
}

export async function desconectar(owner) {
  await dbMp.borrarCuenta(owner)
}

// Cliente MP de la cuenta, renovando el token OAuth si vence en < 7 días. MP rota el
// refresh token en cada uso: se guardan los dos nuevos. Si la renovación falla y el
// token todavía no venció, se sigue con el actual y se marca para reconectar.
export async function clienteParaCuenta(cuenta, ahora = Date.now()) {
  const key = config.mp.tokenKey
  let token = descifrar(cuenta.access_token_enc, key)
  const vence = cuenta.expira_at ? Date.parse(cuenta.expira_at) : null
  if (cuenta.metodo === 'oauth' && vence && vence - ahora < SIETE_DIAS) {
    try {
      const t = await pedirTokenOauth({
        client_id: config.mp.clientId,
        client_secret: config.mp.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: descifrar(cuenta.refresh_token_enc, key),
      })
      await dbMp.guardarCuenta({ ...cuenta, ...filaOauth(cuenta.owner, { id: cuenta.mp_user_id, nickname: cuenta.mp_nickname }, t) })
      token = t.access_token
    } catch (e) {
      await dbMp.guardarCuenta({ ...cuenta, necesita_reconectar: true })
      if (vence <= ahora) throw new Error('El acceso a Mercado Pago venció: reconectá la cuenta')
      console.warn('[mp] no se pudo renovar el token de', cuenta.owner, e.message)
    }
  }
  return crearClienteMp(token)
}
