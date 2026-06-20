'use client'
import { useState, useEffect, useRef } from 'react'
import { useCrearGasto, useEditarGasto, useBorrarGasto } from '../lib/api.js'
import { useToast } from './Toasts.jsx'

// Fecha local YYYY-MM-DD (sin desfase UTC), igual que app.js.
function ymdLocal(d) {
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}
const hoyStr = () => ymdLocal(new Date())
const ayerStr = () => ymdLocal(new Date(Date.now() - 86400000))

function polishLocal(s) {
  s = (s || '').trim().replace(/\s+/g, ' ')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

const VACIO = (personaDefault) => ({
  editId: '',
  descripcion: '',
  monto: '',
  moneda: 'ARS',
  compartido: true,
  persona: personaDefault,
  categoria: '__auto__',
  fecha: hoyStr(),
  fechaKind: 'hoy',
})

// Hoja inferior (bottom sheet) para cargar / editar un gasto. Portado de sheet.ejs
// + la lógica de app.js, ahora como estado React. `iaEnabled` decide si se ofrece
// la categoría "Automático".
export default function Sheet({
  open,
  onClose,
  initial, // gasto a editar (filaMovimiento o data-*) o null para nuevo
  categorias = [],
  personas = [],
  personaDefault = '',
  otrosId = '',
  sugerencias = [],
  iaEnabled = false,
  onSaved, // callback(tipo) tras guardar: 'nuevo' | 'editado' | 'borrado'
}) {
  const crear = useCrearGasto()
  const editar = useEditarGasto()
  const borrar = useBorrarGasto()
  const toast = useToast()
  const [f, setF] = useState(VACIO(personaDefault))
  const [guardando, setGuardando] = useState(false)
  const descRef = useRef(null)

  const esEdicion = !!f.editId
  const autoDisponible = iaEnabled && !esEdicion

  // El CSS del diseño abre la hoja con la clase `sheet-open` en el <body>
  // (body.sheet-open .sheet/.scrim). Mantenemos ese contrato.
  useEffect(() => {
    document.body.classList.toggle('sheet-open', open)
    return () => document.body.classList.remove('sheet-open')
  }, [open])

  // Al abrir, cargar el estado (nuevo o edición).
  useEffect(() => {
    if (!open) return
    setGuardando(false)
    if (initial) {
      const fechaG = initial.fecha || ''
      setF({
        editId: initial.id,
        descripcion: initial.descripcion ?? initial.desc ?? '',
        monto: String(initial.monto ?? initial.amt ?? ''),
        moneda: (initial.moneda ?? initial.cur) === 'USD' ? 'USD' : 'ARS',
        compartido: initial.compartido !== false,
        persona: initial.a_nombre_de ?? initial.per ?? personaDefault,
        categoria: initial.categoria ?? initial.cat ?? otrosId,
        fecha: fechaG || hoyStr(),
        fechaKind: !fechaG || fechaG === hoyStr() ? 'hoy' : fechaG === ayerStr() ? 'ayer' : 'otro',
      })
    } else {
      setF({ ...VACIO(personaDefault), categoria: autoDisponible ? '__auto__' : otrosId })
    }
    // foco en descripción
    setTimeout(() => descRef.current?.focus(), 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  function set(patch) {
    setF((prev) => ({ ...prev, ...patch }))
  }

  // Personal: fuerza la persona al logueado y deshabilita el selector.
  function setPersonal(personal) {
    set({ compartido: !personal, ...(personal ? { persona: personaDefault } : {}) })
  }

  function setFechaKind(kind) {
    if (kind === 'hoy') set({ fechaKind: 'hoy', fecha: hoyStr() })
    else if (kind === 'ayer') set({ fechaKind: 'ayer', fecha: ayerStr() })
    else set({ fechaKind: 'otro' })
  }

  function camposFaltantes() {
    const falta = []
    if (!f.descripcion.trim()) falta.push('qué')
    if (!(Number(f.monto) > 0)) falta.push('cuánto')
    if (!f.persona) falta.push('quién')
    return falta
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (guardando) return
    const faltan = camposFaltantes()
    if (faltan.length) {
      toast('warning', 'Te falta: ' + faltan.join(', '))
      return
    }
    setGuardando(true)
    // En Automático, mandamos "Otros" como placeholder (la IA puede cambiarla luego).
    const categoria = f.categoria === '__auto__' ? otrosId : f.categoria
    const body = {
      descripcion: polishLocal(f.descripcion),
      monto: Number(f.monto),
      moneda: f.moneda,
      a_nombre_de: f.persona,
      categoria,
      fecha: f.fecha,
      compartido: f.compartido,
    }
    try {
      if (esEdicion) {
        await editar.mutateAsync({ id: f.editId, ...body })
        toast('success', 'Gasto actualizado ✓')
        onSaved?.('editado')
      } else {
        await crear.mutateAsync(body)
        toast('success', 'Gasto guardado ✓')
        onSaved?.('nuevo')
      }
      onClose()
    } catch (err) {
      toast('error', err.message || 'No se pudo guardar')
      setGuardando(false)
    }
  }

  async function onBorrar() {
    if (!confirm('¿Seguro que querés borrar este gasto?')) return
    try {
      await borrar.mutateAsync(f.editId)
      toast('success', 'Gasto borrado ✓')
      onSaved?.('borrado')
      onClose()
    } catch (err) {
      toast('error', err.message || 'No se pudo borrar')
    }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-grab" />
        <div className="sheet-head">
          <div className="sheet-head-top">
            <div className="sheet-title">{esEdicion ? 'Editar gasto' : 'Nuevo gasto'}</div>
            <label className="personal-switch" title="Gasto solo mío, no entra al reparto">
              <span className="personal-switch-txt">Personal</span>
              <input type="checkbox" checked={!f.compartido} onChange={(e) => setPersonal(e.target.checked)} />
              <span className="personal-switch-track"><span className="personal-switch-knob" /></span>
            </label>
          </div>
        </div>

        <form className="sheet-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="f-descripcion">¿Qué fue?</label>
            <input
              ref={descRef}
              className="inp"
              id="f-descripcion"
              placeholder="Ej: Súper"
              list="desc-sugerencias"
              autoComplete="off"
              value={f.descripcion}
              onChange={(e) => set({ descripcion: e.target.value })}
              onBlur={(e) => set({ descripcion: polishLocal(e.target.value) })}
            />
            <datalist id="desc-sugerencias">
              {sugerencias.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label htmlFor="f-monto">¿Cuánto?</label>
            <div className="money-row">
              <div className="money-inp">
                <span className="money-sign">{f.moneda === 'USD' ? 'US$' : '$'}</span>
                <input
                  className="inp-money"
                  id="f-monto"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={f.monto}
                  onChange={(e) => set({ monto: e.target.value })}
                />
              </div>
              <div className="moneda-toggle">
                {['ARS', 'USD'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`moneda-opt ${f.moneda === m ? 'is-on' : ''}`}
                    onClick={() => set({ moneda: m })}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <label>¿A nombre de quién?</label>
            <div className={`segmented ${!f.compartido ? 'is-disabled' : ''}`}>
              {personas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`seg-opt ${f.persona === p.id ? 'is-on' : ''}`}
                  disabled={!f.compartido}
                  onClick={() => set({ persona: p.id })}
                >
                  <span className="seg-emoji">{p.emoji}</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label htmlFor="cat-select">Categoría</label>
            <div className="cat-select-wrap">
              <select className="inp cat-select" id="cat-select" value={f.categoria} onChange={(e) => set({ categoria: e.target.value })}>
                {autoDisponible && <option value="__auto__">✨ Automático (lo elige la IA)</option>}
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.emoji}  {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>¿Cuándo?</label>
            <div className="date-row">
              <button type="button" className={`date-pill ${f.fechaKind === 'hoy' ? 'is-on' : ''}`} onClick={() => setFechaKind('hoy')}>Hoy</button>
              <button type="button" className={`date-pill ${f.fechaKind === 'ayer' ? 'is-on' : ''}`} onClick={() => setFechaKind('ayer')}>Ayer</button>
              <button type="button" className={`date-pill ${f.fechaKind === 'otro' ? 'is-on' : ''}`} onClick={() => setFechaKind('otro')}>Otro día</button>
              {f.fechaKind === 'otro' && (
                <input
                  type="date"
                  className="date-input"
                  value={f.fecha}
                  onChange={(e) => set({ fecha: e.target.value })}
                />
              )}
            </div>
          </div>

          <div className="sheet-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn-save" disabled={guardando}>
              {esEdicion ? 'Guardar edición' : 'Guardar gasto'}
            </button>
          </div>
        </form>

        {esEdicion && (
          <form onSubmit={(e) => { e.preventDefault(); onBorrar() }} style={{ marginTop: 4 }}>
            <button type="submit" className="btn-delete">🗑 Borrar gasto</button>
          </form>
        )}
      </div>
    </>
  )
}
