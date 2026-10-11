/* Pulshift service worker – Web Push only (no offline caching yet). */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

/** Resolves app paths ('/schedule') against the scope, so sub-path deployments work. */
const appUrl = (path) => new URL(String(path).replace(/^\//, ''), self.registration.scope).href

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Pulshift', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Pulshift'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: appUrl('/favicon.svg'),
      badge: appUrl('/favicon.svg'),
      tag: data.tag,
      data: { url: data.url || '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = appUrl((event.notification.data && event.notification.data.url) || '/')
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
