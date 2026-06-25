// Interpretación de gastos con IA. Probamos varios modelos en orden (ver MODELOS):
// si uno falla (cuota agotada, error de red, etc.) pasamos al siguiente.
// IMPORTANTE: las API keys viven SOLO en el servidor (config.groq / config.gemini).
// El navegador manda el texto a /api/interpretar; nunca ve las claves.
//
// Las categorías ya NO son una lista fija: salen de la BD (config/categorias.js).
// A la IA le mostramos los NOMBRES de las categorías activas (legibles) y le
// pedimos que devuelva uno; del lado servidor mapeamos ese nombre al UUID que se
// guarda en `gastos.categoria`. (Pedirle un UUID directo es frágil: los modelos
// los alucinan.)
import { config } from './env.js'
import {
  getCategorias,
  catById,
  normalizarCategoria,
  normalizarNombre,
  otrosId,
  ensureCategoriasCargadas,
} from './categorias.js'
import { PERSONA_ENUM, normalizarPersona } from './personas.js'
import { hoyAR } from './fecha.js'

// Orden de preferencia (Groq primero, Gemini de respaldo). Se define en la env
// IA_MODELOS y se parsea en config (config.iaModelos). Se prueba de arriba a
// abajo y se usa el primero que responda bien.
// Solo dejamos los modelos cuyo proveedor está configurado (tiene API key).
const MODELOS_ACTIVOS = config.iaModelos.filter((m) => config[m.provider]?.enabled)

export const iaEnabled = MODELOS_ACTIVOS.length > 0

// Schema de salida estructurada (lo entiende Gemini de forma nativa; para Groq
// se lo pedimos por prompt + modo JSON). El enum de categoría son los NOMBRES
// activos del momento, por eso se construye por llamada.
function buildResponseSchema(nombres) {
  return {
    type: 'OBJECT',
    properties: {
      descripcion: { type: 'STRING' },
      monto: { type: 'NUMBER' },
      moneda: { type: 'STRING', enum: ['ARS', 'USD'] },
      categoria: { type: 'STRING', enum: nombres },
      persona: { type: 'STRING', enum: PERSONA_ENUM },
      fecha: { type: 'STRING', description: 'Fecha en formato YYYY-MM-DD' },
    },
    required: ['descripcion', 'monto', 'moneda', 'categoria', 'persona', 'fecha'],
  }
}

// Schema chico para la revisión de la carga manual (solo descripción + categoría).
function buildResponseSchemaRevision(nombres) {
  return {
    type: 'OBJECT',
    properties: {
      descripcion: { type: 'STRING' },
      categoria: { type: 'STRING', enum: nombres },
    },
    required: ['descripcion', 'categoria'],
  }
}

// Guía de categorías para el prompt: una línea por categoría que tenga `hint`
// (la pista que cargó el usuario). Las que no tienen hint igual están en el enum;
// simplemente no aparecen en la guía. Formato: "    · Nombre — pista".
function buildGuia(cats) {
  return cats
    .filter((c) => c.hint && String(c.hint).trim())
    .map((c) => `    · ${c.nombre} — ${String(c.hint).trim()}`)
}

function listaNombres(cats) {
  return cats.map((c) => c.nombre).join(', ')
}

