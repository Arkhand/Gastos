'use client'
import Link from 'next/link'
import AppShell from '../../../../components/AppShell.jsx'
import { useEstadoIA } from '../../../../lib/api.js'

// Configuración → Estado de la IA de voz. Lista cada modelo configurado EN EL
// ORDEN en que se consumen (failover), si su API key funciona y, donde el
// proveedor lo expone (Groq), cuánta cuota queda. Gemini no informa cuota: solo
// se puede saber si responde. Cada visita pingea los modelos (botón Actualizar
// para refrescar a mano).

// Etiqueta legible del proveedor.
function proveedorLabel(p) {
  if (p === 'groq') return 'Groq'
  if (p === 'gemini') return 'Gemini'
  return p
}

// Texto de cuota de Groq: "quedan X de Y". Devuelve null si no hay datos.
function textoCuota(par) {
  if (!par || par.restantes == null || par.total == null) return null
  return `${par.restantes.toLocaleString('es-AR')} de ${par.total.toLocaleString('es-AR')}`
}

function ModeloCard({ m }) {
  const cuota = m.cuota
  return (
    <section className="cfg-card">
      <div className="ia-row">
        <span className="ia-orden">{m.orden}</span>
        <div className="ia-info">
          <div className="cfg-card-title ia-nombre">
            {proveedorLabel(m.provider)} · {m.model}
          </div>
          {m.ok ? (
            <span className="ia-badge ia-badge-ok">✓ Funciona</span>
          ) : (
            <span className="ia-badge ia-badge-err">✗ No responde</span>
          )}
        </div>
      </div>

      {/* Cuota: solo Groq la expone. */}
      {m.ok && m.provider === 'groq' && cuota && (
        <ul className="ia-cuota">
          {textoCuota(cuota.requests) && (
            <li>
              Mensajes restantes (por día): <strong>{textoCuota(cuota.requests)}</strong>
              {cuota.resetRequests ? <span className="ia-reset"> · se repone en {cuota.resetRequests}</span> : null}
            </li>
          )}
          {textoCuota(cuota.tokens) && (
            <li>
              Tokens restantes (por minuto): <strong>{textoCuota(cuota.tokens)}</strong>
              {cuota.resetTokens ? <span className="ia-reset"> · se repone en {cuota.resetTokens}</span> : null}
            </li>
          )}
        </ul>
      )}

      {/* Gemini: la API no informa cuántos mensajes quedan. */}
      {m.ok && m.provider === 'gemini' && (
        <p className="ia-nota">Google no informa la cuota restante por API; podés verla en su consola.</p>
      )}

      {/* Falla: mostramos el motivo (HTTP 401 key inválida, 429 sin cuota, etc.). */}
      {!m.ok && m.error && <p className="ia-error">{m.error}</p>}
    </section>
  )
}

export default function ConfigIAPage() {
  const { data, isLoading, isFetching, isError, refetch } = useEstadoIA()
  const modelos = data?.modelos ?? []

  return (
    <AppShell pageClass="page-config">
      <div className="config">
        <Link className="cfg-back" href="/config">‹ Configuración</Link>
        <h1>Estado de la IA</h1>

        <p className="cfg-intro">
          La voz prueba estos modelos en orden hasta que uno responde. Acá ves si la API key de cada uno
          funciona y, cuando el proveedor lo informa (Groq), cuántos mensajes quedan.
        </p>

        <button
          type="button"
          className="btn-save cfg-add-btn ia-refresh"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? 'Comprobando…' : 'Actualizar'}
        </button>

        {isLoading ? (
          <div className="recent-empty">Comprobando modelos…</div>
        ) : isError ? (
          <div className="cfg-alert cfg-alert-err">No pude consultar el estado de la IA.</div>
        ) : data && data.enabled === false ? (
          <div className="cfg-alert cfg-alert-err">
            La IA no está configurada (faltan las API keys de Groq y Gemini).
          </div>
        ) : modelos.length === 0 ? (
          <div className="recent-empty">No hay modelos configurados.</div>
        ) : (
          modelos.map((m) => <ModeloCard key={`${m.provider}:${m.model}`} m={m} />)
        )}
      </div>
    </AppShell>
  )
}
