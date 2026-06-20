'use client'
import Link from 'next/link'
import { useState } from 'react'
import AppShell from '../../../../components/AppShell.jsx'
import {
  useCategorias,
  useCrearCategoria,
  useEditarCategoria,
  useBorrarCategoria,
  useRevivirCategoria,
} from '../../../../lib/api.js'

const AVISOS = {
  creada: ['ok', 'Categoría creada ✓'],
  editada: ['ok', 'Cambios guardados ✓'],
  eliminada: ['ok', 'Categoría eliminada ✓'],
  archivada: ['ok', 'La categoría tenía gastos: quedó archivada (sus gastos se conservan) ✓'],
  revivida: ['ok', 'Categoría restaurada ✓'],
  nombre: ['err', 'Poné un nombre.'],
  largo: ['err', 'El nombre es muy largo (máx 24).'],
  existe: ['err', 'Ya existe una categoría con ese nombre.'],
  'existe-borrada': ['err', 'Existe una categoría borrada con ese nombre. Restaurala desde "Archivadas" en vez de crear una nueva.'],
  'otros-imborrable': ['err', '"Otros" no se puede borrar: es la categoría de respaldo.'],
  'revivir-choca': ['err', 'Ya hay una categoría activa con ese nombre. Renombrá o borrá la otra primero.'],
  'no-existe': ['err', 'Esa categoría no existe.'],
}

export default function ConfigCategoriasPage() {
  const { data, isLoading } = useCategorias()
  const crear = useCrearCategoria()
  const editar = useEditarCategoria()
  const borrar = useBorrarCategoria()
  const revivir = useRevivirCategoria()

  const [aviso, setAviso] = useState('')
  const [nueva, setNueva] = useState({ emoji: '', nombre: '', hint: '' })
  const [editId, setEditId] = useState(null)
  const [editData, setEditData] = useState({ emoji: '', nombre: '', hint: '' })

  const activas = data?.activas ?? []
  const borradas = data?.borradas ?? []

  async function onCrear(e) {
    e.preventDefault()
    setAviso('')
    try {
      await crear.mutateAsync(nueva)
      setNueva({ emoji: '', nombre: '', hint: '' })
      setAviso('creada')
    } catch (err) {
      setAviso(err.code || 'error')
    }
  }

  function abrirEdit(c) {
    setEditId(c.id)
    setEditData({ emoji: c.emoji, nombre: c.label, hint: c.hint })
  }

  async function onEditar(e, id) {
    e.preventDefault()
    setAviso('')
    try {
      await editar.mutateAsync({ id, ...editData })
      setEditId(null)
      setAviso('editada')
    } catch (err) {
      setAviso(err.code || 'error')
    }
  }

  async function onBorrar(c) {
    if (!confirm(`¿Quitar «${c.label}»? Si tiene gastos, quedará archivada y esos gastos se conservan.`)) return
    setAviso('')
    try {
      const r = await borrar.mutateAsync(c.id)
      setAviso(r.resultado === 'archivada' ? 'archivada' : 'eliminada')
    } catch (err) {
      setAviso(err.code || 'error')
    }
  }

  async function onRevivir(c) {
    setAviso('')
    try {
      await revivir.mutateAsync(c.id)
      setAviso('revivida')
    } catch (err) {
      setAviso(err.code || 'error')
    }
  }

  const av = AVISOS[aviso]

  return (
    <AppShell pageClass="page-config">
      <div className="config">
        <Link className="cfg-back" href="/config">‹ Configuración</Link>
        <h1>Categorías</h1>

        {av && <div className={`cfg-alert cfg-alert-${av[0]}`}>{av[1]}</div>}

        <p className="cfg-intro">
          Agregá, editá o quitá las categorías de tus gastos. La IA usa estas mismas categorías al
          interpretar lo que cargás por voz o a mano.
        </p>

        {/* Alta */}
        <section className="cfg-card">
          <div className="cfg-card-title">Nueva categoría</div>
          <form className="cfg-new" onSubmit={onCrear}>
            <div className="cfg-new-row">
              <input className="inp cfg-emoji-inp" maxLength="4" placeholder="🐾" aria-label="Emoji"
                value={nueva.emoji} onChange={(e) => setNueva({ ...nueva, emoji: e.target.value })} />
              <input className="inp cfg-nombre-inp" maxLength="24" placeholder="Nombre (ej: Mascotas)" autoComplete="off" required
                value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} />
              <button type="submit" className="btn-save cfg-add-btn" disabled={crear.isPending}>Agregar</button>
            </div>
            <input className="inp cfg-hint-inp" maxLength="120" placeholder="Pista para la IA (opcional): ej veterinaria, alimento de perro" autoComplete="off"
              value={nueva.hint} onChange={(e) => setNueva({ ...nueva, hint: e.target.value })} />
          </form>
        </section>

        {/* Activas */}
        <section className="cfg-card">
          <div className="cfg-card-title">Activas</div>
          <div className="cfg-list">
            {isLoading && <div className="recent-empty">Cargando…</div>}
            {activas.map((c) => (
              <div className="cfg-item" key={c.id} data-id={c.id}>
                <div className="cfg-item-main">
                  <span className={`cat-chip cat-${c.id}`}>{c.emoji} {c.label}</span>
                  {c.hint && <span className="cfg-hint-txt">{c.hint}</span>}
                </div>
                <div className="cfg-item-actions">
                  <button type="button" className="cfg-btn cfg-edit-btn" onClick={() => (editId === c.id ? setEditId(null) : abrirEdit(c))}>
                    {editId === c.id ? 'Cancelar' : 'Editar'}
                  </button>
                  {!c.es_otros ? (
                    <button type="button" className="cfg-btn cfg-del-btn" onClick={() => onBorrar(c)}>Quitar</button>
                  ) : (
                    <span className="cfg-lock" title="La categoría de respaldo no se puede borrar">🔒</span>
                  )}
                </div>

                {editId === c.id && (
                  <form className="cfg-edit-form" onSubmit={(e) => onEditar(e, c.id)}>
                    <div className="cfg-new-row">
                      <input className="inp cfg-emoji-inp" maxLength="4" aria-label="Emoji"
                        value={editData.emoji} onChange={(e) => setEditData({ ...editData, emoji: e.target.value })} />
                      <input className="inp cfg-nombre-inp" maxLength="24" autoComplete="off" required readOnly={c.es_otros}
                        value={editData.nombre} onChange={(e) => setEditData({ ...editData, nombre: e.target.value })} />
                      <button type="submit" className="btn-save cfg-add-btn" disabled={editar.isPending}>Guardar</button>
                    </div>
                    <input className="inp cfg-hint-inp" maxLength="120" placeholder="Pista para la IA (opcional)" autoComplete="off"
                      value={editData.hint} onChange={(e) => setEditData({ ...editData, hint: e.target.value })} />
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Archivadas */}
        {borradas.length > 0 && (
          <section className="cfg-card">
            <div className="cfg-card-title">Archivadas</div>
            <p className="cfg-intro">
              Estas categorías tienen gastos viejos asociados. No aparecen al cargar ni las usa la IA. Podés restaurarlas.
            </p>
            <div className="cfg-list">
              {borradas.map((c) => (
                <div className="cfg-item cfg-item-off" key={c.id} data-id={c.id}>
                  <div className="cfg-item-main">
                    <span className={`cat-chip cat-${c.id}`}>{c.emoji} {c.label}</span>
                  </div>
                  <div className="cfg-item-actions">
                    <button type="button" className="cfg-btn cfg-revive-btn" onClick={() => onRevivir(c)}>Restaurar</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  )
}
