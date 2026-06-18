// Configuración: alta/edición/baja de categorías de gastos. La clave de cada
// categoría es un UUID (la genera la BD); el nombre es texto único entre las
// activas. Editar nombre/emoji se refleja al instante en todos los gastos porque
// estos guardan el UUID y el nombre/emoji se resuelven en vivo (modelo relacional).
import {
  dbEnabled,
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  marcarCategoriaEliminada,
  eliminarCategoriaFisica,
  contarGastosDeCategoria,
} from '../models/db.js'
import {
  recargarCategorias,
  normalizarNombre,
  colorPara,
} from '../config/categorias.js'

// Tope de largo para no romper los chips ni el layout.
const NOMBRE_MAX = 24

// Convierte una fila de la BD a la forma que usa la vista (agrega `label`/marca).
function paraVista(row) {
  return {
    id: row.id,
    nombre: row.nombre,
    label: row.nombre,
    emoji: row.emoji || '✨',
    color_bg: row.color_bg || '#e3e0ea',
    color_ink: row.color_ink || '#5a5570',
    hint: row.hint || '',
    es_otros: !!row.es_otros,
    eliminado: !!row.eliminado,
  }
}

// GET /config — lista de categorías (activas y borradas) + formulario de alta.
export const config = async (req, res, next) => {
  try {
    let activas = []
    let borradas = []
    if (dbEnabled) {
      const todas = (await listarCategorias()).map(paraVista)
      activas = todas.filter((c) => !c.eliminado)
      borradas = todas.filter((c) => c.eliminado)
    }
    res.render('config', {
      user: req.user,
      dbEnabled,
      activas,
      borradas,
      ok: req.query.ok || '',
      err: req.query.err || '',
      tab: 'config',
    })
  } catch (err) {
    next(err)
  }
}

// POST /config/categorias — alta. Rechaza nombres duplicados (entre activas) y, si
// el nombre coincide con una categoría borrada, sugiere revivirla.
export const crearCat = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const nombre = (req.body?.nombre ?? '').toString().trim().replace(/\s+/g, ' ')
    const emoji = (req.body?.emoji ?? '').toString().trim() || '✨'
    const hint = (req.body?.hint ?? '').toString().trim()
    if (!nombre) return res.redirect('/config?err=nombre')
    if (nombre.length > NOMBRE_MAX) return res.redirect('/config?err=largo')

    const todas = await listarCategorias()
    const norm = normalizarNombre(nombre)
    const choque = todas.find((c) => normalizarNombre(c.nombre) === norm)
    if (choque) {
      // Ya existe con ese nombre: si está activa, es duplicado; si está borrada,
      // se revive en vez de crear una nueva.
      return res.redirect(choque.eliminado ? '/config?err=existe-borrada' : '/config?err=existe')
    }

    // Color estable desde la paleta (el usuario no elige color) y orden al final,
    // pero siempre antes de "Otros" (que vive en 999).
    const [bg, ink] = colorPara(nombre)
    const ordenes = todas.filter((c) => !c.es_otros).map((c) => c.orden ?? 0)
    const orden = (ordenes.length ? Math.max(...ordenes) : 0) + 10

    await crearCategoria({ nombre, emoji, color_bg: bg, color_ink: ink, hint: hint || null, orden })
    await recargarCategorias()
    res.redirect('/config?ok=creada')
  } catch (err) {
    next(err)
  }
}

// POST /config/categorias/:id/editar — cambia nombre/emoji/pista. No toca el id,
// así los gastos asociados siguen apuntando a la misma categoría.
export const editarCat = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const id = req.params.id
    const nombre = (req.body?.nombre ?? '').toString().trim().replace(/\s+/g, ' ')
    const emoji = (req.body?.emoji ?? '').toString().trim() || '✨'
    const hint = (req.body?.hint ?? '').toString().trim()
    if (!nombre) return res.redirect('/config?err=nombre')
    if (nombre.length > NOMBRE_MAX) return res.redirect('/config?err=largo')

    // El nombre nuevo no puede chocar con OTRA categoría (activa o borrada).
    const todas = await listarCategorias()
    const norm = normalizarNombre(nombre)
    const choque = todas.find((c) => c.id !== id && normalizarNombre(c.nombre) === norm)
    if (choque) return res.redirect('/config?err=existe')

    await actualizarCategoria(id, { nombre, emoji, hint: hint || null })
    await recargarCategorias()
    res.redirect('/config?ok=editada')
  } catch (err) {
    next(err)
  }
}

// POST /config/categorias/:id/eliminar — baja. "Otros" es imborrable. Si la
// categoría tiene gastos, se marca como borrada (soft-delete) para conservar el
// historial; si no tiene ninguno, se borra físicamente.
export const eliminarCat = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const id = req.params.id
    const todas = await listarCategorias()
    const cat = todas.find((c) => c.id === id)
    if (!cat) return res.redirect('/config?err=no-existe')
    if (cat.es_otros) return res.redirect('/config?err=otros-imborrable')

    const usados = await contarGastosDeCategoria(id)
    if (usados > 0) {
      await marcarCategoriaEliminada(id, true)
    } else {
      await eliminarCategoriaFisica(id)
    }
    await recargarCategorias()
    res.redirect('/config?ok=' + (usados > 0 ? 'archivada' : 'eliminada'))
  } catch (err) {
    next(err)
  }
}

// POST /config/categorias/:id/revivir — saca la marca de borrado. Revalida que el
// nombre no choque con una categoría YA activa (podría haberse creado otra igual).
export const revivirCat = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const id = req.params.id
    const todas = await listarCategorias()
    const cat = todas.find((c) => c.id === id)
    if (!cat) return res.redirect('/config?err=no-existe')

    const norm = normalizarNombre(cat.nombre)
    const choque = todas.find((c) => c.id !== id && !c.eliminado && normalizarNombre(c.nombre) === norm)
    if (choque) return res.redirect('/config?err=revivir-choca')

    await marcarCategoriaEliminada(id, false)
    await recargarCategorias()
    res.redirect('/config?ok=revivida')
  } catch (err) {
    next(err)
  }
}
