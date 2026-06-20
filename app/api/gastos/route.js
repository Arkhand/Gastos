import { NextResponse } from 'next/server'
import { requireUserApi } from '../../../lib/session.js'
import {
  dbEnabled,
  listarGastos,
  crearGasto,
  listarCategorias,
  listarDivision,
  listarCierres,
} from '../../../lib/db.js'
import { obtenerCotizacion, convertirMontos } from '../../../lib/cotizacion.js'
import { normalizarPersona, personaPorDefecto } from '../../../lib/personas.js'
import { normalizarCategoria, otrosId, recargarCategorias } from '../../../lib/categorias.js'
import { hoyAR } from '../../../lib/fecha.js'

// Normaliza una fila cruda de `categorias` a la forma que usa la UI: agrega `label`
// (alias de nombre) y defaults de emoji/color. Sin esto, el cliente (que usa
// c.label) mostraba opciones vacías en el desplegable de categoría.
function catParaVista(row) {
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

// GET /api/gastos?mes=YYYY-MM
// Devuelve los datos CRUDOS que la UI necesita para un mes: gastos del mes +
// categorías + división + cierres + cotización. El cliente hace los cálculos de
// presentación (totales, gráficos, saldo) con lib/calculos.js y lib/division.js,
// así los filtros/toggles son instantáneos sin pegarle al server.
export async function GET(request) {
  try {
    await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })

    const hoy = hoyAR()
    const mesActual = hoy.slice(0, 7)
    const mesReq = String(new URL(request.url).searchParams.get('mes') || '')
    const mes = /^\d{4}-\d{2}$/.test(mesReq) && mesReq <= mesActual ? mesReq : mesActual

    // Recargamos la cache de categorías para responder con las activas al día.
    await recargarCategorias()
    const [gastos, categorias, division, cierres, cotizacion] = await Promise.all([
      listarGastos(),
      listarCategorias(),
      listarDivision(),
      listarCierres(),
      obtenerCotizacion(),
    ])

    return NextResponse.json({
      mes,
      mesActual,
      hoy,
      gastos, // TODOS los activos; el cliente filtra por mes/tipo/persona
      categorias: categorias.filter((c) => !c.eliminado).map(catParaVista),
      categoriasTodas: categorias.map(catParaVista), // incluye archivadas (para lookups)
      division,
      cierres,
      cotizacion,
      otrosId: otrosId(),
    })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/gastos GET]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}

// POST /api/gastos — crea un gasto. Body: { descripcion, monto, moneda, a_nombre_de,
// categoria, fecha, compartido }. Reusa la conversión de montos y los defaults.
export async function POST(request) {
  try {
    const user = await requireUserApi()
    if (!dbEnabled) return NextResponse.json({ error: 'BD no configurada' }, { status: 503 })
    await recargarCategorias()

    const body = await request.json()
    const montoNum = Number(body?.monto)
    if (!body?.descripcion || !Number.isFinite(montoNum) || montoNum < 0) {
      return NextResponse.json({ error: 'Descripción y monto válidos son obligatorios' }, { status: 400 })
    }

    const rate = await obtenerCotizacion()
    const datos = {
      descripcion: String(body.descripcion),
      monto: montoNum,
      moneda: body.moneda,
      a_nombre_de: normalizarPersona(body.a_nombre_de) ?? personaPorDefecto(user.email),
      categoria: normalizarCategoria(body.categoria),
      fecha: body.fecha ? String(body.fecha) : null,
      compartido: String(body.compartido) !== 'false',
      ...convertirMontos(body.moneda, montoNum, rate),
    }
    const nuevo = await crearGasto(user.id, user.displayName, datos)
    return NextResponse.json({ ok: true, gasto: nuevo })
  } catch (err) {
    const status = err.status || 500
    if (status !== 401) console.error('[api/gastos POST]', err.message)
    return NextResponse.json({ error: err.message }, { status })
  }
}
