// Controlador de la app logueada: inicio (mascota + voz + lista solo lectura),
// resumen (totales + lista editable), nosotros, y crear / actualizar / eliminar.
import {
  dbEnabled,
  listarGastos,
  crearGasto,
  actualizarGasto,
  corregirGasto,
  eliminarGasto,
  listarCierres,
  obtenerCierre,
  crearCierre,
} from '../models/db.js'
import {
  ensureDivisionCargada,
  getDivision,
  recargarDivision,
  repartir,
  calcularSaldo,
} from '../config/division.js'
import {
  getCategorias,
  catById,
  normalizarCategoria,
  otrosId,
  ensureCategoriasCargadas,
} from '../config/categorias.js'
import { PERSONAS, personaPorDefecto, personaLabel, normalizarPersona } from '../config/personas.js'
import { iaEnabled } from '../models/ia.js'
import { obtenerCotizacion, convertirMontos } from '../models/cotizacion.js'
import { hoyAR, ayerAR, mesLabel, fechaCorta } from '../utils/fecha.js'

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
  const { descripcion, monto, categoria, fecha, moneda, a_nombre_de, compartido } = body ?? {}
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
      // Default compartido: solo es personal si llega explícitamente "false".
      compartido: String(compartido) !== 'false',
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
    await ensureCategoriasCargadas()
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
      categorias: getCategorias(),
      otrosId: otrosId(),
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
    // Si la hoja trae el UUID de un gasto (edit_id), esto es una EDICIÓN, no un alta.
    // Identificar por el id (y no por el action del form) evita que un fallo de JS
    // termine creando un duplicado de algo que se estaba editando.
    const editId = String(req.body?.edit_id || '').trim()
    if (editId) {
      return actualizar(req, res, next)
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

// Destino de Resumen preservando la vista que se estaba viendo (la hoja manda en
// `volver` la query string de Resumen: mes, vista, …). Reconstruimos la URL desde
// CERO con solo los parámetros conocidos y validados, para no reflejar nada que
// venga del cliente sin control (evita open-redirect / basura en la query).
function resumenVolver(body) {
  const params = new URLSearchParams()
  let raw = {}
  try {
    raw = Object.fromEntries(new URLSearchParams(String(body?.volver || '')))
  } catch {
    raw = {}
  }
  if (/^\d{4}-\d{2}$/.test(raw.mes || '')) params.set('mes', raw.mes)
  if (raw.vista === 'graficos' || raw.vista === 'gastos') params.set('vista', raw.vista)
  const qs = params.toString()
  return qs ? '/resumen?' + qs : '/resumen'
}

export const actualizar = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    // Id del gasto a editar: de la URL (/gastos/:id/editar) o del hidden de la hoja
    // (edit_id, cuando se postea a /nuevo). Sin id válido no hay nada que editar.
    const id = String(req.params.id || req.body?.edit_id || '').trim()
    const destino = resumenVolver(req.body)
    const r = leerGastoDelBody(req.body)
    if (!r.ok || !id) {
      res.redirect(destino)
      return
    }
    const rate = await obtenerCotizacion()
    const datos = {
      ...r.datos,
      a_nombre_de: r.datos.a_nombre_de ?? personaPorDefecto(req.user.email),
      ...convertirMontos(r.datos.moneda, r.datos.monto, rate),
    }
    await actualizarGasto(req.user.id, id, datos)
    res.redirect(destino)
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
    res.redirect(resumenVolver(req.body))
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
    await ensureCategoriasCargadas()
    await ensureDivisionCargada()
    let gastos = []
    let cierres = []
    if (dbEnabled) {
      gastos = await listarGastos(req.user.id)
      cierres = await listarCierres()
    }
    const hoy = hoyAR()
    const mesActual = hoy.slice(0, 7)
    // Mes elegido (?mes=YYYY-MM); por defecto el actual y nunca futuro.
    const mesReq = String(req.query.mes || '')
    const mes = /^\d{4}-\d{2}$/.test(mesReq) && mesReq <= mesActual ? mesReq : mesActual
    const vista = req.query.vista === 'graficos' ? 'graficos' : 'gastos'
    // Meses cerrados (🤝): mapa mes -> foto del % congelado.
    const cierrePorMes = {}
    for (const c of cierres) cierrePorMes[c.mes] = c
    // Meses con datos cargados (YYYY-MM distintos), de mayor a menor. Incluye el
    // mes elegido aunque no tenga gastos, para que el selector lo refleje.
    const mesesSet = new Set(gastos.map((g) => (g.fecha || hoy).slice(0, 7)))
    mesesSet.add(mes)
    const meses = [...mesesSet]
      .sort((a, b) => (a < b ? 1 : -1))
      .map((m) => ({ value: m, label: mesLabel(m), cerrado: !!cierrePorMes[m] }))
    // Gastos del mes elegido (sin fecha = cuenta como hoy).
    const gastosMes = gastos.filter((g) => (g.fecha || hoy).slice(0, 7) === mes)
    const porCat = {}
    for (const g of gastosMes) {
      if (g.moneda !== 'ARS') continue
      // normalizarCategoria mapea null/categoría archivada/inexistente al id de
      // "Otros", así esos gastos suman a una fila visible (no se pierden del total)
      // y quedan consistentes con la lista (catById también cae en "Otros").
      const id = normalizarCategoria(g.categoria)
      porCat[id] = (porCat[id] ?? 0) + Number(g.monto)
    }
    const filasBase = getCategorias()
      .map((c) => ({ ...c, total: porCat[c.id] ?? 0 }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total)
    const totalMesNum = filasBase.reduce((s, c) => s + c.total, 0)
    const filas = filasBase.map((c) => ({
      ...c,
      pct: totalMesNum ? Math.round((c.total / totalMesNum) * 100) : 0,
    }))
    // Gradiente para el gráfico de torta (grados exactos por categoría). Usamos el
    // color de la categoría directo (no la CSS var por id) para que cualquier
    // categoría nueva tenga color sin depender de reglas CSS estáticas.
    let deg = 0
    const stops = filasBase.map((c) => {
      const start = deg
      deg += totalMesNum ? (c.total / totalMesNum) * 360 : 0
      return `${c.color_bg} ${start.toFixed(2)}deg ${deg.toFixed(2)}deg`
    })
    const colorOtros = catById(otrosId()).color_bg
    const pieGradient = stops.length ? `conic-gradient(${stops.join(', ')})` : colorOtros
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
    // --- Cierre / ajuste de cuentas ---
    // Solo cuentan los gastos COMPARTIDOS (los personales quedan afuera). Sumamos el
    // total del mes y lo que PAGÓ cada persona (ARS y USD por separado). Con eso y el
    // % acordado, calcularSaldo dice quién le debe a quién: lo que cada uno puso vs.
    // lo que le tocaba. Si el mes está cerrado se usa la foto congelada del %; si
    // está abierto, el % global vigente (el saldo se ve "en vivo").
    let compArs = 0
    let compUsd = 0
    const pagado = {}
    for (const g of gastosMes) {
      if (g.compartido === false) continue
      const ars = Number(g.monto_ars) || (g.moneda === 'ARS' ? Number(g.monto) : 0)
      const usd = Number(g.monto_usd) || (g.moneda === 'USD' ? Number(g.monto) : 0)
      compArs += ars
      compUsd += usd
      const id = normalizarPersona(g.a_nombre_de)
      if (!id) continue
      if (!pagado[id]) pagado[id] = { ars: 0, usd: 0 }
      pagado[id].ars += ars
      pagado[id].usd += usd
    }
    const cierreRow = cierrePorMes[mes]
    const divUsada = cierreRow ? cierreRow.division : getDivision()
    const saldo = calcularSaldo(compArs, compUsd, pagado, divUsada)
    // % aplicado por persona (para mostrar "70% / 30%" junto al saldo).
    const pctPorPersona = PERSONAS.filter((p) => p.id in divUsada).map((p) => ({
      label: p.label,
      emoji: p.emoji,
      pct: Number(divUsada[p.id]) || 0,
    }))
    const cierre = {
      cerrado: !!cierreRow,
      cerradoPor: cierreRow ? cierreRow.cerrado_por || '' : '',
      // Solo se puede cerrar un mes ya pasado (el actual sigue recibiendo gastos).
      esPasado: mes < mesActual,
      totalArsStr: fmtMonto('ARS', compArs),
      totalUsdStr: fmtMonto('USD', compUsd),
      hayCompartidos: compArs > 0 || compUsd > 0,
      pctPorPersona,
      // Saldo por moneda: null = saldado / sin gastos; objeto = hay deuda.
      saldoArs: saldo.ars
        ? { ...saldo.ars, montoStr: fmtMonto('ARS', saldo.ars.monto) }
        : null,
      saldoUsd: saldo.usd
        ? { ...saldo.usd, montoStr: fmtMonto('USD', saldo.usd.monto) }
        : null,
    }
    // Tabla detallada (vista de escritorio): una fila por gasto del mes, con id para
    // poder disparar la edición. JSON seguro para embeber en <script>.
    const movs = gastosMes.map((g) => filaMovimiento(g, hoy))
    const movsJson = JSON.stringify(movs).replace(/</g, '\\u003c')
    res.render('resumen', {
      user: req.user,
      dbEnabled,
      iaEnabled,
      sugerencias: sugerenciasDescripcion(gastos),
      filas,
      totalMes: fmtMonto('ARS', totalMesNum),
      pieGradient,
      personasTotales,
      categorias: getCategorias(),
      otrosId: otrosId(),
      personas: PERSONAS,
      personaDefault: personaPorDefecto(req.user.email),
      catById,
      personaLabel,
      fmt: fmtMonto,
      grupos: agruparPorDia(gastosMes),
      movs,
      movsJson,
      mes,
      meses,
      vista,
      cierre,
      ok: req.query.ok || '',
      tab: 'stats',
    })
  } catch (err) {
    next(err)
  }
}

