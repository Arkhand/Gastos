// Rutas de gastos: SOLO definen las URLs. La lógica está en el controlador.
// Todas son privadas (requireAuth).
import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import {
  crearDesdeFormulario,
  eliminarDesdeFormulario,
  listar,
  crear,
  eliminar,
  me,
} from '../controllers/gastosController.js'

export const gastosRouter = Router()

// Formularios HTML (redirigen a /perfil)
gastosRouter.post('/gastos', requireAuth, crearDesdeFormulario)
gastosRouter.post('/gastos/:id/eliminar', requireAuth, eliminarDesdeFormulario)

// API JSON
gastosRouter.get('/api/gastos', requireAuth, listar)
gastosRouter.post('/api/gastos', requireAuth, crear)
gastosRouter.delete('/api/gastos/:id', requireAuth, eliminar)
gastosRouter.get('/api/me', requireAuth, me)
