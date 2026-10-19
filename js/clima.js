/* ==========================================================================
   SMA · Silvicultura — Clima nas Fazendas (Home)
   Versão compacta (mapa + resumo), tela cheia (camadas, radar, filtros, tabela) e detalhe da fazenda.
   Os dados vêm do servidor (/api/clima): coordenadas já corrigidas, previsão Open-Meteo e janela de
   aplicação calculada com os limites de js/dados.js → CLIMA. Mapa e gráficos só carregam quando o bloco aparece.
   ========================================================================== */

(() => {
  const CFG = window.SMA_DADOS?.CLIMA;
  const secao = document.getElementById('clima');
  if (!CFG || !secao) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const n1 = v => (v == null || !Number.isFinite(+v) ? '—' : (+v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const n0 = v => (v == null || !Number.isFinite(+v) ? '—' : Math.round(+v).toLocaleString('pt-BR'));
  const comServidor = /^https?:$/.test(location.protocol);

  /* ---------- Status da janela e tempo (códigos WMO) ---------- */
  const STATUS = [
    { nome: 'Janela ideal', curto: 'Ideal', cor: '#22e07a' },
    { nome: 'Atenção', curto: 'Atenção', cor: '#ffc83d' },
    { nome: 'Não aplicar', curto: 'Não aplicar', cor: '#ff4d5e' }
  ];
  const SEM = { nome: 'Sem dado', curto: '—', cor: '#64748b' };
  const st = s => STATUS[s] || SEM;
  function tempo(c) {
    if (c == null) return ['❔', 'Sem dado'];
    if (c === 0) return ['☀️', 'Céu limpo']; if (c === 1) return ['🌤️', 'Predomínio de sol']; if (c === 2) return ['⛅', 'Parcialmente nublado']; if (c === 3) return ['☁️', 'Nublado'];
    if (c === 45 || c === 48) return ['🌫️', 'Nevoeiro'];
    if (c >= 51 && c <= 55) return ['🌦️', c === 55 ? 'Garoa forte' : 'Garoa']; if (c === 56 || c === 57) return ['🌧️', 'Garoa congelante'];
    if (c === 61) return ['🌧️', 'Chuva fraca']; if (c === 63) return ['🌧️', 'Chuva moderada']; if (c === 65) return ['🌧️', 'Chuva forte']; if (c === 66 || c === 67) return ['🌧️', 'Chuva congelante'];
    if (c >= 71 && c <= 77) return ['🌨️', 'Neve']; if (c === 80) return ['🌦️', 'Pancadas fracas']; if (c === 81) return ['🌧️', 'Pancadas de chuva']; if (c === 82) return ['⛈️', 'Pancadas fortes'];
    if (c === 85 || c === 86) return ['🌨️', 'Pancadas de neve']; if (c === 95) return ['⛈️', 'Trovoadas']; if (c >= 96) return ['⛈️', 'Trovoadas com granizo'];
    return ['🌥️', 'Variável'];
  }
  const direcao = g => (g == null ? '' : ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(g / 45) % 8]);
  // Chuva prevista (mm) em escala de azul
  const CHUVA = [[0.1, '#64748b', 'sem chuva'], [1, '#bae6fd', 'até 1 mm'], [5, '#7dd3fc', '1 a 5 mm'], [15, '#38bdf8', '5 a 15 mm'], [30, '#0284c7', '15 a 30 mm'], [Infinity, '#1e3a8a', 'acima de 30 mm']];
  const corChuva = mm => (mm == null ? SEM.cor : CHUVA.find(([lim]) => mm < lim)[1]);
  const horaBR = iso => (iso ? `${iso.slice(11, 13)}h` : '');

  /* ---------- Estado ---------- */
  const estado = { dados: null, fazendas: [], modo: 'agora', camada: 'satelite', busca: '', municipio: '', fazenda: '', carregando: false };
  const pontoDe = f => estado.dados?.pontos?.[f.ponto];

  /* ---------- Bibliotecas sob demanda ---------- */
  const carregar = (tag, attrs) => new Promise((ok, falha) => { const e = document.createElement(tag); Object.assign(e, attrs); e.onload = ok; e.onerror = () => falha(new Error(`não carregou ${attrs.src || attrs.href}`)); document.head.appendChild(e); });
  let libs = null;
  const leaflet = () => (libs ||= Promise.all([
    window.L ? null : carregar('link', { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css' }),
    window.L ? null : carregar('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js' })
  ]));
  let chartLib = null;
  const chartjs = () => (chartLib ||= (window.Chart ? Promise.resolve() : carregar('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js' })));

  /* ---------- Dados ---------- */
  // 1º o servidor (resultado compartilhado, em cache); se ele não responder a tempo, o próprio navegador
  // calcula com o mesmo motor (js/clima-motor.js), consultando o Open-Meteo direto.
  let motorLocal = null;
  const horariasLocais = new Map();
  const motor = async () => (motorLocal ||= await import(new URL('js/clima-motor.js', location.href).href));
  async function buscar(fresco = false) {
    if (comServidor) {
      try {
        const r = await fetch(`api/clima${fresco ? '?fresco=1' : ''}`, { cache: fresco ? 'no-store' : 'default', signal: AbortSignal.timeout(25_000) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
        if (!j.semPrevisao || j.semPrevisao < Object.keys(j.pontos || {}).length / 4) return { ...j, origem: 'servidor' };
        throw new Error(`${j.semPrevisao} pontos sem previsão no servidor`);
      } catch (erro) { console.warn('Clima: servidor não respondeu a tempo; calculando no navegador.', erro.message); }
    }
    return calcularNoNavegador();
  }
  async function calcularNoNavegador() {
    const M = await motor();
    const tentativas = [
      ...(comServidor ? [`api/planilha?id=${CFG.planilha}&gid=${CFG.aba}`] : []),
      `https://docs.google.com/spreadsheets/d/${CFG.planilha}/export?format=csv&gid=${CFG.aba}`
    ];
    let texto = null, ultimoErro;
    for (const url of tentativas) {
      try { const r = await fetch(url, { signal: AbortSignal.timeout(25_000) }); const t = await r.text(); if (!r.ok || /^\s*[{<]/.test(t)) throw new Error(`planilha: erro ${r.status}`); texto = t; break; } catch (e) { ultimoErro = e; }
    }
    if (!texto) throw ultimoErro || new Error('planilha de coordenadas indisponível');
    const d = await M.montarResumo(texto, CFG, (id, h) => horariasLocais.set(id, { quando: Date.now(), hourly: h }));
    if (!Object.keys(d.pontos).length) throw new Error('o Open-Meteo não respondeu');
    return { ...d, origem: 'navegador' };
  }
  async function detalheDoPonto(id) {
    if (comServidor && estado.dados?.origem !== 'navegador') {
      try {
        const r = await fetch(`api/clima/ponto/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20_000) });
        if (r.ok) return r.json();
      } catch { /* cai para o navegador */ }
    }
    const M = await motor();
    let h = horariasLocais.get(id);
    if (!h || Date.now() - h.quando > CFG.cacheMin * 60_000) {
      const p = M.pontoValido(id, CFG); if (!p) throw new Error('ponto inválido');
      const [hourly] = await M.previsao([p]);
      if (!hourly) throw new Error('o Open-Meteo não respondeu');
      h = { quando: Date.now(), hourly }; horariasLocais.set(id, h);
    }
    return M.montarDetalhe(id, h.hourly, CFG, h.quando);
  }
  const CHAVE_CACHE = 'clima:resumo';
  function doCache() { try { const c = JSON.parse(localStorage.getItem(CHAVE_CACHE) || 'null'); return c && Date.now() - c.quando < CFG.cacheMin * 60_000 ? c.dados : null; } catch { return null; } }
  function guardar(d) { try { localStorage.setItem(CHAVE_CACHE, JSON.stringify({ quando: Date.now(), dados: d })); } catch { /* sem espaço: segue */ } }

  async function atualizar(fresco = false) {
    if (estado.carregando) return;
    estado.carregando = true;
    const bt = $('#clima-atualizar'); bt.disabled = true; bt.classList.add('girando');
    mostrarEstado('carregando');
    try {
      const d = (!fresco && doCache()) || await buscar(fresco);
      guardar(d);
      estado.dados = d;
      estado.fazendas = d.fazendas;
      mostrarEstado(null);
      renderTudo();
    } catch (erro) {
      console.warn('Clima: falha ao carregar', erro);
      mostrarEstado('erro', erro.message);
    } finally {
      estado.carregando = false; bt.disabled = false; bt.classList.remove('girando');
    }
  }
  function mostrarEstado(tipo, msg = '') {
    const el = $('#clima-estado');
    el.hidden = !tipo;
    if (tipo === 'carregando') el.innerHTML = '<span class="clima-spinner" aria-hidden="true"></span><span>Carregando a previsão das fazendas…</span>';
    if (tipo === 'erro') el.innerHTML = `<i data-lucide="cloud-off"></i><div><strong>Não consegui carregar o clima agora</strong><p>${esc(msg)}. O resto da página segue normal; tente "Atualizar previsão" em instantes.</p></div>`;
    el.classList.toggle('erro', tipo === 'erro');
    icones();
  }

  /* ---------- Resumo / KPIs / lista ---------- */
  const itens = () => estado.fazendas.map(f => ({ f, p: pontoDe(f) })).filter(x => x.p);
  function renderKPIs() {
    const xs = itens(), tot = xs.length;
    const boas = xs.filter(x => x.p.agora.status === 0).length;
    const chuva = xs.filter(x => (x.p.chuvaHoje || 0) >= CFG.chuvaHojeMm).length;
    const raj = xs.reduce((m, x) => ((x.p.rajadaHoje ?? -1) > (m?.p.rajadaHoje ?? -1) ? x : m), null);
    const media7 = tot ? xs.reduce((s, x) => s + (x.p.chuva7d || 0), 0) / tot : null;
    $('#clima-kpis').innerHTML = [
      ['badge-check', 'Janela boa agora', `${n0(boas)}<small> de ${n0(tot)}</small>`, '#22e07a'],
      ['cloud-rain', 'Chuva prevista hoje', `${n0(chuva)}<small> fazendas</small>`, '#38bdf8'],
      ['wind', 'Maior rajada hoje', raj ? `${n0(raj.p.rajadaHoje)}<small> km/h</small>` : '—', '#fb923c', raj ? raj.f.nome : ''],
      ['droplets', 'Chuva média em 7 dias', `${n1(media7)}<small> mm</small>`, '#7dd3fc']
    ].map(([ic, rot, val, cor, sub]) => `<div class="clima-kpi" style="--c:${cor}"><i data-lucide="${ic}"></i><span>${rot}</span><b>${val}</b>${sub ? `<small title="${esc(sub)}">${esc(sub)}</small>` : ''}</div>`).join('');
  }
  const ordemStatus = x => (x.p.agora.status == null ? 3 : 2 - x.p.agora.status);   // vermelho primeiro
  function renderLista() {
    const xs = itens().sort((a, b) => ordemStatus(a) - ordemStatus(b) || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
    $('#clima-lista').innerHTML = xs.map(({ f, p }) => {
      const s = st(p.agora.status), [ic] = tempo(p.agora.codigo);
      return `<button type="button" class="clima-item" role="listitem" data-faz="${esc(f.nome)}" style="--c:${s.cor}">
        <i class="clima-ponto" aria-hidden="true"></i>
        <span class="clima-item-nome"><b>${esc(f.nome)}</b><small>${esc(f.municipio)} · ${s.curto}</small></span>
        <span class="clima-item-num"><b>${ic} ${n0(p.agora.t)}°</b><small>💨 ${n0(p.agora.vento)} · 💧 ${n1(p.chuvaHoje)} mm</small></span></button>`;
    }).join('') || '<p class="clima-vazio">Nenhuma fazenda com previsão.</p>';
  }
  function renderRodape() {
    const d = estado.dados;
    $('#clima-hora').textContent = d ? `Atualizado às ${new Date(d.atualizado).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}${d.origem === 'navegador' ? ' (calculado neste navegador)' : ''}` : '—';
    const inv = d?.invalidos?.qtd || 0, av = $('#clima-aviso');
    av.hidden = !inv;
    av.textContent = inv ? `${inv} ${inv === 1 ? 'ponto' : 'pontos'} com coordenada inválida` : '';
    av.title = inv ? d.invalidos.exemplos.map(x => `${x.fazenda}: ${x.latitude} / ${x.longitude}`).join('\n') : '';
  }

  /* ---------- Mapas (compacto e tela cheia usam o mesmo desenho) ---------- */
  const BASES = {
    satelite: () => window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Imagens © Esri' }),
    mapa: () => window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' })
  };
  const corDe = (x, modo) => {
    if (modo === 'agora') return st(x.p.agora.status).cor;
    const mm = modo === 'hoje' ? x.p.chuvaHoje : modo === 'amanha' ? x.p.chuvaAmanha : x.p.chuva7d;
    return corChuva(mm);
  };
  const valorModo = (x, modo) => (modo === 'agora' ? `${n0(x.p.agora.t)}°` : `${n1(modo === 'hoje' ? x.p.chuvaHoje : modo === 'amanha' ? x.p.chuvaAmanha : x.p.chuva7d)} mm`);
  function dica(x) {
    const a = x.p.agora, s = st(a.status), [ic, desc] = tempo(a.codigo);
    return `<div class="clima-dica"><b>${esc(x.f.nome)}</b><small>${esc(x.f.municipio)}</small>
      <span>${ic} ${desc} · <b>${n1(a.t)} °C</b> · 💧 ${n0(a.ur)}%</span>
      <span>💨 ${n0(a.vento)} km/h ${direcao(a.direcao)} · rajada ${n0(a.rajada)} km/h</span>
      <span class="clima-dica-st" style="--c:${s.cor}">● ${s.nome}${a.motivo ? ` — ${esc(a.motivo)}` : ''}</span></div>`;
  }

  // Desenha camadas: contornos (perto), bolinhas (longe) e marcadores com ícone + temperatura (perto)
  function criarCamadas(mapa, filtro = () => true, modo = 'agora') {
    const L = window.L, render = L.canvas({ padding: .4 });
    const contornos = L.layerGroup(), bolinhas = L.layerGroup(), marcadores = L.layerGroup();
    const porNome = new Map();
    itens().filter(filtro).forEach(x => {
      const cor = corDe(x, modo);
      if (x.f.contorno.length >= 3) L.polygon(x.f.contorno, { renderer: render, color: cor, weight: 1.5, opacity: .9, fillColor: cor, fillOpacity: .18, smoothFactor: 1.5, interactive: false }).addTo(contornos);
      const b = L.circleMarker([x.f.lat, x.f.lon], { renderer: render, radius: 6, color: '#04120f', weight: 1.5, fillColor: cor, fillOpacity: .95 })
        .bindTooltip(dica(x), { className: 'clima-tooltip', direction: 'top', offset: [0, -6] }).on('click', () => abrirDetalhe(x.f.nome));
      b.addTo(bolinhas);
      const [ic] = tempo(x.p.agora.codigo);
      const m = L.marker([x.f.lat, x.f.lon], { icon: L.divIcon({ className: 'clima-marcador', html: `<span style="--c:${cor}"><em>${modo === 'agora' ? ic : '💧'}</em>${valorModo(x, modo)}</span>`, iconSize: null }), riseOnHover: true })
        .bindTooltip(dica(x), { className: 'clima-tooltip', direction: 'top', offset: [0, -14] }).on('click', () => abrirDetalhe(x.f.nome));
      m.addTo(marcadores);
      porNome.set(x.f.nome, { x, b, m });
    });
    const ajustar = () => {
      const z = mapa.getZoom();
      [[contornos, z >= 9], [bolinhas, z < 10], [marcadores, z >= 10]].forEach(([g, ver]) => { if (ver && !mapa.hasLayer(g)) g.addTo(mapa); if (!ver && mapa.hasLayer(g)) mapa.removeLayer(g); });
    };
    mapa.on('zoomend', ajustar); ajustar();
    return { remover: () => { mapa.off('zoomend', ajustar); [contornos, bolinhas, marcadores].forEach(g => mapa.removeLayer(g)); }, porNome };
  }
  function limites(filtro = () => true) {
    const xs = itens().filter(filtro);
    if (!xs.length) return null;
    return window.L.latLngBounds(xs.map(x => [x.f.lat, x.f.lon])).pad(.08);
  }

  let mapaHome = null, camadasHome = null;
  function enquadrarHome() {
    const b = limites(); if (!b || !mapaHome) return;
    mapaHome._enquadrando = true; mapaHome.fitBounds(b, { animate: false }); mapaHome._enquadrando = false;
  }
  async function renderMapaHome() {
    await leaflet();
    const L = window.L;
    if (!mapaHome) {
      mapaHome = L.map('clima-mapa', { zoomControl: true, scrollWheelZoom: false, attributionControl: true, preferCanvas: true });
      BASES.satelite().addTo(mapaHome);
      mapaHome.on('focus click', () => mapaHome.scrollWheelZoom.enable());
      mapaHome.on('mouseout', () => mapaHome.scrollWheelZoom.disable());
      // enquanto a pessoa não mexer no mapa, ele se reenquadra quando o espaço muda (celular, giro da tela…)
      let mexeu = false;
      mapaHome.on('dragstart zoomstart', e => { if (!mapaHome._enquadrando) mexeu = true; });
      new ResizeObserver(() => { mapaHome.invalidateSize(); if (!mexeu) enquadrarHome(); }).observe($('#clima-mapa'));
    }
    camadasHome?.remover();
    camadasHome = criarCamadas(mapaHome);
    enquadrarHome();
    $('#clima-legenda').innerHTML = STATUS.map(s => `<span><i style="--c:${s.cor}"></i>${s.curto}</span>`).join('') + '<span class="clima-leg-dica">aproxime para ver ícone e temperatura</span>';
    setTimeout(() => mapaHome.invalidateSize(), 50);
  }

  function renderTudo() {
    renderKPIs(); renderLista(); renderRodape();
    renderMapaHome().catch(e => mostrarEstado('erro', `mapa indisponível (${e.message})`));
    if (tela.aberta) renderTela();
    icones();
  }

  // Lista e botões da versão compacta
  $('#clima-lista').addEventListener('click', e => { const b = e.target.closest('[data-faz]'); if (b) abrirDetalhe(b.dataset.faz); });
  $('#clima-atualizar').addEventListener('click', () => atualizar(true));
  $('#clima-abrir').addEventListener('click', () => abrirTela());

  /* ======================================================================
     TELA CHEIA
     ====================================================================== */
  const tela = { aberta: false, mapa: null, base: null, camadas: null, radar: null };
  function montarTela() {
    if ($('#clima-tela')) return;
    const el = document.createElement('div');
    el.className = 'clima-tela'; el.id = 'clima-tela'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Clima nas fazendas em tela cheia');
    el.innerHTML = `
      <header class="clima-tela-topo">
        <div class="clima-tela-tit"><span class="eyebrow">Tempo</span><h2>Clima nas <span class="serif">Fazendas</span></h2></div>
        <div class="clima-tela-ctrl">
          <div class="clima-seg" data-grupo="modo" role="group" aria-label="Período">
            <button type="button" data-v="agora">Agora</button><button type="button" data-v="hoje">Hoje</button><button type="button" data-v="amanha">Amanhã</button><button type="button" data-v="7d">7 dias</button>
          </div>
          <div class="clima-seg" data-grupo="camada" role="group" aria-label="Camada do mapa">
            <button type="button" data-v="satelite">Satélite</button><button type="button" data-v="mapa">Mapa</button><button type="button" data-v="radar">Radar de chuva</button>
          </div>
          <label class="clima-campo"><i data-lucide="map-pin"></i><select id="clima-f-mun" aria-label="Município"></select></label>
          <label class="clima-campo"><i data-lucide="trees"></i><select id="clima-f-faz" aria-label="Fazenda"></select></label>
          <label class="clima-campo clima-busca"><i data-lucide="search"></i><input type="search" id="clima-f-busca" placeholder="Buscar fazenda" aria-label="Buscar fazenda"></label>
          <button type="button" class="clima-tbtn" id="clima-t-atualizar"><i data-lucide="refresh-cw"></i><span>Atualizar</span></button>
          <button type="button" class="clima-tbtn clima-fechar" id="clima-t-fechar" aria-label="Fechar tela cheia"><i data-lucide="x"></i><span>Fechar</span></button>
        </div>
      </header>
      <div class="clima-tela-corpo">
        <div class="clima-tela-mapa-wrap">
          <div class="clima-tela-mapa" id="clima-tela-mapa"></div>
          <div class="clima-radar" id="clima-radar" hidden><button type="button" id="clima-radar-play" aria-label="Pausar radar"><i data-lucide="pause"></i></button><span id="clima-radar-hora">—</span></div>
          <div class="clima-legenda" id="clima-tela-legenda"></div>
        </div>
        <div class="clima-tela-tabela"><div class="clima-alertas" id="clima-alertas"></div><div id="clima-tabela"></div></div>
      </div>
      <footer class="clima-tela-rodape">Previsão: Open-Meteo · Radar: RainViewer · Imagens: Esri · <span id="clima-t-hora"></span></footer>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('.clima-seg button'); if (!b) return;
      const g = b.closest('.clima-seg').dataset.grupo;
      estado[g] = b.dataset.v;
      if (g === 'camada') trocarCamada(); else renderTela();
      marcarSegmentos();
    });
    $('#clima-f-mun', el).addEventListener('change', e => { estado.municipio = e.target.value; estado.fazenda = ''; renderTela(true); });
    $('#clima-f-faz', el).addEventListener('change', e => { estado.fazenda = e.target.value; renderTela(true); });
    let espera; $('#clima-f-busca', el).addEventListener('input', e => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = e.target.value; renderTela(true); }, 200); });
    $('#clima-t-atualizar', el).addEventListener('click', () => atualizar(true));
    $('#clima-t-fechar', el).addEventListener('click', fecharTela);
    $('#clima-tabela', el).addEventListener('click', e => {
      const tr = e.target.closest('tr[data-faz]'); if (!tr) return;
      if (e.target.closest('.clima-detalhe-btn')) return abrirDetalhe(tr.dataset.faz);
      centrar(tr.dataset.faz);
    });
    $('#clima-radar-play', el).addEventListener('click', () => { tela.radar && (tela.radar.tocando ? pararRadar() : tocarRadar()); });
  }
  function marcarSegmentos() { $$('#clima-tela .clima-seg button').forEach(b => { const g = b.closest('.clima-seg').dataset.grupo; const at = estado[g] === b.dataset.v || (g === 'camada' && estado.camada === 'radar' && b.dataset.v === 'radar'); b.classList.toggle('ativo', at); b.setAttribute('aria-pressed', String(at)); }); }
  const filtroTela = x => (!estado.municipio || x.f.municipio === estado.municipio) && (!estado.fazenda || x.f.nome === estado.fazenda) && (!estado.busca || norm(x.f.nome).includes(norm(estado.busca)));

  async function abrirTela() {
    montarTela();
    const el = $('#clima-tela'); el.hidden = false; tela.aberta = true;
    document.body.classList.add('clima-sem-rolagem');
    marcarSegmentos(); icones();
    if (!estado.dados) { await atualizar(); if (!estado.dados) return; }
    await leaflet();
    if (!tela.mapa) {
      tela.mapa = window.L.map('clima-tela-mapa', { zoomControl: true, preferCanvas: true });
      trocarCamada();
    }
    renderTela(true);
    setTimeout(() => tela.mapa.invalidateSize(), 60);
    $('#clima-t-fechar').focus();
  }
  function fecharTela() {
    $('#clima-tela').hidden = true; tela.aberta = false; pararRadar();
    document.body.classList.remove('clima-sem-rolagem');
    $('#clima-abrir').focus();
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('#clima-detalhe') && !$('#clima-detalhe').hidden) return fecharDetalhe();
    if (tela.aberta) fecharTela();
  });

  function renderTela(enquadrar = false) {
    if (!tela.aberta || !estado.dados) return;
    const todos = itens();
    // filtros
    const muns = [...new Set(todos.map(x => x.f.municipio))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    $('#clima-f-mun').innerHTML = `<option value="">Todos os municípios</option>${muns.map(m => `<option ${m === estado.municipio ? 'selected' : ''}>${esc(m)}</option>`).join('')}`;
    const fazs = todos.filter(x => !estado.municipio || x.f.municipio === estado.municipio).map(x => x.f.nome);
    $('#clima-f-faz').innerHTML = `<option value="">Todas as fazendas</option>${fazs.map(n => `<option ${n === estado.fazenda ? 'selected' : ''}>${esc(n)}</option>`).join('')}`;
    // mapa
    tela.camadas?.remover();
    tela.camadas = criarCamadas(tela.mapa, filtroTela, estado.modo);
    if (enquadrar) { const b = limites(filtroTela); if (b) tela.mapa.fitBounds(b, { maxZoom: 13 }); }
    $('#clima-tela-legenda').innerHTML = estado.modo === 'agora'
      ? STATUS.map(s => `<span><i style="--c:${s.cor}"></i>${s.nome}</span>`).join('')
      : `<span class="clima-leg-tit">Chuva ${estado.modo === 'hoje' ? 'hoje' : estado.modo === 'amanha' ? 'amanhã' : 'em 7 dias'}</span>` + CHUVA.map(([, c, r]) => `<span><i style="--c:${c}"></i>${r}</span>`).join('');
    // alertas e tabela
    const xs = todos.filter(filtroTela).sort((a, b) => ordemStatus(a) - ordemStatus(b) || a.f.nome.localeCompare(b.f.nome, 'pt-BR'));
    const comAlerta = xs.filter(x => x.p.alertas.length);
    const tipos = { chuva: ['cloud-rain-wind', 'Chuva forte'], vento: ['wind', 'Rajadas'], calor: ['thermometer-sun', 'Calor'], geada: ['snowflake', 'Geada'] };
    const cont = {}; comAlerta.forEach(x => new Set(x.p.alertas.map(a => a.tipo)).forEach(t => { cont[t] = (cont[t] || 0) + 1; }));
    $('#clima-alertas').innerHTML = Object.keys(cont).length
      ? Object.entries(cont).map(([t, q]) => `<span class="clima-alerta ${t}"><i data-lucide="${tipos[t][0]}"></i>${tipos[t][1]} · <b>${q}</b> ${q === 1 ? 'fazenda' : 'fazendas'}</span>`).join('')
      : '<span class="clima-alerta ok"><i data-lucide="shield-check"></i>Sem alertas nos próximos 7 dias</span>';
    $('#clima-tabela').innerHTML = `<table class="tabela clima-tab">
      <thead><tr><th>Fazenda</th><th>Município</th><th>Agora</th><th>Janela agora</th><th>Próxima janela boa</th><th>Chuva hoje</th><th>Chuva 7 dias</th><th>Alerta</th></tr></thead>
      <tbody>${xs.map(({ f, p }) => { const a = p.agora, s = st(a.status), [ic] = tempo(a.codigo); return `<tr data-faz="${esc(f.nome)}" style="--sc-linha:${s.cor}" title="Clique para centralizar no mapa">
        <th scope="row"><button type="button" class="clima-detalhe-btn" title="Ver detalhe">${esc(f.nome)}</button></th><td>${esc(f.municipio)}</td>
        <td>${ic} ${n1(a.t)} °C · ${n0(a.ur)}% · ${n0(a.vento)} km/h</td>
        <td><span class="clima-pill" style="--c:${s.cor}">${s.curto}</span></td>
        <td>${p.proximaJanela ? esc(p.proximaJanela.agora ? `Agora até ${p.proximaJanela.rotulo.split('–')[1]}` : p.proximaJanela.rotulo) : '<span class="clima-mudo">nenhuma em 7 dias</span>'}</td>
        <td class="num">${n1(p.chuvaHoje)} mm</td><td class="num">${n1(p.chuva7d)} mm</td>
        <td>${p.alertas.length ? `<span class="clima-alerta-mini" title="${esc(p.alertas.map(x => x.texto).join('\n'))}">⚠️ ${esc(p.alertas[0].texto)}${p.alertas.length > 1 ? ` +${p.alertas.length - 1}` : ''}</span>` : '—'}</td></tr>`; }).join('') || '<tr><td colspan="8" class="vazio">Nenhuma fazenda com esses filtros.</td></tr>'}</tbody></table>`;
    $('#clima-t-hora').textContent = $('#clima-hora').textContent;
    icones();
  }
  function centrar(nome) {
    const r = tela.camadas?.porNome.get(nome); if (!r) return;
    const f = r.x.f;
    const b = f.contorno.length >= 3 ? window.L.latLngBounds(f.contorno) : null;
    if (b) tela.mapa.fitBounds(b.pad(.6), { maxZoom: 14 }); else tela.mapa.setView([f.lat, f.lon], 13);
    setTimeout(() => r.m.openTooltip(), 400);
  }

  /* ---------- Camadas: satélite, mapa e radar animado (RainViewer) ---------- */
  function trocarCamada() {
    const L = window.L; if (!tela.mapa) return;
    if (tela.base) tela.mapa.removeLayer(tela.base);
    tela.base = (estado.camada === 'mapa' ? BASES.mapa() : BASES.satelite()).addTo(tela.mapa);
    if (estado.camada === 'radar') iniciarRadar(); else { pararRadar(); removerRadar(); }
    marcarSegmentos();
  }
  async function iniciarRadar() {
    $('#clima-radar').hidden = false;
    try {
      if (!tela.radar) {
        const r = await fetch('https://api.rainviewer.com/public/weather-maps.json');
        const j = await r.json();
        const quadros = [...(j.radar?.past || []), ...(j.radar?.nowcast || [])];
        if (!quadros.length) throw new Error('sem imagens de radar');
        tela.radar = { quadros, camadas: quadros.map(q => window.L.tileLayer(`${j.host}${q.path}/256/{z}/{x}/{y}/2/1_1.png`, { opacity: 0, zIndex: 400, maxNativeZoom: 7, maxZoom: 18 })), i: quadros.length - 1, tocando: false, timer: null };
        tela.radar.camadas.forEach(c => c.addTo(tela.mapa));
      }
      mostrarQuadro(tela.radar.i); tocarRadar();
    } catch (erro) { $('#clima-radar-hora').textContent = `Radar indisponível (${erro.message})`; }
  }
  function mostrarQuadro(i) {
    const R = tela.radar; if (!R) return;
    R.camadas.forEach((c, k) => c.setOpacity(k === i ? .7 : 0)); R.i = i;
    const q = R.quadros[i], d = new Date(q.time * 1000);
    $('#clima-radar-hora').textContent = `${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}${q.time * 1000 > Date.now() ? ' · previsão' : ''}`;
  }
  function tocarRadar() { const R = tela.radar; if (!R) return; clearInterval(R.timer); R.tocando = true; R.timer = setInterval(() => mostrarQuadro((R.i + 1) % R.quadros.length), 700); $('#clima-radar-play').innerHTML = '<i data-lucide="pause"></i>'; $('#clima-radar-play').setAttribute('aria-label', 'Pausar radar'); icones(); }
  function pararRadar() { const R = tela.radar; if (!R) return; clearInterval(R.timer); R.tocando = false; const b = $('#clima-radar-play'); if (b) { b.innerHTML = '<i data-lucide="play"></i>'; b.setAttribute('aria-label', 'Animar radar'); icones(); } }
  function removerRadar() { if (tela.radar) { tela.radar.camadas.forEach(c => tela.mapa.removeLayer(c)); tela.radar = null; } const r = $('#clima-radar'); if (r) r.hidden = true; }

  /* ======================================================================
     DETALHE DA FAZENDA
     ====================================================================== */
  let grafico = null;
  function montarDetalhe() {
    if ($('#clima-detalhe')) return;
    const el = document.createElement('div');
    el.className = 'clima-detalhe'; el.id = 'clima-detalhe'; el.hidden = true;
    el.innerHTML = `<div class="clima-detalhe-fundo" data-fechar></div>
      <aside class="clima-detalhe-painel glass" role="dialog" aria-modal="true" aria-labelledby="clima-d-nome">
        <button type="button" class="clima-detalhe-fechar" data-fechar aria-label="Fechar detalhe"><i data-lucide="x"></i></button>
        <div id="clima-d-corpo"></div>
      </aside>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target.closest('[data-fechar]')) fecharDetalhe(); if (e.target.closest('#clima-d-ativ')) carregarAtividades(); });
  }
  function fecharDetalhe() { $('#clima-detalhe').hidden = true; if (!tela.aberta) document.body.classList.remove('clima-sem-rolagem'); grafico?.destroy(); grafico = null; }

  async function abrirDetalhe(nome) {
    montarDetalhe();
    const f = estado.fazendas.find(x => x.nome === nome), p = f && pontoDe(f);
    if (!f || !p) return;
    const el = $('#clima-detalhe'); el.hidden = false; document.body.classList.add('clima-sem-rolagem');
    el.dataset.fazenda = nome;
    const a = p.agora, s = st(a.status), [ic, desc] = tempo(a.codigo);
    const pass = p.chuvaPassada7d ?? 0, favoravel = pass >= CFG.plantio.chuva7dMm;
    $('#clima-d-corpo').innerHTML = `
      <header class="clima-d-topo" style="--c:${s.cor}">
        <span class="eyebrow">${esc(f.municipio)}</span>
        <h3 id="clima-d-nome">${esc(f.nome)}</h3>
        <div class="clima-d-agora"><span class="clima-d-ic">${ic}</span><div><b>${n1(a.t)} °C</b><small>${desc} · 💧 ${n0(a.ur)}% · 💨 ${n0(a.vento)} km/h ${direcao(a.direcao)} (rajada ${n0(a.rajada)})</small></div></div>
        <div class="clima-d-status"><span class="clima-pill" style="--c:${s.cor}">${s.nome}</span>${a.motivo ? `<small>${esc(a.motivo)}</small>` : ''}${a.deltaT != null ? `<small>Delta T ${n1(a.deltaT)} °C</small>` : ''}</div>
        <p class="clima-d-prox"><i data-lucide="calendar-clock"></i>Próxima janela boa: <b>${p.proximaJanela ? esc(p.proximaJanela.agora ? `agora (até ${p.proximaJanela.rotulo.split('–')[1]})` : p.proximaJanela.rotulo) : 'nenhuma nos próximos 7 dias'}</b></p>
      </header>
      <section class="clima-d-bloco"><h4>Próximas 72 horas</h4><div class="clima-d-graf"><canvas id="clima-d-canvas" aria-label="Temperatura, chuva, vento e janela de aplicação nas próximas 72 horas"></canvas><p class="clima-d-carregando">Carregando as próximas horas…</p></div>
        <div class="clima-d-faixa-leg">${STATUS.map(x => `<span><i style="--c:${x.cor}"></i>${x.curto}</span>`).join('')}<span>faixa = janela de aplicação hora a hora</span></div></section>
      <section class="clima-d-bloco"><h4>7 dias</h4><div class="clima-d-dias">${p.dias.map(d => { const [di, dd] = tempo(d.codigo); return `<div class="clima-d-dia"><b>${esc(d.rotulo)}</b><span class="clima-d-ic" title="${dd}">${di}</span><span><b>${n0(d.tmax)}°</b> / ${n0(d.tmin)}°</span><small>💧 ${n1(d.chuva)} mm · ${n0(d.prob)}%</small><small>💨 até ${n0(d.vento)} km/h</small></div>`; }).join('')}</div></section>
      <section class="clima-d-bloco clima-d-chuva">
        <div><span>Chuva nos últimos 7 dias</span><b>${n1(pass)} mm</b></div>
        <div><span>Prevista nos próximos 7 dias</span><b>${n1(p.chuva7d)} mm</b></div>
        <div class="clima-plantio ${favoravel ? 'ok' : 'irrigar'}"><i data-lucide="${favoravel ? 'sprout' : 'droplets'}"></i><span>${favoravel ? 'Umidade favorável ao plantio' : 'Prever irrigação'}<small>acumulado dos últimos 7 dias ${favoravel ? '≥' : '<'} ${n0(CFG.plantio.chuva7dMm)} mm</small></span></div>
      </section>
      ${p.alertas.length ? `<section class="clima-d-bloco"><h4>Alertas</h4><ul class="clima-d-alertas">${p.alertas.map(x => `<li class="${x.tipo}">⚠️ ${esc(x.texto)}</li>`).join('')}</ul></section>` : ''}
      <section class="clima-d-bloco"><h4>Atividades apontadas (últimos 7 dias)</h4><div id="clima-d-ativ-lista"><button type="button" class="clima-tbtn" id="clima-d-ativ"><i data-lucide="clipboard-list"></i><span>Ver atividades desta fazenda</span></button><small class="clima-mudo">carrega a planilha de produção (PGO), que é grande</small></div></section>`;
    icones();
    $('.clima-detalhe-fechar').focus();
    try {
      const [r] = await Promise.all([detalheDoPonto(f.ponto), chartjs()]);
      if (el.dataset.fazenda !== nome || el.hidden) return;
      desenharGrafico(r.horas72);
    } catch (erro) { const c = $('.clima-d-carregando'); if (c) c.textContent = `Não consegui carregar as próximas horas (${erro.message}).`; }
  }

  function desenharGrafico(h) {
    const C = window.Chart; if (!C) return;
    $('.clima-d-carregando')?.remove();
    grafico?.destroy();
    const rot = h.horas.map(t => `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 13)}h`);
    const faixa = {
      id: 'faixaJanela',
      beforeDatasetsDraw(chart) {
        const { ctx, chartArea: a, scales: { x } } = chart, w = (a.right - a.left) / h.status.length;
        ctx.save();
        h.status.forEach((s, i) => { ctx.fillStyle = st(s).cor; ctx.globalAlpha = .85; ctx.fillRect(x.getPixelForValue(i) - w / 2, a.bottom - 9, w + .5, 9); });
        ctx.restore();
      }
    };
    grafico = new C($('#clima-d-canvas'), {
      data: {
        labels: rot,
        datasets: [
          { type: 'bar', label: 'Chuva (mm)', data: h.chuva, backgroundColor: 'rgba(56,189,248,.55)', borderRadius: 3, yAxisID: 'mm', order: 4 },
          { type: 'line', label: 'Temperatura (°C)', data: h.t, borderColor: '#fb923c', backgroundColor: '#fb923c', borderWidth: 2.5, pointRadius: 0, tension: .35, yAxisID: 'y', order: 1 },
          { type: 'line', label: 'Vento (km/h)', data: h.vento, borderColor: '#3dffa8', borderWidth: 2, pointRadius: 0, tension: .35, yAxisID: 'y', order: 2 },
          { type: 'line', label: 'Rajada (km/h)', data: h.rajada, borderColor: 'rgba(200,245,96,.8)', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, tension: .35, yAxisID: 'y', order: 3 }
        ]
      },
      plugins: [faixa],
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        layout: { padding: { bottom: 4 } },
        plugins: {
          legend: { position: 'bottom', labels: { color: '#cfe3df', usePointStyle: true, boxWidth: 8, padding: 14, font: { family: 'Manrope', weight: 700 } } },
          tooltip: { backgroundColor: 'rgba(4,18,17,.95)', borderColor: 'rgba(61,255,168,.4)', borderWidth: 1, padding: 10, callbacks: { afterBody: it => { const i = it[0].dataIndex; return [`Umidade ${n0(h.ur[i])}% · Delta T ${n1(h.deltaT[i])} °C`, `Janela: ${st(h.status[i]).nome}${h.motivo[i] ? ` (${h.motivo[i]})` : ''}`]; } } }
        },
        scales: {
          x: { ticks: { color: '#9fb6b2', maxRotation: 0, autoSkip: true, maxTicksLimit: 9, font: { family: 'Manrope' } }, grid: { color: 'rgba(255,255,255,.05)' } },
          y: { position: 'left', title: { display: true, text: '°C · km/h', color: '#9fb6b2' }, ticks: { color: '#9fb6b2' }, grid: { color: 'rgba(255,255,255,.06)' } },
          mm: { position: 'right', beginAtZero: true, suggestedMax: 5, title: { display: true, text: 'mm', color: '#7dd3fc' }, ticks: { color: '#7dd3fc' }, grid: { display: false } }
        }
      }
    });
  }

  // Atividades do PGO nesta fazenda (mesmo padrão de nome: "SÃO MIGUEL (S-G12D )")
  async function carregarAtividades() {
    const alvo = $('#clima-d-ativ-lista'), nome = $('#clima-detalhe').dataset.fazenda;
    alvo.innerHTML = '<p class="clima-mudo">Carregando a planilha de produção…</p>';
    try {
      if (!window.SMA_EXPERIMENTO) await carregar('script', { src: 'js/experimento-motor.js' });
      const M = window.SMA_EXPERIMENTO;
      await M.carregarBases(false, ['pgo']);
      const chaveFaz = t => norm(t).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
      const desde = new Date(); desde.setHours(0, 0, 0, 0); desde.setDate(desde.getDate() - 7);
      const linhas = (M.dados.pgo || []).filter(r => chaveFaz(r.FAZENDA) === chaveFaz(nome) && r.DATA && r.DATA >= desde);
      if (!linhas.length) { alvo.innerHTML = '<p class="clima-mudo">Nenhum apontamento nesta fazenda nos últimos 7 dias.</p>'; return; }
      const porAtiv = new Map();
      linhas.forEach(r => { const a = porAtiv.get(r.ATIVIDADE) || porAtiv.set(r.ATIVIDADE, { area: 0, equipes: new Set(), ultima: r.DATA }).get(r.ATIVIDADE); a.area += r.AREA || 0; a.equipes.add(r.EQUIPE); if (r.DATA > a.ultima) a.ultima = r.DATA; });
      alvo.innerHTML = `<ul class="clima-d-ativ">${[...porAtiv.entries()].sort((a, b) => b[1].area - a[1].area).map(([at, v]) => `<li><b>${esc(at)}</b><span>${n1(v.area)} ha · equipe ${esc([...v.equipes].join(', '))} · último ${v.ultima.toLocaleDateString('pt-BR')}</span></li>`).join('')}</ul>`;
    } catch (erro) { alvo.innerHTML = `<p class="clima-mudo">Não consegui ler a produção (${esc(erro.message)}).</p>`; }
  }

  /* ---------- Início preguiçoso: só quando o bloco chega perto da tela ---------- */
  let iniciado = false;
  const iniciar = () => { if (iniciado) return; iniciado = true; atualizar(); };
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(ents => { if (ents.some(e => e.isIntersecting)) { obs.disconnect(); iniciar(); } }, { rootMargin: '300px' });
    obs.observe(secao);
  } else iniciar();
  if (location.hash === '#clima') iniciar();
  window.SMA_CLIMA = { iniciar, abrirTela, abrirDetalhe, mapa: () => mapaHome, limites };
})();
