// Manejador de errores global: es el último middleware que se monta.
// Cualquier error que un controlador pase con next(err) cae acá.
export const errorHandler = (err, req, res, _next) => {
  console.error('[error]', err)
  if (res.headersSent) return
  if (req.path.startsWith('/api')) {
    res.status(500).json({ error: 'Error interno' })
  } else {
    res.status(500).send('Error interno')
  }
}
