// Personas del libro compartido (a nombre de quién es el gasto).
// En la BD guardamos el EMAIL (dato formal/canónico), pero en la app mostramos
// un label amable ("Dani Hombre" / "Dani Mujer"). Un solo lugar: lo usan el
// segmented de la hoja, los controladores, las vistas y el esquema de Gemini.
export const PERSONAS = [
  { id: 'musiald@gmail.com', label: 'Dani Hombre', emoji: '👨', alias: ['daniel', 'dani hombre', 'el', 'él', 'varon', 'varón', 'hombre'] },
  { id: 'danielapaulacastelli@gmail.com', label: 'Dani Mujer', emoji: '👩', alias: ['daniela', 'dani mujer', 'ella', 'mujer'] },
]

// Ids canónicos = los emails (lo que se guarda en a_nombre_de).
export const PERSONA_IDS = PERSONAS.map((p) => p.id)

// Valores que la IA puede devolver: los emails + "Desconocido" si no lo sabe.
export const PERSONA_ENUM = [...PERSONA_IDS, 'Desconocido']

// Normaliza un valor (email, label, alias o nombre viejo) al EMAIL canónico.
// Devuelve null si no matchea (incluido "Desconocido"), para que el front pida elegir.
export function normalizarPersona(valor) {
  if (!valor) return null
  const v = String(valor).trim().toLowerCase()
  for (const p of PERSONAS) {
    if (v === p.id.toLowerCase() || v === p.label.toLowerCase() || p.alias.includes(v)) return p.id
  }
  return null
}

// Email (o lo que haya) -> label para mostrar. Si no lo reconoce, devuelve el valor tal cual.
export function personaLabel(valor) {
  const id = normalizarPersona(valor)
  if (id) return PERSONAS.find((p) => p.id === id).label
  return valor ? String(valor) : ''
}

// Persona preseleccionada según quién está logueado (su propio email).
export function personaPorDefecto(email) {
  return normalizarPersona(email) || PERSONAS[0].id
}
