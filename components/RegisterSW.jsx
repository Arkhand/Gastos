'use client'
import { useEffect } from 'react'

// Registra el service worker (PWA instalable). Equivale al script del footer viejo.
// El sw.js (en public/) solo cachea imágenes; el resto va a la red.
export default function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
