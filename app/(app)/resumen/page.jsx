import { getUser } from '../../../lib/session.js'
import { personaPorDefecto } from '../../../lib/personas.js'
import ResumenClient from './ResumenClient.jsx'

// Resumen: lista + tabla + gráficos + ajuste de cuentas. Todos los filtros y
// toggles son estado React -> instantáneos, sin recargar. El layout (app) validó sesión.
export default async function ResumenPage() {
  const user = await getUser()
  const personaDefault = personaPorDefecto(user.email)
  return <ResumenClient personaDefault={personaDefault} />
}
