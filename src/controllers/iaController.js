// Controlador de IA: recibe el texto (lo que el navegador transcribió de la voz)
// y devuelve el gasto interpretado por Gemini en JSON.
import { iaEnabled, interpretarGasto, revisarGasto } from '../models/ia.js'

// POST /api/interpretar  { texto }  ->  { ok:true, gasto } | { error }
export const interpretar = async (req, res) => {
  const texto = (req.body?.texto ?? '').toString().trim()
  if (!texto) {
    res.status(400).json({ error: 'Texto vacío' })
    return
  }
  if (!iaEnabled) {
    res.status(503).json({ error: 'IA no configurada (falta GEMINI_API_KEY en el servidor).' })
    return
  }
  try {
    const gasto = await interpretarGasto(texto)
    res.json({ ok: true, gasto })
  } catch (err) {
    console.error('[ia] error interpretando:', err.message)
    res.status(502).json({ error: 'No pude interpretar lo que dijiste. Probá de nuevo o cargalo a mano.' })
  }
}

// POST /api/revisar  { descripcion, categoria }  ->  { ok:true, descripcion, categoria } | { error }
// Carga manual: corrige typos/formatea la descripción y verifica la categoría.
export const revisar = async (req, res) => {
  const descripcion = (req.body?.descripcion ?? '').toString().trim()
  const categoria = (req.body?.categoria ?? '').toString().trim()
  if (!descripcion) {
    res.status(400).json({ error: 'Descripción vacía' })
    return
  }
  if (!iaEnabled) {
    res.status(503).json({ error: 'IA no configurada (falta GROQ_API_KEY y/o GEMINI_API_KEY en el servidor).' })
    return
  }
  try {
    const r = await revisarGasto(descripcion, categoria)
    res.json({ ok: true, descripcion: r.descripcion, categoria: r.categoria })
  } catch (err) {
    console.error('[ia] error revisando:', err.message)
    res.status(502).json({ error: 'No pude revisar el gasto.' })
  }
}
