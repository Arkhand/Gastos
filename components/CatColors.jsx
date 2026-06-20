'use client'
import { useCategorias } from '../lib/api.js'

// Inyecta un <style> con las CSS vars (--bg/--ink) de cada categoría por id, igual
// que cssVarsCategorias() de la app vieja. Así las clases .cat-<uuid> tienen color
// sin depender de reglas estáticas. Las categorías SEED ya tienen sus vars en el
// CSS global; esto cubre las creadas con UUID (y pisa por especificidad si hace falta).
function cssEscapeId(id) {
  return String(id).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

export default function CatColors() {
  const { data } = useCategorias()
  const cats = [...(data?.activas ?? []), ...(data?.borradas ?? [])]
  if (!cats.length) return null
  const reglas = cats
    .map((c) => `.cat-${cssEscapeId(c.id)}{--bg:${c.color_bg};--ink:${c.color_ink};}`)
    .join('')
  return <style id="cat-colors" dangerouslySetInnerHTML={{ __html: reglas }} />
}
