import { NextResponse } from 'next/server'
import { getUser } from '../../../lib/session.js'

// GET /api/me — devuelve el usuario logueado o 401. El cliente lo usa para saber
// si hay sesión.
export async function GET() {
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  return NextResponse.json({ user })
}