// POST /resumen/cerrar  { mes }  ->  redirect /resumen?mes=<mes>&ok=cerrado
// Cierra un mes (🤝): congela el % global vigente como foto del mes. Definitivo:
// rechaza si el mes ya está cerrado, no tiene formato válido, o NO es un mes pasado
// (el mes en curso todavía puede recibir gastos, así que no se puede cerrar).
export const cerrarMes = async (req, res, next) => {
  try {
    if (!dbEnabled) {
      res.status(503).send('Base de datos no configurada.')
      return
    }
    const mes = String(req.body?.mes || '')
    const mesActual = hoyAR().slice(0, 7)
    // Solo meses estrictamente anteriores al actual (mes < mesActual).
    if (!/^\d{4}-\d{2}$/.test(mes) || mes >= mesActual) {
      return res.redirect('/resumen')
    }
    // El cierre se dispara desde la vista Gráficos: volvemos ahí, al mismo mes.
    const volver = '/resumen?mes=' + encodeURIComponent(mes) + '&vista=graficos'
    const yaCerrado = await obtenerCierre(mes)
    if (yaCerrado) {
      return res.redirect(volver)
    }
    await ensureDivisionCargada()
    const foto = getDivision()
    await crearCierre(mes, foto, req.user.displayName)
    res.redirect(volver + '&ok=cerrado')
  } catch (err) {
    next(err)
  }
}

