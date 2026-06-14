// Interpretación de gastos con Gemini (Google Generative Language API).
// IMPORTANTE: la API key vive SOLO en el servidor (config.gemini.apiKey).
// El navegador manda el texto a /api/interpretar; nunca ve la clave.
import { config } from '../config/env.js'
import { CATEGORIA_IDS } from '../config/categorias.js'
import { PERSONA_ENUM, normalizarPersona } from '../config/personas.js'
import { hoyAR } from '../utils/fecha.js'

export const iaEnabled = config.gemini.enabled

const endpoint = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

// Le exigimos a Gemini que devuelva SIEMPRE este JSON (salida estructurada).
const responseSchema = {
  type: 'OBJECT',
  properties: {
    descripcion: { type: 'STRING' },
    monto: { type: 'NUMBER' },
    moneda: { type: 'STRING', enum: ['ARS', 'USD'] },
    categoria: { type: 'STRING', enum: CATEGORIA_IDS },
    persona: { type: 'STRING', enum: PERSONA_ENUM },
    fecha: { type: 'STRING', description: 'Fecha en formato YYYY-MM-DD' },
  },
  required: ['descripcion', 'monto', 'moneda', 'categoria', 'persona', 'fecha'],
}

function construirPrompt(texto) {
  const hoy = hoyAR()
  return [
    'Sos un asistente que extrae UN gasto de una frase dicha en español rioplatense (Argentina).',
    `Hoy es ${hoy}. Si la frase dice "ayer" restá un día, "anteayer" dos; si no menciona fecha, usá hoy.`,
    'Devolvé el JSON pedido con estos campos:',
    '- descripcion: texto corto de qué se gastó (sin el monto), capitalizado. Si no se entiende qué se gastó, dejala vacía "".',
    '- monto: número en la moneda detectada. Entendé "mil", "lucas", "palos", "k" y el formato es-AR (el punto separa miles: "2.500" = 2500). Si no se dice un monto, devolvé 0.',
    '- moneda: "USD" solo si menciona dólares o usd; si no, "ARS".',
    `- categoria: una de estas exactamente: ${CATEGORIA_IDS.join(', ')}. Si no encaja, "otros".`,
    '- persona: a nombre de quién fue el gasto, devuelto como EMAIL. Usá "musiald@gmail.com" si dice Daniel, "él", "el varón" o un nombre de varón; "danielapaulacastelli@gmail.com" si dice Daniela, "ella", "la mujer" o un nombre de mujer. Si solo dice "Dani" (ambiguo) o no menciona a nadie, devolvé "Desconocido".',
    '- fecha: en formato YYYY-MM-DD.',
    '',
    `Frase: "${texto}"`,
  ].join('\n')
}

// Llama a Gemini y devuelve { descripcion, monto, moneda, categoria, fecha }.
export async function interpretarGasto(texto) {
  if (!config.gemini.enabled) {
    throw new Error('Gemini no configurado (falta GEMINI_API_KEY).')
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: construirPrompt(texto) }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema,
    },
  }

  const res = await fetch(endpoint(config.gemini.model, config.gemini.apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`Gemini respondió ${res.status}: ${detalle.slice(0, 300)}`)
  }

  const data = await res.json()
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) throw new Error('Gemini no devolvió contenido.')

  const parsed = JSON.parse(txt)
  // No forzamos defaults que tapen lo que Gemini NO pudo mapear: descripcion vacía,
  // monto 0 y persona null le avisan al front que falta completar a mano (warning).
  // Lo que sí tiene default natural es fecha (hoy) y moneda (ARS).
  return {
    descripcion: String(parsed.descripcion ?? '').trim(),
    monto: Number(parsed.monto) || 0,
    moneda: parsed.moneda === 'USD' ? 'USD' : 'ARS',
    categoria: CATEGORIA_IDS.includes(parsed.categoria) ? parsed.categoria : 'otros',
    persona: normalizarPersona(parsed.persona),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha) ? parsed.fecha : hoyAR(),
  }
}
