/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Durante la migración: el cliente de Supabase usa `ws` solo del lado server.
  // Next lo maneja bien en API routes; nada especial que configurar acá por ahora.
}

export default nextConfig
