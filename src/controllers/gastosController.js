// Controlador de gastos: las pantallas 2 (cargar) y 3 (lista) y sus acciones.
import {
  dbEnabled,
  listarGastos,
  obtenerGasto,
  crearGasto,
  actualizarGasto,
  eliminarGasto,
} from '../models/db.js'

// Calcula los totales separados por moneda (no se puede sumar ARS con USD).
function calcularTotales(gastos) {
  const totales = gastos.reduce((acc, g) => {
    acc[g.moneda] = (acc[g.moneda] ?? 0) + Number(g.monto)
    return acc
  }, {})
  return (
    Object.entries(totales)
      .map(([m, v]) => `${m} $${v.toFixed(2)}`)
      .join(' — ') || '—'
  )
}

// Lee y valida los campos de un gasto desde el body del formulario.
// Devuelve { ok, datos } o { ok:false, error }.
function leerGastoDelBody(body) {
  const { descripcion, monto, categoria, fecha, moneda, a_nombre_de } = body ?? {}
  const montoNum = Number(monto)
  if (!descripcion || !Number.isFinite(montoNum) || montoNum < 0) {
    return { ok: false, error: 'Descripción y monto (válido) son obligatorios.' }
  }
  return {
    ok: true,
    datos: {
      descripcion: String(descripcion),
      monto: montoNum,
      moneda,
      a_nombre_de: a_nombre_de ? String(a_nombre_de) : null,
      categoria: categoria ? String(categoria) : null,
      fecha: fecha ? String(fecha) : null,
    },
  }
}

// --- Pantalla 2: cargar un gasto nuevo ---
export const formularioNuevo = (req, res) => {
  res.render('nuevo', { user: req.user, dbEnabled, error: null })
}

export const crear = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const r = leerGastoDelBody(req.body)
    if (!r.ok) {
      res.status(400).render('nuevo', { user: req.user, dbEnabled, error: r.error })
      return
    }
    await crearGasto(req.user.id, req.user.displayName, r.datos)
    res.redirect('/gastos')
  } catch (err) {
    next(err)
  }
}

// --- Pantalla 3: lista de gastos (con borrar y editar) ---
export const lista = async (req, res, next) => {
  try {
    let gastos = []
    let totalStr = '—'
    if (dbEnabled) {
      gastos = await listarGastos(req.user.id)
      totalStr = calcularTotales(gastos)
    }
    res.render('lista', { user: req.user, dbEnabled, gastos, totalStr })
  } catch (err) {
    next(err)
  }
}

// Formulario de edición (precargado con el gasto elegido).
export const formularioEditar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const gasto = await obtenerGasto(req.user.id, req.params.id)
    if (!gasto) {
      res.redirect('/gastos')
      return
    }
    res.render('editar', { user: req.user, gasto, error: null })
  } catch (err) {
    next(err)
  }
}

export const actualizar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const r = leerGastoDelBody(req.body)
    if (!r.ok) {
      const gasto = { ...req.body, id: req.params.id }
      res.status(400).render('editar', { user: req.user, gasto, error: r.error })
      return
    }
    // a_nombre_de vacío en edición: mantenemos el nombre del usuario por defecto.
    const datos = { ...r.datos, a_nombre_de: r.datos.a_nombre_de ?? req.user.displayName }
    await actualizarGasto(req.user.id, req.params.id, datos)
    res.redirect('/gastos')
  } catch (err) {
    next(err)
  }
}

// Borrar (desde el botón de la lista).
export const eliminar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    await eliminarGasto(req.user.id, req.params.id)
    res.redirect('/gastos')
  } catch (err) {
    next(err)
  }
}
