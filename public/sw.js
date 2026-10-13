// Service worker: cachea SOLO imágenes/íconos y el manifest (rara vez cambian).
// El CSS, el JS, las páginas y la API van SIEMPRE a la red, así nunca ves una
// versión vieja del estilo o del código mientras seguimos iterando el diseño,
// y nunca se mezclan datos entre usuarios.

const CACHE = 'gastos-static-v3'
const ASSETS = [
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

// Al activar: borramos caches viejas (incluida la v1 que cacheaba el CSS).
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  )
  self.clients.claim()
})

// Al pedir algo: solo intervenimos en imágenes/íconos GET del mismo origen.
// CSS, JS, páginas, login, formularios y API: red directa (siempre frescos).
self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)

  const esEstatico =
    req.method === 'GET' &&
    url.origin === self.location.origin &&
    /\.(png|webmanifest|ico|svg|jpg|jpeg|gif|woff2?)$/.test(url.pathname)

  if (!esEstatico) return // ← CSS/JS/páginas/API: red directa, sin caché

  // Imagen/ícono: primero caché (rápido), si no está, red y lo guardamos.
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

// Push de Mercado Pago: muestra el aviso y, al tocarlo, abre/enfoca la app en la URL
// del aviso (/inicio?mp=<id> abre la hoja de ese pago; ?mp=lista, la tarjeta).
self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { title: 'Gastos', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'Gastos', {
      body: d.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: d.tag || 'mp',
      renotify: true,
      data: { url: d.url || '/inicio' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/inicio', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((w) => new URL(w.url).origin === self.location.origin)
      if (!abierta) return self.clients.openWindow(url)
      // navigate() falla en ventanas que este SW no controla: ahí abrimos una nueva.
      return abierta
        .navigate(url)
        .then((w) => (w || abierta).focus())
        .catch(() => self.clients.openWindow(url))
    })
  )
})
