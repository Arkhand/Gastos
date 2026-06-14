// Categorías fijas (vienen del diseño). Un solo lugar: las usan los chips de la
// hoja, la lista de gastos, la pantalla Resumen y el esquema que le pedimos a la IA.
export const CATEGORIAS = [
  { id: 'comida', label: 'Comida', emoji: '🍔' },
  { id: 'super', label: 'Súper', emoji: '🛒' },
  { id: 'transporte', label: 'Transporte', emoji: '🚕' },
  { id: 'salidas', label: 'Salidas', emoji: '🍻' },
  { id: 'salud', label: 'Salud', emoji: '💊' },
  { id: 'hogar', label: 'Hogar', emoji: '🏠' },
  { id: 'otros', label: 'Otros', emoji: '✨' },
]

export const CATEGORIA_IDS = CATEGORIAS.map((c) => c.id)

// Devuelve la categoría por id (cae en "otros" si no la encuentra).
export function catById(id) {
  return CATEGORIAS.find((c) => c.id === id) ?? CATEGORIAS[CATEGORIAS.length - 1]
}

// Normaliza un id recibido del formulario o de la IA a uno válido.
export function normalizarCategoria(id) {
  return CATEGORIA_IDS.includes(id) ? id : 'otros'
}
