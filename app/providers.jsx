'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

// Provider de TanStack Query: cachea las respuestas de /api/* en el cliente, así
// los datos se comparten entre componentes y los filtros/toggles son instantáneos.
export default function Providers({ children }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // 30s: no re-fetch en cada navegación
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  )
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
