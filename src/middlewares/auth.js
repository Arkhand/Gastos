// Middleware de autenticación: protege las rutas privadas.
// Además de estar logueado, exige que el email esté en la lista blanca
// (la app es solo para la familia). Ver config/acceso.js.
import { emailPermitido } from '../config/acceso.js'

export const requireAuth = (req, res, next) => {
  if (req.isAuthenticated()) {
    if (emailPermitido(req.user?.email)) {
      next()
      return
    }
    // Logueado pero sin acceso: API -> 403; página -> cerramos sesión y avisamos.
    if (req.path.startsWith('/api')) {
      res.status(403).json({ error: 'Sin acceso' })
      return
    }
    req.logout(() => res.redirect('/?error=acceso'))
    return
  }

  // No autenticado.
  if (req.path.startsWith('/api')) {
    res.status(401).json({ error: 'No autenticado' })
    return
  }
  res.redirect('/')
}
