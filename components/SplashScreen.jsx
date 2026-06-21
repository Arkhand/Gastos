'use client'
import { useEffect, useState } from 'react'
import Chubi from './Chubi.jsx'

// Pantalla de bienvenida animada al abrir la PWA instalada.
// - Solo se muestra en modo standalone (PWA), no en el navegador normal,
//   para no entorpecer la navegación web habitual.
// - Reusa la mascota Chubi (misma del login) → identidad coherente con el icono.
// - Tras un instante hace fade-out (.splash-out) y se desmonta.
//
// Tiempos: VISIBLE = cuánto se ve entera; FADE = duración del desvanecido
// (debe coincidir con la animación splashOut del CSS).
const VISIBLE = 1300
const FADE = 450

export default function SplashScreen() {
  // mounted: si el overlay existe en el DOM. leaving: si está haciendo fade-out.
  const [mounted, setMounted] = useState(false)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // ¿Corre como PWA instalada? (Android/desktop usan display-mode; iOS, navigator.standalone)
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (!standalone) return

    setMounted(true)
    const t1 = setTimeout(() => setLeaving(true), VISIBLE)
    const t2 = setTimeout(() => setMounted(false), VISIBLE + FADE)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  if (!mounted) return null

  return (
    <div className={`splash${leaving ? ' splash-out' : ''}`} aria-hidden="true">
      <Chubi estado="happy" size={172} />
      <h1 className="splash-title">Gastos danis</h1>
      <p className="splash-sub">Anotá tus gastos hablando</p>
    </div>
  )
}
