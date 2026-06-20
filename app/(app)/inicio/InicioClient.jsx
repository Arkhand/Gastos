'use client'
import { useState, useMemo } from 'react'
import AppShell from '../../../components/AppShell.jsx'
import Mic from '../../../components/Mic.jsx'
import Sheet from '../../../components/Sheet.jsx'
import GastoRow from '../../../components/GastoRow.jsx'
import { useGastos, useCrearGasto } from '../../../lib/api.js'
import { useToast } from '../../../components/Toasts.jsx'
import { agruparPorDia, sugerenciasDescripcion, fmtMonto, hacerCatLookup } from '../../../lib/calculos.js'
import { PERSONAS, personaLabel } from '../../../lib/personas.js'
import { hoyAR } from '../../../lib/fecha.js'

export default function InicioClient({ personaDefault }) {
  const mesActual = hoyAR().slice(0, 7)
  const { data } = useGastos(mesActual)
  const crear = useCrearGasto()
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetInitial, setSheetInitial] = useState(null)

  const cats = data?.categorias ?? []
  const otrosId = data?.otrosId ?? ''
  const catLookup = useMemo(() => hacerCatLookup([...(cats || []), ...(data?.categoriasTodas || [])], otrosId), [cats, data, otrosId])
  const iaEnabled = true // el server decide; la opción Automático se ofrece igual

  const hoy = hoyAR()
  const gastos = data?.gastos ?? []
  // Últimos: todos los activos (la API ya filtra eliminado=false), agrupados por día.
  const grupos = useMemo(() => agruparPorDia(gastos), [gastos])
  const sugerencias = useMemo(() => sugerenciasDescripcion(gastos), [gastos])

  // Total de hoy en ARS (suma el equivalente ARS de cada gasto de hoy).
  const totalHoy = useMemo(() => {
    const t = gastos
      .filter((g) => (g.fecha || hoy) === hoy)
      .reduce((s, g) => s + (Number(g.monto_ars) || (g.moneda === 'ARS' ? Number(g.monto) : 0)), 0)
    return fmtMonto('ARS', t)
  }, [gastos, hoy])

  function abrirNuevo() {
    setSheetInitial(null)
    setSheetOpen(true)
  }

  // Editar un gasto (de la BD: tiene a_nombre_de, categoria, compartido, etc.).
  function editar(g) {
    setSheetInitial(g)
    setSheetOpen(true)
  }

  // Voz: gasto completo -> guardar directo. `personaIncierta` = la IA no detectó a
  // quién, así que cayó en el usuario logueado (lo avisamos y ofrecemos editar).
  async function guardarDirecto(g, _texto, personaIncierta) {
    try {
      const r = await crear.mutateAsync({
        descripcion: g.descripcion,
        monto: Number(g.monto),
        moneda: g.moneda || 'ARS',
        a_nombre_de: g.persona || personaDefault,
        categoria: g.categoria || otrosId,
        fecha: g.fecha || null,
        compartido: true, // la voz siempre es compartido
      })
      const creado = r?.gasto
      const msg = personaIncierta ? 'Guardado a tu nombre ✓' : 'Gasto guardado ✓'
      // Ofrecemos editar el gasto recién creado (para corregir lo que puso la IA).
      toast('success', msg, creado ? { label: 'Editar', onClick: () => editar(creado) } : undefined)
    } catch (err) {
      toast('error', err.message || 'No se pudo guardar')
    }
  }

  // Voz: gasto incompleto -> abrir la hoja precargada.
  function abrirPrecargada(g) {
    setSheetInitial({
      descripcion: g.descripcion || '',
      monto: g.monto || '',
      moneda: g.moneda || 'ARS',
      a_nombre_de: g.persona || personaDefault,
      categoria: g.categoria || otrosId,
      fecha: g.fecha || '',
      compartido: true,
    })
    setSheetOpen(true)
  }

  return (
    <AppShell pageClass="page-inicio">
      <header className="hdr">
        <div>
          <div className="hdr-title">Gastos danis</div>
          <div className="hdr-sub">Contame en qué se te fue la plata</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="hdr-total">
            <div className="hdr-total-label">Hoy</div>
            <div className="hdr-total-amount">{totalHoy}</div>
          </div>
          <form method="post" action="/auth/logout">
            <button type="submit" className="hdr-logout">Salir</button>
          </form>
        </div>
      </header>

      <div className="dk-cols">
        <div className="dk-col-main">
          <Mic
            onGuardarDirecto={guardarDirecto}
            onAbrirHojaPrecargada={abrirPrecargada}
            sinSoporte={abrirNuevo}
          />
        </div>

        <section className="recent">
          <div className="recent-head">Últimos gastos</div>
          {grupos.length === 0 ? (
            <div className="recent-empty">Sin gastos todavía. Tocá el micrófono o el ➕ para cargar el primero.</div>
          ) : (
            grupos.map((grupo) => (
              <div className="day-group" key={grupo.fecha}>
                <div className="day-row">
                  <span className="day-label">{grupo.etiqueta}</span>
                  <span className="day-total">{grupo.totalStr}</span>
                </div>
                <div className="day-card">
                  {grupo.items.map((g) => (
                    <GastoRow key={g.id} g={g} cat={catLookup(g.categoria)} perLabel={personaLabel(g.a_nombre_de)} editable={false} />
                  ))}
                </div>
              </div>
            ))
          )}
        </section>
      </div>

      <button className="fab" type="button" aria-label="Cargar gasto" onClick={abrirNuevo}>
        <span>＋</span>
      </button>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={sheetInitial}
        categorias={cats}
        personas={PERSONAS}
        personaDefault={personaDefault}
        otrosId={otrosId}
        sugerencias={sugerencias}
        iaEnabled={iaEnabled}
      />
    </AppShell>
  )
}
