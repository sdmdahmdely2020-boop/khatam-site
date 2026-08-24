// Service worker de Khatam.
// Rôle : permettre l'installation de l'app (icône sur l'écran d'accueil, ouverture
// sans barre d'adresse) et un minimum de mise en cache de la coquille de l'app
// (HTML/police/icônes) pour un démarrage plus rapide.
//
// IMPORTANT : tout ce qui touche à l'argent, aux comptes ou aux documents passe par
// l'API du backend (khatam-backend-i6zn.onrender.com) et n'est JAMAIS mis en cache —
// ces requêtes vont toujours directement au réseau, jamais au cache. Un ancien solde
// de portefeuille ou un ancien statut de paiement servi depuis un cache serait dangereux.

const SW_VERSION = 'khatam-v1';
const APP_SHELL_CACHE = `khatam-shell-${SW_VERSION}`;
const API_HOST = 'khatam-backend-i6zn.onrender.com';

const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      // addAll échouerait entièrement si un seul fichier manque (ex: police externe) —
      // on ajoute donc chaque fichier individuellement et on ignore les échecs isolés.
      Promise.all(
        APP_SHELL_FILES.map((url) =>
          cache.add(url).catch((err) => console.warn('[sw] échec mise en cache', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('khatam-shell-') && name !== APP_SHELL_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return; // ne jamais intercepter POST/PATCH/DELETE (paiements, uploads, etc.)

  let url;
  try { url = new URL(request.url); } catch { return; }

  // Jamais de cache pour l'API backend (données dynamiques : solde, statut paiement, documents).
  if (url.hostname === API_HOST) return;

  // Jamais de cache pour les PDF servis par le visualiseur sécurisé (filigrane par utilisateur,
  // lien à usage limité) ni pour les images d'annonces, qui changent régulièrement.
  if (url.pathname.startsWith('/uploads/')) return;

  // Documents Google (police, AdSense) : laissés au réseau/cache du navigateur normal.
  if (url.hostname !== self.location.hostname) return;

  // Coquille de l'app (HTML, manifest, icônes) : "stale-while-revalidate" — répond vite
  // depuis le cache si présent, puis rafraîchit le cache en arrière-plan.
  event.respondWith(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);
      return cached || (await network) || new Response('Hors ligne.', { status: 503, statusText: 'Offline' });
    })
  );
});