function construirPrompt(texto, cats) {
  const hoy = hoyAR()
  const guia = buildGuia(cats)
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
    `- categoria (string): EXACTAMENTE uno de estos nombres (tal cual, respetando mayúsculas): ${listaNombres(cats)}.`,
    ...(guia.length ? ['  Guía:', ...guia] : []),
    '- persona (string): a nombre de quién fue el gasto, como EMAIL:',
    '    · "musiald@gmail.com" si dice Daniel, "él", "el varón", "el hombre" o un nombre de varón.',
    '    · "danielapaulacastelli@gmail.com" si dice Daniela, "ella", "la mujer" o un nombre de mujer.',
    '    · "Desconocido" si solo dice "Dani" (ambiguo) o no menciona a nadie.',
    '- fecha (string, formato YYYY-MM-DD): "ayer" y "anoche" = un día menos que hoy; "anteayer" = dos días menos; si no se menciona fecha, usá hoy.',
    '',
    '# Reglas',
    '- No inventes datos que la frase no dice; ante la duda usá los defaults (descripcion "", monto 0, persona "Desconocido").',
    '- La categoría tiene que ser uno de los nombres de la lista, exactamente. Si ninguna encaja, usá "Otros".',
    '- Si la frase dice que el gasto es "personal"/"personales" o "solo mío", eso marca que es un gasto personal: NO incluyas esas palabras en la descripción.',
    '- Frase vacía o sin gasto entendible → descripcion "", monto 0, categoria "Otros", persona "Desconocido", fecha hoy.',
    '',
    '# Ejemplos (suponiendo que hoy fuese 2025-03-10)',
    'Frase: "ayer gasté 2 lucas en el super para Daniela"',
    '{"descripcion":"Súper","monto":2000,"moneda":"ARS","categoria":"Súper","persona":"danielapaulacastelli@gmail.com","fecha":"2025-03-09"}',
    'Frase: "pagué 15 dólares de Netflix"',
    '{"descripcion":"Netflix","monto":15,"moneda":"USD","categoria":"Servicios","persona":"Desconocido","fecha":"2025-03-10"}',
    'Frase: "cargué nafta, 30 mil, la puso él"',
    '{"descripcion":"Nafta","monto":30000,"moneda":"ARS","categoria":"Transporte","persona":"musiald@gmail.com","fecha":"2025-03-10"}',
    'Frase: "ehh no sé"',
    '{"descripcion":"","monto":0,"moneda":"ARS","categoria":"Otros","persona":"Desconocido","fecha":"2025-03-10"}',
    '',
    '# Frase a interpretar',
    `"${texto}"`,
  ].join('\n')
}

// Prompt enfocado para la carga MANUAL: corrige typos/formatea la descripción y
// verifica la categoría (la cambia solo si claramente no corresponde). Estructura
// Rol/Tarea/Reglas/Formato/Ejemplos (metodología prompt-engineer).
function construirPromptRevision(descripcion, categoriaNombre, cats) {
  const guia = buildGuia(cats)
  return [
    '# Rol',
    'Sos un asistente que corrige y formatea la descripción de UN gasto cargado a mano, y verifica su categoría. Español rioplatense (Argentina). Devolvés SOLO un objeto JSON válido, sin texto extra ni explicaciones.',
    '',
    '# Tarea',
    '1. descripcion: corregí errores de tipeo, incluso fonéticos o de tecla aunque la palabra parezca rara (p. ej. "nasta"→"nafta", "supermecado"→"supermercado"), pero SIN inventar datos que el texto no diga. Dejala prolija: capitalizada (primera letra mayúscula), concisa (pocas palabras), SIN el monto ni símbolos de moneda. Respetá las mayúsculas de marcas y siglas (YPF, SUBE, Netflix); no traduzcas ni cambies nombres de marcas/comercios.',
    '2. categoria: si la dada es "Otros", NO la tomes como elegida — asigná la que MEJOR describa el gasto. Si es una categoría específica (distinta de "Otros"), MANTENELA salvo que claramente no corresponda.',
    '',
    `# Categorías válidas (nombres exactos): ${listaNombres(cats)}.`,
    ...(guia.length ? ['  Guía:', ...guia] : []),
    '',
    '# Reglas',
    '- No inventes ni expandas la descripción más allá de corregir/formatear.',
    '- La categoría tiene que ser uno de los nombres de la lista, exactamente.',
    '- Si la categoría dada es específica (no "Otros"), ante la duda conservala; si es "Otros", elegí la mejor.',
    '- descripcion vacía o sin sentido → "descripcion":"" y conservá la categoría dada.',
    '',
    '# Formato',
    'Devolvé exactamente: {"descripcion": <string>, "categoria": <uno de los nombres válidos>}',
    '',
    '# Ejemplos',
    'Entrada: descripcion="netflxi", categoria="Otros"',
    '{"descripcion":"Netflix","categoria":"Servicios"}',
    'Entrada: descripcion="nasta", categoria="Otros"',
    '{"descripcion":"Nafta","categoria":"Transporte"}',
    'Entrada: descripcion="cafe con un amigo", categoria="Salidas"',
    '{"descripcion":"Café con un amigo","categoria":"Salidas"}',
    'Entrada: descripcion="asdfgh", categoria="Otros"',
    '{"descripcion":"","categoria":"Otros"}',
    '',
    '# Gasto a revisar',
    `descripcion="${descripcion}", categoria="${categoriaNombre}"`,
  ].join('\n')
}

