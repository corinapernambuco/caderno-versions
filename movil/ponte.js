/* Caderno no iPhone: ponte entre a interface (app.js) e o Worker con Python, permiso de Google
   e cando sincronizar con Drive. app.js usa window.CadernoPonte.api() en vez de fetch(). */
'use strict';
(function () {
  const CFG = window.CADERNO_CONFIG || {};
  const GOOGLE = {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    revoke: 'https://oauth2.googleapis.com/revoke',
    ...(CFG.googleUrls || {}), // só nas probas: un Google simulado
  };
  const PERMISO = 'https://www.googleapis.com/auth/drive.file';
  const CHAVE_GOOGLE = 'caderno-google';
  const CHAVE_PENDENTE = 'caderno-google-pendente';
  const SEGUNDOS_TRAS_CAMBIO = 8;

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sen almacenamento */ } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* sen almacenamento */ } }

  // --- Worker ------------------------------------------------------------------------
  const traballador = new Worker('traballador.js', { type: 'module' });
  const agardando = new Map();
  let seguinte = 1;
  traballador.onmessage = ev => {
    const p = agardando.get(ev.data.id);
    if (p) { agardando.delete(ev.data.id); p(ev.data); }
  };
  function chama(metodo, url, corpo, token) {
    return new Promise(resolve => {
      const id = seguinte++;
      agardando.set(id, resolve);
      traballador.postMessage({ id, metodo, url, corpo, token, urls: CFG.googleUrls || null });
    });
  }

  async function api(metodo, url, corpo) {
    const precisaToken = url.startsWith('/api/sincronizar');
    const token = precisaToken ? await tokenOuNada() : null;
    const r = await chama(metodo, url, corpo, token);
    if (r.status !== 200) throw new Error((r.datos && r.datos.erro) || 'Erro ' + r.status);
    if (r.cambiou && metodo !== 'GET' && !url.startsWith('/api/sincronizar') && !url.startsWith('/api/movil')) {
      programaSincronizacion(SEGUNDOS_TRAS_CAMBIO * 1000);
    }
    return r.descarga ? r : r.datos;
  }

  // --- permiso de Google (OAuth con PKCE; o refresh token queda só neste iPhone) -------------
  function aleatorio(bytes) {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return b64url(a);
  }
  function b64url(bytes) {
    return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function redireccion() { return location.origin + location.pathname; }
  function configurado() { return !!(CFG.googleClientId && CFG.googleClientSecret); }

  async function conectaGoogle() {
    if (!configurado()) throw new Error('Esta versión non ten configurado Google.');
    const verificador = aleatorio(48);
    const estado = aleatorio(24);
    const reto = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
    lsSet(CHAVE_PENDENTE, { verificador, estado });
    location.href = GOOGLE.auth + '?' + new URLSearchParams({
      client_id: CFG.googleClientId, redirect_uri: redireccion(), response_type: 'code', scope: PERMISO,
      state: estado, code_challenge: reto, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent',
    });
  }

  async function pideToken(campos) {
    let r;
    try {
      r = await fetch(GOOGLE.token, { method: 'POST', body: new URLSearchParams(campos) });
    } catch (e) {
      const erro = new Error('Sen conexión con Google.');
      erro.senConexion = true;
      throw erro;
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Google non deu permiso' + (d.error ? ` (${d.error})` : '') + '.');
    return d;
  }

  // Ao volver de Google (?code=…&state=…): pide o permiso permanente e limpa o enderezo.
  async function completaVolta() {
    const q = new URLSearchParams(location.search);
    if (!q.has('state')) return null;
    const pendente = lsGet(CHAVE_PENDENTE);
    lsDel(CHAVE_PENDENTE);
    history.replaceState(null, '', redireccion() + location.hash);
    if (q.get('error')) return 'Cancelouse a conexión con Google.';
    if (!pendente || pendente.estado !== q.get('state') || !q.get('code')) return 'A conexión con Google non é válida: téntao de novo.';
    try {
      const d = await pideToken({
        code: q.get('code'), client_id: CFG.googleClientId, client_secret: CFG.googleClientSecret,
        redirect_uri: redireccion(), grant_type: 'authorization_code', code_verifier: pendente.verificador,
      });
      if (!d.refresh_token) return 'Google non deu permiso permanente: téntao de novo.';
      lsSet(CHAVE_GOOGLE, { refresh: d.refresh_token, acceso: d.access_token, caduca: Date.now() + (d.expires_in - 60) * 1000 });
      await chama('POST', '/api/movil/google', { conectado: true });
      return 'ok';
    } catch (e) {
      return e.message;
    }
  }

  async function token() {
    const g = lsGet(CHAVE_GOOGLE);
    if (!g) return null;
    if (g.acceso && Date.now() < g.caduca) return g.acceso;
    let d;
    try {
      d = await pideToken({ refresh_token: g.refresh, client_id: CFG.googleClientId,
        client_secret: CFG.googleClientSecret, grant_type: 'refresh_token' });
    } catch (e) {
      if (!e.senConexion) {
        // Google retirou o permiso: hai que conectar de novo.
        lsDel(CHAVE_GOOGLE);
        await chama('POST', '/api/movil/google', { conectado: false });
      }
      throw e;
    }
    lsSet(CHAVE_GOOGLE, { ...g, acceso: d.access_token, caduca: Date.now() + (d.expires_in - 60) * 1000 });
    return d.access_token;
  }
  async function tokenOuNada() { try { return await token(); } catch (e) { return null; } }

  async function desconectaGoogle() {
    const g = lsGet(CHAVE_GOOGLE);
    lsDel(CHAVE_GOOGLE);
    await chama('POST', '/api/movil/google', { conectado: false });
    if (g) fetch(GOOGLE.revoke, { method: 'POST', body: new URLSearchParams({ token: g.refresh }) }).catch(() => {});
  }

  // Deixa o iPhone como recén instalado (os datos do Mac e as copias de Drive non se tocan).
  async function borraTodo() {
    await desconectaGoogle();
    const r = await chama('POST', '/api/movil/borrar', { confirmar: true });
    if (r.status !== 200) throw new Error((r.datos && r.datos.erro) || 'Non se puido borrar.');
    [CHAVE_GOOGLE, CHAVE_PENDENTE].forEach(lsDel);
    try { localStorage.clear(); } catch (e) { /* sen almacenamento */ }
    location.replace(redireccion());
  }

  // --- sincronización -------------------------------------------------------------------
  let temporizador = null;
  let enCurso = null;
  function programaSincronizacion(ms) {
    clearTimeout(temporizador);
    temporizador = setTimeout(sincroniza, ms);
  }
  function sincroniza() {
    clearTimeout(temporizador);
    if (enCurso) return enCurso;
    enCurso = (async () => {
      try {
        if (!lsGet(CHAVE_GOOGLE) || !navigator.onLine) return null;
        const r = await api('POST', '/api/sincronizar');
        window.dispatchEvent(new CustomEvent('caderno-sincronizado', { detail: r }));
        return r;
      } catch (e) {
        return null;
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  }

  // Ao abrir ou volver á app trae os cambios do Mac; ao saír, sobe os deste iPhone.
  document.addEventListener('visibilitychange', () => sincroniza());
  window.addEventListener('online', () => sincroniza());
  setInterval(() => { if (!document.hidden) sincroniza(); }, 5 * 60 * 1000);

  async function descarga(ruta) {
    const r = await api('GET', ruta);
    if (!r.descarga) throw new Error('Non se puido preparar o ficheiro.');
    const bytes = Uint8Array.from(atob(r.descarga.base64), c => c.charCodeAt(0));
    const ficheiro = new File([bytes], r.descarga.nome, { type: r.descarga.mime });
    if (navigator.canShare && navigator.canShare({ files: [ficheiro] })) {
      try { await navigator.share({ files: [ficheiro] }); } catch (e) { /* cancelado */ }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(ficheiro);
    a.download = ficheiro.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  const volta = completaVolta();
  window.CadernoPonte = {
    api, descarga, conectaGoogle, desconectaGoogle, sincroniza, borraTodo,
    googleConfigurado: configurado,
    // Resultado da volta de Google (null se non se vén de alí); despois sincroniza.
    volta: volta.then(r => { sincroniza(); return r; }),
  };
})();
