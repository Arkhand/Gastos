// Controlador de la app logueada: inicio (mascota + voz + lista solo lectura),
// resumen (totales + lista editable), nosotros, y crear / actualizar / eliminar.
import {
  dbEnabled,
  listarGastos,
  crearGasto,
  actualizarGasto,
  corregirGasto,
  eliminarGasto,
} from '../models/db.js'
import { CATEGORIAS, catById, normalizarCategoria } from '../config/categorias.js'
import { PERSONAS, personaPorDefecto, personaLabel, normalizarPersona } from '../config/personas.js'
import { iaEnabled } from '../models/ia.js'
import { obtenerCotizacion, convertirMontos } from '../models/cotizacion.js'
import { hoyAR, ayerAR, mesLabel } from '../utils/fecha.js'

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
  return [...grupos.entries()].map(([fecha, items]) => ({
    fecha,
    etiqueta: fecha === hoy ? 'Hoy' : fecha === ayer ? 'Ayer' : fecha,
    items,
    totalStr: totalesPorMoneda(items),
  }))
}

// Lee y valida los campos de un gasto desde el body (la hoja). a_nombre_de se
// normaliza al email canónico de la persona (o null si no es válido).
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
      a_nombre_de: normalizarPersona(a_nombre_de),
      categoria: normalizarCategoria(categoria),
      fecha: fecha ? String(fecha) : null,
    },
  }
}

// Descripciones más usadas, para el autocompletado (datalist) de la hoja. Dedupe
// por texto no vacío, ordenadas por frecuencia, top N.
function sugerenciasDescripcion(gastos, limite = 20) {
  const cuenta = new Map()
  for (const g of gastos) {
    const d = (g.descripcion || '').trim()
    if (!d) continue
    cuenta.set(d, (cuenta.get(d) ?? 0) + 1)
  }
  return [...cuenta.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([d]) => d)
}

// --- Inicio: mascota + micrófono + últimos gastos (SOLO LECTURA, no se edita acá) ---
export const home = async (req, res, next) => {
  try {
    let gastos = []
    if (dbEnabled) gastos = await listarGastos(req.user.id)
    const hoy = hoyAR()
    // Total de hoy SIEMPRE en pesos: sumamos el equivalente ARS de cada gasto (los
    // USD ya vienen convertidos por dólar bolsa en monto_ars). Así el header no
    // mezcla dos monedas, que se veía mal.
    const totalHoyArs = gastos
      .filter((g) => (g.fecha || hoy) === hoy)
      .reduce((s, g) => s + (Number(g.monto_ars) || (g.moneda === 'ARS' ? Number(g.monto) : 0)), 0)
    const totalHoy = fmtMonto('ARS', totalHoyArs)
    // Si venimos de crear (?ok=<id>), armamos el dato para el toast de éxito.
    let creado = null
    if (req.query.ok) {
      const g = gastos.find((x) => String(x.id) === String(req.query.ok))
      if (g) {
        const fechaG = g.fecha || hoy
        creado = {
          id: g.id,
          aNombreDe: personaLabel(g.a_nombre_de),
          montoStr: fmtMonto(g.moneda, g.monto),
          descripcion: g.descripcion,
          catEmoji: catById(g.categoria).emoji,
          // Solo informamos la fecha cuando NO es hoy (una fecha rara es un error
          // silencioso fácil de no notar en un gasto cargado por voz).
          fechaLabel: fechaG === hoy ? '' : fechaG === ayerAR() ? 'ayer' : fechaG,
        }
      }
    }
    res.render('home', {
      user: req.user,
      dbEnabled,
      iaEnabled,
      sugerencias: sugerenciasDescripcion(gastos),
      categorias: CATEGORIAS,
      personas: PERSONAS,
      personaDefault: personaPorDefecto(req.user.email),
      catById,
      personaLabel,
      fmt: fmtMonto,
      grupos: agruparPorDia(gastos),
      totalHoy,
      creado,
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
    const rate = await obtenerCotizacion()
    const datos = {
      ...r.datos,
      a_nombre_de: r.datos.a_nombre_de ?? personaPorDefecto(req.user.email),
      ...convertirMontos(r.datos.moneda, r.datos.monto, rate),
    }
    const nuevo = await crearGasto(req.user.id, req.user.displayName, datos)
    res.redirect('/inicio?ok=' + encodeURIComponent(nuevo.id))
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
      res.redirect('/resumen')
      return
    }
    const rate = await obtenerCotizacion()
    const datos = {
      ...r.datos,
      a_nombre_de: r.datos.a_nombre_de ?? personaPorDefecto(req.user.email),
      ...convertirMontos(r.datos.moneda, r.datos.monto, rate),
    }
    await actualizarGasto(req.user.id, req.params.id, datos)
    res.redirect('/resumen')
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
    res.redirect('/resumen')
  } catch (err) {
    next(err)
  }
}

// POST /api/gastos/:id/corregir  { descripcion, categoria }  ->  { ok:true } | { error }
// Aplica (vía fetch, sin navegar) la corrección de la IA sobre un gasto recién
// creado: actualiza solo descripción + categoría. También sirve para deshacerla.
export const corregir = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).json({ error: 'Base de datos no configurada.' })
      return
    }
    const descripcion = (req.body?.descripcion ?? '').toString().trim()
    if (!descripcion) {
      res.status(400).json({ error: 'Descripción vacía' })
      return
    }
    const categoria = normalizarCategoria((req.body?.categoria ?? '').toString())
    await corregirGasto(req.user.id, req.params.id, { descripcion, categoria })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

