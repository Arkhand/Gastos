// Configuración centralizada: TODO lo que viene de variables de entorno se lee
// acá. El resto del código importa `config` y nunca toca process.env directamente.
// (Portado desde src/config/env.js — en Next las env vars se leen igual de process.env.)

const IA_MODELOS_DEFAULT =
  'groq:llama-3.3-70b-versatile,gemini:gemini-2.5-flash,gemini:gemini-3.1-flash-lite,gemini:gemini-2.5-flash-lite'

function parsearModelos(raw) {
  return (raw || IA_MODELOS_DEFAULT)
    .split(',')
    .map((par) => par.trim())
    .filter(Boolean)
    .map((par) => {
      const [provider, ...resto] = par.split(':')
      return { provider: provider.trim(), model: resto.join(':').trim() }
    })
    .filter((m) => m.provider && m.model)
}

export const config = {
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret-cambiame-en-produccion',
  isProduction: process.env.NODE_ENV === 'production',

  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    enabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY,
    enabled: Boolean(process.env.GROQ_API_KEY),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    enabled: Boolean(process.env.GEMINI_API_KEY),
  },

  // Mercado Pago. MP_TOKEN_KEY cifra los tokens de cada persona en la DB; client
  // id/secret son de la app de MP (botón "Conectar con Mercado Pago"); CRON_SECRET
  // autentica al cron que llama a /api/mp/sync.
  mp: {
    clientId: process.env.MP_CLIENT_ID,
    clientSecret: process.env.MP_CLIENT_SECRET,
    tokenKey: process.env.MP_TOKEN_KEY,
    cronSecret: process.env.CRON_SECRET,
    enabled: Boolean(process.env.MP_TOKEN_KEY),
    oauthEnabled: Boolean(process.env.MP_CLIENT_ID && process.env.MP_CLIENT_SECRET),
  },

  // Push (Web Push con VAPID) para avisar pendientes de Mercado Pago al celular.
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY?.trim(),
    privateKey: process.env.VAPID_PRIVATE_KEY?.trim(),
    subject: process.env.VAPID_SUBJECT?.trim() || 'mailto:musiald@gmail.com',
    enabled: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
  },

  iaModelos: parsearModelos(process.env.IA_MODELOS),
  allowedEmails: process.env.ALLOWED_EMAILS ?? '',
}
