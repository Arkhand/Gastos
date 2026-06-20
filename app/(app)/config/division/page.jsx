'use client'
import Link from 'next/link'
import { useState, useEffect, useMemo } from 'react'
import AppShell from '../../../../components/AppShell.jsx'
import { useDivision, useGuardarDivision } from '../../../../lib/api.js'

// Configuración → División. Inputs enteros con auto-balanceo (2 personas suman 100).
// Portado de config-division.ejs (guardar ahora vía API, sin recargar).
export default function ConfigDivisionPage() {
  const { data, isLoading } = useDivision()
  const guardar = useGuardarDivision()
  const [valores, setValores] = useState(null) // { email: pct }
  const [aviso, setAviso] = useState('')

  // Inicializa el estado local cuando llegan los datos.
  useEffect(() => {
    if (data?.division && !valores) {
      const m = {}
      data.division.forEach((d) => (m[d.persona] = d.porcentaje))
      setValores(m)
    }
  }, [data, valores])

  const personas = data?.division ?? []
  const suma = useMemo(
    () => (valores ? Math.round(Object.values(valores).reduce((s, n) => s + (Number(n) || 0), 0) * 100) / 100 : 0),
    [valores]
  )

  function cambiar(email, raw) {
    let n = Number(raw)
    if (!Number.isFinite(n)) n = 0
    n = Math.max(0, Math.min(100, n))
    setValores((prev) => {
      const next = { ...prev, [email]: n }
      // Auto-balanceo con 2 integrantes: el otro se completa a 100.
      if (personas.length === 2) {
        const otro = personas.find((p) => p.persona !== email)
        if (otro) next[otro.persona] = Math.round((100 - n) * 100) / 100
      }
      return next
    })
  }

  async function onSubmit(e) {
    e.preventDefault()
    setAviso('')
    const body = {}
    personas.forEach((p) => (body['pct_' + p.persona] = valores[p.persona]))
    try {
      await guardar.mutateAsync(body)
      setAviso('ok')
    } catch (err) {
      setAviso(err.code === 'division-suma' ? 'division-suma' : 'error')
    }
  }

  return (
    <AppShell pageClass="page-config">
      <div className="config">
        <Link className="cfg-back" href="/config">‹ Configuración</Link>
        <h1>División</h1>

        {aviso === 'ok' && <div className="cfg-alert cfg-alert-ok">División guardada ✓</div>}
        {aviso === 'division-suma' && (
          <div className="cfg-alert cfg-alert-err">Los porcentajes deben ser números entre 0 y 100 y sumar 100.</div>
        )}

        <p className="cfg-intro">
          Definí cómo se reparten los gastos compartidos entre los integrantes. Los porcentajes deben
          sumar 100. Este valor se usa al cerrar un mes en Resumen; los meses ya cerrados conservan el %
          con el que se cerraron.
        </p>

        {isLoading || !valores ? (
          <div className="recent-empty">Cargando…</div>
        ) : (
          <section className="cfg-card">
            <div className="cfg-card-title">Porcentaje por integrante</div>
            <form className="cfg-division" onSubmit={onSubmit}>
              {personas.map((d) => (
                <div className="cfg-div-row" key={d.persona}>
                  <span className="cat-chip">{d.emoji} {d.label}</span>
                  <div className="cfg-div-inp">
                    <input
                      className="inp"
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      inputMode="numeric"
                      value={valores[d.persona] ?? 0}
                      onChange={(e) => cambiar(d.persona, e.target.value)}
                      required
                    />
                    <span className="cfg-div-sign">%</span>
                  </div>
                </div>
              ))}
              <div className={`cfg-div-suma ${Math.abs(suma - 100) < 0.01 ? 'cfg-div-ok' : 'cfg-div-bad'}`}>
                Suma: <span>{suma}</span>%
              </div>
              <button type="submit" className="btn-save cfg-add-btn" disabled={guardar.isPending}>
                {guardar.isPending ? 'Guardando…' : 'Guardar división'}
              </button>
            </form>
          </section>
        )}
      </div>
    </AppShell>
  )
}
