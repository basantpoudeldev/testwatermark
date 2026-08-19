// Bump CACHE_NAME on every deploy — old caches are deleted automatically,
// so this is how you force returning visitors to pick up a fresh version.
const CACHE_NAME = 'proofmark-shell-v5';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './site-config.js',
  './app.js',
  './pdftools.js',
  './ga-loader.js',
  './consent.js',
  './vendor/jszip/jszip.min.js',
  './vendor/pdf-lib/pdf-lib.min.js',
  './vendor/pdf-lib/pdf-lib.esm.min.js',
  './vendor/pdf-encrypt-lite/pdf-encrypt-lite.umd.js',
  './vendor/pdf-decrypt/index.mjs',
  './vendor/pdf-decrypt/pdf-decrypt.mjs',
  './vendor/pdf-decrypt/crypto-rc4.mjs',
  './vendor/pdf-decrypt/crypto-aes.mjs',
  './vendor/pdf-decrypt/bridge.mjs',
  './vendor/pdfjs/pdf.min.js',
  './vendor/pdfjs/pdf.worker.min.js',
  // Deliberately NOT precached: vendor/ffmpeg/* and vendor/ffmpeg-core/*
  // (ffmpeg-core.wasm alone is ~24MB — precaching it here would make the
  // very first page load install slowly for everyone, even people who
  // never touch the Video tab. The runtime fetch handler below still
  // caches it lazily the first time it's actually requested.)
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Only intercept same-origin GET requests. Third-party CDN scripts
// (JSZip, pdf-lib, pdf.js, ffmpeg.wasm, GA/AdSense) are deliberately left
// alone — caching those here would mean a compromised or updated CDN
// response could get pinned in a visitor's browser indefinitely, surviving
// even after the source is fixed and redeployed.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).catch(() => cached);
    })
  );
});
