// Configuración centralizada: TODO lo que viene de variables de entorno se lee
// acá y en ningún otro lado. El resto del código importa `config` y nunca toca
// process.env directamente. Así hay un único lugar donde mirar la configuración.

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
}
