// Rutas de páginas generales.
import { Router } from 'express'
import { inicio, healthz } from '../controllers/paginasController.js'

export const paginasRouter = Router()

paginasRouter.get('/', inicio) // pantalla 1 (o redirige a /nuevo si ya estás logueado)
paginasRouter.get('/healthz', healthz) // monitoreo (sin link en el menú)
