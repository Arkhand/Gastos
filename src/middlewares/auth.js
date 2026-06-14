// Middleware de autenticación: protege rutas privadas.
// Se le pasa como argumento a cada ruta que requiere estar logueado.
export const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    next()
    return
  }
  // Para rutas de API devolvemos 401; para páginas redirigimos al inicio.
  if (req.path.startsWith('/api')) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  res.redirect('/')
}
