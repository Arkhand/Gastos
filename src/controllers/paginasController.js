// Controlador de páginas generales.

// Pantalla 1 — Inicio. Si NO estás logueado, muestra la landing con el botón
// de Google. Si YA estás logueado, te manda directo a cargar un gasto.
export const inicio = (req, res) => {
  if (req.user) {
    res.redirect('/inicio')
    return
  }
  res.render('landing', { user: undefined })
}

// Health check (no aparece en el menú; sirve para monitoreo / verificar el deploy).
export const healthz = (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
}
