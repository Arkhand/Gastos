'use client'
// Cliente de la API: fetch a /api/* + hooks de TanStack Query. Las cookies viajan
// solas (mismo origen). Sin lógica de negocio: solo transporte y cache.
import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Wrapper de fetch para todos los endpoints. Ante error (!res.ok) lanza un Error
// enriquecido con `.status` (código HTTP) y `.code` (string corto del server, p.ej.
// 'existe', 'division-suma'); la UI los usa para mostrar el mensaje adecuado.
async function req(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(data?.error || `Error ${res.status}`)
    err.status = res.status
    err.code = data?.error
    throw err
  }
  return data
}

// ---- Queries ----
export function useGastos(mes) {
  return useQuery({
    queryKey: ['gastos', mes],
    queryFn: () => req(`/api/gastos${mes ? `?mes=${mes}` : ''}`),
  })
}

export function useCategorias() {
  return useQuery({ queryKey: ['categorias'], queryFn: () => req('/api/categorias') })
}

export function useDivision() {
  return useQuery({ queryKey: ['division'], queryFn: () => req('/api/division') })
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => req('/api/me'),
    retry: false,
  })
}

// Estado de la IA de voz (Groq/Gemini). Cada consulta pingea los modelos, así que
// no la refrescamos sola: solo al entrar a la página o al tocar "Actualizar".
export function useEstadoIA() {
  return useQuery({
    queryKey: ['ia-estado'],
    queryFn: () => req('/api/ia/estado'),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

// ---- Mercado Pago ----
export function useMpPendientes() {
  return useQuery({ queryKey: ['mp-pendientes'], queryFn: () => req('/api/mp/pendientes'), staleTime: 60_000 })
}

export function useMpCuenta() {
  return useQuery({ queryKey: ['mp-cuenta'], queryFn: () => req('/api/mp/cuenta'), retry: false })
}

// Al abrir /inicio: sincroniza con MP (el server se saltea si fue hace < 5 min) y
// refresca los pendientes. Silencioso: si falla, se ve lo que ya había.
export function useSyncMpAlAbrir() {
  const qc = useQueryClient()
  useEffect(() => {
    req('/api/mp/sync', { method: 'POST' })
      .then(() => qc.invalidateQueries({ queryKey: ['mp-pendientes'] }))
      .catch(() => {})
  }, [qc])
}

// ---- Mutations ----
// Invalida las queries afectadas para que la UI se refresque sola tras escribir.
function useInvalidate(keys) {
  const qc = useQueryClient()
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

export function useCrearGasto() {
  const inval = useInvalidate(['gastos', 'mp-pendientes'])
  return useMutation({
    mutationFn: (body) => req('/api/gastos', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: inval,
  })
}

export function useEditarGasto() {
  const inval = useInvalidate(['gastos'])
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      req(`/api/gastos/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: inval,
  })
}

export function useBorrarGasto() {
  const inval = useInvalidate(['gastos'])
  return useMutation({
    mutationFn: (id) => req(`/api/gastos/${id}`, { method: 'DELETE' }),
    onSuccess: inval,
  })
}

export function useCrearCategoria() {
  const inval = useInvalidate(['categorias', 'gastos'])
  return useMutation({
    mutationFn: (body) => req('/api/categorias', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: inval,
  })
}

export function useEditarCategoria() {
  const inval = useInvalidate(['categorias', 'gastos'])
  return useMutation({
    mutationFn: ({ id, ...body }) =>
      req(`/api/categorias/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: inval,
  })
}

export function useBorrarCategoria() {
  const inval = useInvalidate(['categorias', 'gastos'])
  return useMutation({
    mutationFn: (id) => req(`/api/categorias/${id}`, { method: 'DELETE' }),
    onSuccess: inval,
  })
}

export function useRevivirCategoria() {
  const inval = useInvalidate(['categorias', 'gastos'])
  return useMutation({
    mutationFn: (id) => req(`/api/categorias/${id}/revivir`, { method: 'POST' }),
    onSuccess: inval,
  })
}

export function useGuardarDivision() {
  const inval = useInvalidate(['division', 'gastos'])
  return useMutation({
    mutationFn: (body) => req('/api/division', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: inval,
  })
}

export function useCerrarMes() {
  const inval = useInvalidate(['gastos'])
  return useMutation({
    mutationFn: (mes) => req('/api/cierres', { method: 'POST', body: JSON.stringify({ mes }) }),
    onSuccess: inval,
  })
}

const urlMov = (id) => `/api/mp/${encodeURIComponent(id)}`

export function useDescartarMp() {
  const inval = useInvalidate(['mp-pendientes'])
  return useMutation({
    mutationFn: ({ id, deshacer }) =>
      req(`${urlMov(id)}/descartar`, { method: 'POST', body: JSON.stringify({ deshacer: !!deshacer }) }),
    onSuccess: inval,
  })
}

export function useVincularMp() {
  const inval = useInvalidate(['mp-pendientes', 'gastos'])
  return useMutation({
    mutationFn: ({ id, gasto_id }) =>
      req(`${urlMov(id)}/vincular`, { method: 'POST', body: JSON.stringify({ gasto_id }) }),
    onSuccess: inval,
  })
}

export function useConectarMpToken() {
  const inval = useInvalidate(['mp-cuenta', 'mp-pendientes'])
  return useMutation({
    mutationFn: (token) => req('/api/mp/token', { method: 'POST', body: JSON.stringify({ token }) }),
    onSuccess: inval,
  })
}

export function useDesconectarMp() {
  const inval = useInvalidate(['mp-cuenta', 'mp-pendientes'])
  return useMutation({ mutationFn: () => req('/api/mp/cuenta', { method: 'DELETE' }), onSuccess: inval })
}

// Voz (sin cache, son acciones puntuales)
export function interpretarVoz(texto) {
  return req('/api/voz/interpretar', { method: 'POST', body: JSON.stringify({ texto }) })
}
export function revisarVoz(descripcion, categoria) {
  return req('/api/voz/revisar', { method: 'POST', body: JSON.stringify({ descripcion, categoria }) })
}
export function corregirGastoApi(id, descripcion, categoria) {
  return req(`/api/gastos/${id}/corregir`, {
    method: 'POST',
    body: JSON.stringify({ descripcion, categoria }),
  })
}
