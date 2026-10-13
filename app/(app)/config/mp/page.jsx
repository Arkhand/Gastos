'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import AppShell from '../../../../components/AppShell.jsx'
import LoadingDots from '../../../../components/LoadingDots.jsx'
import { useToast } from '../../../../components/Toasts.jsx'
import { useMpCuenta, useConectarMpToken, useDesconectarMp } from '../../../../lib/api.js'

const ERRORES = {
  autorizacion: 'Mercado Pago no confirmó la autorización. Probá de nuevo.',
  canje: 'No se pudo completar la conexión con Mercado Pago.',
  'cuenta-ajena': 'Esa cuenta de Mercado Pago ya está conectada por otra persona.',
  'oauth-no-disponible': 'La conexión con el botón no está configurada; pegá un Access Token.',
}

const fmtFecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// Configuración → Mercado Pago. Cada persona conecta SU cuenta: con el botón
// (OAuth) o pegando un Access Token. El token nunca vuelve al navegador.
export default function ConfigMpPage() {
  const { data, isLoading } = useMpCuenta()
  const conectar = useConectarMpToken()
  const desconectar = useDesconectarMp()
  const toast = useToast()
  const [token, setToken] = useState('')

  // Resultado del OAuth (?ok=1 / ?error=...). Sin useSearchParams para no exigir Suspense.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('ok')) toast('success', 'Mercado Pago conectado ✓')
    const e = q.get('error')
    if (e) toast('error', ERRORES[e] || 'No se pudo conectar')
    if (q.toString()) window.history.replaceState(null, '', '/config/mp')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function onPegar(e) {
    e.preventDefault()
    try {
      const r = await conectar.mutateAsync(token)
      setToken('')
      toast('success', `Conectado como ${r.mp_nickname} ✓`)
    } catch (err) {
      toast('error', err.message || 'No se pudo conectar')
    }
  }

  async function onDesconectar() {
    if (!confirm('¿Desconectar Mercado Pago? Dejás de ver los pendientes nuevos.')) return
    try {
      await desconectar.mutateAsync()
      toast('success', 'Mercado Pago desconectado')
    } catch (err) {
      toast('error', err.message || 'No se pudo desconectar')
    }
  }

  const cuenta = data?.cuenta
  const sync = data?.sync

  return (
    <AppShell pageClass="page-config">
      <div className="config">
        <Link className="cfg-back" href="/config">‹ Configuración</Link>
        <h1>Mercado Pago</h1>
        <p className="cfg-intro">La app revisa tus pagos y transferencias de Mercado Pago y te muestra los que todavía no cargaste.</p>

        {isLoading ? (
          <LoadingDots label="Cargando…" />
        ) : !data?.habilitado ? (
          <section className="cfg-card"><p className="ia-error">Mercado Pago no está configurado en el servidor.</p></section>
        ) : cuenta ? (
          <section className="cfg-card">
            <div className="cfg-card-title">Conectado como {cuenta.mp_nickname || 'tu cuenta'}</div>
            <ul className="mp-cfg-datos">
              <li>Desde {fmtFecha(cuenta.conectado_at)} · {cuenta.metodo === 'oauth' ? 'con Mercado Pago' : 'con Access Token'}</li>
              <li>Última revisión de pagos: {fmtFecha(sync?.payments_sync_at)}</li>
              <li>Última revisión de transferencias: {fmtFecha(sync?.report_downloaded_at)}</li>
            </ul>
            {cuenta.necesita_reconectar && <p className="ia-error">Hay que volver a conectar la cuenta.</p>}
            {sync?.last_error && <p className="ia-error">Último error ({fmtFecha(sync.last_error_at)}): {sync.last_error}</p>}
            <div className="mp-cfg-acciones">
              {cuenta.necesita_reconectar && data.oauthDisponible && (
                <a className="btn-save" href="/api/mp/conectar">Reconectar</a>
              )}
              <button type="button" className="btn-ghost" onClick={onDesconectar} disabled={desconectar.isPending}>
                Desconectar
              </button>
            </div>
          </section>
        ) : (
          <section className="cfg-card">
            {data.oauthDisponible && (
              <a className="btn-save mp-cfg-conectar" href="/api/mp/conectar">Conectar con Mercado Pago</a>
            )}
            <form className="mp-cfg-token" onSubmit={onPegar}>
              <label htmlFor="mp-token">{data.oauthDisponible ? 'O pegá un Access Token de producción' : 'Pegá un Access Token de producción'}</label>
              <input
                id="mp-token"
                className="inp"
                type="password"
                autoComplete="off"
                placeholder="APP_USR-…"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              <button type="submit" className="btn-ghost" disabled={!token.trim() || conectar.isPending}>Guardar</button>
            </form>
          </section>
        )}
      </div>
    </AppShell>
  )
}
