// Controlador de IA: recibe el texto (lo que el navegador transcribió de la voz)
// y devuelve el gasto interpretado por Gemini en JSON.
import { iaEnabled, interpretarGasto } from '../models/ia.js'

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
