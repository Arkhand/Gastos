// "¿Ya lo cargaste?": busca un gasto activo que probablemente sea este movimiento.
// Monto en ARS a ±1% (mínimo $1) y fecha a ±1 día. Se ignoran los gastos ya
// vinculados a otro movimiento. Gana el monto más cercano; a igual distancia, el
// cargado a nombre del dueño del movimiento (puede haberlo cargado la otra persona).
const dia = (ymd) => Date.parse(`${ymd}T00:00:00Z`) / 86400_000

export function buscarDuplicado(mov, gastos, vinculados) {
  const tol = Math.max(mov.monto * 0.01, 1)
  const dMov = dia(mov.fecha)
  let mejor = null
  for (const g of gastos) {
    if (g.eliminado || vinculados.has(g.id)) continue
    const fecha = g.fecha || String(g.created_at || '').slice(0, 10)
    if (!fecha) continue
    const montoArs = Number(g.monto_ars ?? (g.moneda === 'ARS' ? g.monto : NaN))
    const diff = Math.abs(montoArs - mov.monto)
    if (!(diff <= tol) || Math.abs(dia(fecha) - dMov) > 1) continue
    const ajeno = g.a_nombre_de === mov.owner ? 0 : 1
    if (!mejor || diff < mejor.diff || (diff === mejor.diff && ajeno < mejor.ajeno)) mejor = { g, diff, ajeno }
  }
  return mejor?.g ?? null
}
