// Control de acceso: la app es SOLO para la familia (lista blanca de emails).
// Para agregar o quitar a alguien: editá POR_DEFECTO acá abajo (o seteá la
// variable de entorno ALLOWED_EMAILS con los mails separados por coma) y redeploy.
import { config } from './env.js'

const POR_DEFECTO = ['musiald@gmail.com', 'danielapaulacastelli@gmail.com']

function parsear(str) {
  return String(str || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

const desdeEnv = parsear(config.allowedEmails)

// Si hay ALLOWED_EMAILS definida, manda esa lista; si no, la de la familia.
export const EMAILS_PERMITIDOS = desdeEnv.length ? desdeEnv : POR_DEFECTO.map((e) => e.toLowerCase())

// ¿Este email puede entrar? (sin distinguir mayúsculas ni espacios)
export function emailPermitido(email) {
  if (!email) return false
  return EMAILS_PERMITIDOS.includes(String(email).trim().toLowerCase())
}
