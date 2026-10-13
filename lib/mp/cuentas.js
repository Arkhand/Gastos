import 'server-only'
import { config } from '../env.js'
import { normalizarPersona } from '../personas.js'
import { cifrar, descifrar } from './cripto.js'
import { crearClienteMp, pedirTokenOauth } from './client.js'
import { dbMp } from './db.js'
import { tokenVigente, asegurarCuentaLibre } from './conexion.js'

// Dueño de las filas de MP = email canónico del usuario logueado.
export function ownerDe(user) {
  return normalizarPersona(user?.email) ?? String(user?.email || '').toLowerCase()
}

function errorConCodigo(mensaje, code) {
  return Object.assign(new Error(mensaje), { code })
}

// Valida el token recién obtenido contra MP (/users/me).
async function perfil(token) {
  try {
    return await crearClienteMp(token).get('/users/me')
  } catch {
    throw errorConCodigo('Mercado Pago rechazó el token', 'token-invalido')
  }
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
  await asegurarCuentaLibre(dbMp, me.id, owner)
  return dbMp.guardarCuenta({ ...filaOauth(owner, me, t), conectado_at: new Date().toISOString() })
}

export async function desconectar(owner) {
  await dbMp.borrarCuenta(owner)
}

// Cliente MP de la cuenta, con el token renovado si hace falta (reglas en conexion.js).
export async function clienteParaCuenta(cuenta, ahora = Date.now()) {
  const key = config.mp.tokenKey
  const token = await tokenVigente({
    cuenta,
    db: dbMp,
    cripto: { cifrar: (s) => cifrar(s, key), descifrar: (s) => descifrar(s, key) },
    refrescar: (refreshToken) =>
      pedirTokenOauth({
        client_id: config.mp.clientId,
        client_secret: config.mp.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    ahora,
  })
  return crearClienteMp(token)
}
