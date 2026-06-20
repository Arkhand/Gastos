import AppShell from '../../../components/AppShell.jsx'

// Pantalla "Nosotros" (estática). Portado de nosotros.ejs.
export default function NosotrosPage() {
  return (
    <AppShell pageClass="nosotros page-nosotros">
      <div className="nos-hero">
        <div className="nos-kicker">NOSOTROS</div>
        <div className="nos-title">
          Un equipo<br />familiar 💛
        </div>
        <div className="nos-text">
          Gastos nació en la mesa de casa, anotando en qué se nos iba la plata. Lo hacemos los tres.
        </div>
      </div>

      <div className="team-stage">
        <div className="team-card">
          <div className="team-photo" style={{ '--ring': 'var(--lilac-deep)' }}>
            <img src="/mama.jpg" alt="Mamá" />
          </div>
          <div className="team-name">Mamá</div>
          <div className="team-role">Las cuentas</div>
        </div>
        <div className="team-card">
          <div className="team-photo" style={{ '--ring': 'var(--mint-deep)' }}>
            <img src="/papa.jpg" alt="Papá" />
          </div>
          <div className="team-name">Papá</div>
          <div className="team-role">El que gasta</div>
        </div>
        <div className="team-card">
          <div className="team-photo" style={{ '--ring': 'var(--butter-deep)' }}>
            <img src="/nena.jpg" alt="Peque" />
          </div>
          <div className="team-name">Peque</div>
          <div className="team-role">Antojos 🍭</div>
        </div>
      </div>

      <div className="nos-quote">"Si lo decís en voz alta, ya está cargado."</div>
    </AppShell>
  )
}
