import { NextResponse } from 'next/server'

// Barrera ligera de auth: si una ruta privada se pide SIN la cookie de sesión,
// redirige al login (páginas) o responde 401 (API). NO descifra la cookie (eso lo
// hace cada página/route con getUser); solo evita cargar pantallas privadas sin
// sesión. La validación real (firma + lista blanca) vive en el server.
const RUTAS_PRIVADAS = ['/inicio', '/resumen', '/nosotros', '/config']

export function middleware(request) {
  const { pathname } = request.nextUrl
  const tieneCookie = request.cookies.has('gastos_session')
  if (tieneCookie) return NextResponse.next()

  // API privada sin cookie -> 401. (Excluye /api/me, que maneja su propio 401, y
  // /api/auth/*.)
  if (pathname.startsWith('/api/') && pathname !== '/api/me') {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  // Página privada sin cookie -> login.
  if (RUTAS_PRIVADAS.some((r) => pathname === r || pathname.startsWith(r + '/'))) {
    return NextResponse.redirect(new URL('/', request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Corre en todo menos assets estáticos y el flujo de auth (que necesita correr
  // sin cookie para poder crearla).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|auth/|.*\\.(?:png|jpg|jpeg|svg|webmanifest|js|css|ico)$).*)'],
}
