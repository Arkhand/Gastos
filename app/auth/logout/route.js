import { NextResponse } from 'next/server'
import { getSession } from '../../../lib/session.js'

// POST /auth/logout — cierra la sesión y vuelve al login.
export async function POST(request) {
  const session = await getSession()
  session.destroy()
  return NextResponse.redirect(`${new URL(request.url).origin}/`, { status: 303 })
}
