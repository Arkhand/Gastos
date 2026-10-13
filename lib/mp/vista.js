// Helpers de presentación de Mercado Pago. Puros y sin APIs de Node: los usan
// componentes cliente (la tarjeta de pendientes y la hoja).

// "Cuenta …2440 · Santander" / "Usuario de MP: NICK". Nunca muestra el CBU entero.
export function detalleContacto(c) {
  if (!c?.id) return ''
  if (c.id.startsWith('cbu:')) {
    const fin = c.id.slice(-4)
    return c.sugerido ? `Cuenta …${fin} · ${c.sugerido}` : `Cuenta …${fin}`
  }
  return c.sugerido ? `Usuario de MP: ${c.sugerido}` : 'Usuario de MP'
}
