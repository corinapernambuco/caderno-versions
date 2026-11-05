/* Caderno no iPhone: Web Worker que executa o código Python do caderno con Pyodide.
   Os datos (/datos) gárdanse no propio iPhone (IndexedDB). Atende as peticións dunha en unha. */
import { loadPyodide } from './pyodide/pyodide.mjs';

function gardaNoIphone(py) {
  return new Promise((ok, ko) => py.FS.syncfs(false, e => (e ? ko(e) : ok())));
}

const listo = (async () => {
  const py = await loadPyodide({ indexURL: new URL('pyodide/', self.location.href).href });
  await py.loadPackage('cryptography', { messageCallback: () => {} });
  py.FS.mkdirTree('/datos');
  py.FS.mount(py.FS.filesystems.IDBFS, {}, '/datos');
  await new Promise((ok, ko) => py.FS.syncfs(true, e => (e ? ko(e) : ok())));
  const zip = await (await fetch('caderno.zip')).arrayBuffer();
  py.unpackArchive(zip, 'zip', { extractDir: '/codigo' });
  py.runPython("import sys; sys.path.insert(0, '/codigo')");
  const app = py.pyimport('caderno.movil').Movil();
  await gardaNoIphone(py);
  return { py, app };
})();

async function atende({ id, metodo, url, corpo, token, urls }) {
  let py, app;
  try {
    ({ py, app } = await listo);
  } catch (e) {
    postMessage({ id, status: 0, datos: { erro: 'Non se puido abrir o caderno neste iPhone. Pecha a app e ábrea de novo.' } });
    return;
  }
  let r;
  try {
    r = JSON.parse(app.chama(metodo, url, JSON.stringify(corpo ?? null), token ?? null, urls ? JSON.stringify(urls) : null));
  } catch (e) {
    r = { status: 500, datos: { erro: 'Erro interno.' } };
  }
  if (r.cambiou) {
    try { await gardaNoIphone(py); } catch (e) { r = { status: 500, datos: { erro: 'Non se puido gardar no iPhone.' } }; }
  }
  postMessage({ id, ...r });
}

let cola = Promise.resolve();
self.onmessage = ev => { cola = cola.then(() => atende(ev.data)); };
