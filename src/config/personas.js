// Personas a las que se puede cargar un gasto ("a nombre de quién").
// Son solo dos: Daniel y Daniela. La IA mapea sinónimos dichos por voz a una
// de estas (o "Desconocido" si no lo puede distinguir, y ahí el front obliga a
// elegir a mano). Un solo lugar: lo usan el segmented button de la hoja, el
// controlador y el esquema que le pedimos a Gemini.
export const PERSONAS = [
  { id: 'Daniel', label: 'Daniel', emoji: '👨' },
  { id: 'Daniela', label: 'Daniela', emoji: '👩' },
]

export const PERSONA_IDS = PERSONAS.map((p) => p.id)

// Valores que la IA puede devolver (incluye el "no sé").
export const PERSONA_ENUM = [...PERSONA_IDS, 'Desconocido']

// Normaliza un valor recibido del form o de la IA. Devuelve null si no es válido
// (incluido "Desconocido"), para que el front sepa que falta elegir.
export function normalizarPersona(valor) {
  return PERSONA_IDS.includes(valor) ? valor : null
}

// Persona preseleccionada según quién está logueado: la cuenta de Daniela
// arranca en "Daniela"; cualquier otra (incluida la de Daniel) arranca en "Daniel".
export function personaPorDefecto(email) {
  return String(email || '').toLowerCase() === 'danielapaulacastelli@gmail.com'
    ? 'Daniela'
    : 'Daniel'
}
