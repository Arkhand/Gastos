'use client'
import { createContext, useContext, useState, useCallback, useRef } from 'react'

// Sistema de toasts (arriba, auto-dismiss). Portado de app.js. Provee un contexto
// con toast(type, msg, action?) y los sonidos/vibración. type: success|warning|error.
const ToastCtx = createContext(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

// Sonidos con WebAudio (sin archivos), igual que la app vieja.
function beep(type) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    if (ctx.state === 'suspended') ctx.resume()
    const notas = {
      success: [[660, 0, 0.1], [990, 0.1, 0.16]],
      warning: [[540, 0, 0.11], [540, 0.17, 0.13]],
      error: [[320, 0, 0.16], [200, 0.17, 0.24]],
    }[type] || []
    const t0 = ctx.currentTime
    for (const n of notas) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type === 'error' ? 'triangle' : 'sine'
      osc.frequency.value = n[0]
      osc.connect(gain)
      gain.connect(ctx.destination)
      const st = t0 + n[1]
      const en = st + n[2]
      gain.gain.setValueAtTime(0.0001, st)
      gain.gain.exponentialRampToValueAtTime(0.22, st + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, en)
      osc.start(st)
      osc.stop(en + 0.03)
    }
  } catch (_) {}
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const remove = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)))
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 240)
  }, [])

  const toast = useCallback(
    (type, msg, action) => {
      const id = ++idRef.current
      setToasts((prev) => [...prev, { id, type, msg, action, out: false }])
      beep(type)
      if (type === 'success' && navigator.vibrate) {
        try { navigator.vibrate(12) } catch (_) {}
      }
      setTimeout(() => remove(id), action ? 6000 : 2500)
      return id
    },
    [remove]
  )

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toast-host" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.type} ${t.out ? 'is-out' : 'is-in'}`}
            onClick={(e) => {
              if (e.target.closest('.toast-act')) return
              remove(t.id)
            }}
          >
            <span className="toast-ico">{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : '!'}</span>
            <span className="toast-msg">{t.msg}</span>
            {t.action?.label && (
              <button
                type="button"
                className="toast-act"
                onClick={() => {
                  t.action.onClick?.()
                  remove(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
