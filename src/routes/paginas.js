import { Router } from 'express'
import { requireAuth } from './auth.js'
import { dbEnabled, listarGastos } from '../models/db.js'

// Controlador de páginas (vistas HTML). Cada handler solo arma los DATOS
// y se los pasa a una vista .ejs con res.render(). Nada de HTML acá.
export const paginasRouter = Router()

// Inicio (público)
paginasRouter.get('/', (req, res) => {
  res.render('home', { user: req.user })
})

// Acerca de (público)
paginasRouter.get('/about', (_req, res) => {
  res.render('about', { user: undefined })
})

// API de ejemplo - JSON (público)
paginasRouter.get('/api-data', (_req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
})

// Health check
paginasRouter.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Perfil + gastos (privado). El controlador pide los datos al modelo (db)
// y calcula los totales; la vista perfil.ejs solo los muestra.
paginasRouter.get('/perfil', requireAuth, async (req, res, next) => {
  try {
    const user = req.user
    let gastos = []
    let totalStr = '—'

    if (dbEnabled) {
      gastos = await listarGastos(user.id)
      // Totales separados por moneda (no se puede sumar ARS con USD).
      const totales = gastos.reduce((acc, g) => {
        acc[g.moneda] = (acc[g.moneda] ?? 0) + Number(g.monto)
        return acc
      }, {})
      totalStr =
        Object.entries(totales)
          .map(([m, v]) => `${m} $${v.toFixed(2)}`)
          .join(' — ') || '—'
    }

    res.render('perfil', { user, dbEnabled, gastos, totalStr })
  } catch (err) {
    next(err)
  }
})
