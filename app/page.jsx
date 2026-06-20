// Página raíz temporal (Fase 0): solo verifica que Next arranca y toma los estilos.
// Se reemplaza en fases siguientes por el flujo real (login / inicio).
export default function Home() {
  return (
    <main style={{ maxWidth: 460, margin: '0 auto', padding: 32, textAlign: 'center' }}>
      <h1 style={{ fontFamily: 'var(--font-d)', color: 'var(--coral-deep)' }}>Gastos</h1>
      <p style={{ color: 'var(--ink-soft)' }}>
        Migración a Next.js en curso — Fase 0 (andamiaje) ✓
      </p>
    </main>
  )
}
