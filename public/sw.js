const cacheName = `fogon-shell-${new URL(self.location.href).searchParams.get('build') || '1'}`
const assets = ['/manifest.webmanifest', '/img/icon-192.png', '/img/icon-512.png']
// Los videos y las 60 fotos de la carta no se guardan de antemano (pesan); sí
// los pósteres de los videos cuando existen, para que la portada se vea aunque
// el servidor se apague. Si faltan, el service worker se instala igual.
const optional = [1, 2, 3, 4].map(number => `/video/central-video-${number}.jpg`)

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName)
    const home = await fetch('/', { cache: 'reload' })
    if (!home.ok) throw new Error('No se pudo preparar la aplicación.')
    const markup = await home.clone().text()
    const bundles = [...markup.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map(match => match[1])
    await cache.addAll([...assets, ...bundles])
    await Promise.allSettled(optional.map(path => cache.add(path)))
    await cache.put('/', home)
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const obsolete = (await caches.keys()).filter(name => name.startsWith('fogon-shell-') && name !== cacheName)
    await Promise.all(obsolete.map(name => caches.delete(name)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')))
  } else if (url.pathname.startsWith('/assets/') || assets.includes(url.pathname) || optional.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request)
      if (cached) return cached
      const response = await fetch(event.request)
      if (response.ok) {
        const cache = await caches.open(cacheName)
        await cache.put(event.request, response.clone())
      }
      return response
    })())
  }
})
