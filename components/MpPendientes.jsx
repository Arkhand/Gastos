'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMpPendientes, useDescartarMp, useVincularMp } from '../lib/api.js'
import { fmtMonto } from '../lib/calculos.js'
import { detalleContacto } from '../lib/mp/vista.js'
import { useToast } from './Toasts.jsx'

const CHIP = { tarjeta: '💳 tarjeta', transferencia: '↗ transferencia' }
const ddmm = (ymd) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`

// Tarjeta "Mercado Pago · N sin cargar" en /inicio. Solo aparece si hay pendientes
// (o si hay que reconectar la cuenta). Agregar abre la hoja precargada.
export default function MpPendientes({ onAgregar, abrirInicial = false }) {
  const { data } = useMpPendientes()
  const descartar = useDescartarMp()
  const vincular = useVincularMp()
  const toast = useToast()
  const [abierta, setAbierta] = useState(abrirInicial)
  // Desde el aviso push resumen (?mp=lista) se abre desplegada.
  useEffect(() => {
    if (abrirInicial) setAbierta(true)
  }, [abrirInicial])

  if (data?.necesitaReconectar) {
    return (
      <Link className="mp-card mp-card-aviso" href="/config/mp">
        🟦 Mercado Pago necesita que vuelvas a conectar tu cuenta ›
      </Link>
    )
  }
  const lista = data?.pendientes ?? []
  if (!lista.length) return null

  function onDescartar(m) {
    descartar.mutate(
      { id: m.id },
      {
        onSuccess: () =>
          toast('success', 'Descartado', { label: 'Deshacer', onClick: () => descartar.mutate({ id: m.id, deshacer: true }) }),
        onError: (e) => toast('error', e.message || 'No se pudo descartar'),
      },
    )
  }

  function onEsEste(m) {
    vincular.mutate(
      { id: m.id, gasto_id: m.duplicado.id },
      {
        onSuccess: () => toast('success', 'Listo, quedó vinculado ✓'),
        onError: (e) => toast('error', e.message || 'No se pudo vincular'),
      },
    )
  }

  return (
    <section className="mp-card">
      <button type="button" className="mp-card-head" onClick={() => setAbierta(!abierta)} aria-expanded={abierta}>
        <span>🟦 Mercado Pago · <strong>{lista.length}</strong> sin cargar</span>
        <span className="mp-card-arrow">{abierta ? '▾' : '▸'}</span>
      </button>
      {abierta && (
        <ul className="mp-list">
          {lista.map((m) => (
            <li className="mp-item" key={m.id}>
              <div className="mp-item-top">
                <div className="mp-item-desc">{m.descripcion || m.descripcion_mp || 'Pago con Mercado Pago'}</div>
                <div className="mp-item-monto">{fmtMonto(m.moneda, m.monto)}</div>
              </div>
              <div className="mp-item-meta">
                <span>{ddmm(m.fecha)}</span>
                {CHIP[m.medio] && <span className="mp-chip">{CHIP[m.medio]}</span>}
                {m.mp_status && m.mp_status !== 'approved' && (
                  <span className="mp-chip" title="Mercado Pago todavía no lo cobró en firme: el monto puede ajustarse">⏳ sin confirmar</span>
                )}
                {m.contacto && <span>{m.contacto.nombre || detalleContacto(m.contacto)}</span>}
              </div>
              {m.duplicado && (
                <div className="mp-dup">
                  ¿Ya lo cargaste? {m.duplicado.descripcion} · {fmtMonto(m.duplicado.moneda, m.duplicado.monto)}
                  <button type="button" className="mp-link" onClick={() => onEsEste(m)}>Es este</button>
                </div>
              )}
              <div className="mp-item-acts">
                <button type="button" className="mp-btn-ghost" onClick={() => onDescartar(m)}>Descartar</button>
                <button type="button" className="mp-btn" onClick={() => onAgregar(m)}>Agregar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
