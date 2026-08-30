// Exportación de los movimientos de un mes a un archivo que Excel abre como
// planilla. Usamos una tabla HTML guardada como .xls (no una librería): Excel la
// abre respetando columnas y formato en cualquier locale, sin dependencias.

// Escapa texto para meterlo en una celda HTML.
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// `movs` = filas de filaMovimiento (fecha, perLabel, desc, catLabel, cur, amt,
// ars, usd, compartido). `mesLbl` = "Junio 2026" para el título.
export function movimientosAExcel(movs, mesLbl) {
  const filas = movs
    .slice()
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0))
  const num = (n) => (n == null ? '' : Math.round(Number(n)))

  const cabeceras = ['Fecha', 'Persona', 'Descripción', 'Categoría', 'Tipo', 'Moneda', 'Monto', 'ARS', 'USD']
  const thead = cabeceras.map((h) => `<th>${esc(h)}</th>`).join('')
  const tbody = filas
    .map(
      (r) => `<tr>
        <td>${esc(r.fecha)}</td>
        <td>${esc(r.perLabel)}</td>
        <td>${esc(r.desc)}</td>
        <td>${esc(r.catLabel)}</td>
        <td>${r.compartido ? 'Compartido' : 'Personal'}</td>
        <td>${esc(r.cur)}</td>
        <td style="mso-number-format:'#,##0'">${num(r.amt)}</td>
        <td style="mso-number-format:'#,##0'">${num(r.ars)}</td>
        <td style="mso-number-format:'#,##0'">${num(r.usd)}</td>
      </tr>`
    )
    .join('')

  const totArs = filas.reduce((s, r) => s + (Number(r.ars) || 0), 0)
  const totUsd = filas.reduce((s, r) => s + (Number(r.usd) || 0), 0)
  const tfoot = `<tr>
      <td colspan="7" style="font-weight:bold">Totales (${filas.length} mov.)</td>
      <td style="font-weight:bold;mso-number-format:'#,##0'">${num(totArs)}</td>
      <td style="font-weight:bold;mso-number-format:'#,##0'">${num(totUsd)}</td>
    </tr>`

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${esc(mesLbl)}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body>
<table border="1">
<caption style="font-weight:bold;text-align:left">Gastos — ${esc(mesLbl)}</caption>
<thead><tr>${thead}</tr></thead>
<tbody>${tbody}</tbody>
<tfoot>${tfoot}</tfoot>
</table>
</body></html>`
}

// Dispara la descarga del .xls en el navegador.
export function descargarExcel(movs, mes, mesLbl) {
  const html = movimientosAExcel(movs, mesLbl)
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gastos-${mes}.xls`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
