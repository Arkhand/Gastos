'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import AppShell from '../../../../components/AppShell.jsx'
import LoadingDots from '../../../../components/LoadingDots.jsx'
import { useToast } from '../../../../components/Toasts.jsx'
import {
  useMpCuenta,
  useDesconectarMp,
  usePushEstado,
  activarPush,
  desactivarPush,
  probarPush,
} from '../../../../lib/api.js'

const ERRORES = {
  autorizacion: 'Mercado Pago no confirmó la autorización. Probá de nuevo.',
  canje: 'No se pudo completar la conexión con Mercado Pago.',
  'cuenta-ajena': 'Esa cuenta de Mercado Pago ya está conectada por otra persona.',
  'oauth-no-disponible': 'La conexión con Mercado Pago no está configurada en el servidor.',
}

const fmtFecha = (iso) =>
  iso ? new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// Configuración → Mercado Pago. Cada persona conecta SU cuenta con el botón
// (OAuth contra la app de MP de la familia). El token nunca vuelve al navegador.
export default function ConfigMpPage() {
  const { data, isLoading } = useMpCuenta()
  const desconectar = useDesconectarMp()
  const toast = useToast()

  // Resultado del OAuth (?ok=1 / ?error=...). Sin useSearchParams para no exigir Suspense.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('ok')) toast('success', 'Mercado Pago conectado ✓')
    const e = q.get('error')
    if (e) toast('error', ERRORES[e] || 'No se pudo conectar')
    if (q.toString()) window.history.replaceState(null, '', '/config/mp')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  // Cuentas conectadas antes pegando un token: se pasan a OAuth con el mismo botón.
  const reconectar = cuenta && (cuenta.necesita_reconectar || cuenta.metodo !== 'oauth')

  return (
    <AppShell pageClass="page-config">
      <div className="config">
        <Link className="cfg-back" href="/config">‹ Configuración</Link>
        <h1>Mercado Pago</h1>
        <p className="cfg-intro">La app revisa tus pagos y transferencias de Mercado Pago y te muestra los que todavía no cargaste.</p>

        {isLoading ? (
          <LoadingDots label="Cargando…" />
        ) : !data?.habilitado || !data?.oauthDisponible ? (
          <section className="cfg-card"><p className="ia-error">{ERRORES['oauth-no-disponible']}</p></section>
        ) : cuenta ? (
          <section className="cfg-card">
            <div className="cfg-card-title">Conectado como {cuenta.mp_nickname || 'tu cuenta'}</div>
            <ul className="mp-cfg-datos">
              <li>Desde {fmtFecha(cuenta.conectado_at)}</li>
              <li>Última revisión de pagos: {fmtFecha(sync?.payments_sync_at)}</li>
              <li>Última revisión de transferencias: {fmtFecha(sync?.report_downloaded_at)}</li>
            </ul>
            {cuenta.necesita_reconectar && <p className="ia-error">Hay que volver a conectar la cuenta.</p>}
            {!cuenta.necesita_reconectar && cuenta.metodo !== 'oauth' && (
              <p className="ia-nota">Conectada con un Access Token. Reconectala con el botón para que se renueve sola.</p>
            )}
            {sync?.last_error && <p className="ia-error">Último error ({fmtFecha(sync.last_error_at)}): {sync.last_error}</p>}
            <div className="mp-cfg-acciones">
              {reconectar && <a className="btn-save" href="/api/mp/conectar">Reconectar</a>}
              <button type="button" className="btn-ghost" onClick={onDesconectar} disabled={desconectar.isPending}>
                Desconectar
              </button>
            </div>
            <AvisosCelular />
          </section>
        ) : (
          <section className="cfg-card">
            <a className="btn-save mp-cfg-conectar" href="/api/mp/conectar">Conectar con Mercado Pago</a>
          </section>
        )}
      </div>
    </AppShell>
  )
}

// Avisos push en ESTE dispositivo (cada celular se activa por separado).
function AvisosCelular() {
  const { data: p, isLoading } = usePushEstado()
  const qc = useQueryClient()
  const toast = useToast()
  const [ocupado, setOcupado] = useState(false)
  if (isLoading || !p?.habilitado) return null

  async function correr(fn, ok) {
    setOcupado(true)
    try {
      await fn()
      if (ok) toast('success', ok)
    } catch (e) {
      toast('error', e.message || 'No se pudo')
    } finally {
      setOcupado(false)
      qc.invalidateQueries({ queryKey: ['mp-push'] })
    }
  }

  return (
    <div className="mp-cfg-push">
      <div className="mp-cfg-push-title">Avisos en este celular</div>
      {!p.soportado ? (
        <p className="ia-nota">Este navegador no soporta avisos. Abrí la app instalada en el celular.</p>
      ) : p.permiso === 'denied' ? (
        <p className="ia-error">Las notificaciones están bloqueadas para esta app. Habilitalas en Ajustes → Apps → Gastos → Notificaciones.</p>
      ) : p.activo ? (
        <div className="mp-cfg-acciones">
          <button type="button" className="btn-save" disabled={ocupado} onClick={() => correr(probarPush, 'Aviso de prueba enviado')}>
            Probar aviso
          </button>
          <button type="button" className="btn-ghost" disabled={ocupado} onClick={() => correr(desactivarPush, 'Avisos desactivados en este celular')}>
            Desactivar
          </button>
        </div>
      ) : (
        <button type="button" className="btn-save" disabled={ocupado} onClick={() => correr(() => activarPush(p.publicKey), 'Avisos activados ✓')}>
          Avisarme cuando pague con Mercado Pago
        </button>
      )}
      {p.dispositivos > 0 && <p className="ia-nota">Dispositivos con avisos: {p.dispositivos}</p>}
    </div>
  )
}
