'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

// Barra de pestañas inferior (mobile). Portado de partials/tabbar.ejs.
const TABS = [
  {
    href: '/inicio',
    label: 'Cargar',
    icon: <path d="M4 11.5 12 5l8 6.5V20a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    href: '/resumen',
    label: 'Resumen',
    icon: (
      <>
        <rect x="4" y="12" width="4" height="7" rx="1.2" fill="currentColor" />
        <rect x="10" y="7" width="4" height="12" rx="1.2" fill="currentColor" />
        <rect x="16" y="9" width="4" height="10" rx="1.2" fill="currentColor" />
      </>
    ),
  },
  {
    href: '/nosotros',
    label: 'Nosotros',
    icon: <path d="M12 20s-7-4.4-7-9.3A3.7 3.7 0 0 1 12 8a3.7 3.7 0 0 1 7 2.7C19 15.6 12 20 12 20z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  },
  {
    href: '/config',
    label: 'Configuración',
    icon: (
      <>
        <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M19.4 13a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V21a2 2 0 0 1-4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H3a2 2 0 0 1 0-4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2H8a1 1 0 0 0 .6-.9V3a2 2 0 0 1 4 0v.1a1 1 0 0 0 .6.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1V8a1 1 0 0 0 .9.6H21a2 2 0 0 1 0 4h-.1a1 1 0 0 0-.9.6z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </>
    ),
  },
]

function activo(pathname, href) {
  return href === '/inicio' ? pathname === '/inicio' : pathname.startsWith(href)
}

export default function TabBar() {
  const pathname = usePathname()
  const router = useRouter()
  // Destino "optimista": al tocar, marcamos ese tab YA (sin esperar la navegación),
  // así el feedback de pestaña activa es instantáneo. Se sincroniza al llegar.
  const [pending, setPending] = useState(null)
  useEffect(() => {
    setPending(null) // la navegación terminó: el pathname real manda
  }, [pathname])

  // Prefetch de todas las pestañas al montar: el tap luego es casi instantáneo.
  useEffect(() => {
    TABS.forEach((t) => router.prefetch(t.href))
  }, [router])

  const actual = pending || pathname

  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <Link
          key={t.href}
          className={`tab ${activo(actual, t.href) ? 'tab-on' : ''}`}
          href={t.href}
          prefetch
          onClick={() => setPending(t.href)}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            {t.icon}
          </svg>
          <span>{t.label}</span>
        </Link>
      ))}
    </nav>
  )
}
