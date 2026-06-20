'use client'
import { useRef, useState, useCallback } from 'react'
import Chubi from './Chubi.jsx'
import { interpretarVoz } from '../lib/api.js'
import { useToast } from './Toasts.jsx'

const MIC_IDLE = 'Tocá y contame un gasto'

// Micrófono: voz -> texto (Web Speech API) -> /api/voz/interpretar -> gasto.
// Si el gasto quedó completo, lo guarda directo (vía onGuardarDirecto). Si falta
// algo, abre la hoja precargada (vía onAbrirHojaPrecargada). Portado de app.js.
export default function Mic({ onGuardarDirecto, onAbrirHojaPrecargada, sinSoporte }) {
  const toast = useToast()
  const recRef = useRef(null)
  const finalRef = useRef('')
  const [estado, setEstado] = useState('idle') // idle|listening|thinking|happy
  const [label, setLabel] = useState(MIC_IDLE)
  const [bubble, setBubble] = useState('«Gasté 4500 en el súper»')
  const [bubbleListening, setBubbleListening] = useState(false)

  const procesar = useCallback(
    async (texto) => {
      setEstado('thinking')
      setLabel('Pensando…')
      setBubble(texto)
      setBubbleListening(true)
      try {
        const data = await interpretarVoz(texto)
        setLabel(MIC_IDLE)
        const g = data.gasto || {}
        const faltan = []
        if (!g.descripcion) faltan.push('qué')
        if (!(Number(g.monto) > 0)) faltan.push('cuánto')
        if (!g.persona) faltan.push('quién')
        if (faltan.length) {
          setEstado('idle')
          toast('warning', 'Me faltó: ' + faltan.join(', ') + '. Completalo 👇')
          onAbrirHojaPrecargada?.(g, texto)
        } else {
          setEstado('happy')
          setBubble('¡Anotado! 📝')
          setBubbleListening(false)
          await onGuardarDirecto?.(g, texto)
          setTimeout(() => setEstado('idle'), 1500)
        }
      } catch (err) {
        setEstado('idle')
        setLabel('No pude interpretar, probá de nuevo')
        toast('error', err.message || 'No pude interpretar lo que dijiste.')
      }
    },
    [toast, onAbrirHojaPrecargada, onGuardarDirecto]
  )

  const getRecognition = useCallback(() => {
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!SR) return null
    if (recRef.current) return recRef.current
    const r = new SR()
    r.lang = 'es-AR'
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      let interim = '', fin = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) fin += t
        else interim += t
      }
      if (fin) { finalRef.current = fin.trim(); setBubble(finalRef.current); setBubbleListening(true) }
      else if (interim) { setBubble(interim); setBubbleListening(true) }
    }
    r.onerror = (e) => {
      setEstado('idle')
      setLabel(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'Permití el micrófono para usar la voz'
          : 'No te escuché, probá de nuevo'
      )
    }
    r.onend = () => {
      if (finalRef.current) procesar(finalRef.current)
      else { setEstado('idle'); setLabel(MIC_IDLE) }
    }
    recRef.current = r
    return r
  }, [procesar])

  const onTocar = useCallback(() => {
    if (estado === 'listening') {
      try { recRef.current?.stop() } catch (_) {}
      return
    }
    if (estado === 'thinking' || estado === 'happy') return
    const r = getRecognition()
    if (!r) {
      setLabel('Tu navegador no soporta voz, cargá a mano 👇')
      sinSoporte?.()
      return
    }
    finalRef.current = ''
    setEstado('listening')
    setLabel('Te escucho… tocá para terminar')
    setBubble('Escuchando…')
    setBubbleListening(true)
    try { r.start() } catch (_) {}
  }, [estado, getRecognition, sinSoporte])

  return (
    <section className="hero">
      <div className={`bubble ${bubbleListening ? 'bubble-listening' : 'bubble-hint'}`} aria-live="polite">
        {bubble}
      </div>
      <div className="mascot-wrap">
        <div className="mascot-shadow" />
        <Chubi estado={estado} />
      </div>
      <button className={`mic-btn ${estado === 'listening' ? 'mic-listening' : ''}`} type="button" aria-label="Hablar un gasto" onClick={onTocar}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="2.5" width="6" height="11.5" rx="3" fill="currentColor" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M12 17.5V21" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M8.5 21h7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      </button>
      <div className="mic-label">{label}</div>
    </section>
  )
}
