/* Caderno no iPhone: garda a app no teléfono para que abra sen conexión.
   fabricar_movil.py substitúe VERSION e FICHEIROS ao fabricar. Google (Drive) nunca se garda aquí. */
'use strict';
const VERSION = "1.5.0-736b00e3e44d";
const FICHEIROS = ["./", "index.html", "config.js", "caderno.zip", "app.js", "app.css", "favicon.svg", "ponte.js", "traballador.js", "movil.css", "manifest.webmanifest", "icona-180.png", "icona-192.png", "icona-512.png", "pyodide/cffi-2.0.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl", "pyodide/cryptography-47.0.0-cp314-abi3-pyemscripten_2026_0_wasm32.whl", "pyodide/pycparser-3.0-py3-none-any.whl", "pyodide/pyodide-lock.json", "pyodide/pyodide.asm.mjs", "pyodide/pyodide.asm.wasm", "pyodide/pyodide.mjs", "pyodide/python_stdlib.zip", "pyodide/six-1.17.0-py2.py3-none-any.whl"];
const CACHE = 'caderno-' + VERSION;

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHEIROS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('caderno-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // A páxina abre sempre desde o gardado, aínda que o enderezo leve ?code=… (volta de Google).
  const peticion = ev.request.mode === 'navigate' ? new Request(new URL('./', self.location.href)) : ev.request;
  ev.respondWith(caches.open(CACHE).then(c => c.match(peticion, { ignoreSearch: true })
    .then(r => r || fetch(ev.request))));
});
