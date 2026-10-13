import { fmtMonto } from '../calculos.js'

// Texto de la notificación push para los pendientes nuevos de una corrida.
// 1 movimiento → detalle y abre su hoja; 2+ → resumen y abre la tarjeta.
// `tag: 'mp'` hace que un aviso nuevo reemplace al anterior en vez de apilarse.
export function armarAviso(movs) {
  if (!movs?.length) return null
  if (movs.length > 1) {
    return { title: 'Mercado Pago', body: `Tenés ${movs.length} pagos sin cargar`, url: '/inicio?mp=lista', tag: 'mp' }
  }
  const m = movs[0]
  const esTransferencia = m.medio === 'transferencia'
  const que = esTransferencia
    ? m.contacto?.nombre || m.contacto?.sugerido || m.descripcion || 'una cuenta'
    : m.descripcion || m.descripcion_mp || 'Pago con Mercado Pago'
  return {
    title: `${esTransferencia ? 'Transferiste' : 'Pagaste'} ${fmtMonto(m.moneda, m.monto)}`,
    body: `${que} — ¿lo cargo?`,
    url: `/inicio?mp=${encodeURIComponent(m.id)}`,
    tag: 'mp',
  }
}