// --- Chequeo de estado/cuota de un proveedor (para la pantalla de Config) ---
// Groq devuelve, en cada respuesta, headers x-ratelimit-* con lo que queda. Los
// leemos con un ping mínimo (1 token) para no consumir cuota real. Devuelve la
// cuota restante de requests/tokens, o null si la API no los expone.
async function pingGroq(model) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.groq.apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${detalle.slice(0, 160)}`)
  }
  const h = res.headers
  const num = (k) => {
    const v = h.get(k)
    const n = v == null ? NaN : Number(v)
    return Number.isFinite(n) ? n : null
  }
  return {
    requests: { restantes: num('x-ratelimit-remaining-requests'), total: num('x-ratelimit-limit-requests') },
    tokens: { restantes: num('x-ratelimit-remaining-tokens'), total: num('x-ratelimit-limit-tokens') },
    // Cuándo se reponen (string tipo "1m26.4s" / "185ms" tal cual lo da Groq).
    resetRequests: h.get('x-ratelimit-reset-requests'),
    resetTokens: h.get('x-ratelimit-reset-tokens'),
  }
}

// Gemini (API REST) NO expone cuota restante por header ni body: solo sabemos si
// la key responde. Hacemos un ping de 1 token; si responde 200, la key funciona.
async function pingGemini(model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.gemini.apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 1 },
    }),
  })
  if (!res.ok) {
    const detalle = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${detalle.slice(0, 160)}`)
  }
  return null // sin info de cuota disponible
}

// Estado de cada modelo configurado, EN EL MISMO ORDEN en que se consumen
// (MODELOS_ACTIVOS). Para cada uno: si responde (ok) y, cuando el proveedor lo
// permite (Groq), cuánta cuota queda. Lo usa GET /api/ia/estado → pantalla Config.
export async function estadoModelos() {
  const resultados = []
  for (let i = 0; i < MODELOS_ACTIVOS.length; i++) {
    const { provider, model } = MODELOS_ACTIVOS[i]
    const item = { orden: i + 1, provider, model, ok: false, error: null, cuota: null }
    try {
      item.cuota = provider === 'groq' ? await pingGroq(model) : await pingGemini(model)
      item.ok = true
    } catch (err) {
      item.error = err.message
    }
    resultados.push(item)
  }
  return resultados
}

