// CSS completo de la app (mismo del diseño original): garantiza paridad visual
// exacta. Las clases se aplican idénticas en los componentes React.
import './legacy.css'
import Providers from './providers.jsx'
import RegisterSW from '../components/RegisterSW.jsx'
import SplashScreen from '../components/SplashScreen.jsx'

// Metadata global (Next la inyecta en el <head>). `manifest` habilita la PWA.
export const metadata = {
  title: 'Gastos',
  description: 'App de gastos familiar',
  manifest: '/manifest.webmanifest',
}

// `themeColor` coral pinta la barra del navegador/PWA; `viewportFit: cover` usa
// toda la pantalla en móviles con notch.
export const viewport = {
  themeColor: '#f2895f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        {/* Fuentes del diseño (mismas que la app vieja) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/icon-192.png" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <RegisterSW />
        <SplashScreen />
      </body>
    </html>
  )
}
