// Controlador de gastos: la lógica de crear/listar/borrar.
// Las acciones por formulario redirigen a /perfil; la API devuelve JSON.
import { dbEnabled, listarGastos, crearGasto, eliminarGasto } from '../models/db.js'

// --- Acciones vía formulario HTML ---
export const crearDesdeFormulario = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const { descripcion, monto, categoria, fecha, moneda, a_nombre_de } = req.body ?? {}
    const montoNum = Number(monto)
    if (!descripcion || !Number.isFinite(montoNum)) {
      res.status(400).send('Faltan datos: descripción y monto son obligatorios.')
      return
    }
    await crearGasto(req.user.id, req.user.displayName, {
      descripcion: String(descripcion),
      monto: montoNum,
      moneda,
      a_nombre_de: a_nombre_de ? String(a_nombre_de) : null,
      categoria: categoria ? String(categoria) : null,
      fecha: fecha ? String(fecha) : null,
    })
    res.redirect('/perfil')
  } catch (err) {
    next(err)
  }
}

export const eliminarDesdeFormulario = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    await eliminarGasto(req.user.id, req.params.id)
    res.redirect('/perfil')
  } catch (err) {
    next(err)
  }
}

// --- API JSON ---
export const listar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada' })
      return
    }
    res.json({ gastos: await listarGastos(req.user.id) })
  } catch (err) {
    next(err)
  }
}

export const crear = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada' })
      return
    }
    const { descripcion, monto, categoria, fecha, moneda, a_nombre_de } = req.body ?? {}
    const montoNum = Number(monto)
    if (!descripcion || !Number.isFinite(montoNum)) {
      res.status(400).json({ error: 'descripcion y monto son obligatorios' })
      return
    }
    const gasto = await crearGasto(req.user.id, req.user.displayName, {
      descripcion: String(descripcion),
      monto: montoNum,
      moneda,
      a_nombre_de: a_nombre_de ?? null,
      categoria: categoria ?? null,
      fecha: fecha ?? null,
    })
    res.status(201).json({ gasto })
  } catch (err) {
    next(err)
  }
}

export const eliminar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada' })
      return
    }
    await eliminarGasto(req.user.id, req.params.id)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
}

// Devuelve el usuario logueado (útil para un futuro frontend tipo Vue).
export const me = (req, res) => {
  res.json({ user: req.user })
}
