import Sidebar from './Sidebar.jsx'
import TabBar from './TabBar.jsx'
import CatColors from './CatColors.jsx'

// Envoltura de las pantallas privadas: sidebar (desktop) + contenido + tabbar
// (mobile). Replica la estructura app-shell > sidebar + app-root de las vistas.
// `pageClass` = clase de página (page-resumen, page-config, ...) para el CSS.
export default function AppShell({ children, pageClass = '' }) {
  return (
    <div className="app-shell">
      <CatColors />
      <Sidebar />
      <div className={`app-root ${pageClass}`}>
        {children}
        <TabBar />
      </div>
    </div>
  )
}
