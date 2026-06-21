'use client'
// Indicador de carga: tres puntitos que suben y bajan como una olita.
// Se usa mientras la query trae los datos, para no mostrar el estado vacío
// ("sin gastos") por error antes de que lleguen.
export default function LoadingDots({ label = 'Cargando…' }) {
  return (
    <div className="loading-wave" role="status" aria-live="polite">
      <span className="loading-dots" aria-hidden="true">
        <span className="loading-dot" />
        <span className="loading-dot" />
        <span className="loading-dot" />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  )
}