// --- Gemini (Google Generative Language API) ---
async function llamarGemini(model, prompt, schema) {
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

// Mapea el NOMBRE de categoría que devolvió la IA al UUID (id) que se guarda en la
// BD. Compara sin acentos/mayúsculas para tolerar diferencias ("super" ≈ "Súper").
// Si no matchea ninguna activa, devuelve el id de "Otros".
function nombreCategoriaAId(nombre, cats) {
  const objetivo = normalizarNombre(nombre)
  const hit = cats.find((c) => normalizarNombre(c.nombre) === objetivo)
  return hit ? hit.id : otrosId()
}

// Pasa el JSON crudo del modelo a la forma que espera el front. No forzamos
// defaults que tapen lo que el modelo NO pudo mapear: descripcion vacía, monto 0
// y persona null le avisan al front que falta completar a mano (warning). Lo que
// sí tiene default natural es fecha (hoy) y moneda (ARS). La categoría llega como
// nombre y la convertimos al id (UUID).
function normalizar(parsed, cats) {
  return {
    descripcion: String(parsed.descripcion ?? '').trim(),
    monto: Number(parsed.monto) || 0,
    moneda: parsed.moneda === 'USD' ? 'USD' : 'ARS',
    categoria: nombreCategoriaAId(parsed.categoria, cats),
    persona: normalizarPersona(parsed.persona),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(parsed.fecha) ? parsed.fecha : hoyAR(),
  }
}

// Revisión de la carga manual: solo descripción (prolija) + categoría válida.
// Si el modelo devuelve una categoría que no matchea ninguna activa, CONSERVAMOS
// la que eligió la persona (id original) en vez de degradarla a "Otros".
function normalizarRevision(parsed, idOriginal, cats) {
  const txt = String(parsed.categoria ?? '').trim()
  const id = txt ? nombreCategoriaAId(txt, cats) : idOriginal
  return {
    descripcion: String(parsed.descripcion ?? '').trim(),
    categoria: id,
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

// La MONEDA la decide el TEXTO, nunca el modelo (que a veces marca USD aunque se
// dijo "pesos"). Regla dura, pedida por el usuario: USD SOLO si se mencionan
// dólares explícitamente y NO se mencionan pesos. En cualquier otro caso, ARS.
export function monedaDesdeTexto(texto) {
  const t = (texto || '').toLowerCase()
  const pesos = /\bpesos?\b|\bars\b|\bmangos?\b|\blucas?\b|\bpalos?\b/.test(t)
  const usd = /d[oó]lar(es)?\b|\busd\b|u\$s|us\$|\bverdes?\b/.test(t)
  if (usd && !pesos) return 'USD'
  return 'ARS'
}

// Igual que la moneda, el "es personal" lo decide el TEXTO, no el modelo. Por
// defecto la voz es compartida; si la frase menciona explícitamente que el gasto
// es personal/mío, lo marcamos como NO compartido (no entra al reparto). Pedido
// del usuario: si digo literalmente "gastos personales", que lo flague así.
export function esPersonalDesdeTexto(texto) {
  const t = (texto || '').toLowerCase()
  // Buscamos la INTENCIÓN, no la palabra suelta: "gasto/gastos personal(es)",
  // "es/fue/son personal(es)", "(es) mío", "solo mío". Así "entrenador personal"
  // o "cuidado personal" (que son descripciones) no disparan el flag por error.
  return /\bgastos?\s+personal(es)?\b|\b(es|fue|son|era)\s+personal(es)?\b|\b(s[oó]lo|solo)\s+m[ií][oa]s?\b|\bes\s+m[ií][oa]s?\b/.test(t)
}

// Interpreta un gasto a partir de texto libre dictado por voz.
export async function interpretarGasto(texto) {
  if (!iaEnabled) {
    throw new Error('IA no configurada (falta GROQ_API_KEY y/o GEMINI_API_KEY).')
  }
  await ensureCategoriasCargadas()
  const cats = getCategorias() // solo activas: las borradas no se ofrecen a la IA
  const nombres = cats.map((c) => c.nombre)
  const gasto = await ejecutarModelos(
    construirPrompt(texto, cats),
    buildResponseSchema(nombres),
    (parsed) => normalizar(parsed, cats),
  )
  // No confiamos la moneda al modelo: la fijamos por las palabras del usuario.
  gasto.moneda = monedaDesdeTexto(texto)
  // Lo mismo con "es personal": lo decide el texto (default = compartido).
  gasto.compartido = !esPersonalDesdeTexto(texto)
  return gasto
}

// Corrige typos/formatea la descripción y verifica la categoría (carga manual).
// Recibe el id (UUID) de categoría que mandó el front; a la IA le pasamos el
// NOMBRE de esa categoría y mapeamos la respuesta de vuelta a id.
export async function revisarGasto(descripcion, categoriaId) {
  if (!iaEnabled) {
    throw new Error('IA no configurada (falta GROQ_API_KEY y/o GEMINI_API_KEY).')
  }
  await ensureCategoriasCargadas()
  const cats = getCategorias()
  const nombres = cats.map((c) => c.nombre)
  // La categoría que mandó el front ya es un id válido; es el fallback si el
  // modelo devuelve algo fuera de la lista.
  const idOriginal = normalizarCategoria(categoriaId)
  const nombreOriginal = catById(idOriginal).nombre
  return ejecutarModelos(
    construirPromptRevision(descripcion, nombreOriginal, cats),
    buildResponseSchemaRevision(nombres),
    (parsed) => normalizarRevision(parsed, idOriginal, cats),
  )
}