// --- Resumen: totales por categoría del mes + lista editable de gastos ---
export const resumen = async (req, res, next) => {
  try {
    let gastos = []
    if (dbEnabled) gastos = await listarGastos(req.user.id)
    const hoy = hoyAR()
    const mesActual = hoy.slice(0, 7)
    // Mes elegido (?mes=YYYY-MM); por defecto el actual y nunca futuro.
    const mesReq = String(req.query.mes || '')
    const mes = /^\d{4}-\d{2}$/.test(mesReq) && mesReq <= mesActual ? mesReq : mesActual
    const vista = req.query.vista === 'graficos' ? 'graficos' : 'gastos'
    // Meses con datos cargados (YYYY-MM distintos), de mayor a menor. Incluye el
    // mes elegido aunque no tenga gastos, para que el selector lo refleje.
    const mesesSet = new Set(gastos.map((g) => (g.fecha || hoy).slice(0, 7)))
    mesesSet.add(mes)
    const meses = [...mesesSet]
      .sort((a, b) => (a < b ? 1 : -1))
      .map((m) => ({ value: m, label: mesLabel(m) }))
    // Gastos del mes elegido (sin fecha = cuenta como hoy).
    const gastosMes = gastos.filter((g) => (g.fecha || hoy).slice(0, 7) === mes)
    const porCat = {}
    for (const g of gastosMes) {
      if (g.moneda !== 'ARS') continue
      const id = g.categoria || 'otros'
      porCat[id] = (porCat[id] ?? 0) + Number(g.monto)
    }
    const filasBase = CATEGORIAS.map((c) => ({ ...c, total: porCat[c.id] ?? 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
    const totalMesNum = filasBase.reduce((s, c) => s + c.total, 0)
    const filas = filasBase.map((c) => ({
      ...c,
      pct: totalMesNum ? Math.round((c.total / totalMesNum) * 100) : 0,
    }))
    // Gradiente para el gráfico de torta (grados exactos por categoría).
    let deg = 0
    const stops = filasBase.map((c) => {
      const start = deg
      deg += totalMesNum ? (c.total / totalMesNum) * 360 : 0
      return `var(--c-${c.id}) ${start.toFixed(2)}deg ${deg.toFixed(2)}deg`
    })
    const pieGradient = stops.length ? `conic-gradient(${stops.join(', ')})` : 'var(--c-otros)'
    // Total por persona (ARS y USD), sumando los montos convertidos del mes.
    const porPersona = {}
    for (const g of gastosMes) {
      const id = normalizarPersona(g.a_nombre_de)
      if (!id) continue
      if (!porPersona[id]) porPersona[id] = { ars: 0, usd: 0 }
      porPersona[id].ars += Number(g.monto_ars) || 0
      porPersona[id].usd += Number(g.monto_usd) || 0
    }
    const personasTotales = PERSONAS.filter((p) => porPersona[p.id]).map((p) => ({
      label: p.label,
      emoji: p.emoji,
      arsStr: fmtMonto('ARS', porPersona[p.id].ars),
      usdStr: fmtMonto('USD', porPersona[p.id].usd),
    }))
    res.render('resumen', {
      user: req.user,
      dbEnabled,
      iaEnabled,
      sugerencias: sugerenciasDescripcion(gastos),
      filas,
      totalMes: fmtMonto('ARS', totalMesNum),
      pieGradient,
      personasTotales,
      categorias: CATEGORIAS,
      personas: PERSONAS,
      personaDefault: personaPorDefecto(req.user.email),
      catById,
      personaLabel,
      fmt: fmtMonto,
      grupos: agruparPorDia(gastosMes),
      mes,
      meses,
      vista,
      tab: 'stats',
    })
  } catch (err) {
    next(err)
  }
}

// --- Nosotros: pantalla estática con la familia ---
export const nosotros = (req, res) => {
  res.render('nosotros', { user: req.user, tab: 'us' })
}
