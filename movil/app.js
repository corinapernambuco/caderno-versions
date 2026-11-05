/* Caderno — interface. Os cálculos fanse no servidor (caderno/calculo.py); aquí só se amosan. */
'use strict';
(function () {
  const NOMES_AV = { 1: '1ª Avaliación', 2: '2ª Avaliación', 3: '3ª Avaliación', final: 'Final' };
  const SECCIONS = [['notas', 'Notas'], ['alumnado', 'Alumnado'], ['probas', 'Probas'],
    ['estatisticas', 'Estatísticas'], ['axustes', 'Axustes']];
  const TIPOS = { nota: 'Nota', acertos: 'Acertos', faltas: 'Faltas' };
  // Reparto: Insuficiente en estado crítico; o resto, rampla ordinal dun só ton.
  const CORES_REPARTO = ['--crit', '--o1', '--o2', '--o3', '--o4'];

  const E = { clases: [], cursoActual: '', clase: null, seccion: null, vista: null, nav: 0, ultimaAv: '1' };
  let cola = Promise.resolve();

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const main = () => $('#main');

  // --- utilidades ---------------------------------------------------------------
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }
  function num(x, d) {
    if (x == null) return '—';
    const t = d == null ? String(Math.round(x * 100) / 100) : x.toFixed(d);
    return t.replace('.', ',');
  }
  function pct(n, total) { return total ? Math.round(n / total * 100) + ' %' : '—'; }
  function plural(n, s, p) { return n + ' ' + (n === 1 ? s : p); }
  function leNum(txt) {
    const t = String(txt ?? '').trim().replace(',', '.');
    if (t === '') return null;
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return NaN;
    return Number(t);
  }
  function chave(v) { return v == null ? '' : String(v); }
  function valorInput(v) { return v == null ? '' : num(v); }
  const MESES = ['xaneiro', 'febreiro', 'marzo', 'abril', 'maio', 'xuño', 'xullo', 'agosto', 'setembro', 'outubro', 'novembro', 'decembro'];
  function dataLonga(d) { return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`; }
  function dataCurta(iso) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sen almacenamento */ } }
  function sumaPesosOk(s) { return Math.abs(s - 100) < 1e-9; }

  async function api(metodo, url, corpo) {
    // No iPhone non hai servidor: o mesmo código Python corre no navegador (movil/ponte.js).
    if (window.CadernoPonte) return window.CadernoPonte.api(metodo, url, corpo);
    const opts = { method: metodo, headers: { Accept: 'application/json' } };
    if (corpo !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(corpo);
    }
    let r;
    try { r = await fetch(url, opts); } catch (e) { throw new Error('Non se puido conectar co servidor.'); }
    let datos = null;
    try { datos = await r.json(); } catch (e) { /* corpo baleiro */ }
    if (!r.ok) throw new Error((datos && datos.erro) || 'Erro ' + r.status);
    return datos;
  }

  function toast(msg, erro) {
    const caixa = $('#toast');
    while (caixa.children.length >= 2) caixa.firstChild.remove();
    const d = document.createElement('div');
    d.textContent = msg;
    if (erro) d.className = 'erro';
    caixa.appendChild(d);
    setTimeout(() => d.remove(), erro ? 5000 : 2500);
  }

  // --- navegación: #/{clase}/{sección}/{argumento}[/auto] ---------------------------
  function ruta() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { clase: p[0] ? Number(p[0]) : null, seccion: p[1] || 'notas', arg: p[2] || null, auto: p[3] === 'auto' };
  }
  function href(seccion, arg, claseId) {
    return '#/' + [claseId ?? E.clase.id, seccion, arg].filter(x => x != null).join('/');
  }
  function avValida(a) { return ['1', '2', '3', 'final'].includes(a) ? a : null; }
  function avNumerica() { return ['1', '2', '3'].includes(E.ultimaAv) ? Number(E.ultimaAv) : 1; }

  async function cargaClases() {
    const d = await api('GET', '/api/clases');
    E.clases = d.clases;
    E.cursoActual = d.curso_actual;
  }

  async function navega() {
    const t = ++E.nav;
    const r = ruta();
    document.body.classList.toggle('informe', r.seccion === 'informe');
    if (!E.clases.length) {
      E.clase = null;
      pintaCabeceira();
      return pintaBenvida();
    }
    const c = E.clases.find(x => x.id === r.clase);
    if (!c) {
      const gardada = E.clases.find(x => x.id === Number(lsGet('caderno.clase')));
      location.replace(href(r.clase ? 'notas' : r.seccion, r.clase ? null : r.arg, (gardada || E.clases[0]).id));
      return;
    }
    E.clase = c;
    E.seccion = r.seccion;
    lsSet('caderno.clase', c.id);
    pintaCabeceira();
    try {
      switch (r.seccion) {
        case 'notas': return await pintaNotas(r.arg, t);
        case 'alumnado': return await pintaAlumnado(t);
        case 'probas': return await pintaProbas(t);
        case 'estatisticas': return await pintaEstatisticas(r.arg, t);
        case 'axustes':
          await cargaSistema();
          if (t !== E.nav) return;
          return pintaAxustes();
        case 'informe': return await pintaInforme(r.arg, r.auto, t);
        default: location.replace(href('notas'));
      }
    } catch (e) {
      if (t === E.nav) pintaErro(e);
    }
  }

  function pintaErro(e) {
    main().innerHTML = `<section class="box baleiro"><h2>Non se puido cargar</h2><p>${esc(e.message)}</p>
      <button class="btn" type="button" id="b-reintentar">Tentar de novo</button></section>`;
    $('#b-reintentar').onclick = () => cargaClases().then(navega).catch(pintaErro);
  }

  function pintaCabeceira() {
    const c = E.clase;
    const sel = $('#sel-clase');
    sel.hidden = !c;
    $('#accions').hidden = !c;
    $('#curso').textContent = c ? 'Curso ' + c.curso : '';
    sel.innerHTML = E.clases.map(x =>
      `<option value="${x.id}" ${c && x.id === c.id ? 'selected' : ''}>${esc(x.nome)} · ${esc(x.materia)}</option>`).join('');
    const sec = E.seccion === 'informe' ? 'notas' : E.seccion;
    $('#nav-seccions').innerHTML = c ? SECCIONS.map(([k, l]) =>
      `<a href="${href(k, ['notas', 'estatisticas'].includes(k) ? E.ultimaAv : null)}" class="${k === sec ? 'on' : ''}" ${k === sec ? 'aria-current="page"' : ''}>${l}</a>`).join('') : '';
    $('#nav-clases').innerHTML = E.clases.map(x =>
      `<a href="${href(sec || 'notas', ['notas', 'estatisticas'].includes(sec) ? E.ultimaAv : null, x.id)}" class="${c && x.id === c.id ? 'on' : ''}">${esc(x.nome)}</a>`).join('');
  }

  function cabeceira(titulo, sub, dereita) {
    return `<div class="head"><div><h1>${titulo}</h1><p class="sub" id="sub">${sub}</p></div>${dereita || ''}</div>`;
  }

  function lapelas(seccion, actual) {
    return '<div class="tabs" role="tablist" aria-label="Avaliación">' + ['1', '2', '3', 'final'].map(k =>
      `<a role="tab" href="${href(seccion, k)}" aria-selected="${k === actual}">${NOMES_AV[k]}</a>`).join('') + '</div>';
  }

  function tarxetas(lista) {
    return lista.map(([k, v, s, cls]) =>
      `<div class="card"><div class="k">${k}</div><div class="v ${cls || ''}">${v}</div><div class="s">${s}</div></div>`).join('');
  }

  function chipFinal(r) {
    if (r == null) return '<span class="faint">—</span>';
    return `<span class="fin ${r < 5 ? 'bad' : r >= 9 ? 'top' : ''}">${r}</span>`;
  }

  function baleiro(titulo, texto, boton) {
    return `<section class="box baleiro"><h2>${titulo}</h2><p>${texto}</p>${boton || ''}</section>`;
  }

  // --- benvida ---------------------------------------------------------------------
  function pintaBenvida() {
    // No iPhone, o primeiro é traer os datos do Mac (se se crea antes unha clase, habería conflito).
    if (esMovil()) {
      main().innerHTML = cabeceira('Benvido/a ao Caderno', 'Este iPhone aínda non ten datos.') +
        `<div class="axustes">${seccionMovil(true)}
        <section class="box pad"><h2>Empezar sen o Mac</h2>
          <p class="muted" style="margin:0 0 12px">Só se non tes datos no Mac: crea aquí a primeira clase.</p>
          <button class="btn" type="button" id="b-primeira">+ Nova clase</button></section></div>`;
      $('#b-primeira').onclick = dialogoClase;
      escoitaAccions($('.axustes', main()));
      return;
    }
    main().innerHTML = cabeceira('Benvido/a ao Caderno', 'Aínda non hai ningunha clase.') +
      baleiro('Crea a túa primeira clase', 'Despois engade o alumnado e as probas de cada avaliación; o caderno calcula as notas.',
        '<button class="btn main" type="button" id="b-primeira">+ Nova clase</button>');
    $('#b-primeira').onclick = dialogoClase;
  }

  // --- notas -------------------------------------------------------------------------
  async function pintaNotas(arg, t) {
    const av = avValida(arg);
    if (!av) return location.replace(href('notas', E.ultimaAv));
    E.ultimaAv = av;
    pintaCabeceira();
    const url = av === 'final' ? `/api/clases/${E.clase.id}/final` : `/api/clases/${E.clase.id}/avaliacions/${av}`;
    const v = await api('GET', url);
    if (t !== E.nav) return;
    E.vista = v;
    if (av === 'final') pintaFinal(v); else pintaAvaliacion(v);
  }

  function metaProba(p) { return `${TIPOS[p.tipo].toLowerCase()} · ${num(p.peso)} %`; }
  function claseCela(cel) { return cel.estado === 'baixo' ? 'bad' : cel.estado === 'pendente' ? 'wait' : ''; }
  function subCela(p, cel) { return cel.valor != null && p.tipo !== 'nota' ? '→ ' + num(cel.nota, 1) : ''; }

  function subAvaliacion(v) {
    const pesos = sumaPesosOk(v.suma_pesos) ? `os pesos suman 100 %`
      : `<span class="aviso">⚠ os pesos suman ${num(v.suma_pesos)} % (deberían sumar 100 %)</span>`;
    return `${plural(v.filas.length, 'alumno', 'alumnos')} · ${plural(v.probas.length, 'proba', 'probas')} · ${pesos}`;
  }

  function tarxetasAvaliacion(v) {
    const r = v.resumo;
    return tarxetas([
      ['Media da clase', num(r.media, 2), 'sen redondear', ''],
      ['Aprobados', pct(r.aprobados, r.n), r.n ? `${r.aprobados} de ${plural(r.n, 'alumno', 'alumnos')}` : 'aínda sen notas', 'acc'],
      [`Probas por debaixo de ${num(v.clase.minimo_proba)}`, r.baixo, 'só aviso, fan media', 'bad'],
      ['Notas pendentes', r.pendentes, 'contan como 0 ata poñelas', 'wait'],
    ]);
  }

  function reparto(r) {
    return '<div class="bars">' + r.reparto.map((c, i) => {
      const w = r.n ? c.n / r.n * 100 : 0;
      return `<div class="bar" title="${c.nome}: ${c.n} (${pct(c.n, r.n)})"><span>${c.nome}</span>` +
        `<span class="track"><i style="width:${w}%;background:var(${CORES_REPARTO[i]})"></i></span><b>${c.n}</b></div>`;
    }).join('') + '</div>';
  }

  function corSerie(j) { return j < 8 ? `var(--s${j + 1})` : 'var(--s0)'; }

  function probasPesos(v) {
    const total = Math.max(100, v.suma_pesos);
    const pilla = v.probas.map((p, j) =>
      `<i style="width:${p.peso / total * 100}%;background:${corSerie(j)}" title="${esc(p.nome)}: ${num(p.peso)} %"></i>`).join('');
    const lista = v.probas.map((p, j) =>
      `<div class="pr"><span><i class="dot" style="background:${corSerie(j)}"></i>${esc(p.nome)} <span class="faint">${num(p.peso)} %</span></span><b>${num(p.media, 2)}</b></div>`).join('');
    return `<div class="stack" role="img" aria-label="Reparto dos pesos entre as probas">${pilla}</div>${lista}`;
  }

  function asideAvaliacion(v) {
    return `<section class="box"><h2>Reparto de cualificacións</h2>${reparto(v.resumo)}</section>
      <section class="box"><h2>Probas e pesos</h2><p class="sub" style="margin:-8px 0 12px;font-size:12px">Media da clase en cada proba (sobre 10)</p>${probasPesos(v)}</section>`;
  }

  function lenda(v) {
    const esp = v.probas.filter(p => p.tipo !== 'nota').map(p => p.tipo === 'acertos'
      ? `${esc(p.nome)}: acertos sobre ${num(p.parametro)}` : `${esc(p.nome)}: −${num(p.parametro)} por falta`);
    return `<span><i class="sw" style="background:var(--bad-bg);box-shadow:inset 0 0 0 1px var(--bad-line)"></i>Por debaixo de ${num(v.clase.minimo_proba)} (só aviso)</span>
      <span><i class="sw" style="background:var(--wait-bg);box-shadow:inset 0 0 0 1px var(--wait-line)"></i>Nota pendente</span>
      ${esp.length ? `<span>${esp.join(' · ')}</span>` : ''}
      <span class="faint">Intro ou ↓: seguinte alumno · Tab: seguinte proba · Esc: desfacer</span>`;
  }

  function taboaAvaliacion(v) {
    let h = `<thead><tr><th class="l sticky1" style="padding-left:14px">Nº</th><th class="l sticky2">Alumno/a</th>
      <th>Comport.<span class="m">± ${num(v.clase.puntos_comportamento)}</span></th>`;
    v.probas.forEach(p => {
      h += `<th><button type="button" class="th-proba" data-proba="${p.id}" title="Editar a proba">${esc(p.nome)}</button><span class="m">${metaProba(p)}</span></th>`;
    });
    h += '<th class="n">Nota</th><th class="n">Final</th></tr></thead><tbody>';
    v.filas.forEach((f, i) => {
      h += `<tr><td class="num l sticky1">${f.num}</td><td class="name l sticky2">${esc(f.nome)}</td>
        <td><input class="in c-in" data-fila="${i}" data-col="0" value="${valorInput(f.comportamento)}" data-orixinal="${chave(f.comportamento)}" inputmode="decimal" autocomplete="off" aria-label="Comportamento · ${esc(f.nome)}"><span class="lt">${f.letra}</span></td>`;
      f.celas.forEach((cel, j) => {
        const p = v.probas[j];
        h += `<td><span class="cel ${cel.estado === 'baixo' ? 'bad' : ''}"><input class="in ${claseCela(cel)}" data-proba="${p.id}" data-fila="${i}" data-col="${j + 1}" value="${valorInput(cel.valor)}" data-orixinal="${chave(cel.valor)}" inputmode="decimal" autocomplete="off" aria-label="${esc(p.nome)} · ${esc(f.nome)}"><small>${subCela(p, cel)}</small></span></td>`;
      });
      h += `<td class="nota">${num(f.nota, 2)}</td><td class="fin-cel">${chipFinal(f.redondeada)}</td></tr>`;
    });
    return h + '</tbody>';
  }

  function pintaAvaliacion(v) {
    const av = String(v.avaliacion);
    const cab = cabeceira('Notas · ' + NOMES_AV[av], subAvaliacion(v), lapelas('notas', av));
    if (!v.filas.length) {
      main().innerHTML = cab + baleiro('Aínda non hai alumnado nesta clase', 'Engade a lista de alumnos para comezar a poñer notas.',
        `<a class="btn main" href="${href('alumnado')}">Engadir alumnado</a>`);
      return;
    }
    if (!v.probas.length) {
      main().innerHTML = cab + baleiro(`Aínda non hai probas na ${NOMES_AV[av]}`,
        'Crea as probas (exames, mapas, ditados, traballos…) co seu peso; os pesos deben sumar 100 %.',
        '<button class="btn main" type="button" id="b-primeira-proba">+ Nova proba</button>');
      $('#b-primeira-proba').onclick = () => dialogoProba(null, v.avaliacion);
      return;
    }
    main().innerHTML = cab + `<div class="cards" id="cards">${tarxetasAvaliacion(v)}</div>
      <div class="grid2">
        <section class="box tablebox" aria-label="Cadro de notas">
          <div class="scroll"><table id="taboa">${taboaAvaliacion(v)}</table></div>
          <div class="legend">${lenda(v)}</div>
        </section>
        <aside id="aside">${asideAvaliacion(v)}</aside>
      </div>`;
    const taboa = $('#taboa');
    taboa.addEventListener('change', ev => { if (ev.target.matches('.in')) garda(ev.target); });
    taboa.addEventListener('keydown', teclaCela);
    taboa.addEventListener('focusin', ev => { if (ev.target.matches('.in')) ev.target.select(); });
    taboa.addEventListener('click', ev => {
      const b = ev.target.closest('.th-proba');
      if (b) dialogoProba(E.vista.probas.find(p => p.id === Number(b.dataset.proba)));
    });
  }

  function moveCela(input, df) {
    const dest = $(`#taboa input[data-fila="${Number(input.dataset.fila) + df}"][data-col="${input.dataset.col}"]`);
    if (dest) dest.focus();
    return !!dest;
  }

  function teclaCela(ev) {
    const input = ev.target;
    if (!input.matches('.in')) return;
    if (ev.key === 'Enter' || ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      const df = ev.key === 'ArrowUp' || (ev.key === 'Enter' && ev.shiftKey) ? -1 : 1;
      if (!moveCela(input, df)) garda(input);
    } else if (ev.key === 'Escape') {
      const o = input.dataset.orixinal;
      input.value = o === '' ? '' : num(Number(o));
      input.classList.remove('erro');
    }
  }

  function erroCela(input, valor) {
    if (Number.isNaN(valor)) return 'Escribe un número (podes usar coma decimal).';
    if (valor == null) return null;
    if (input.dataset.proba == null) {
      return valor < 0 || valor > 10 ? 'O comportamento vai de 0 a 10.' : null;
    }
    const p = E.vista.probas.find(q => q.id === Number(input.dataset.proba));
    if (valor < 0) return 'Non pode ser negativo.';
    if (p.tipo === 'nota' && valor > 10) return 'A nota vai de 0 a 10.';
    if (p.tipo === 'acertos' && valor > p.parametro) return `${p.nome}: máximo ${num(p.parametro)} acertos.`;
    return null;
  }

  function garda(input) {
    const valor = leNum(input.value);
    if (chave(valor) === input.dataset.orixinal) { input.classList.remove('erro'); return; }
    const erro = erroCela(input, valor);
    if (erro) { input.classList.add('erro'); toast(erro, true); return; }
    input.classList.remove('erro');
    const v = E.vista;
    const fila = v.filas[Number(input.dataset.fila)];
    const pet = input.dataset.proba == null
      ? ['/api/comportamentos', { alumno_id: fila.id, avaliacion: v.avaliacion, valor }]
      : ['/api/cualificacions', { proba_id: Number(input.dataset.proba), alumno_id: fila.id, valor }];
    const anterior = input.dataset.orixinal;
    input.dataset.orixinal = chave(valor);
    // En fila: as respostas aplícanse na mesma orde en que se gardaron.
    cola = cola.then(() => api('PUT', ...pet)).then(nova => {
      if (E.vista && E.vista.clase.id === nova.clase.id && E.vista.avaliacion === nova.avaliacion) actualizaAvaliacion(nova);
    }).catch(e => {
      input.dataset.orixinal = anterior;
      input.classList.add('erro');
      toast(e.message, true);
    });
  }

  function mesmaEstrutura(a, b) {
    return a && a.probas && a.probas.length === b.probas.length && a.filas.length === b.filas.length &&
      a.probas.every((p, j) => p.id === b.probas[j].id && p.tipo === b.probas[j].tipo) &&
      a.filas.every((f, i) => f.id === b.filas[i].id);
  }

  function actualizaAvaliacion(v) {
    const vella = E.vista;
    E.vista = v;
    if (!$('#taboa') || !mesmaEstrutura(vella, v)) return pintaAvaliacion(v);
    const activo = document.activeElement;
    const ponValor = (input, valor) => {
      input.dataset.orixinal = chave(valor);
      if (input !== activo && !input.classList.contains('erro')) input.value = valorInput(valor);
    };
    $$('#taboa tbody tr').forEach((tr, i) => {
      const f = v.filas[i];
      const ins = $$('input', tr);
      ponValor(ins[0], f.comportamento);
      $('.lt', tr).textContent = f.letra;
      f.celas.forEach((cel, j) => {
        const input = ins[j + 1];
        ponValor(input, cel.valor);
        input.classList.toggle('bad', cel.estado === 'baixo');
        input.classList.toggle('wait', cel.estado === 'pendente');
        input.parentElement.classList.toggle('bad', cel.estado === 'baixo');
        $('small', input.parentElement).textContent = subCela(v.probas[j], cel);
      });
      $('.nota', tr).textContent = num(f.nota, 2);
      $('.fin-cel', tr).innerHTML = chipFinal(f.redondeada);
    });
    $('#cards').innerHTML = tarxetasAvaliacion(v);
    $('#aside').innerHTML = asideAvaliacion(v);
    $('#sub').innerHTML = subAvaliacion(v);
  }

  // --- final -----------------------------------------------------------------------
  function modoFinal(c) {
    return `media ponderada (${c.pesos_avaliacions.map(w => num(w)).join('/')}) das avaliacións con nota, ${c.final_redondeadas ? 'redondeadas' : 'sen redondear'}`;
  }

  function pintaFinal(v) {
    const c = v.clase;
    const r = v.resumo;
    const cab = cabeceira('Notas · Final', `${plural(v.filas.length, 'alumno', 'alumnos')} · ${modoFinal(c)}`, lapelas('notas', 'final'));
    if (!v.filas.length) {
      main().innerHTML = cab + baleiro('Aínda non hai alumnado nesta clase', 'Engade a lista de alumnos para comezar.',
        `<a class="btn main" href="${href('alumnado')}">Engadir alumnado</a>`);
      return;
    }
    const conNotas = v.por_avaliacion.filter(a => a.n > 0).length;
    let h = `<thead><tr><th class="l sticky1" style="padding-left:14px">Nº</th><th class="l sticky2">Alumno/a</th>`;
    [1, 2, 3].forEach(a => { h += `<th>${NOMES_AV[a]}<span class="m">peso ${num(c.pesos_avaliacions[a - 1])}</span></th>`; });
    h += '<th class="n">Media</th><th class="n">Final</th></tr></thead><tbody>';
    v.filas.forEach(f => {
      h += `<tr><td class="num l sticky1">${f.num}</td><td class="name l sticky2">${esc(f.nome)}</td>`;
      f.avs.forEach(a => {
        h += a.nota == null ? '<td><span class="faint">—</span></td>'
          : `<td><span class="c ${a.redondeada < 5 ? 'bad' : ''}">${num(a.nota, 2)}<small>→ ${a.redondeada}</small></span></td>`;
      });
      h += `<td class="nota">${num(f.media, 2)}</td><td>${chipFinal(f.redondeada)}</td></tr>`;
    });
    h += '</tbody>';
    const porAv = v.por_avaliacion.map((a, i) =>
      `<div class="pr"><span>${NOMES_AV[i + 1]} <span class="faint">${a.n ? 'aprob. ' + pct(a.aprobados, a.n) : 'sen notas'}</span></span><b>${num(a.media, 2)}</b></div>`).join('');
    main().innerHTML = cab + `<div class="cards">${tarxetas([
      ['Media final', num(r.media, 2), 'sen redondear', ''],
      ['Aprobados', pct(r.aprobados, r.n), r.n ? `${r.aprobados} de ${plural(r.n, 'alumno', 'alumnos')}` : 'aínda sen notas', 'acc'],
      ['Suspensos', r.n - r.aprobados, 'final redondeada por debaixo de 5', 'bad'],
      ['Avaliacións con notas', `${conNotas} de 3`, 'só contan as que teñen nota', ''],
    ])}</div>
      <div class="grid2">
        <section class="box tablebox" aria-label="Notas finais">
          <div class="scroll"><table>${h}</table></div>
          <div class="legend"><span><i class="sw" style="background:var(--bad-bg);box-shadow:inset 0 0 0 1px var(--bad-line)"></i>Avaliación suspensa</span>
            <span>Cada avaliación: nota sen redondear → redondeada</span>
            <span class="faint">Unha avaliación só conta se o alumno ten algunha nota nela</span></div>
        </section>
        <aside><section class="box"><h2>Reparto da nota final</h2>${reparto(r)}</section>
          <section class="box"><h2>Media por avaliación</h2>${porAv}</section></aside>
      </div>`;
  }

  // --- alumnado ----------------------------------------------------------------------
  async function pintaAlumnado(t) {
    const d = await api('GET', `/api/clases/${E.clase.id}/alumnos`);
    if (t !== E.nav) return;
    const n = d.alumnos.length;
    const cab = cabeceira('Alumnado', `${plural(n, 'alumno', 'alumnos')} · orde alfabética por apelidos`,
      '<button class="btn main" type="button" id="b-engadir">+ Engadir alumnado</button>');
    if (!n) {
      main().innerHTML = cab + baleiro('Aínda non hai alumnado', 'Podes pegar a lista enteira dunha vez (un alumno por liña).',
        '<button class="btn main" type="button" id="b-engadir2">+ Engadir alumnado</button>');
      $('#b-engadir2').onclick = dialogoAlumnado;
    } else {
      main().innerHTML = cab + `<section class="box"><div class="scroll"><table>
        <thead><tr><th class="l" style="padding-left:14px">Nº</th><th class="l">Apelidos</th><th class="l">Nome</th><th><span class="sr-only">Accións</span></th></tr></thead>
        <tbody>${d.alumnos.map(a => `<tr><td class="num l">${a.num}</td><td class="l">${esc(a.apelidos)}</td><td class="l name">${esc(a.nome)}</td>
          <td><div class="botons-fila"><button class="btn peq" type="button" data-editar="${a.id}">Editar</button>
          <button class="btn peq perigo" type="button" data-eliminar="${a.id}">Eliminar</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
      main().querySelector('table').addEventListener('click', ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        const a = d.alumnos.find(x => x.id === Number(b.dataset.editar || b.dataset.eliminar));
        if (b.dataset.editar) dialogoEditarAlumno(a); else eliminaAlumno(a);
      });
    }
    $('#b-engadir').onclick = dialogoAlumnado;
  }

  function parseAlumnado(texto) {
    return texto.split(/\r?\n/).map(l => l.replace(/^\s*\d+\s*[.)\-–:]?\s+/, '').trim()).filter(Boolean).map(l => {
      const sep = l.includes('\t') ? '\t' : l.includes(',') ? ',' : null;
      if (sep) {
        const [apelidos, ...resto] = l.split(sep).map(s => s.trim()).filter(Boolean);
        return resto.length ? { apelidos, nome: resto.join(' ') } : { apelidos: '', nome: apelidos };
      }
      const p = l.split(/\s+/);
      if (p.length >= 3) return { nome: p.slice(0, -2).join(' '), apelidos: p.slice(-2).join(' ') };
      if (p.length === 2) return { nome: p[0], apelidos: p[1] };
      return { nome: p[0], apelidos: '' };
    });
  }

  function dialogoAlumnado() {
    return dialogo({
      titulo: 'Engadir alumnado',
      boton: 'Engadir',
      html: `<label class="campo"><span>Un alumno por liña</span>
          <textarea name="lista" placeholder="Barreiro Souto, Antía&#10;Castro Lema, Brais&#10;Carla Domínguez Rial"></textarea>
          <small>«Apelidos, Nome» (tamén separado por tabulador, ao copiar dunha folla de cálculo) ou «Nome Apelido1 Apelido2».</small></label>
        <div class="vista-previa" hidden></div>`,
      aoAbrir(form) {
        const ta = $('textarea', form);
        const vp = $('.vista-previa', form);
        ta.addEventListener('input', () => {
          const l = parseAlumnado(ta.value);
          vp.hidden = !l.length;
          vp.innerHTML = `<table><thead><tr><th>Nome</th><th>Apelidos</th></tr></thead><tbody>${l.map(a =>
            `<tr><td>${esc(a.nome)}</td><td>${esc(a.apelidos) || '<span class="faint">—</span>'}</td></tr>`).join('')}</tbody></table>`;
        });
      },
      async aoEnviar(form) {
        const l = parseAlumnado(form.lista.value);
        if (!l.length) throw new Error('Escribe polo menos un nome.');
        await api('POST', `/api/clases/${E.clase.id}/alumnos`, { alumnos: l });
        toast(`${plural(l.length, 'alumno engadido', 'alumnos engadidos')}`);
        navega();
      },
    });
  }

  function dialogoEditarAlumno(a) {
    return dialogo({
      titulo: 'Editar alumno/a',
      html: `<label class="campo"><span>Nome</span><input name="nome" maxlength="120" value="${esc(a.nome)}"></label>
        <label class="campo"><span>Apelidos</span><input name="apelidos" maxlength="120" value="${esc(a.apelidos)}"></label>`,
      async aoEnviar(form) {
        await api('PUT', `/api/alumnos/${a.id}`, { nome: form.nome.value, apelidos: form.apelidos.value });
        toast('Gardado');
        navega();
      },
    });
  }

  async function eliminaAlumno(a) {
    const ok = await confirma('Eliminar alumno/a', `Eliminarase a ${a.nome_completo} e todas as súas notas e comportamentos. Non se pode desfacer.`, 'Eliminar');
    if (!ok) return;
    try {
      await api('DELETE', `/api/alumnos/${a.id}`);
      toast('Alumno/a eliminado/a');
      navega();
    } catch (e) { toast(e.message, true); }
  }

  // --- probas ------------------------------------------------------------------------
  function detalleProba(p) {
    if (p.tipo === 'acertos') return `sobre ${num(p.parametro)} preguntas`;
    if (p.tipo === 'faltas') return `−${num(p.parametro)} por falta`;
    return 'sobre 10';
  }

  async function pintaProbas(t) {
    const d = await api('GET', `/api/clases/${E.clase.id}/probas`);
    if (t !== E.nav) return;
    let h = cabeceira('Probas', 'En cada avaliación os pesos deben sumar 100 %. Preme o nome dunha proba no cadro de notas para editala.');
    [1, 2, 3].forEach(av => {
      const ps = d.probas.filter(p => p.avaliacion === av);
      const suma = ps.reduce((s, p) => s + p.peso, 0);
      const etq = !ps.length ? '' : sumaPesosOk(suma) ? '<span class="etq ok">✓ pesos: 100 %</span>'
        : `<span class="etq malo">⚠ pesos: ${num(suma)} %</span>`;
      h += `<section class="box"><div class="cab-box"><div class="row"><h2>${NOMES_AV[av]}</h2>${etq}</div>
        <button class="btn peq" type="button" data-nova="${av}">+ Nova proba</button></div>`;
      if (!ps.length) {
        h += '<p class="baleiro" style="padding:16px">Sen probas.</p></section>';
        return;
      }
      h += `<div class="scroll"><table><thead><tr><th class="l" style="padding-left:14px">Orde</th><th class="l">Proba</th><th class="l">Tipo</th><th>Peso</th>
        <th class="l">Cálculo</th><th>Data</th><th>Notas postas</th><th><span class="sr-only">Accións</span></th></tr></thead><tbody>`;
      ps.forEach((p, i) => {
        h += `<tr><td class="l" style="padding-left:10px;white-space:nowrap">
            <button class="icono" type="button" data-mover="${p.id}" data-dir="-1" aria-label="Subir ${esc(p.nome)}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icono" type="button" data-mover="${p.id}" data-dir="1" aria-label="Baixar ${esc(p.nome)}" ${i === ps.length - 1 ? 'disabled' : ''}>↓</button></td>
          <td class="l name">${esc(p.nome)}</td><td class="l">${TIPOS[p.tipo]}</td><td>${num(p.peso)} %</td>
          <td class="l muted">${detalleProba(p)}</td><td class="muted">${dataCurta(p.data)}</td>
          <td class="muted">${p.postas} de ${d.alumnos}</td>
          <td><div class="botons-fila"><button class="btn peq" type="button" data-editar="${p.id}">Editar</button>
            <button class="btn peq perigo" type="button" data-eliminar="${p.id}">Eliminar</button></div></td></tr>`;
      });
      h += '</tbody></table></div></section>';
    });
    main().innerHTML = `<div class="pila" id="probas">${h}</div>`;
    $('#probas').onclick = async ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      const p = d.probas.find(x => x.id === Number(b.dataset.editar || b.dataset.eliminar || b.dataset.mover));
      if (b.dataset.nova) dialogoProba(null, Number(b.dataset.nova));
      else if (b.dataset.editar) dialogoProba(p);
      else if (b.dataset.eliminar) eliminaProba(p);
      else if (b.dataset.mover) {
        try { await api('POST', `/api/probas/${p.id}/mover`, { direccion: Number(b.dataset.dir) }); navega(); } catch (e) { toast(e.message, true); }
      }
    };
  }

  async function eliminaProba(p) {
    const notas = p.postas != null ? p.postas : null;
    const texto = `Eliminarase «${p.nome}» (${NOMES_AV[p.avaliacion]})` +
      (notas ? ` e as ${plural(notas, 'nota posta', 'notas postas')} nela` : '') + '. Non se pode desfacer.';
    if (!(await confirma('Eliminar proba', texto, 'Eliminar'))) return;
    try {
      await api('DELETE', `/api/probas/${p.id}`);
      toast('Proba eliminada');
      navega();
    } catch (e) { toast(e.message, true); }
  }

  async function dialogoProba(p, avInicial) {
    let lista;
    try { lista = (await api('GET', `/api/clases/${E.clase.id}/probas`)).probas; } catch (e) { return toast(e.message, true); }
    const ed = p ? lista.find(x => x.id === p.id) || p : null;
    const d = ed || { nome: '', avaliacion: avInicial || avNumerica(), tipo: 'nota', peso: null, parametro: null, data: '' };
    const radio = (k, texto) => `<label class="radio"><input type="radio" name="tipo" value="${k}" ${d.tipo === k ? 'checked' : ''}><span>${texto}</span></label>`;
    return dialogo({
      titulo: ed ? 'Editar proba' : 'Nova proba',
      boton: ed ? 'Gardar' : 'Crear proba',
      extra: ed ? '<button type="button" class="btn perigo" data-eliminar style="margin-right:auto">Eliminar</button>' : '',
      html: `<label class="campo"><span>Nome</span><input name="nome" maxlength="40" value="${esc(d.nome)}" placeholder="Ex. 1, Mapa, Ditado, PBL…" autocomplete="off"></label>
        <div class="fila3">
          <label class="campo"><span>Avaliación</span><select name="avaliacion">${[1, 2, 3].map(a =>
            `<option value="${a}" ${a === d.avaliacion ? 'selected' : ''}>${NOMES_AV[a]}</option>`).join('')}</select></label>
          <label class="campo"><span>Peso (%)</span><input name="peso" inputmode="decimal" autocomplete="off" value="${d.peso == null ? '' : num(d.peso)}"></label>
          <label class="campo"><span>Data <small>(opcional)</small></span><input type="date" name="data" value="${esc(d.data || '')}"></label>
        </div>
        <small class="faint" id="info-peso"></small>
        <fieldset class="campo"><legend>Tipo de proba</legend>
          ${radio('nota', 'Nota <span class="faint">— sobre 10</span>')}
          ${radio('acertos', 'Acertos <span class="faint">— acertos ÷ preguntas totais × 10</span>')}
          ${radio('faltas', 'Faltas <span class="faint">— 10 − faltas × penalización (mínimo 0)</span>')}
        </fieldset>
        <label class="campo" data-par="acertos"><span>Preguntas totais</span><input name="preguntas" inputmode="decimal" autocomplete="off" value="${d.tipo === 'acertos' ? num(d.parametro) : ''}" placeholder="52"></label>
        <label class="campo" data-par="faltas"><span>Penalización por falta</span><input name="penalizacion" inputmode="decimal" autocomplete="off" value="${d.tipo === 'faltas' ? num(d.parametro) : ''}" placeholder="0,3"></label>`,
      aoAbrir(form) {
        const actualiza = () => {
          const tipo = form.tipo.value;
          $$('[data-par]', form).forEach(el => { el.hidden = el.dataset.par !== tipo; });
          const av = Number(form.avaliacion.value);
          const outras = lista.filter(q => q.avaliacion === av && (!ed || q.id !== ed.id)).reduce((s, q) => s + q.peso, 0);
          const peso = leNum(form.peso.value);
          const total = outras + (Number.isFinite(peso) ? peso : 0);
          $('#info-peso', form).innerHTML = `Con esta proba, os pesos da ${NOMES_AV[av]} suman <b>${num(total)} %</b>` +
            (sumaPesosOk(total) ? ' ✓' : ` (deberían sumar 100 %; quedan ${num(100 - outras)} %)`);
        };
        form.addEventListener('input', actualiza);
        form.addEventListener('change', actualiza);
        actualiza();
        const el = $('[data-eliminar]', form);
        if (el) el.onclick = () => { $('#dlg').close(); eliminaProba(ed); };
      },
      async aoEnviar(form) {
        const tipo = form.tipo.value;
        const corpo = {
          nome: form.nome.value, avaliacion: Number(form.avaliacion.value), tipo,
          peso: leNum(form.peso.value), data: form.data.value || null,
          parametro: tipo === 'acertos' ? leNum(form.preguntas.value) : tipo === 'faltas' ? leNum(form.penalizacion.value) : null,
        };
        if (Number.isNaN(corpo.peso) || Number.isNaN(corpo.parametro)) throw new Error('Revisa os números (podes usar coma decimal).');
        if (ed) await api('PUT', `/api/probas/${ed.id}`, corpo);
        else await api('POST', `/api/clases/${E.clase.id}/probas`, corpo);
        toast(ed ? 'Proba gardada' : 'Proba creada');
        if (!ed && E.seccion === 'notas' && E.ultimaAv !== String(corpo.avaliacion)) location.hash = href('notas', String(corpo.avaliacion));
        else navega();
      },
    });
  }

  // --- estatísticas ------------------------------------------------------------------
  function histograma(h) {
    const max = Math.max(1, ...h);
    const cols = h.map((n, k) => `<div class="col" title="Nota ${k}: ${plural(n, 'alumno', 'alumnos')}">${n ? `<span>${n}</span>` : ''}` +
      `<i style="height:${n / max * 100}%;background:var(${k < 5 ? '--crit' : '--s1'})"></i></div>`).join('');
    const eixo = h.map((_, k) => `<span>${k}</span>`).join('');
    return `<div class="hist" role="img" aria-label="Número de alumnos por nota redondeada">${cols}</div><div class="hist-x">${eixo}</div>
      <div class="chave"><span><i class="sw" style="background:var(--crit)"></i>Suspenso (0–4)</span><span><i class="sw" style="background:var(--s1)"></i>Aprobado (5–10)</span></div>`;
  }

  function listaSuspensos(filas, nota, detalle) {
    const l = filas.filter(f => nota(f) != null && f.redondeada < 5).sort((a, b) => nota(a) - nota(b));
    if (!l.length) return '<p class="muted" style="margin:0">Ningún alumno por debaixo de 5.</p>';
    return l.map(f => {
      const d = detalle ? detalle(f) : '';
      return `<div class="pr"><span>${esc(f.nome)}${d ? `<small class="faint" style="display:block">${d}</small>` : ''}</span>
        <span style="white-space:nowrap">${num(nota(f), 2)} ${chipFinal(f.redondeada)}</span></div>`;
    }).join('');
  }

  async function pintaEstatisticas(arg, t) {
    const av = avValida(arg);
    if (!av) return location.replace(href('estatisticas', E.ultimaAv));
    E.ultimaAv = av;
    pintaCabeceira();
    const base = `/api/clases/${E.clase.id}`;
    const [vf, va] = await Promise.all([api('GET', base + '/final'), av === 'final' ? null : api('GET', `${base}/avaliacions/${av}`)]);
    if (t !== E.nav) return;
    const v = va || vf;
    const r = v.resumo;
    const cab = cabeceira('Estatísticas · ' + NOMES_AV[av], `${plural(r.alumnos, 'alumno', 'alumnos')} · ${r.n} con nota`, lapelas('estatisticas', av));
    if (!r.n) {
      main().innerHTML = cab + baleiro('Aínda non hai notas', av === 'final' ? 'Ningunha avaliación ten notas.' : `Ningún alumno ten notas na ${NOMES_AV[av]}.`,
        `<a class="btn" href="${href('notas', av)}">Ir ao cadro de notas</a>`);
      return;
    }
    let detalle;
    if (va) {
      detalle = `<section class="box"><div class="cab-box"><h2>Por proba</h2></div><div class="scroll"><table><thead><tr>
        <th class="l" style="padding-left:14px">Proba</th><th>Peso</th><th>Media</th><th>Mín.</th><th>Máx.</th>
        <th>&lt; ${num(v.clase.minimo_proba)}</th><th>Pendentes</th></tr></thead><tbody>${va.probas.map(p => `<tr>
        <td class="l name" style="padding-left:14px">${esc(p.nome)} <span class="faint">${TIPOS[p.tipo].toLowerCase()}</span></td><td>${num(p.peso)} %</td>
        <td><b>${num(p.media, 2)}</b></td><td>${num(p.minima, 2)}</td><td>${num(p.maxima, 2)}</td>
        <td class="${p.baixo ? 'malo' : 'muted'}">${p.baixo}</td><td class="${p.pendentes ? '' : 'muted'}">${p.pendentes}</td></tr>`).join('')}</tbody></table></div></section>`;
    } else {
      detalle = `<section class="box"><div class="cab-box"><h2>Por avaliación</h2></div><div class="scroll"><table><thead><tr>
        <th class="l" style="padding-left:14px">Avaliación</th><th>Peso</th><th>Probas</th><th>Con nota</th><th>Media</th><th>Mediana</th><th>Aprobados</th></tr></thead><tbody>
        ${vf.por_avaliacion.map((a, i) => `<tr><td class="l name" style="padding-left:14px">${NOMES_AV[i + 1]}</td><td>${num(v.clase.pesos_avaliacions[i])}</td>
        <td>${a.probas}</td><td>${a.n}</td><td><b>${num(a.media, 2)}</b></td><td>${num(a.mediana, 2)}</td><td>${a.n ? pct(a.aprobados, a.n) : '—'}</td></tr>`).join('')}</tbody></table></div></section>`;
    }
    const evol = [...vf.por_avaliacion.map((a, i) => [NOMES_AV[i + 1], a]), ['Final', vf.resumo]].map(([nome, a]) =>
      `<div class="pr"><span>${nome} <span class="faint">${a.n ? 'aprob. ' + pct(a.aprobados, a.n) : 'sen notas'}</span></span><b>${num(a.media, 2)}</b></div>`).join('');
    const nota = va ? f => f.nota : f => f.media;
    const det = va ? f => {
      const b = f.celas.filter(c => c.estado === 'baixo').length;
      const p = f.celas.filter(c => c.estado === 'pendente').length;
      return [b ? `${plural(b, 'proba', 'probas')} &lt; ${num(v.clase.minimo_proba)}` : '', p ? plural(p, 'pendente', 'pendentes') : ''].filter(Boolean).join(' · ');
    } : null;
    main().innerHTML = cab + `<div class="cards">${tarxetas([
      ['Media', num(r.media, 2), 'sen redondear', ''],
      ['Mediana', num(r.mediana, 2), 'a nota do medio', ''],
      ['Desviación típica', num(r.desviacion, 2), 'dispersión das notas', ''],
      ['Máxima · mínima', `${num(r.maximo, 1)} · ${num(r.minimo, 1)}`, 'sen redondear', ''],
      ['Aprobados', pct(r.aprobados, r.n), `${r.aprobados} de ${r.n}`, 'acc'],
    ])}</div>
      <div class="grid2">
        <div class="columna">
          <section class="box pad"><h2>Distribución das notas</h2><p class="sub" style="margin:-8px 0 4px;font-size:12px">Número de alumnos con cada nota redondeada</p>${histograma(r.histograma)}</section>
          ${detalle}
        </div>
        <aside>
          <section class="box"><h2>Evolución</h2><p class="sub" style="margin:-8px 0 8px;font-size:12px">Media sen redondear e porcentaxe de aprobados</p>${evol}</section>
          <section class="box"><h2>Por debaixo de 5</h2>${listaSuspensos(v.filas, nota, det)}</section>
        </aside>
      </div>`;
  }

  // --- axustes -----------------------------------------------------------------------
  function pintaAxustes() {
    const c = E.clase;
    const w = c.pesos_avaliacions;
    main().innerHTML = cabeceira('Axustes', `${esc(c.nome)} · ${esc(c.materia)}`) + `<div class="axustes">
      <section class="box pad"><h2>Clase e cálculo</h2>
        <form class="form" id="f-axustes" novalidate>
          <div class="fila3">
            <label class="campo"><span>Nome da clase</span><input name="nome" maxlength="60" value="${esc(c.nome)}"></label>
            <label class="campo"><span>Materia</span><input name="materia" maxlength="80" value="${esc(c.materia)}"></label>
            <label class="campo"><span>Curso</span><input name="curso" maxlength="20" value="${esc(c.curso)}"></label>
          </div>
          <div class="fila3">
            <label class="campo"><span>Comportamento ± puntos</span><input name="puntos" inputmode="decimal" value="${num(c.puntos_comportamento)}">
              <small>Comportamento 10 suma isto; 0 réstao; 5 non cambia nada.</small></label>
            <label class="campo"><span>Mínimo por proba</span><input name="minimo" inputmode="decimal" value="${num(c.minimo_proba)}">
              <small>Só marca en vermello; non impide facer media.</small></label>
          </div>
          <fieldset class="campo"><legend>Pesos das avaliacións na nota final</legend>
            <div class="fila3">${[0, 1, 2].map(i => `<label class="campo"><span class="muted">${NOMES_AV[i + 1]}</span><input name="peso${i}" inputmode="decimal" value="${num(w[i])}"></label>`).join('')}</div>
          </fieldset>
          <fieldset class="campo"><legend>Nota final</legend>
            <label class="radio"><input type="radio" name="redondeadas" value="non" ${c.final_redondeadas ? '' : 'checked'}><span>Media das notas de avaliación <b>sen redondear</b> (recomendado)</span></label>
            <label class="radio"><input type="radio" name="redondeadas" value="si" ${c.final_redondeadas ? 'checked' : ''}><span>Media das notas de avaliación <b>redondeadas</b></span></label>
          </fieldset>
          <p class="erro-form" role="alert"></p>
          <div class="botoes"><button class="btn main" type="submit">Gardar cambios</button></div>
        </form></section>
      <section class="box pad"><h2>Como se calcula</h2><ul class="regras">
        <li>Nota da avaliación = Σ nota de cada proba × peso / 100 + (comportamento − 5) / 5 × ${num(c.puntos_comportamento)}, entre 0 e 10. Sen comportamento, non conta.</li>
        <li>Tipos: <b>Nota</b> (sobre 10), <b>Acertos</b> (acertos ÷ preguntas totais × 10), <b>Faltas</b> (10 − faltas × penalización, mínimo 0).</li>
        <li>As notas pendentes contan como 0 ata poñelas.</li>
        <li>Redondeo: sobe ao enteiro seguinte só se supera ,55 (5,55 → 5; 5,56 → 6), agás o 5, que abonda con superar 4,6.</li>
        <li>Letra de comportamento: ata 2 E, ata 4 D, ata 6 C, ata 8,5 B, máis A.</li>
        <li>Final: media ponderada das avaliacións nas que o alumno ten algunha nota.</li>
      </ul></section>
      ${seccionCopias()}
      <section class="box pad"><h2>Eliminar a clase</h2>
        <p class="muted" style="margin:0 0 12px">Bórranse o alumnado, as probas e todas as notas de ${esc(c.nome)}. Non se pode desfacer.</p>
        <button class="btn perigo" type="button" id="b-eliminar-clase">Eliminar ${esc(c.nome)}</button></section>
    </div>`;
    escoitaAccions($('.axustes', main()));
    const form = $('#f-axustes');
    form.onsubmit = async ev => {
      ev.preventDefault();
      const corpo = {
        nome: form.nome.value, materia: form.materia.value, curso: form.curso.value,
        puntos_comportamento: leNum(form.puntos.value), minimo_proba: leNum(form.minimo.value),
        pesos_avaliacions: [0, 1, 2].map(i => leNum(form['peso' + i].value)),
        final_redondeadas: form.redondeadas.value === 'si',
      };
      const nums = [corpo.puntos_comportamento, corpo.minimo_proba, ...corpo.pesos_avaliacions];
      if (nums.some(x => x == null || Number.isNaN(x))) {
        $('.erro-form', form).textContent = 'Revisa os números (podes usar coma decimal).';
        return;
      }
      try {
        await api('PUT', `/api/clases/${c.id}`, corpo);
        await cargaClases();
        toast('Axustes gardados');
        navega();
      } catch (e) { $('.erro-form', form).textContent = e.message; }
    };
    $('#b-eliminar-clase').onclick = async () => {
      if (!(await confirma('Eliminar clase', `Eliminarase ${c.nome} con todo o seu alumnado, probas e notas. Non se pode desfacer.`, 'Eliminar clase'))) return;
      try {
        await api('DELETE', `/api/clases/${c.id}`);
        await cargaClases();
        toast('Clase eliminada');
        location.hash = '#/';
        navega();
      } catch (e) { toast(e.message, true); }
    };
  }

  function dialogoClase() {
    return dialogo({
      titulo: 'Nova clase',
      boton: 'Crear clase',
      html: `<label class="campo"><span>Nome</span><input name="nome" maxlength="60" placeholder="1º ESO A" autocomplete="off"></label>
        <div class="fila3">
          <label class="campo"><span>Materia</span><input name="materia" maxlength="80" value="Xeografía e Historia"></label>
          <label class="campo"><span>Curso</span><input name="curso" maxlength="20" value="${esc(E.cursoActual)}"></label>
        </div>
        ${E.clases.length ? `<label class="campo"><span>Copiar probas e axustes de</span><select name="copiar"><option value="">Ningunha (empezar en branco)</option>
          ${E.clases.map(x => `<option value="${x.id}">${esc(x.nome)} · ${esc(x.materia)}</option>`).join('')}</select>
          <small>Cópianse as probas (nome, tipo e peso), non as notas.</small></label>` : ''}`,
      async aoEnviar(form) {
        const corpo = { nome: form.nome.value, materia: form.materia.value, curso: form.curso.value };
        if (form.copiar && form.copiar.value) corpo.copiar_de = Number(form.copiar.value);
        const c = await api('POST', '/api/clases', corpo);
        await cargaClases();
        toast('Clase creada');
        location.hash = href('alumnado', null, c.id);
      },
    });
  }

  // --- informe para imprimir ou gardar como PDF -------------------------------------
  async function pintaInforme(arg, auto, t) {
    const av = avValida(arg) || '1';
    const c = E.clase;
    const v = await api('GET', av === 'final' ? `/api/clases/${c.id}/final` : `/api/clases/${c.id}/avaliacions/${av}`);
    if (t !== E.nav) return;
    const r = v.resumo;
    document.title = `Informe · ${c.nome} · ${NOMES_AV[av]}`;
    const hoxe = dataLonga(new Date());
    let h;
    if (av === 'final') {
      h = '<thead><tr><th class="l">Nº</th><th class="l">Alumno/a</th>' + [1, 2, 3].map(a => `<th>${NOMES_AV[a]}</th>`).join('') + '<th>Media</th><th>Final</th></tr></thead><tbody>';
      v.filas.forEach(f => {
        h += `<tr><td class="l">${f.num}</td><td class="l name">${esc(f.nome)}</td>` +
          f.avs.map(a => `<td class="${a.redondeada != null && a.redondeada < 5 ? 'inf-baixo' : ''}">${a.nota == null ? '—' : `${num(a.nota, 2)} (${a.redondeada})`}</td>`).join('') +
          `<td>${num(f.media, 2)}</td><td><b class="${f.redondeada != null && f.redondeada < 5 ? 'inf-baixo' : ''}">${f.redondeada ?? '—'}</b></td></tr>`;
      });
    } else {
      h = '<thead><tr><th class="l">Nº</th><th class="l">Alumno/a</th><th>Comp.</th>' +
        v.probas.map(p => `<th>${esc(p.nome)}<span class="m">${num(p.peso)} %</span></th>`).join('') + '<th>Nota</th><th>Final</th></tr></thead><tbody>';
      v.filas.forEach(f => {
        h += `<tr><td class="l">${f.num}</td><td class="l name">${esc(f.nome)}</td><td>${f.comportamento == null ? '—' : `${num(f.comportamento)} ${f.letra}`}</td>` +
          f.celas.map(cel => `<td class="${cel.estado === 'baixo' ? 'inf-baixo' : ''}">${cel.valor == null ? 'pend.' : num(cel.nota, 2)}</td>`).join('') +
          `<td>${num(f.nota, 2)}</td><td><b class="${f.redondeada != null && f.redondeada < 5 ? 'inf-baixo' : ''}">${f.redondeada ?? '—'}</b></td></tr>`;
      });
    }
    h += '</tbody>';
    const repartoTxt = r.reparto.map(x => `${x.nome}: <b>${x.n}</b>`).join(' · ');
    main().innerHTML = `<div class="informe-barra"><a class="btn" href="${href('notas', av)}">Volver ao caderno</a>
        <button class="btn main" type="button" id="b-imprimir">Imprimir ou gardar como PDF</button></div>
      <div class="informe-cab"><h1>${esc(c.nome)} · ${esc(c.materia)} — ${NOMES_AV[av]}</h1>
        <p class="sub">Curso ${esc(c.curso)} · informe xerado o ${hoxe}</p></div>
      <div class="resumo-inf"><span>Alumnado: <b>${r.alumnos}</b> (${r.n} con nota)</span><span>Media: <b>${num(r.media, 2)}</b></span>
        <span>Aprobados: <b>${r.aprobados}</b> (${pct(r.aprobados, r.n)})</span><span>${repartoTxt}</span></div>
      <section class="box informe"><div class="scroll"><table>${h}</table></div></section>
      ${av === 'final' ? `<p class="faint">Final: ${modoFinal(c)}. Entre parénteses, a nota redondeada.</p>`
        : `<p class="faint">Probas convertidas a nota sobre 10. Vermello: por debaixo de ${num(c.minimo_proba)} (só aviso) ou suspenso. «pend.»: nota pendente (conta como 0).
          Medias por proba: ${v.probas.map(p => `${esc(p.nome)} ${num(p.media, 2)}`).join(' · ')}.</p>`}`;
    $('#b-imprimir').onclick = () => window.print();
    if (auto) setTimeout(() => window.print(), 300);
  }

  // --- aplicación de Mac: copias, Drive e actualizacións -------------------------------
  function esApp() { return !!(E.sistema && E.sistema.modo === 'app'); }
  function esMovil() { return !!(E.sistema && E.sistema.modo === 'movil'); }
  function sincroniza() { return esApp() || esMovil(); }

  function dataHora(iso) {
    if (!iso) return 'nunca';
    const d = new Date(iso);
    const dous = n => String(n).padStart(2, '0');
    return `${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}, ${dous(d.getHours())}:${dous(d.getMinutes())}`;
  }

  async function cargaSistema() {
    try { E.sistema = await api('GET', '/api/sistema'); } catch (e) { /* mantén o anterior */ }
    const el = $('#avisos');
    const avisos = sincroniza() ? E.sistema.avisos : [];
    const conflito = sincroniza() && E.sistema.sincronizacion && E.sistema.sincronizacion.conflito;
    document.body.classList.toggle('so-consulta', esMovil() && !E.sistema.edicion);
    el.hidden = !avisos.length;
    el.innerHTML = avisos.map(a => `<p>⚠ ${esc(a)}</p>`).join('')
      + (conflito ? '<p><button class="btn" type="button" data-accion="conflito">Escoller que datos conservar…</button></p>' : '');
    await recargaSeCambiou();
  }

  // Os datos poden cambiar desde fóra (o outro dispositivo, unha copia recuperada): vólvese pintar.
  async function recargaSeCambiou() {
    const x = sincroniza() && E.sistema.sincronizacion ? E.sistema.sincronizacion.xeracion_datos : null;
    if (x == null || x === E.xeracionDatos) return;
    const primeira = E.xeracionDatos === undefined;
    if (!primeira && escribindo()) return; // non se interrompe a quen está escribindo: na seguinte volta
    E.xeracionDatos = x;
    if (primeira) return;
    await cargaClases();
    navega();
    toast(esMovil() ? 'Datos actualizados cos cambios do Mac' : 'Datos actualizados cos cambios feitos no outro dispositivo');
  }

  // Hai un diálogo aberto ou unha cela cun valor tecleado que aínda non se gardou.
  function escribindo() {
    if ($('#dlg').open) return true;
    const ae = document.activeElement;
    if (!ae || !ae.matches('#main input')) return false;
    if (!('orixinal' in ae.dataset)) return true;
    const orixinal = ae.dataset.orixinal === '' ? '' : num(Number(ae.dataset.orixinal));
    return ae.value.trim() !== orixinal;
  }

  async function dialogoConflito() {
    const c = E.sistema.sincronizacion.conflito;
    if (!c) return;
    const outro = { iphone: 'no iPhone', mac: esMovil() ? 'no Mac' : 'no outro Mac' }[c.dispositivo] || 'no outro dispositivo';
    const aqui = E.sistema.dispositivo === 'iphone' ? 'neste iPhone' : 'neste Mac';
    const r = await dialogo({
      titulo: 'Cambios en dous sitios',
      boton: 'Conservar',
      html: `<p style="margin:0">Fixéronse cambios ${aqui} e tamén ${outro} (${esc(dataHora(c.data))}) sen que se pasasen dun ao outro. Escolle cales conservar:</p>
        <label class="radio"><input type="radio" name="conservar" value="este"><span>Os datos ${aqui}</span></label>
        <label class="radio"><input type="radio" name="conservar" value="outro"><span>Os datos que se gardaron ${outro}</span></label>
        <p class="muted" style="margin:0;font-size:13px">A outra versión non se borra: queda gardada nas copias de Google Drive.</p>`,
      async aoEnviar(form) {
        const sel = form.querySelector('input[name=conservar]:checked');
        if (!sel) throw new Error('Escolle unha das dúas.');
        E.sistema = await api('POST', '/api/sincronizar/resolver', { conservar: sel.value });
        return true;
      },
    });
    if (r) {
      await cargaSistema();
      toast('Feito');
      if (E.seccion === 'axustes') pintaAxustes();
    }
  }

  function textoActualizacion(s) {
    if (!s.actualizacions) return '<span class="muted">desactivadas</span>';
    const a = s.actualizacion;
    if (!a) return '<span class="muted">aínda sen comprobar</span>';
    const cando = dataHora(a.data);
    return ({
      'ao-dia': `ao día <span class="faint">(${cando})</span>`,
      instalada: `versión ${esc(a.version)} lista: aplícase ao abrir de novo o Caderno`,
      'precisa-app': `hai unha versión nova (${esc(a.version)}) que hai que instalar a man: avisa`,
      erro: `<span class="muted">${esc(a.mensaxe || 'non se puido comprobar')} (${cando})</span>`,
      desactivado: '<span class="muted">desactivadas</span>',
    })[a.estado] || '';
  }

  function escoitaAccions(el) {
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-accion]');
      if (b && b.type !== 'checkbox') accionCopias(b.dataset.accion, b);
    });
    el.addEventListener('change', ev => {
      if (ev.target.matches('input[type=checkbox][data-accion]')) accionCopias(ev.target.dataset.accion, ev.target);
    });
  }

  // Volve pintar a pantalla onde estean os axustes do iPhone (benvida ou Axustes).
  function repintaMovil() {
    if (!E.clases.length) pintaBenvida();
    else if (E.seccion === 'axustes') pintaAxustes();
  }

  function seccionMovil(benvida) {
    const s = E.sistema;
    const si = s.sincronizacion;
    const ok = t => `<span class="ok">✓ ${t}</span>`;
    const estadoSinc = !s.google || !s.clave ? '<span class="muted">—</span>'
      : si.conflito ? '<span class="malo">hai cambios en dous sitios</span>'
        : `<b>${dataHora(si.ultima)}</b>${si.pendente ? ' <span class="faint">(cambios aínda sen enviar)</span>' : ''}`;
    const pasos = benvida ? `<p style="margin:0 0 12px">Para traer as clases e as notas do Mac: <b>1.</b> conecta a conta de Google da familia e <b>2.</b> pon a clave de recuperación. Os datos chegan sós en poucos segundos.</p>` : '';
    return `<section class="box pad"><h2>${benvida ? 'Traer os datos do Mac' : 'Este iPhone'}</h2>${pasos}
        <div class="pr"><span>Conta de Google</span>${s.google ? ok('conectada') : '<span class="muted">non conectada</span>'}</div>
        <div class="pr"><span>Clave de recuperación</span>${s.clave ? ok('posta') : '<span class="muted">falta</span>'}</div>
        <div class="pr"><span>Sincronizado co Mac</span>${estadoSinc}</div>
        <p class="muted" style="font-size:13px">Os datos gárdanse neste iPhone. Cando hai internet, intercámbianse co Mac a través de Google Drive, sempre cifrados: ao abrir o Caderno tráense os cambios do Mac e uns segundos despois de cada cambio envíanse os deste iPhone.</p>
        <div class="botoes" style="justify-content:flex-start">
          ${s.google && s.clave ? '<button class="btn main" type="button" data-accion="sincronizar">Sincronizar agora</button>' : ''}
          ${si.conflito ? '<button class="btn" type="button" data-accion="conflito">Escoller que datos conservar…</button>' : ''}
          ${s.google ? '' : '<button class="btn main" type="button" data-accion="google">Conectar a conta de Google</button>'}
          <button class="btn" type="button" data-accion="clave-movil">${s.clave ? 'Cambiar a clave' : 'Poñer a clave de recuperación'}</button>
        </div>
        <details class="mais"><summary>Máis opcións</summary>
          <label class="radio"><input type="checkbox" data-accion="modo" ${s.edicion ? 'checked' : ''}><span>Permitir cambios neste iPhone <small class="muted">(se o desmarcas, só se poden consultar as notas)</small></span></label>
          <div class="botoes" style="justify-content:flex-start">
            ${s.google ? '<button class="btn" type="button" data-accion="google-desconectar">Desconectar a conta de Google</button>' : ''}
            <button class="btn perigo" type="button" data-accion="borrar-iphone">Borrar os datos deste iPhone</button>
          </div>
          <p class="faint" style="font-size:12px;margin:8px 0 0">Versión ${esc(s.version)}</p>
        </details></section>`;
  }

  async function dialogoClaveMovil() {
    const r = await dialogo({
      titulo: 'Clave de recuperación',
      boton: 'Gardar',
      html: `<p style="margin:0">As copias de Google Drive van cifradas. Para abrilas neste iPhone fai falta a mesma clave de recuperación que ten o Mac.</p>
        <label class="campo"><span>Clave</span><input name="clave" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE-FGHIJ-…"></label>`,
      async aoEnviar(form) {
        E.sistema = await api('POST', '/api/movil/clave', { clave: form.clave.value });
        return true;
      },
    });
    if (r) {
      toast('Clave gardada');
      repintaMovil();
      await window.CadernoPonte.sincroniza();
    }
  }

  async function accionMovil(accion, boton) {
    const P = window.CadernoPonte;
    const si = E.sistema.sincronizacion;
    try {
      if (accion === 'clave-movil') return dialogoClaveMovil();
      if (accion === 'google') return await P.conectaGoogle();
      if (accion === 'modo') {
        E.sistema = await api('POST', '/api/movil/modo', { edicion: boton.checked });
        await cargaSistema();
        toast(boton.checked ? 'Pódense facer cambios neste iPhone' : 'Este iPhone queda só para consultar');
        return;
      }
      boton.disabled = true;
      if (accion === 'sincronizar') {
        const r = await P.sincroniza();
        const res = r && r.resultado;
        toast(({ ao_dia: 'Xa estaba todo ao día', subido: 'Cambios enviados', baixado: 'Traídos os cambios do Mac',
          conflito: 'Hai cambios en dous sitios: escolle cales conservar' })[res] || 'Non se puido sincronizar: comproba a conexión', !res || res === 'conflito' || res.startsWith('sen') || res === 'erro');
      } else if (accion === 'borrar-iphone') {
        boton.disabled = false;
        const aviso = si.pendente ? ' Ollo: hai cambios deste iPhone que aínda non se enviaron ao Mac e perderanse.' : '';
        if (!(await confirma('Borrar os datos deste iPhone', 'Bórranse deste iPhone as clases, as notas, a clave e a conexión con Google, como se se instalase de novo. O Mac e as copias de Google Drive non se tocan.' + aviso, 'Borrar'))) return;
        return await P.borraTodo();
      } else if (accion === 'google-desconectar') {
        boton.disabled = false;
        if (!(await confirma('Desconectar Google', 'Este iPhone deixará de intercambiar datos co Mac. Os datos que xa ten quedan nel.', 'Desconectar'))) return;
        await P.desconectaGoogle();
      }
      await cargaSistema();
      repintaMovil();
    } catch (e) {
      toast(e.message, true);
      if (boton) boton.disabled = false;
    }
  }

  function seccionCopias() {
    if (esMovil()) return seccionMovil();
    if (!esApp()) {
      return `<section class="box pad"><h2>Copia de seguridade</h2>
        <p class="muted" style="margin:0 0 12px">Descarga a base de datos completa (todas as clases). Contén datos persoais do alumnado: gárdaa nun lugar seguro e non a compartas.</p>
        <a class="btn" href="/api/copia" download>Descargar copia (.sqlite)</a></section>`;
    }
    const s = E.sistema;
    const d = s.drive;
    const estado = !d.configurado ? '<span class="muted">non dispoñible nesta versión</span>'
      : d.caducado ? '<span class="malo">hai que conectalo de novo</span>'
        : d.conectado ? '<span class="ok">✓ conectado</span>' : '<span class="muted">non conectado</span>';
    return `<section class="box pad"><h2>Copias de seguridade</h2>
        <div class="pr"><span>Última copia neste Mac</span><b>${dataHora(s.copias.ultima_local)}</b></div>
        <div class="pr"><span>Última copia en Google Drive <span class="faint">(cifrada)</span></span><b>${d.conectado ? dataHora(s.copias.ultima_drive) : '—'}</b></div>
        <div class="pr"><span>Google Drive</span>${estado}</div>
        ${d.conectado && s.sincronizacion ? `<div class="pr"><span>Sincronizado co iPhone</span>${s.sincronizacion.conflito ? '<span class="malo">hai cambios en dous sitios</span>' : `<b>${dataHora(s.sincronizacion.ultima)}</b>`}</div>` : ''}
        <p class="muted" style="font-size:13px">O caderno fai unha copia neste Mac ao pechar e outra cada día, e garda as 30 últimas. Cando hai internet, garda os cambios cifrados en Google Drive uns segundos despois de facelos: así tamén chegan ao iPhone.</p>
        <div class="botoes" style="justify-content:flex-start">
          <button class="btn main" type="button" data-accion="copia">Facer copia agora</button>
          ${s.sincronizacion && s.sincronizacion.conflito ? '<button class="btn" type="button" data-accion="conflito">Escoller que datos conservar…</button>' : ''}
          <button class="btn" type="button" data-accion="recuperar">Recuperar unha copia…</button>
          ${d.configurado && (!d.conectado || d.caducado) ? '<button class="btn" type="button" data-accion="conectar">Conectar Google Drive</button>' : ''}
          <button class="btn" type="button" data-accion="clave">Clave de recuperación</button>
          ${d.conectado ? '<button class="btn perigo" type="button" data-accion="desconectar">Desconectar Drive</button>' : ''}
        </div></section>
      <section class="box pad"><h2>Programa</h2>
        <div class="pr"><span>Versión</span><b>${esc(s.version)}</b></div>
        <div class="pr"><span>Actualizacións</span><span>${textoActualizacion(s)}</span></div>
        ${s.actualizacions ? '<div class="botoes" style="justify-content:flex-start"><button class="btn" type="button" data-accion="actualizar">Buscar actualizacións</button></div>' : ''}
      </section>`;
  }

  function esperaDrive() {
    let voltas = 0;
    const t = setInterval(async () => {
      await cargaSistema();
      const ok = E.sistema && E.sistema.drive.conectado && !E.sistema.drive.caducado;
      if (ok || ++voltas > 100) {
        clearInterval(t);
        if (ok) toast('Google Drive conectado');
        if (E.seccion === 'axustes') pintaAxustes();
      }
    }, 3000);
  }

  async function accionCopias(accion, boton) {
    try {
      if (accion === 'recuperar') return dialogoRecuperar();
      if (accion === 'clave') return dialogoClave(false);
      if (accion === 'conflito') return dialogoConflito();
      if (esMovil()) return accionMovil(accion, boton);
      boton.disabled = true;
      if (accion === 'copia') {
        E.sistema = await api('POST', '/api/copias');
        toast('Copia feita');
      } else if (accion === 'conectar') {
        await api('POST', '/api/drive/conectar');
        toast('Abriuse o navegador: inicia sesión coa conta de Google e acepta.');
        esperaDrive();
      } else if (accion === 'desconectar') {
        boton.disabled = false;
        if (!(await confirma('Desconectar Google Drive', 'As copias deixarán de subirse a Drive. As que xa están alí non se borran.', 'Desconectar'))) return;
        E.sistema = await api('POST', '/api/drive/desconectar');
      } else if (accion === 'actualizar') {
        boton.textContent = 'Buscando…';
        await api('POST', '/api/actualizacions');
        await cargaSistema();
      }
      if (E.seccion === 'axustes') pintaAxustes();
    } catch (e) {
      toast(e.message, true);
      if (boton) boton.disabled = false;
    }
  }

  async function dialogoClave(primeira) {
    let clave;
    try { clave = (await api('GET', '/api/clave')).clave; } catch (e) { return toast(e.message, true); }
    const ok = await dialogo({
      titulo: 'Clave de recuperación',
      boton: 'Xa a gardei',
      html: `<p style="margin:0">${primeira ? 'É a primeira vez que se abre o Caderno neste Mac. ' : ''}As copias de Google Drive van cifradas. Para abrilas noutro Mac (se este se perde ou estraga) fai falta esta clave:</p>
        <p class="clave">${esc(clave)}</p>
        <p class="muted" style="margin:0;font-size:13px">Gárdaa fóra deste Mac, en papel ou nun xestor de contrasinais, e non a compartas.</p>`,
      aoEnviar: async () => true,
    });
    if (ok) {
      try { E.sistema = await api('POST', '/api/clave/confirmar'); } catch (e) { toast(e.message, true); }
    }
  }

  async function dialogoRecuperar() {
    const s = E.sistema;
    const opcion = (valor, texto) => `<label class="radio"><input type="radio" name="copia" value="${esc(valor)}"><span>${texto}</span></label>`;
    const locais = s.copias.locais.map(c => opcion('local:' + c.nome, `${dataHora(c.data)} <span class="faint">· ${esc(c.motivo)}</span>`)).join('');
    const r = await dialogo({
      titulo: 'Recuperar unha copia',
      boton: 'Recuperar',
      perigo: true,
      html: `<p class="muted" style="margin:0">Os datos actuais substitúense pola copia que escollas. Antes gárdase unha copia dos actuais, por se acaso.</p>
        <fieldset class="campo"><legend>Neste Mac</legend><div class="lista-copias">${locais || '<p class="muted">Aínda non hai copias.</p>'}</div></fieldset>
        ${s.drive.conectado ? `<fieldset class="campo"><legend>Google Drive</legend><div class="lista-copias" id="copias-drive"><p class="muted">Cargando…</p></div></fieldset>
          <label class="campo"><span>Clave de recuperación <small>(só se é un Mac novo)</small></span><input name="clave" autocomplete="off" spellcheck="false"></label>` : ''}`,
      aoAbrir(form) {
        if (!s.drive.conectado) return;
        api('GET', '/api/drive/copias').then(d => {
          $('#copias-drive', form).innerHTML = d.copias.length
            ? d.copias.map(c => opcion('drive:' + c.id, `${dataHora(c.data)} <span class="faint">· ${(c.tamano / 1024).toFixed(0)} KB</span>`)).join('')
            : '<p class="muted">Non hai copias en Drive.</p>';
        }).catch(e => { $('#copias-drive', form).innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
      },
      async aoEnviar(form) {
        const sel = form.querySelector('input[name=copia]:checked');
        if (!sel) throw new Error('Escolle unha copia.');
        const i = sel.value.indexOf(':');
        const orixe = sel.value.slice(0, i);
        const id = sel.value.slice(i + 1);
        if (orixe === 'local') await api('POST', '/api/copias/recuperar', { nome: id });
        else await api('POST', '/api/drive/recuperar', { id, clave: (form.clave && form.clave.value.trim()) || null });
        return true;
      },
    });
    if (r) {
      await cargaClases();
      await cargaSistema();
      toast('Copia recuperada');
      location.hash = '#/';
      navega();
    }
  }

  // --- diálogos ----------------------------------------------------------------------
  function dialogo({ titulo, html, boton = 'Gardar', perigo = false, extra = '', aoAbrir, aoEnviar }) {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form novalidate><div class="dlg-cab"><h2 id="dlg-titulo">${esc(titulo)}</h2></div>
      <div class="dlg-corpo form">${html}<p class="erro-form" role="alert"></p>
      <div class="botoes">${extra}<button type="button" class="btn" data-pechar>Cancelar</button>
      <button type="submit" class="btn main ${perigo ? 'perigo' : ''}">${esc(boton)}</button></div></div></form>`;
    const form = $('form', dlg);
    return new Promise(resolve => {
      let feito = false;
      form.addEventListener('submit', async ev => {
        ev.preventDefault();
        const b = $('button[type=submit]', form);
        b.disabled = true;
        try {
          const r = await aoEnviar(form);
          feito = true;
          dlg.close();
          resolve(r ?? true);
        } catch (e) {
          $('.erro-form', form).textContent = e.message;
        } finally { b.disabled = false; }
      });
      $('[data-pechar]', form).onclick = () => dlg.close();
      // Ignora o evento «close» atrasado dun diálogo anterior (chega cando este xa está aberto).
      const aoPechar = () => {
        if (dlg.open) return;
        dlg.removeEventListener('close', aoPechar);
        if (!feito) resolve(null);
      };
      dlg.addEventListener('close', aoPechar);
      dlg.showModal();
      if (aoAbrir) aoAbrir(form);
      const primeiro = $('input:not([type=radio]),select,textarea', form);
      if (primeiro) primeiro.focus();
    });
  }

  function confirma(titulo, texto, boton) {
    return dialogo({ titulo, html: `<p style="margin:0">${esc(texto)}</p>`, boton, perigo: true, aoEnviar: async () => true });
  }

  // --- inicio --------------------------------------------------------------------------
  function inicia() {
    $('#sel-clase').onchange = ev => {
      const id = Number(ev.target.value);
      const arg = ['notas', 'estatisticas'].includes(E.seccion) ? E.ultimaAv : null;
      location.hash = href(E.seccion === 'informe' ? 'notas' : E.seccion, arg, id);
    };
    // Na aplicación de Mac, Excel e informe ábrense no navegador (descargas e impresión).
    $('#b-xls').onclick = () => {
      const ruta = `/exportar/clase-${E.clase.id}.xlsx`;
      if (esApp()) api('POST', '/api/abrir', { ruta }).catch(e => toast(e.message, true));
      else if (esMovil()) window.CadernoPonte.descarga(ruta).catch(e => toast(e.message, true));
      else location.href = ruta;
    };
    $('#b-pdf').onclick = () => {
      const av = ['notas', 'estatisticas'].includes(E.seccion) ? E.ultimaAv : '1';
      const ruta = href('informe', av) + '/auto';
      if (esApp()) api('POST', '/api/abrir', { ruta: '/' + ruta }).catch(e => toast(e.message, true));
      else if (esMovil()) location.hash = ruta;
      else window.open(ruta, '_blank', 'noopener');
    };
    $('#b-nova').onclick = () => dialogoProba(null, avNumerica());
    $('#b-nova-clase').onclick = dialogoClase;
    window.addEventListener('hashchange', navega);
    Promise.all([cargaClases(), cargaSistema()]).then(() => {
      navega();
      if (esApp() && E.sistema.clave_sen_confirmar) dialogoClave(true);
    }).catch(pintaErro);
    if (window.CadernoPonte) {
      window.addEventListener('caderno-sincronizado', () => cargaSistema());
      window.CadernoPonte.volta.then(r => {
        if (r === 'ok') toast('Conta de Google conectada');
        else if (r) toast(r, true);
      });
    }
    $('#avisos').addEventListener('click', ev => {
      if (ev.target.closest('[data-accion=conflito]')) dialogoConflito();
    });
    setInterval(cargaSistema, 30 * 1000);
  }

  inicia();
})();
