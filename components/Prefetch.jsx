'use client'
import { useGastos } from '../lib/api.js'
import { hoyAR } from '../lib/fecha.js'

// Ceba el cache de React Query con los datos del mes actual en TODAS las pantallas
// privadas (vía AppShell). Como /api/gastos trae gastos+categorías+división+cierres,
// al navegar a Inicio o Resumen los datos ya están cacheados -> sin espera. React
// Query deduplica, así que si la pantalla ya los pidió no se repite el fetch.
export default function Prefetch() {
  useGastos(hoyAR().slice(0, 7))
  return null
}
