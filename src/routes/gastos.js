import { Router } from 'express'
import { requireAuth } from './auth.js'
import { dbEnabled, listarGastos, crearGasto, eliminarGasto } from '../models/db.js'

// Controlador de gastos: acciones por formulario (redirigen a /perfil) y API JSON.
export const gastosRouter = Router()

// --- Acciones vía formulario HTML ---
gastosRouter.post('/gastos', requireAuth, async (req, res, next) => {
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
})

gastosRouter.post('/gastos/:id/eliminar', requireAuth, async (req, res, next) => {
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
})

// --- API JSON de gastos (privada) ---
gastosRouter.get('/api/gastos', requireAuth, async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada' })
      return
    }
    res.json({ gastos: await listarGastos(req.user.id) })
  } catch (err) {
    next(err)
  }
})

gastosRouter.post('/api/gastos', requireAuth, async (req, res, next) => {
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
})

gastosRouter.delete('/api/gastos/:id', requireAuth, async (req, res, next) => {
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
})

// Devuelve el usuario logueado (útil para un futuro frontend tipo Vue).
gastosRouter.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})
