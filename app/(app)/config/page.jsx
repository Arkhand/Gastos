import Link from 'next/link'
import AppShell from '../../../components/AppShell.jsx'

// Índice de Configuración. Portado de config-menu.ejs.
export default function ConfigMenuPage() {
  return (
    <AppShell pageClass="page-config">
      <div className="config">
        <h1>Configuración</h1>
        <p className="cfg-intro">Ajustá cómo funciona la app.</p>

        <nav className="cfg-menu">
          <Link className="cfg-menu-item" href="/config/division">
            <span className="cfg-menu-ico">⚖️</span>
            <span className="cfg-menu-txt">
              <span className="cfg-menu-name">División</span>
              <span className="cfg-menu-sub">Cómo se reparten los gastos compartidos</span>
            </span>
            <span className="cfg-menu-arrow">›</span>
          </Link>
          <Link className="cfg-menu-item" href="/config/categorias">
            <span className="cfg-menu-ico">🏷️</span>
            <span className="cfg-menu-txt">
              <span className="cfg-menu-name">Categorías</span>
              <span className="cfg-menu-sub">Agregá, editá o quitá categorías de gastos</span>
            </span>
            <span className="cfg-menu-arrow">›</span>
          </Link>
        </nav>
      </div>
    </AppShell>
  )
}
