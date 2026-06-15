// Rutas de la app logueada. Todas privadas (requireAuth).
import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import {
  home,
  crear,
  actualizar,
  eliminar,
  resumen,
  nosotros,
} from '../controllers/gastosController.js'
import { interpretar, revisar } from '../controllers/iaController.js'

export const gastosRouter = Router()

// Pantallas (pestañas): inicio / resumen / nosotros
gastosRouter.get('/inicio', requireAuth, home)
gastosRouter.get('/resumen', requireAuth, resumen)
gastosRouter.get('/nosotros', requireAuth, nosotros)

// Acciones del gasto (la hoja inferior postea acá)
gastosRouter.post('/nuevo', requireAuth, crear)
gastosRouter.post('/gastos/:id/editar', requireAuth, actualizar)
gastosRouter.post('/gastos/:id/eliminar', requireAuth, eliminar)

// IA: el navegador manda el texto transcripto y recibe el gasto en JSON
gastosRouter.post('/api/interpretar', requireAuth, interpretar)

// IA: revisa la descripción (typos/formato) y la categoría de una carga manual
gastosRouter.post('/api/revisar', requireAuth, revisar)

// Compatibilidad con atajos/bookmarks viejos -> al inicio
gastosRouter.get(['/nuevo', '/gastos', '/gastos/:id/editar'], requireAuth, (_req, res) =>
  res.redirect('/inicio')
)
