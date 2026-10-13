// Configura las claves VAPID sin tirar nunca: una clave mal cargada en Vercel
// (comillas, salto de línea, subject sin mailto:) apaga los avisos push pero no
// rompe el import de /api/mp/sync, que es lo que mantiene viva la feature de MP.
export function iniciarVapid(cfg, setVapidDetails) {
  if (!cfg.enabled) return false
  try {
    setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey)
    return true
  } catch (e) {
    console.error('[mp push] claves VAPID inválidas, avisos desactivados:', e.message)
    return false
  }
}
