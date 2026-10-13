'use client'
import { useState, useMemo, useEffect } from 'react'
import AppShell from '../../../components/AppShell.jsx'
import Mic from '../../../components/Mic.jsx'
import Sheet from '../../../components/Sheet.jsx'
import GastoRow from '../../../components/GastoRow.jsx'
import LoadingDots from '../../../components/LoadingDots.jsx'
import MpPendientes from '../../../components/MpPendientes.jsx'
import { useGastos, useCrearGasto, useSyncMpAlAbrir, useMpPendientes } from '../../../lib/api.js'
import { useToast } from '../../../components/Toasts.jsx'
import { agruparPorDia, sugerenciasDescripcion, fmtMonto, hacerCatLookup } from '../../../lib/calculos.js'
import { PERSONAS, personaLabel } from '../../../lib/personas.js'
import { hoyAR } from '../../../lib/fecha.js'

export default function InicioClient({ personaDefault }) {
  const mesActual = hoyAR().slice(0, 7)
  const { data, isLoading } = useGastos(mesActual)
  const crear = useCrearGasto()
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetInitial, setSheetInitial] = useState(null)
  const [mpMov, setMpMov] = useState(null) // pendiente de MP que se está cargando
  useSyncMpAlAbrir()

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

  // Abrir la hoja vacía (FAB ＋ o fallback cuando no hay soporte de voz).
  function abrirNuevo() {
    setMpMov(null)
    setSheetInitial(null)
    setSheetOpen(true)
  }

  // Editar un gasto (de la BD: tiene a_nombre_de, categoria, compartido, etc.).
  function editar(g) {
    setMpMov(null)
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
        // La voz es compartida salvo que la frase diga que es personal ("gastos
        // personales"), en cuyo caso la IA devuelve compartido=false.
        compartido: g.compartido !== false,
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
    setMpMov(null)
    setSheetInitial({
      descripcion: g.descripcion || '',
      monto: g.monto || '',
      moneda: g.moneda || 'ARS',
      a_nombre_de: g.persona || personaDefault,
      categoria: g.categoria || otrosId,
      fecha: g.fecha || '',
      compartido: g.compartido !== false,
    })
    setSheetOpen(true)
  }

  // Mercado Pago: abrir la hoja precargada con el movimiento (lo marca el server al guardar).
  function agregarDesdeMp(m) {
    setMpMov(m)
    setSheetInitial({
      descripcion: m.descripcion || m.descripcion_mp || '',
      monto: m.monto,
      moneda: m.moneda || 'ARS',
      a_nombre_de: personaDefault,
      categoria: m.categoria_sugerida || otrosId,
      fecha: m.fecha,
      compartido: m.contacto?.compartido ?? true,
    })
    setSheetOpen(true)
  }

  // Deep link desde el push: ?mp=<id> abre la hoja de ese pago; ?mp=lista, un id que
  // ya no está pendiente o uno que parece ya cargado ("¿Ya lo cargaste?") despliega la
  // tarjeta, para no duplicar. Se procesa una sola vez.
  const mpData = useMpPendientes().data
  const [mpAbrirLista, setMpAbrirLista] = useState(false)
  useEffect(() => {
    if (!mpData) return
    const id = new URLSearchParams(window.location.search).get('mp')
    if (!id) return
    window.history.replaceState(null, '', '/inicio')
    const m = id !== 'lista' && mpData.pendientes?.find((p) => p.id === id)
    if (m && !m.duplicado) agregarDesdeMp(m)
    else setMpAbrirLista(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpData])

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
          {/* Dentro de la columna izquierda: en escritorio el CSS ancla la hoja acá,
              debajo del micrófono. En mobile .dk-col-main es display:contents y la
              hoja sigue siendo un overlay fijo. */}
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
            mp={mpMov}
          />
        </div>

        <section className="recent">
          <MpPendientes onAgregar={agregarDesdeMp} abrirInicial={mpAbrirLista} />
          <div className="recent-head">Últimos gastos</div>
          {isLoading ? (
            <LoadingDots label="Cargando gastos…" />
          ) : grupos.length === 0 ? (
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
    </AppShell>
  )
}
