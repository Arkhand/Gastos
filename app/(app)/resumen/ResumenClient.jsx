'use client'
import { useState, useMemo } from 'react'
import AppShell from '../../../components/AppShell.jsx'
import Sheet from '../../../components/Sheet.jsx'
import GastoRow from '../../../components/GastoRow.jsx'
import LoadingDots from '../../../components/LoadingDots.jsx'
import { useGastos, useCerrarMes } from '../../../lib/api.js'
import { useToast } from '../../../components/Toasts.jsx'
import {
  agruparPorDia,
  sugerenciasDescripcion,
  fmtMonto,
  filaMovimiento,
  hacerCatLookup,
  distribucionPorCategoria,
  totalPorPersona,
  calcularSaldo,
} from '../../../lib/calculos.js'
import { PERSONAS, personaLabel, normalizarPersona } from '../../../lib/personas.js'
import { hoyAR, mesLabel } from '../../../lib/fecha.js'
import { descargarExcel } from '../../../lib/exportar.js'

export default function ResumenClient({ personaDefault }) {
  const mesActual = hoyAR().slice(0, 7)
  const [mes, setMes] = useState(mesActual)
  const [vista, setVista] = useState('gastos') // gastos | graficos
  const [tipo, setTipo] = useState('compartidos') // gráficos: compartidos | personales | todos
  const { data, isLoading } = useGastos(mes)
  const cerrar = useCerrarMes()
  const toast = useToast()

  // Sheet (edición desde la tabla/lista)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetInitial, setSheetInitial] = useState(null)

  const hoy = hoyAR()
  const todos = data?.gastos ?? []
  const cats = data?.categorias ?? []
  const otrosId = data?.otrosId ?? ''
  const division = data?.division ?? []
  const cierres = data?.cierres ?? []
  const catLookup = useMemo(
    () => hacerCatLookup([...(cats || []), ...(data?.categoriasTodas || [])], otrosId),
    [cats, data, otrosId]
  )

  // Meses con datos (para el selector) + el mes elegido + flag cerrado.
  const cierrePorMes = useMemo(() => {
    const m = {}
    for (const c of cierres) m[c.mes] = c
    return m
  }, [cierres])
  const meses = useMemo(() => {
    const set = new Set(todos.map((g) => (g.fecha || hoy).slice(0, 7)))
    set.add(mes)
    return [...set].sort((a, b) => (a < b ? 1 : -1)).map((m) => ({ value: m, label: mesLabel(m), cerrado: !!cierrePorMes[m] }))
  }, [todos, mes, hoy, cierrePorMes])

  const gastosMes = useMemo(() => todos.filter((g) => (g.fecha || hoy).slice(0, 7) === mes), [todos, mes, hoy])

  // ---- Filtros lista mobile (buscar + persona) ----
  const [mq, setMq] = useState('')
  const [mPer, setMPer] = useState('all')
  const grupos = useMemo(() => agruparPorDia(gastosMes), [gastosMes])
  const filtrandoMobile = mq.trim() !== '' || mPer !== 'all'
  function matchMobile(g) {
    const q = mq.toLowerCase().trim()
    const qNum = q.replace(/[^0-9]/g, '')
    const desc = (g.descripcion || '').toLowerCase()
    const monto = String(g.monto || '').split('.')[0].replace(/[^0-9]/g, '')
    const per = normalizarPersona(g.a_nombre_de) || ''
    const matchTexto = q === '' || desc.indexOf(q) > -1 || (qNum !== '' && monto.indexOf(qNum) > -1)
    return (mPer === 'all' || per === mPer) && matchTexto
  }

  // ---- Tabla desktop (movimientos + filtros) ----
  const movs = useMemo(() => gastosMes.map((g) => filaMovimiento(g, catLookup, hoy)), [gastosMes, catLookup, hoy])

  // ---- Gráficos (filtrados por tipo) ----
  //  compartidos: los que entran al reparto · todos: sin filtro
  //  personales ("Mis gastos"): TODOS los gastos a mi nombre (compartidos o no).
  const gastosGraf = useMemo(() => {
    return gastosMes.filter((g) =>
      tipo === 'todos'
        ? true
        : tipo === 'personales'
        ? normalizarPersona(g.a_nombre_de) === personaDefault
        : g.compartido !== false
    )
  }, [gastosMes, tipo, personaDefault])

  const colorOtros = catLookup(otrosId).color_bg || '#e3e0ea'
  const dist = useMemo(
    () => distribucionPorCategoria(gastosGraf, cats, catLookup, colorOtros),
    [gastosGraf, cats, catLookup, colorOtros]
  )
  const personasTotales = useMemo(() => totalPorPersona(gastosGraf), [gastosGraf])

  // ---- Ajuste de cuentas (solo compartidos del mes) ----
  const cierre = useMemo(() => {
    let compArs = 0, compUsd = 0
    const pagado = {}
    for (const g of gastosMes) {
      if (g.compartido === false) continue
      const ars = Number(g.monto_ars) || (g.moneda === 'ARS' ? Number(g.monto) : 0)
      const usd = Number(g.monto_usd) || (g.moneda === 'USD' ? Number(g.monto) : 0)
      compArs += ars; compUsd += usd
      const id = normalizarPersona(g.a_nombre_de)
      if (!id) continue
      if (!pagado[id]) pagado[id] = { ars: 0, usd: 0 }
      pagado[id].ars += ars; pagado[id].usd += usd
    }
    const cRow = cierrePorMes[mes]
    const divMap = cRow
      ? cRow.division
      : Object.fromEntries(division.map((d) => [d.persona, d.porcentaje]))
    const saldo = calcularSaldo(compArs, compUsd, pagado, divMap)
    const pctPorPersona = PERSONAS.filter((p) => p.id in divMap).map((p) => ({
      label: p.label, emoji: p.emoji, pct: Number(divMap[p.id]) || 0,
    }))
    return {
      cerrado: !!cRow,
      cerradoPor: cRow?.cerrado_por || '',
      esPasado: mes < mesActual,
      aplica: tipo === 'compartidos',
      totalArsStr: fmtMonto('ARS', compArs),
      totalUsdStr: fmtMonto('USD', compUsd),
      hayCompartidos: compArs > 0 || compUsd > 0,
      pctPorPersona,
      saldoArs: saldo.ars ? { ...saldo.ars, montoStr: fmtMonto('ARS', saldo.ars.monto) } : null,
      saldoUsd: saldo.usd ? { ...saldo.usd, montoStr: fmtMonto('USD', saldo.usd.monto) } : null,
    }
  }, [gastosMes, cierrePorMes, mes, mesActual, division, tipo])

  const sugerencias = useMemo(() => sugerenciasDescripcion(todos), [todos])

  function editar(g) {
    setSheetInitial(g) // g de la BD (tiene a_nombre_de, categoria, compartido...)
    setSheetOpen(true)
  }

  async function onCerrar() {
    if (!confirm('¿Cerrar este mes? El saldo queda congelado y no se puede reabrir.')) return
    try {
      await cerrar.mutateAsync(mes)
      toast('success', 'Mes cerrado 🤝')
    } catch (err) {
      toast('error', err.message || 'No se pudo cerrar')
    }
  }

  // Saldo agrupado por deudor (para no repetir la frase por moneda).
  const saldoGrupos = useMemo(() => {
    const grupos = {}
    ;[cierre.saldoArs, cierre.saldoUsd].forEach((s) => {
      if (!s) return
      const k = s.deudor.label
      if (!grupos[k]) grupos[k] = { deudor: s.deudor, acreedor: s.acreedor, montos: [] }
      grupos[k].montos.push(s.montoStr)
    })
    return Object.values(grupos)
  }, [cierre])

  return (
    <AppShell pageClass="page-resumen">
      <div className="resumen">
        <h1>Resumen {cierre.cerrado && tipo === 'compartidos' && <span className="mes-cerrado-flag" title="Mes cerrado">🤝</span>}</h1>

        {/* Selector de mes */}
        <div className="mes-nav">
          <select className="mes-select" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Elegir mes">
            {meses.map((m) => (
              <option key={m.value} value={m.value}>{m.cerrado ? '🤝 ' : ''}{m.label}</option>
            ))}
          </select>
          <button
            type="button"
            className="btn-excel"
            onClick={() => descargarExcel(movs, mes, mesLabel(mes))}
            disabled={movs.length === 0}
            title="Descargar los gastos del mes en Excel"
          >
            ⬇️ Excel
          </button>
        </div>

        {/* Toggle Gastos / Gráficos */}
        <div className="segmented vista-seg">
          <button type="button" className={`seg-opt ${vista === 'gastos' ? 'is-on' : ''}`} onClick={() => setVista('gastos')}>Gastos</button>
          <button type="button" className={`seg-opt ${vista === 'graficos' ? 'is-on' : ''}`} onClick={() => setVista('graficos')}>Gráficos</button>
        </div>

        {/* ===== Vista Gastos ===== */}
        <div className={`vista ${vista === 'gastos' ? 'is-on' : ''}`}>
          {isLoading ? (
            <LoadingDots label="Cargando gastos…" />
          ) : (
          <>
          {/* MOBILE: filtros */}
          {grupos.length > 0 && (
            <div className="mvm-filters">
              <input className="ctl mvm-q" type="text" placeholder="Buscar… ej: súper, taxi, 5000" autoComplete="off" value={mq} onChange={(e) => setMq(e.target.value)} />
              <div className="seg mvm-per">
                <button type="button" className={mPer === 'all' ? 'is-on' : ''} onClick={() => setMPer('all')}>Todos</button>
                {PERSONAS.map((p) => (
                  <button key={p.id} type="button" className={mPer === p.id ? 'is-on' : ''} onClick={() => setMPer(p.id)}>{p.emoji}</button>
                ))}
              </div>
            </div>
          )}

          {/* MOBILE: lista por día (filtrada) */}
          <div className="gastos-mobile">
            <MobileLista grupos={grupos} match={matchMobile} filtrando={filtrandoMobile} catLookup={catLookup} onEdit={editar} />
          </div>

          {/* DESKTOP: tabla */}
          <TablaDesktop movs={movs} onEdit={(id) => editar(gastosMes.find((g) => g.id === id))} />
          </>
          )}
        </div>

        {/* ===== Vista Gráficos ===== */}
        <div className={`vista ${vista === 'graficos' ? 'is-on' : ''}`}>
          {isLoading ? (
            <LoadingDots label="Cargando gráficos…" />
          ) : (
          <>
          <div className="segmented tipo-seg">
            <button type="button" className={`seg-opt ${tipo === 'compartidos' ? 'is-on' : ''}`} onClick={() => setTipo('compartidos')}>🤝 Compartidos</button>
            <button type="button" className={`seg-opt ${tipo === 'personales' ? 'is-on' : ''}`} onClick={() => setTipo('personales')}>👤 Mis gastos</button>
            <button type="button" className={`seg-opt ${tipo === 'todos' ? 'is-on' : ''}`} onClick={() => setTipo('todos')}>Todos</button>
          </div>

          <div className="res-total">
            <div className="res-total-label">Total del mes (ARS)</div>
            <div className="res-total-amount">{fmtMonto('ARS', dist.totalMesNum)}</div>
          </div>

          {/* Ajuste de cuentas (solo compartidos) */}
          {cierre.aplica && (
            <div className="chart-card cierre-card">
              <div className="cierre-head">
                <div className="chart-title">Ajuste de cuentas</div>
                {cierre.cerrado && <span className="cierre-badge">🤝 Mes cerrado</span>}
              </div>
              {!cierre.hayCompartidos ? (
                <div className="recent-empty">No hay gastos compartidos en este mes.</div>
              ) : (
                <>
                  <p className="cierre-sub">
                    Total compartido: <strong>{cierre.totalArsStr}</strong>
                    {cierre.totalUsdStr !== '$ 0' && <> · <strong>{cierre.totalUsdStr}</strong></>}
                    <span className="cierre-note">
                      División {cierre.pctPorPersona.map((p, i) => <span key={p.label}>{i ? ' / ' : ''}{p.emoji} {p.pct}%</span>)} · los gastos personales no entran
                    </span>
                  </p>
                  {saldoGrupos.length === 0 ? (
                    <div className="saldo-row saldo-quits">✅ Están a mano: nadie le debe nada al otro.</div>
                  ) : (
                    saldoGrupos.map((g, i) => (
                      <div className="saldo-row" key={i}>
                        <div className="saldo-deudor"><strong>{g.deudor.emoji} {g.deudor.label}</strong> {cierre.cerrado ? 'pagó:' : 'debe:'}</div>
                        <div className="saldo-montos">{g.montos.map((m, j) => <span key={j}>{j ? ' · ' : ''}<strong className="saldo-monto">{m}</strong></span>)}</div>
                        <div className="saldo-acreedor">a <strong>{g.acreedor.emoji} {g.acreedor.label}</strong></div>
                      </div>
                    ))
                  )}
                  {cierre.cerrado ? (
                    <p className="cierre-foot">🤝 Cuentas cerradas{cierre.cerradoPor && <> · por {cierre.cerradoPor}</>}.</p>
                  ) : cierre.esPasado ? (
                    <>
                      <p className="cierre-foot">Saldo en vivo con la división actual. Al cerrar, queda congelado para este mes.</p>
                      <button type="button" className="btn-save cierre-btn" onClick={onCerrar} disabled={cerrar.isPending}>Cerrar mes 🤝</button>
                    </>
                  ) : (
                    <p className="cierre-foot">Saldo en vivo con la división actual. El mes en curso se puede cerrar cuando termine.</p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Total por persona (no en "mis gastos") */}
          {personasTotales.length > 0 && tipo !== 'personales' && (
            <div className="chart-card">
              <div className="chart-title">Total por persona</div>
              {personasTotales.map((p) => (
                <div className="persona-row" key={p.label}>
                  <span className="persona-name">{p.emoji} {p.label}</span>
                  <span className="persona-tot">
                    <span className="persona-ars">{p.arsStr}</span>
                    <span className="persona-usd">{p.usdStr}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Torta + ranking */}
          {dist.filas.length === 0 ? (
            <div className="recent-empty">No hay gastos en pesos este mes para graficar.</div>
          ) : (
            <>
              <div className="chart-card">
                <div className="chart-title">Distribución por categoría</div>
                <div className="pie-wrap">
                  <div className="pie" style={{ background: dist.pieGradient }} />
                  <div className="pie-legend">
                    {dist.filas.map((c) => (
                      <div className="leg-item" key={c.id}>
                        <span className={`leg-dot cat-${c.id}`} />
                        <span className="leg-name">{c.emoji} {c.label}</span>
                        <span className="leg-pct">{c.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="chart-card">
                <div className="chart-title">Ranking por categoría</div>
                {dist.filas.map((c) => (
                  <div className="bar-row" key={c.id}>
                    <span className="bar-name">{c.emoji} {c.label}</span>
                    <span className="bar-track"><span className={`bar-fill cat-${c.id}`} style={{ width: `${Math.max(c.pct, 3)}%` }} /></span>
                    <span className="bar-val">$ {c.total.toLocaleString('es-AR')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          </>
          )}
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        initial={sheetInitial}
        categorias={cats}
        personas={PERSONAS}
        personaDefault={personaDefault}
        otrosId={otrosId}
        sugerencias={sugerencias}
        iaEnabled={false}
      />
    </AppShell>
  )
}

// Lista mobile por día, aplicando el filtro (oculta gastos/días vacíos).
function MobileLista({ grupos, match, filtrando, catLookup, onEdit }) {
  let visibles = 0
  const render = grupos.map((grupo) => {
    const items = grupo.items.filter(match)
    visibles += items.length
    if (items.length === 0) return null
    return (
      <div className="day-group" key={grupo.fecha}>
        <div className="day-row">
          <span className="day-label">{grupo.etiqueta}</span>
          {!filtrando && <span className="day-total">{grupo.totalStr}</span>}
        </div>
        <div className="day-card">
          {items.map((g) => (
            <GastoRow key={g.id} g={g} cat={catLookup(g.categoria)} perLabel={personaLabel(g.a_nombre_de)} editable onEdit={() => onEdit(g)} />
          ))}
        </div>
      </div>
    )
  })
  if (grupos.length === 0) return <div className="recent-empty">Sin gastos en este mes.</div>
  if (visibles === 0) return <div className="recent-empty">Sin movimientos con esos filtros 🔍</div>
  return render
}

// Tabla desktop con filtros (buscar, persona, categoría, moneda, agrupación).
// Tiene su propio estado de filtros; recibe `movs` (filas ya calculadas con
// filaMovimiento) y `onEdit(id)` para abrir la hoja de edición.
function TablaDesktop({ movs, onEdit }) {
  const [q, setQ] = useState('')
  const [per, setPer] = useState('all')
  const [cat, setCat] = useState('all')
  const [cur, setCur] = useState('all')
  const [tipo, setTipo] = useState('all') // all | comp | pers
  const [grp, setGrp] = useState('none') // agrupación: none | cat | per

  // Categorías presentes en el mes (para poblar el desplegable de filtro).
  const catsUnicas = useMemo(() => {
    const m = new Map()
    movs.forEach((r) => m.set(r.cat, { id: r.cat, label: r.catLabel, emoji: r.catEmoji }))
    return [...m.values()]
  }, [movs])

  // Filas tras aplicar los 4 filtros (persona, categoría, moneda y texto en desc).
  const rows = useMemo(() => {
    return movs.filter(
      (r) =>
        (per === 'all' || r.per === per) &&
        (cat === 'all' || r.cat === cat) &&
        (cur === 'all' || r.cur === cur) &&
        (tipo === 'all' || (tipo === 'comp' ? r.compartido : !r.compartido)) &&
        (q === '' || r.desc.toLowerCase().indexOf(q.toLowerCase()) > -1)
    )
  }, [movs, per, cat, cur, tipo, q])

  // Helpers de formato y suma (ARS/USD se totalizan por separado). `byFecha`
  // ordena de más nuevo a más viejo. `tArs`/`tUsd` = totales de las filas visibles.
  const fmtARS = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-AR'))
  const fmtUSD = (n) => (n == null ? '—' : 'US$' + Math.round(n).toLocaleString('es-AR'))
  const sumArs = (r) => r.reduce((s, x) => s + (x.ars || 0), 0)
  const sumUsd = (r) => r.reduce((s, x) => s + (x.usd || 0), 0)
  const byFecha = (a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)
  const tArs = sumArs(rows), tUsd = sumUsd(rows)

  // Una fila <tr> de la tabla (fecha, persona, descripción, categoría, tipo,
  // monto cargado, equivalentes ARS/USD y botón editar).
  function Fila({ r }) {
    return (
      <tr>
        <td className="td-date">{r.fechaLabel}</td>
        <td className="col-per"><span className="per-cell"><span className="per-emoji">{r.perEmoji}</span>{r.perLabel}</span></td>
        <td className="desc-cell">{r.desc}</td>
        <td><span className={`cat-chip cat-${r.cat}`}>{r.catEmoji} {r.catLabel}</span></td>
        <td className="col-tipo"><span className={`tipo-chip ${r.compartido ? 'tipo-comp' : 'tipo-pers'}`}>{r.compartido ? '🤝 Compartido' : '👤 Personal'}</span></td>
        <td className="col-cargado"><span className="cargado"><span className="num">{(r.cur === 'USD' ? 'US$' : '$') + Math.round(r.amt).toLocaleString('es-AR')}</span><span className={`cur-badge cur-${r.cur === 'USD' ? 'usd' : 'ars'}`}>{r.cur}</span></span></td>
        <td className="num">{fmtARS(r.ars)}</td>
        <td className="num usd-col col-usd">{fmtUSD(r.usd)}</td>
        <td className="mv-edit-cell"><button type="button" className="mv-edit" aria-label="Editar gasto" onClick={() => onEdit(r.id)}>✏️</button></td>
      </tr>
    )
  }

  // Cuerpo de la tabla: vacío, plano (ordenado por fecha) o agrupado por
  // categoría/persona (cada grupo con su encabezado y subtotal, ordenado por monto).
  let cuerpo
  if (rows.length === 0) {
    cuerpo = <tr className="empty-row"><td colSpan="9">Sin movimientos con estos filtros 🔍</td></tr>
  } else if (grp === 'none') {
    cuerpo = rows.slice().sort(byFecha).map((r) => <Fila key={r.id} r={r} />)
  } else {
    const keyOf = (r) => (grp === 'cat' ? r.cat : r.per)
    const groups = {}
    rows.forEach((r) => (groups[keyOf(r)] = groups[keyOf(r)] || []).push(r))
    cuerpo = Object.keys(groups)
      .sort((a, b) => sumArs(groups[b]) - sumArs(groups[a]))
      .flatMap((k) => {
        const g = groups[k].slice().sort(byFecha)
        const f = g[0]
        const label = grp === 'cat' ? f.catLabel : f.perLabel
        const emoji = grp === 'cat' ? f.catEmoji : f.perEmoji
        return [
          <tr className="grp-row" key={'h' + k}>
            <td colSpan="9">
              <div className="grp-inner">
                <span className="grp-name">{emoji} {label} <span className="grp-count">· {g.length} mov.</span></span>
                <span className="grp-tot"><span className="num">{fmtARS(sumArs(g))}</span><span className="num usd-col">{fmtUSD(sumUsd(g))}</span></span>
              </div>
            </td>
          </tr>,
          ...g.map((r) => <Fila key={r.id} r={r} />),
        ]
      })
  }

  function limpiar() {
    setQ(''); setPer('all'); setCat('all'); setCur('all'); setTipo('all'); setGrp('none')
  }
  const hayFiltros = q !== '' || per !== 'all' || cat !== 'all' || cur !== 'all' || tipo !== 'all'

  return (
    <div className="gastos-desktop">
      <div className="mv-kpis">
        <div className="mv-kpi"><div className="mv-kpi-label">Movimientos</div><div className="mv-kpi-val">{rows.length}</div><div className="mv-kpi-sub">de {movs.length} en el mes</div></div>
        <div className="mv-kpi"><div className="mv-kpi-label">Total ARS</div><div className="mv-kpi-val coral">{fmtARS(tArs)}</div><div className="mv-kpi-sub">pesos</div></div>
        <div className="mv-kpi"><div className="mv-kpi-label">Total USD</div><div className="mv-kpi-val">{fmtUSD(tUsd)}</div><div className="mv-kpi-sub">dólar bolsa</div></div>
        <div className="mv-kpi"><div className="mv-kpi-label">Promedio</div><div className="mv-kpi-val">{fmtARS(rows.length ? tArs / rows.length : 0)}</div><div className="mv-kpi-sub">por movimiento</div></div>
      </div>

      <div className="mv-filters mv-filters-slim">
        <div className="mv-filters-hint">Filtrá desde los títulos de cada columna ↓</div>
        <div className="filt-right">
          <div className="filt">
            <label>Agrupar</label>
            <div className="seg">
              <button type="button" className={grp === 'none' ? 'is-on' : ''} onClick={() => setGrp('none')}>—</button>
              <button type="button" className={grp === 'cat' ? 'is-on' : ''} onClick={() => setGrp('cat')}>Categoría</button>
              <button type="button" className={grp === 'per' ? 'is-on' : ''} onClick={() => setGrp('per')}>Persona</button>
            </div>
          </div>
          <button className="mv-clear" type="button" onClick={limpiar} disabled={!hayFiltros && grp === 'none'}>Limpiar</button>
        </div>
      </div>

      <div className="mv-tablecard">
        <div className="mv-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Fecha</th>
                <th className="col-per">
                  <div className="th-col">
                    <span className="th-name">Persona</span>
                    <select className={`th-ctl ${per !== 'all' ? 'is-active' : ''}`} value={per} onChange={(e) => setPer(e.target.value)} aria-label="Filtrar por persona">
                      <option value="all">Todas</option>
                      {PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.emoji} {p.label}</option>)}
                    </select>
                  </div>
                </th>
                <th>
                  <div className="th-col">
                    <span className="th-name">Descripción</span>
                    <input className={`th-ctl ${q !== '' ? 'is-active' : ''}`} type="text" placeholder="Buscar…" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar por descripción" />
                  </div>
                </th>
                <th>
                  <div className="th-col">
                    <span className="th-name">Categoría</span>
                    <select className={`th-ctl ${cat !== 'all' ? 'is-active' : ''}`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoría">
                      <option value="all">Todas</option>
                      {catsUnicas.map((c) => <option key={c.id} value={c.id}>{c.emoji}  {c.label}</option>)}
                    </select>
                  </div>
                </th>
                <th className="col-tipo">
                  <div className="th-col">
                    <span className="th-name">Tipo</span>
                    <select className={`th-ctl ${tipo !== 'all' ? 'is-active' : ''}`} value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo">
                      <option value="all">Todos</option>
                      <option value="comp">🤝 Compartido</option>
                      <option value="pers">👤 Personal</option>
                    </select>
                  </div>
                </th>
                <th className="col-cargado">
                  <div className="th-col">
                    <span className="th-name">Cargado</span>
                    <select className={`th-ctl ${cur !== 'all' ? 'is-active' : ''}`} value={cur} onChange={(e) => setCur(e.target.value)} aria-label="Filtrar por moneda">
                      <option value="all">Todas</option>
                      <option value="ARS">Pesos (ARS)</option>
                      <option value="USD">Dólares (USD)</option>
                    </select>
                  </div>
                </th>
                <th className="num">ARS</th>
                <th className="num col-usd">USD</th>
                <th aria-label="Editar"></th>
              </tr>
            </thead>
            <tbody>{cuerpo}</tbody>
          </table>
        </div>
        <div className="mv-foot">
          <div className="mv-foot-label">Totales <span className="mv-foot-pill">{rows.length} {rows.length === 1 ? 'movimiento' : 'movimientos'}</span></div>
          <div className="mv-foot-tot">
            <div className="mv-foot-block"><div className="mv-foot-cap">ARS</div><div className="mv-foot-amt">{fmtARS(tArs)}</div></div>
            <div className="mv-foot-block"><div className="mv-foot-cap">USD</div><div className="mv-foot-amt usd">{fmtUSD(tUsd)}</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}
