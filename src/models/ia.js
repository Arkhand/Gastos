// Interpretación de gastos con IA. Probamos varios modelos en orden (ver MODELOS):
// si uno falla (cuota agotada, error de red, etc.) pasamos al siguiente.
// IMPORTANTE: las API keys viven SOLO en el servidor (config.groq / config.gemini).
// El navegador manda el texto a /api/interpretar; nunca ve las claves.
import { config } from '../config/env.js'
import { CATEGORIA_IDS, normalizarCategoria } from '../config/categorias.js'
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

// Schema chico para la revisión de la carga manual (solo descripción + categoría).
const responseSchemaRevision = {
  type: 'OBJECT',
  properties: {
    descripcion: { type: 'STRING' },
    categoria: { type: 'STRING', enum: CATEGORIA_IDS },
  },
  required: ['descripcion', 'categoria'],
}

// Guía de categorías compartida por los prompts de IA (interpretar y revisar).
const GUIA_CATEGORIAS = [
  '    · comida — comer afuera, delivery, restaurante, café, panadería.',
  '    · super — supermercado, almacén, verdulería, carnicería, kiosco (mercadería).',
  '    · transporte — nafta, SUBE, colectivo, taxi, Uber, peaje, estacionamiento.',
  '    · salidas — bar, boliche, cine, tragos, ocio.',
  '    · salud — farmacia, remedios, médico, obra social.',
  '    · hogar — muebles, ferretería, limpieza, cosas para la casa.',
  '    · servicios — luz, gas, agua, internet, teléfono, cable, expensas y suscripciones (Netflix, Spotify, etc.).',
  '    · otros — si no encaja claramente en ninguna.',
]

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
    ...GUIA_CATEGORIAS,
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

// Prompt enfocado para la carga MANUAL: corrige typos/formatea la descripción y
// verifica la categoría (la cambia solo si claramente no corresponde). Estructura
// Rol/Tarea/Reglas/Formato/Ejemplos (metodología prompt-engineer).
function construirPromptRevision(descripcion, categoria) {
  return [
    '# Rol',
    'Sos un asistente que corrige y formatea la descripción de UN gasto cargado a mano, y verifica su categoría. Español rioplatense (Argentina). Devolvés SOLO un objeto JSON válido, sin texto extra ni explicaciones.',
    '',
    '# Tarea',
    '1. descripcion: corregí errores de tipeo, incluso fonéticos o de tecla aunque la palabra parezca rara (p. ej. "nasta"→"nafta", "supermecado"→"supermercado"), pero SIN inventar datos que el texto no diga. Dejala prolija: capitalizada (primera letra mayúscula), concisa (pocas palabras), SIN el monto ni símbolos de moneda. Respetá las mayúsculas de marcas y siglas (YPF, SUBE, Netflix); no traduzcas ni cambies nombres de marcas/comercios.',
    '2. categoria: si la dada es "otros", NO la tomes como elegida — asigná la que MEJOR describa el gasto. Si es una categoría específica (distinta de "otros"), MANTENELA salvo que claramente no corresponda.',
    '',
    `# Categorías válidas (ids): ${CATEGORIA_IDS.join(', ')}. Guía:`,
    ...GUIA_CATEGORIAS,
    '',
    '# Reglas',
    '- No inventes ni expandas la descripción más allá de corregir/formatear.',
    '- Si la categoría dada es específica (no "otros"), ante la duda conservala; si es "otros", elegí la mejor.',
    '- descripcion vacía o sin sentido → "descripcion":"" y conservá la categoría dada.',
    '',
    '# Formato',
    'Devolvé exactamente: {"descripcion": <string>, "categoria": <uno de los ids válidos>}',
    '',
    '# Ejemplos',
    'Entrada: descripcion="netflxi", categoria="otros"',
    '{"descripcion":"Netflix","categoria":"servicios"}',
    'Entrada: descripcion="nasta", categoria="otros"',
    '{"descripcion":"Nafta","categoria":"transporte"}',
    'Entrada: descripcion="nafta axion", categoria="comida"',
    '{"descripcion":"Nafta Axion","categoria":"transporte"}',
    'Entrada: descripcion="cafe con un amigo", categoria="salidas"',
    '{"descripcion":"Café con un amigo","categoria":"salidas"}',
    'Entrada: descripcion="super 5000", categoria="super"',
    '{"descripcion":"Súper","categoria":"super"}',
    'Entrada: descripcion="asdfgh", categoria="otros"',
    '{"descripcion":"","categoria":"otros"}',
    '',
    '# Gasto a revisar',
    `descripcion="${descripcion}", categoria="${categoria}"`,
  ].join('\n')
}

// --- Gemini (Google Generative Language API) ---
async function llamarGemini(model, prompt, schema = responseSchema) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: schema,
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

// Revisión de la carga manual: solo descripción (prolija) + categoría válida.
// Si el modelo devuelve una categoría inválida/vacía (p. ej. Groq sin enum),
// CONSERVAMOS la que eligió la persona en vez de degradarla a 'otros'.
function normalizarRevision(parsed, categoriaOriginal) {
  return {
    descripcion: String(parsed.descripcion ?? '').trim(),
    categoria: CATEGORIA_IDS.includes(parsed.categoria) ? parsed.categoria : categoriaOriginal,
  }
}

// Prueba cada modelo en orden (Groq primero, Gemini de respaldo) hasta que uno
// responda bien. Compartido por interpretarGasto (voz) y revisarGasto (manual).
async function ejecutarModelos(prompt, schema, normalizeFn) {
  let ultimoError
  for (const { provider, model } of MODELOS_ACTIVOS) {
    try {
      const parsed = provider === 'groq'
        ? await llamarGroq(model, prompt)
        : await llamarGemini(model, prompt, schema)
      return normalizeFn(parsed)
    } catch (err) {
      ultimoError = err
      console.warn(`[ia] ${provider}/${model} falló, pruebo el siguiente:`, err.message)
    }
  }
  throw new Error(`Todos los modelos fallaron. Último error: ${ultimoError?.message}`)
}

// Interpreta un gasto a partir de texto libre dictado por voz.
export async function interpretarGasto(texto) {
  if (!iaEnabled) {
    throw new Error('IA no configurada (falta GROQ_API_KEY y/o GEMINI_API_KEY).')
  }
  return ejecutarModelos(construirPrompt(texto), responseSchema, normalizar)
}

// Corrige typos/formatea la descripción y verifica la categoría (carga manual).
export async function revisarGasto(descripcion, categoria) {
  if (!iaEnabled) {
    throw new Error('IA no configurada (falta GROQ_API_KEY y/o GEMINI_API_KEY).')
  }
  // La categoría que mandó el front ya es un id válido; es el fallback si el
  // modelo devuelve algo fuera de la lista.
  const original = normalizarCategoria(categoria)
  return ejecutarModelos(
    construirPromptRevision(descripcion, categoria),
    responseSchemaRevision,
    (parsed) => normalizarRevision(parsed, original),
  )
}
