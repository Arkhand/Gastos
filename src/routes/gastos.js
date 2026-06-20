// Rutas de la app logueada. Todas privadas (requireAuth).
import { Router } from 'express'
import { requireAuth } from '../middlewares/auth.js'
import {
  home,
  crear,
  actualizar,
  corregir,
  eliminar,
  resumen,
  cerrarMes,
  nosotros,
} from '../controllers/gastosController.js'
import { interpretar, revisar } from '../controllers/iaController.js'
import {
  configMenu,
  configDivision,
  configCategorias,
  crearCat,
  editarCat,
  eliminarCat,
  revivirCat,
  guardarDivisionCfg,
} from '../controllers/configController.js'

export const gastosRouter = Router()

// Pantallas (pestañas): inicio / resumen / nosotros / config
gastosRouter.get('/inicio', requireAuth, home)
gastosRouter.get('/resumen', requireAuth, resumen)
gastosRouter.get('/nosotros', requireAuth, nosotros)

// Configuración: índice + pantallas propias (cada una con su URL y "Volver")
gastosRouter.get('/config', requireAuth, configMenu)
gastosRouter.get('/config/division', requireAuth, configDivision)
gastosRouter.get('/config/categorias', requireAuth, configCategorias)

// Configuración de categorías (alta/edición/baja/restaurar). POST + redirect.
gastosRouter.post('/config/categorias', requireAuth, crearCat)
gastosRouter.post('/config/categorias/:id/editar', requireAuth, editarCat)
gastosRouter.post('/config/categorias/:id/eliminar', requireAuth, eliminarCat)
gastosRouter.post('/config/categorias/:id/revivir', requireAuth, revivirCat)

// Configuración de la división (% por integrante). POST + redirect.
gastosRouter.post('/config/division', requireAuth, guardarDivisionCfg)

// Cierre de mes (ajuste de cuentas): congela el % y marca el mes. POST + redirect.
gastosRouter.post('/resumen/cerrar', requireAuth, cerrarMes)

// Acciones del gasto (la hoja inferior postea acá)
gastosRouter.post('/nuevo', requireAuth, crear)
gastosRouter.post('/gastos/:id/editar', requireAuth, actualizar)
gastosRouter.post('/gastos/:id/eliminar', requireAuth, eliminar)

// IA: el navegador manda el texto transcripto y recibe el gasto en JSON
gastosRouter.post('/api/interpretar', requireAuth, interpretar)

// IA: revisa la descripción (typos/formato) y la categoría de una carga manual
gastosRouter.post('/api/revisar', requireAuth, revisar)

// IA (de fondo): aplica/deshace la corrección sobre un gasto ya creado (solo desc+cat)
gastosRouter.post('/api/gastos/:id/corregir', requireAuth, corregir)

// Compatibilidad con atajos/bookmarks viejos -> al inicio
gastosRouter.get(['/nuevo', '/gastos', '/gastos/:id/editar'], requireAuth, (_req, res) =>
  res.redirect('/inicio')
)
