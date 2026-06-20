'use client'
// Cliente de la API: fetch a /api/* + hooks de TanStack Query. Las cookies viajan
// solas (mismo origen). Sin lógica de negocio: solo transporte y cache.
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

// ---- Mutations ----
// Invalida las queries afectadas para que la UI se refresque sola tras escribir.
function useInvalidate(keys) {
  const qc = useQueryClient()
  return () => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
}

export function useCrearGasto() {
  const inval = useInvalidate(['gastos'])
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
