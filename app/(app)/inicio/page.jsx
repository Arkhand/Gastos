import { getUser } from '../../../lib/session.js'
import { personaPorDefecto } from '../../../lib/personas.js'
import InicioClient from './InicioClient.jsx'

// Inicio: mascota + micrófono + últimos gastos. El layout (app) ya validó sesión.
export default async function InicioPage() {
  const user = await getUser()
  const personaDefault = personaPorDefecto(user.email)
  return <InicioClient personaDefault={personaDefault} />
}
