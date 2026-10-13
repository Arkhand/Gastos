// Alta de un gasto desde un pendiente de Mercado Pago. Primero RESERVA el
// movimiento (pendiente → agregado) con un update condicional: si llegan dos
// requests a la vez (dos pestañas, un reintento de red), solo uno lo consigue y el
// otro recibe 409; nunca se crean dos gastos. Si crear el gasto falla, se libera.
// Devuelve { status: 200, gasto } | { status: 404 | 409 }.
export async function agregarDesdeMp({ owner, mpId, db, crearGasto, contactoNombre, datos }) {
  const mov = await db.leerMovimiento(owner, mpId)
  if (!mov) return { status: 404 }
  if (!(await db.marcar(owner, mpId, { estado: 'agregado', motivo: null }))) return { status: 409 }

  let gasto
  try {
    gasto = await crearGasto()
  } catch (e) {
    await db.marcar(owner, mpId, { estado: 'pendiente' }, 'agregado').catch(() => {})
    throw e
  }

  // El gasto ya existe: si esto falla no se rompe el alta (queda agregado sin vínculo).
  try {
    await db.marcar(owner, mpId, { gasto_id: gasto.id }, 'agregado')
    if (mov.contacto_id) {
      const nombre = String(contactoNombre ?? '').trim()
      await db.guardarContacto(owner, mov.contacto_id, {
        nombre: nombre || undefined,
        categoria: datos.categoria,
        compartido: datos.compartido,
      })
    }
  } catch (e) {
    console.error('[mp agregar] vínculo', e.message)
  }
  return { status: 200, gasto }
}
