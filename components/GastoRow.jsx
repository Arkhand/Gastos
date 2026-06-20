'use client'
// Fila de un gasto. Usada en Inicio (solo lectura) y Resumen (editable con lápiz).
// Portado de gasto-row.ejs. `cat` y `perLabel` ya vienen resueltos del cliente.
import { fmtMonto } from '../lib/calculos.js'

export default function GastoRow({ g, cat, perLabel, editable, onEdit }) {
  return (
    <div className="exp-row" data-id={g.id}>
      <span className={`exp-emoji cat-${cat.id}`}>{cat.emoji}</span>
      <span className="exp-mid">
        <span className="exp-desc">{g.descripcion}</span>
        <span className="exp-cat">
          {perLabel ? `${perLabel} · ` : ''}{cat.label}
          {g.compartido === false && <span className="tipo-chip tipo-pers">👤 Personal</span>}
        </span>
      </span>
      <span className="exp-amount">{fmtMonto(g.moneda, g.monto)}</span>
      {editable && (
        <button type="button" className="exp-edit" aria-label="Editar gasto" onClick={() => onEdit?.(g)}>
          ✏️
        </button>
      )}
    </div>
  )
}
