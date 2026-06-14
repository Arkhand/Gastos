// Rutas de páginas: SOLO definen las URLs. La lógica está en el controlador.
// requireAuth (middleware) marca cuáles requieren estar logueado.
import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import {
  home,
  about,
  apiData,
  healthz,
  perfil,
} from '../controllers/paginasController.js'

export const paginasRouter = Router()

paginasRouter.get('/', home) // pública
paginasRouter.get('/about', about) // pública
paginasRouter.get('/api-data', apiData) // pública
paginasRouter.get('/healthz', healthz) // pública
paginasRouter.get('/perfil', requireAuth, perfil) // privada
