// Interpretación de gastos con IA. Probamos varios modelos en orden (ver MODELOS):
// si uno falla (cuota agotada, error de red, etc.) pasamos al siguiente.
// IMPORTANTE: las API keys viven SOLO en el servidor (config.groq / config.gemini).
// El navegador manda el texto a /api/interpretar; nunca ve las claves.
import { config } from '../config/env.js'
import { CATEGORIA_IDS } from '../config/categorias.js'
import { PERSONA_ENUM, normalizarPersona } from '../config/personas.js'
import { hoyAR } from '../utils/fecha.js'

// Orden de preferencia (Groq primero, Gemini de respaldo). Se define en la env
// IA_MODELOS y se parsea en config (config.iaModelos). Se prueba de arriba a
// abajo y se usa el primero que responda bien.
// Solo dejamos los modelos cuyo proveedor está configurado (tiene API key).
const MODELOS_ACTIVOS = config.iaModelos.filter((m) => config[m.provider]?.enabled)

export const iaEnabled = MODELOS_ACTIVOS.length > 0

// Schema de salida estructurada (lo entiende Gemini de forma nativa; para Groq
// se lo pedimos por prompt + modo JSON).
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
    '# Rol',
    'Sos un asistente que extrae UN gasto a partir de una frase dicha por voz en español rioplatense (Argentina). Devolvés SOLO un objeto JSON válido, sin texto extra ni explicaciones.',
    '',
    '# Contexto',
    `Hoy es ${hoy} (hora de Argentina).`,
    '',
    '# Campos',
    '- descripcion (string): qué se gastó, en pocas palabras, SIN el monto, capitalizado. Si no se entiende qué se compró, dejala vacía "".',
    '- monto (number): cantidad en la moneda detectada. Reglas de números es-AR:',
    '    · "mil" = 1000; "X lucas" / "X palos" / "X k" = X×1000 (ej. "2 lucas" = 2000).',
    '    · El punto separa miles y la coma decimales: "2.500" = 2500; "1.250,50" = 1250.5.',
    '    · Si no se menciona ningún monto, devolvé 0.',
    '- moneda (string): "USD" SOLO si menciona dólares, "usd", "verdes" o "dólar"; en cualquier otro caso "ARS".',
    `- categoria (string): EXACTAMENTE uno de estos ids: ${CATEGORIA_IDS.join(', ')}. Guía:`,
    '    · comida — comer afuera, delivery, restaurante, café, panadería.',
    '    · super — supermercado, almacén, verdulería, carnicería, kiosco (mercadería).',
    '    · transporte — nafta, SUBE, colectivo, taxi, Uber, peaje, estacionamiento.',
    '    · salidas — bar, boliche, cine, tragos, ocio.',
    '    · salud — farmacia, remedios, médico, obra social.',
    '    · hogar — muebles, ferretería, limpieza, cosas para la casa.',
    '    · servicios — luz, gas, agua, internet, teléfono, cable, expensas y suscripciones (Netflix, Spotify, etc.).',
    '    · otros — si no encaja claramente en ninguna.',
    '- persona (string): a nombre de quién fue el gasto, como EMAIL:',
    '    · "musiald@gmail.com" si dice Daniel, "él", "el varón", "el hombre" o un nombre de varón.',
    '    · "danielapaulacastelli@gmail.com" si dice Daniela, "ella", "la mujer" o un nombre de mujer.',
    '    · "Desconocido" si solo dice "Dani" (ambiguo) o no menciona a nadie.',
    '- fecha (string, formato YYYY-MM-DD): "ayer" y "anoche" = un día menos que hoy; "anteayer" = dos días menos; si no se menciona fecha, usá hoy.',
    '',
    '# Reglas',
    '- No inventes datos que la frase no dice; ante la duda usá los defaults (descripcion "", monto 0, persona "Desconocido").',
    '- Frase vacía o sin gasto entendible → descripcion "", monto 0, categoria "otros", persona "Desconocido", fecha hoy.',
    '',
    '# Ejemplos (suponiendo que hoy fuese 2025-03-10)',
    'Frase: "ayer gasté 2 lucas en el super para Daniela"',
    '{"descripcion":"Súper","monto":2000,"moneda":"ARS","categoria":"super","persona":"danielapaulacastelli@gmail.com","fecha":"2025-03-09"}',
    'Frase: "pagué 15 dólares de Netflix"',
    '{"descripcion":"Netflix","monto":15,"moneda":"USD","categoria":"servicios","persona":"Desconocido","fecha":"2025-03-10"}',
    'Frase: "cargué nafta, 30 mil, la puso él"',
    '{"descripcion":"Nafta","monto":30000,"moneda":"ARS","categoria":"transporte","persona":"musiald@gmail.com","fecha":"2025-03-10"}',
    'Frase: "ehh no sé"',
    '{"descripcion":"","monto":0,"moneda":"ARS","categoria":"otros","persona":"Desconocido","fecha":"2025-03-10"}',
    '',
    '# Frase a interpretar',
    `"${texto}"`,
  ].join('\n')
}

// --- Gemini (Google Generative Language API) ---
async function llamarGemini(model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema,
      },
    }),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`Gemini ${model} respondió ${res.status}: ${detalle.slice(0, 200)}`)
  }
  const data = await res.json()
  const txt = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!txt) throw new Error(`Gemini ${model} no devolvió contenido.`)
  return JSON.parse(txt)
}

// --- Groq (API compatible con OpenAI) ---
async function llamarGroq(model, prompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groq.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`Groq ${model} respondió ${res.status}: ${detalle.slice(0, 200)}`)
  }
  const data = await res.json()
  const txt = data?.choices?.[0]?.message?.content
  if (!txt) throw new Error(`Groq ${model} no devolvió contenido.`)
  return JSON.parse(txt)
}

// Pasa el JSON crudo del modelo a la forma que espera el front. No forzamos
// defaults que tapen lo que el modelo NO pudo mapear: descripcion vacía, monto 0
// y persona null le avisan al front que falta completar a mano (warning). Lo que
// sí tiene default natural es fecha (hoy) y moneda (ARS).
function normalizar(parsed) {
  return {
    descripcion: String(parsed.descripcion ?? '').trim(),
    monto: Number(parsed.monto) || 0,
    moneda: parsed.moneda === 'USD' ? 'USD' : 'ARS',
    categoria: CATEGORIA_IDS.includes(parsed.categoria) ? parsed.categoria : 'otros',
    persona: normalizarPersona(parsed.persona),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha) ? parsed.fecha : hoyAR(),
  }
}

// Interpreta el gasto probando cada modelo en orden hasta que uno funcione.
export async function interpretarGasto(texto) {
  if (!iaEnabled) {
    throw new Error('IA no configurada (falta GROQ_API_KEY y/o GEMINI_API_KEY).')
  }

  const prompt = construirPrompt(texto)
  let ultimoError

  for (const { provider, model } of MODELOS_ACTIVOS) {
    try {
      const parsed = provider === 'groq'
        ? await llamarGroq(model, prompt)
        : await llamarGemini(model, prompt)
      return normalizar(parsed)
    } catch (err) {
      ultimoError = err
      console.warn(`[ia] ${provider}/${model} falló, pruebo el siguiente:`, err.message)
    }
  }

  throw new Error(`Todos los modelos fallaron. Último error: ${ultimoError?.message}`)
}
