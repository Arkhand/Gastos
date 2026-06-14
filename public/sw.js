// Service worker: cachea SOLO archivos estáticos (CSS, íconos, manifest).
// Las páginas con sesión y cualquier cosa con datos van SIEMPRE a la red,
// así nunca se mezclan datos entre usuarios ni se muestra info vieja.

const CACHE = 'gastos-static-v1'
const ASSETS = [
  '/style.css',
  '/logo.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-512-maskable.png',
  '/manifest.webmanifest',
]

// Al instalar: precargamos los estáticos.
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)))
  self.skipWaiting()
})

// Al activar: borramos caches viejas de versiones anteriores.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

// Al pedir algo: solo intervenimos en estáticos GET del mismo origen.
// Todo lo demás (páginas, login, formularios) lo dejamos pasar a la red.
self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  const esEstatico =
    req.method === 'GET' &&
    url.origin === self.location.origin &&
    /\.(css|png|webmanifest|ico|svg|jpg|jpeg|gif|woff2?)$/.test(url.pathname)

  if (!esEstatico) return // ← páginas y API: red directa, sin caché

  // Estático: primero caché (rápido), si no está, red y lo guardamos.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copia = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copia))
          return res
        })
    )
  )
})
