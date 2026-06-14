// Controlador de la app logueada: inicio (mascota + voz + lista), resumen,
// nosotros, y las acciones crear / actualizar / eliminar.
import {
  dbEnabled,
  listarGastos,
  crearGasto,
  actualizarGasto,
  eliminarGasto,
} from '../models/db.js'
import { CATEGORIAS, catById, normalizarCategoria } from '../config/categorias.js'
import { iaEnabled } from '../models/ia.js'
import { hoyAR, ayerAR } from '../utils/fecha.js'

// Formatea un monto con su signo de moneda (es-AR: el punto separa miles).
function fmtMonto(moneda, valor) {
  const n = Number(valor).toLocaleString('es-AR', { maximumFractionDigits: 2 })
  return moneda === 'USD' ? `US$ ${n}` : `$ ${n}`
}

// Total por moneda (ARS y USD no se suman entre sí).
function totalesPorMoneda(gastos) {
  const t = gastos.reduce((acc, g) => {
    acc[g.moneda] = (acc[g.moneda] ?? 0) + Number(g.monto)
    return acc
  }, {})
  return (
    Object.entries(t)
      .map(([m, v]) => fmtMonto(m, v))
      .join(' · ') || '$ 0'
  )
}

// Agrupa los gastos por fecha, con etiqueta amigable (Hoy / Ayer / la fecha).
function agruparPorDia(gastos) {
  const hoy = hoyAR()
  const ayer = ayerAR()
  const grupos = new Map()
  for (const g of gastos) {
    const fecha = g.fecha || hoy
    if (!grupos.has(fecha)) grupos.set(fecha, [])
    grupos.get(fecha).push(g)
  }
  // Los gastos ya vienen ordenados por created_at desc.
  return [...grupos.entries()].map(([fecha, items]) => ({
    fecha,
    etiqueta: fecha === hoy ? 'Hoy' : fecha === ayer ? 'Ayer' : fecha,
    items,
    totalStr: totalesPorMoneda(items),
  }))
}

// Lee y valida los campos de un gasto desde el body del formulario (la hoja).
function leerGastoDelBody(body) {
  const { descripcion, monto, categoria, fecha, moneda, a_nombre_de } = body ?? {}
  const montoNum = Number(monto)
  if (!descripcion || !Number.isFinite(montoNum) || montoNum < 0) {
    return { ok: false, error: 'Descripción y monto (válido) son obligatorios.' }
  }
  return {
    ok: true,
    datos: {
      descripcion: String(descripcion),
      monto: montoNum,
      moneda,
      a_nombre_de: a_nombre_de ? String(a_nombre_de) : null,
      categoria: normalizarCategoria(categoria),
      fecha: fecha ? String(fecha) : null,
    },
  }
}

// --- Pantalla principal: inicio (mascota + micrófono + últimos gastos) ---
export const home = async (req, res, next) => {
  try {
    let gastos = []
    if (dbEnabled) gastos = await listarGastos(req.user.id)
    const hoy = hoyAR()
    const totalHoy = totalesPorMoneda(gastos.filter((g) => (g.fecha || hoy) === hoy))
    res.render('home', {
      user: req.user,
      dbEnabled,
      iaEnabled,
      categorias: CATEGORIAS,
      catById,
      fmt: fmtMonto,
      grupos: agruparPorDia(gastos),
      totalHoy,
      tab: 'home',
    })
  } catch (err) {
    next(err)
  }
}

export const crear = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const r = leerGastoDelBody(req.body)
    if (!r.ok) {
      res.redirect('/inicio')
      return
    }
    await crearGasto(req.user.id, req.user.displayName, r.datos)
    res.redirect('/inicio')
  } catch (err) {
    next(err)
  }
}

export const actualizar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const r = leerGastoDelBody(req.body)
    if (!r.ok) {
      res.redirect('/inicio')
      return
    }
    const datos = { ...r.datos, a_nombre_de: r.datos.a_nombre_de ?? req.user.displayName }
    await actualizarGasto(req.user.id, req.params.id, datos)
    res.redirect('/inicio')
  } catch (err) {
    next(err)
  }
}

export const eliminar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    await eliminarGasto(req.user.id, req.params.id)
    res.redirect('/inicio')
  } catch (err) {
    next(err)
  }
}

// --- Resumen: totales por categoría del mes en curso (ARS) ---
export const resumen = async (req, res, next) => {
  try {
    let gastos = []
    if (dbEnabled) gastos = await listarGastos(req.user.id)
    const mes = hoyAR().slice(0, 7) // YYYY-MM
    const delMes = gastos.filter((g) => (g.fecha || '').slice(0, 7) === mes && g.moneda === 'ARS')
    const porCat = {}
    for (const g of delMes) {
      const id = g.categoria || 'otros'
      porCat[id] = (porCat[id] ?? 0) + Number(g.monto)
    }
    const filas = CATEGORIAS.map((c) => ({ ...c, total: porCat[c.id] ?? 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
    const totalMes = filas.reduce((s, c) => s + c.total, 0)
    res.render('resumen', {
      user: req.user,
      dbEnabled,
      filas,
      totalMes: fmtMonto('ARS', totalMes),
      tab: 'stats',
    })
  } catch (err) {
    next(err)
  }
}

// --- Nosotros: pantalla estática con la familia (chibis de CSS) ---
export const nosotros = (req, res) => {
  res.render('nosotros', { user: req.user, tab: 'us' })
}
