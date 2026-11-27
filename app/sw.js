// Service worker : application hors-ligne (EXG-12, ENF-05) et notification en arrière-plan (EXG-11).
import { createLogger } from './js/core/logs.js';
import { maybeNotify } from './js/core/notifier.js';
import { idbStore } from './js/core/store.js';

// ANO-03 : le workflow de publication remplace cette valeur par « version-commit » à chaque déploiement,
// ce qui installe un nouveau cache et livre la nouvelle version sur le téléphone.
const VERSION = 'v1.0.1';
const CACHE = `pluie-trajet-${VERSION}`;
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/theme-init.js',
  'js/core/address.js',
  'js/core/auth.js',
  'js/core/crypto.js',
  'js/core/forecast.js',
  'js/core/geo.js',
  'js/core/logs.js',
  'js/core/notifier.js',
  'js/core/rules.js',
  'js/core/service.js',
  'js/core/settings.js',
  'js/core/store.js',
  'js/core/weather.js',
  'js/ui/app.js',
  'js/ui/dom.js',
  'js/ui/notifications.js',
  'js/ui/screens/admin.js',
  'js/ui/screens/auth.js',
  'js/ui/screens/home.js',
  'js/ui/screens/prefs.js',
  'js/ui/screens/trip.js',
  'vendor/leaflet/leaflet.css',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' : on contourne le cache HTTP du navigateur pour ne jamais figer d'anciens fichiers.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pluie-trajet-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Fichiers de l'application : cache d'abord (ouverture instantanée et hors-ligne).
// Appels externes (météo, adresses, tuiles) : réseau direct, non mis en cache ici.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(
      (hit) =>
        hit ||
        fetch(event.request).catch(() =>
          event.request.mode === 'navigate' ? caches.match('index.html') : Response.error(),
        ),
    ),
  );
});

const store = idbStore();
const logger = createLogger(store);
const show = (title, options) => self.registration.showNotification(title, options);

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'verdict-quotidien') {
    event.waitUntil(maybeNotify({ store, logger, show }).catch((e) => logger.log('error', `Notification : ${e.message}`)));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const existing = list.find((c) => 'focus' in c);
      if (existing) return existing.focus();
      return self.clients.openWindow('./#/accueil');
    }),
  );
});
