// Controlador de páginas (vistas HTML). Cada función arma los DATOS y se los
// pasa a una vista .ejs con res.render(). Nada de HTML acá.
import { dbEnabled, listarGastos } from '../models/db.js'

// Inicio (público)
export const home = (req, res) => {
  res.render('home', { user: req.user })
}

// Acerca de (público)
export const about = (_req, res) => {
  res.render('about', { user: undefined })
}

// API de ejemplo - JSON (público)
export const apiData = (_req, res) => {
  res.json({
    message: 'Here is some sample API data',
    items: ['apple', 'banana', 'cherry'],
  })
}

// Health check
export const healthz = (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
}

// Perfil + gastos (privado). Pide los datos al modelo y calcula los totales;
// la vista perfil.ejs solo los muestra.
export const perfil = async (req, res, next) => {
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
}
