import { redirect } from 'next/navigation'
import { getUser } from '../../lib/session.js'

// Layout de las rutas privadas: valida la sesión en el server (firma + presencia).
// Si no hay sesión, al login. El middleware ya filtra por la cookie; esto es la
// barrera real (descifra y valida). Las páginas hijas asumen usuario logueado.
export default async function PrivateLayout({ children }) {
  const user = await getUser()
  if (!user) redirect('/')
  return children
}
