// Configuración centralizada: TODO lo que viene de variables de entorno se lee
// acá y en ningún otro lado. El resto del código importa `config` y nunca toca
// process.env directamente. Así hay un único lugar donde mirar la configuración.

// Lista de modelos de IA en orden de preferencia, leída de IA_MODELOS.
// Formato: "proveedor:modelo" separados por coma. Ej:
//   IA_MODELOS=groq:llama-3.3-70b-versatile,gemini:gemini-2.5-flash
// Si la env está vacía, se usa este default.
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
  // Clave para firmar la cookie de sesión.
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-secret-cambiame-en-produccion',

  // true en Vercel (producción), false en local.
  isProduction: process.env.NODE_ENV === 'production',

  // Login con Google (Passport). Si faltan las credenciales, queda deshabilitado.
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    enabled: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  },

  // Base de datos Supabase. La service_role key es SOLO de servidor.
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    enabled: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
  },

  // IA para interpretar la voz. Las API keys son SOLO de servidor: el navegador
  // manda el texto a /api/interpretar y nunca ve las claves. El orden en que se
  // prueban los proveedores (Groq primero, Gemini de respaldo) está en ia.js.
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    enabled: Boolean(process.env.GROQ_API_KEY),
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    enabled: Boolean(process.env.GEMINI_API_KEY),
  },

  // Orden de modelos a probar (con fallback). Editable desde IA_MODELOS.
  iaModelos: parsearModelos(process.env.IA_MODELOS),

  // Acceso: lista blanca de emails (separados por coma). Si está vacía, se usa
  // la lista por defecto de la familia (ver config/acceso.js).
  allowedEmails: process.env.ALLOWED_EMAILS ?? '',
}