// Construye una fila de tabla por gasto, con TODO el display resuelto (la vista
// solo formatea números). Los montos ARS/USD ya vienen convertidos en la BD.
function filaMovimiento(g, hoy) {
  const fecha = g.fecha || hoy
  const cat = catById(g.categoria)
  const perId = normalizarPersona(g.a_nombre_de)
  const per = PERSONAS.find((p) => p.id === perId)
  const moneda = g.moneda === 'USD' ? 'USD' : 'ARS'
  return {
    id: g.id,
    fecha,
    fechaLabel: fechaCorta(fecha),
    per: perId || '',
    perLabel: per ? per.label : g.a_nombre_de || '—',
    perEmoji: per ? per.emoji : '👤',
    desc: g.descripcion || '',
    cat: cat.id,
    catLabel: cat.label,
    catEmoji: cat.emoji,
    cur: moneda,
    amt: Number(g.monto) || 0,
    ars: g.monto_ars != null ? Number(g.monto_ars) : moneda === 'ARS' ? Number(g.monto) : null,
    usd: g.monto_usd != null ? Number(g.monto_usd) : moneda === 'USD' ? Number(g.monto) : null,
    compartido: g.compartido !== false,
  }
}

// --- Nosotros: pantalla estática con la familia ---
export const nosotros = (req, res) => {
  res.render('nosotros', { user: req.user, tab: 'us' })
}
