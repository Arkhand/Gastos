// Rutas de gastos. Todas privadas (requireAuth).
import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import {
  formularioNuevo,
  crear,
  lista,
  formularioEditar,
  actualizar,
  eliminar,
} from '../controllers/gastosController.js'

export const gastosRouter = Router()

// Pantalla 2: cargar un gasto nuevo
gastosRouter.get('/nuevo', requireAuth, formularioNuevo)
gastosRouter.post('/nuevo', requireAuth, crear)

// Pantalla 3: lista + acciones
gastosRouter.get('/gastos', requireAuth, lista)
gastosRouter.get('/gastos/:id/editar', requireAuth, formularioEditar)
gastosRouter.post('/gastos/:id/editar', requireAuth, actualizar)
gastosRouter.post('/gastos/:id/eliminar', requireAuth, eliminar)
