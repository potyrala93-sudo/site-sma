/* ==========================================================================
   SMA · Silvicultura — Painel de Qualidade (avaliações de 120 dias)
   Camadas: 1) leitura  2) modelo das avaliações e parcelas  3) filtros/estado
            4) componentes (busca, tabela, gráficos, mapa)  5) seções  6) projeção do mês
   ========================================================================== */

(() => {
  const Q = window.SMA_DADOS?.QUALIDADE, P = window.SMA_PLANILHAS;
  const raiz = document.getElementById('qual');
  if (!Q || !P || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

  /* ======================================================================
     1. LEITURA (uma função por aba) — módulo compartilhado js/planilhas.js
     ====================================================================== */
  const carregarAvaliacoes = fresco => P.lerPlanilha(Q.planilha, Q.abas.avaliacoes, { fresco, coluna: 'UP', cabecalho: true });
  const carregarUps = fresco => P.lerPlanilha(Q.planilha, Q.abas.ups, { fresco, coluna: 'UP', cabecalho: true });

  /* ======================================================================
     2. CONVERSÃO E MODELO
     ====================================================================== */
  // Vazio, "-" ou erro = sem valor (null), para não puxar médias para baixo
  const valor = v => { const t = String(v ?? '').trim(); return (!t || t === '-' || t.startsWith('#')) ? null : P.num(t); };
  const media = l => (l.length ? l.reduce((a, c) => a + c, 0) / l.length : null);
  const desvio = l => { if (l.length < 2) return null; const m = media(l); return Math.sqrt(l.reduce((a, c) => a + (c - m) ** 2, 0) / (l.length - 1)); };
  const n1 = v => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const n2 = v => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const nInt = v => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
  const dataTxt = d => (d ? d.toLocaleDateString('pt-BR') : '—');
  const limparNome = t => String(t || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  const monCurto = m => String(m || '').replace(/\s*dias?/i, 'd');

  // Coordenadas: "-23.53, -47.34", "-23.53 -47.34" ou com vírgula decimal
  function coordenadas(t) {
    const m = String(t || '').match(/-?\d{1,3}[.,]\d+/g);
    if (!m || m.length < 2) return null;
    const [lat, lon] = m.slice(0, 2).map(x => parseFloat(x.replace(',', '.')));
    return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
  }

  // Nota de uniformidade quando a planilha não traz: a partir do CV (aproximação da regra da planilha)
  const REGRA_UNIF = 'Quando a planilha não traz a nota da parcela, ela é calculada pelo CV das alturas: nota = 10 − 0,014 × (CV − 13)², limitada entre 0 e 10 (CV até 13% = nota 10).';
  const notaPorCV = cv => (cv == null ? null : Math.max(0, Math.min(10, cv <= 13 ? 10 : 10 - 0.014 * (cv - 13) ** 2)));

  function modeloAvaliacao(l, i) {
    const chaves = Object.keys(l);
    const parcelas = [];
    for (let k = 1; k <= 10; k++) {
      const alturas = [];
      for (let j = 1; j <= 45; j++) { const v = valor(l[`P${k}-${j}`]); if (v != null && v > 0) alturas.push(v); }
      const chaveLoc = chaves.find(c => /^LOCAL/.test(c) && c.endsWith(` P${k}`));
      const coord = coordenadas(l[chaveLoc]);
      if (!alturas.length && !coord) continue;
      const m = valor(l[`MEDIAP${k}`]) ?? media(alturas);
      const dp = valor(l[`DESVIOP${k}`]) ?? desvio(alturas);
      const cv = valor(l[`CVP${k}`]) ?? (m && dp != null ? dp / m * 100 : null);
      const notaPlanilha = valor(l[`P${k}_NOTA_UNIFORMIDADE`]);
      parcelas.push({
        k, nome: `P${k}`, alturas, coord, media: m, desvio: dp, cv,
        min: alturas.length ? Math.min(...alturas) : null, max: alturas.length ? Math.max(...alturas) : null,
        nota: notaPlanilha ?? notaPorCV(cv), notaCalculada: notaPlanilha == null
      });
    }
    const todas = parcelas.flatMap(p => p.alturas);
    const data = P.dataBR(l.DATA);
    return {
      id: l.IDQUALIDADE || `linha-${i}`,
      usuario: (l.USUARIO || '—').trim(),
      data, mon: (l.MONITORAMENTO || '').trim(),
      fazenda: limparNome(l.FAZENDA), up: (l.UP || '').trim(), material: (l.MAT_GENETICO || '').trim(),
      notaFinal: valor(l['NOTA FINAL']),
      parciais: { 'Nota final': valor(l['NOTA FINAL']), 'Uniformidade': valor(l['NOTA DE UNIF.']) ?? valor(l['NOTA_UNIF.']), 'Fito': valor(l['NOTA DE FITO']), 'Mato': valor(l['NOTA DE MATO']), 'N 120': valor(l.N_120) },
      parcelas, alturaMedia: media(todas), desvioUP: desvio(todas),
      cvUP: valor(l['CV% H UP']) ?? valor(l['UP_CV H']) ?? (media(todas) ? desvio(todas) / media(todas) * 100 : null),
      notaUnifUP: valor(l['NOTA U_UP']) ?? valor(l['NOTA DE UNIF.'])
    };
  }

  /* ---------- Cores das notas (0–10): vermelho → amarelo → verde ---------- */
  function hslNota(n) {
    if (n == null) return [180, 8, 55];
    const { vermelhoAte, amareloAte } = Q.faixas;
    let t;
    if (n <= vermelhoAte) { t = Math.max(0, n) / vermelhoAte; return [2 + t * 6, 100 - t * 18, 40 + t * 22]; }     // vermelho forte → claro
    if (n <= amareloAte) { t = (n - vermelhoAte) / (amareloAte - vermelhoAte); return [40 + t * 12, 100, 50 + t * 8]; } // âmbar → amarelo
    t = Math.min(1, (n - amareloAte) / (10 - amareloAte)); return [138 + t * 8, 78 + t * 8, 52 - t * 10];            // verde → verde mais fechado
  }
  function hslParaRgb([h, s, l]) {
    s /= 100; l /= 100;
    const k = x => (x + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = x => Math.round(255 * (l - a * Math.max(-1, Math.min(k(x) - 3, Math.min(9 - k(x), 1)))));
    return [f(0), f(8), f(4)];
  }
  const corNota = (n, alfa = 1) => { const [r, g, b] = hslParaRgb(hslNota(n)); return alfa === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alfa})`; };
  const textoSobre = n => { const [r, g, b] = hslParaRgb(hslNota(n)); return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? '#081a12' : '#ffffff'; };
  const corCV = cv => (cv == null ? '#94a3b8' : cv <= Q.cv.uniformeAte ? '#22e07a' : cv <= Q.cv.intermediariaAte ? '#ffd23f' : '#ff4d5e');
  const classeCV = cv => (cv == null ? 'Sem dado' : cv <= Q.cv.uniformeAte ? 'Uniforme' : cv <= Q.cv.intermediariaAte ? 'Intermediária' : 'Maior variação');
  const selo = n => `<span class="q-selo" style="background:${corNota(n)};color:${textoSobre(n)}">${n1(n)}</span>`;

  /* ======================================================================
     3. ESTADO E FILTROS
     ====================================================================== */
  const hoje = new Date();
  const estado = {
    fazenda: null, up: null, mon: 'todos',
    foco: null, parcelaFoco: null, grupo: null,
    mostrar: 15, ord: { k: 'data', dir: -1 },
    ano: hoje.getFullYear(), mes: hoje.getMonth() + 1,
    avaliacoes: [], ups: [], erros: {}, carregando: true
  };

  const filtradas = () => estado.avaliacoes.filter(a =>
    (!estado.fazenda || a.fazenda === estado.fazenda) && (!estado.up || a.up === estado.up) && (estado.mon === 'todos' || a.mon === estado.mon));
  const avaliacaoEmFoco = lista => lista.find(a => a.id === estado.foco) || [...lista].sort((a, c) => (c.data || 0) - (a.data || 0))[0] || null;

  /* ======================================================================
     4. COMPONENTES
     ====================================================================== */

  // Seleção com busca (reutilizável)
  function combo(el, { rotulo, icone, todos, opcoes, valorAtual, aoEscolher }) {
    el.classList.add('q-combo');
    el.innerHTML = `
      <button type="button" class="q-combo-btn" aria-haspopup="listbox" aria-expanded="false">
        <i data-lucide="${icone}"></i><span class="q-combo-rot"><small>${rotulo}</small><b></b></span><i data-lucide="chevron-down"></i>
      </button>
      <div class="q-combo-pop glass" hidden>
        <label class="q-combo-busca"><i data-lucide="search"></i><input type="search" placeholder="Buscar ${rotulo.toLowerCase()}…" aria-label="Buscar ${rotulo.toLowerCase()}"></label>
        <ul role="listbox"></ul>
      </div>`;
    const btn = $('.q-combo-btn', el), pop = $('.q-combo-pop', el), busca = $('input', el), lista = $('ul', el);
    let ativo = -1;
    const desenhar = () => {
      const termo = norm(busca.value);
      const itens = [{ valor: null, texto: todos }, ...opcoes()].filter(o => !termo || norm(o.texto + ' ' + (o.sub || '')).includes(termo));
      lista.innerHTML = itens.map((o, i) => `<li role="option" data-i="${i}" data-valor="${escapar(o.valor ?? '')}" aria-selected="${o.valor === valorAtual()}" class="${i === ativo ? 'ativo' : ''}">${escapar(o.texto)}${o.sub ? `<small>${escapar(o.sub)}</small>` : ''}</li>`).join('') || '<li class="vazio">Nada encontrado</li>';
    };
    const abrir = sim => {
      pop.hidden = !sim; btn.setAttribute('aria-expanded', String(sim));
      if (sim) { busca.value = ''; ativo = -1; desenhar(); setTimeout(() => busca.focus(), 30); }
    };
    const escolher = li => { if (!li || li.classList.contains('vazio')) return; abrir(false); aoEscolher(li.dataset.valor || null); btn.focus(); };
    btn.addEventListener('click', () => abrir(pop.hidden));
    busca.addEventListener('input', () => { ativo = 0; desenhar(); });
    busca.addEventListener('keydown', e => {
      const lis = $$('li[data-i]', lista);
      if (e.key === 'ArrowDown') { e.preventDefault(); ativo = Math.min(lis.length - 1, ativo + 1); desenhar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); ativo = Math.max(0, ativo - 1); desenhar(); }
      else if (e.key === 'Enter') { e.preventDefault(); escolher($$('li[data-i]', lista)[Math.max(0, ativo)]); }
      else if (e.key === 'Escape') { abrir(false); btn.focus(); }
    });
    lista.addEventListener('click', e => escolher(e.target.closest('li')));
    document.addEventListener('click', e => { if (!pop.hidden && !el.contains(e.target)) abrir(false); });
    return {
      atualizar() {
        const v = valorAtual(); const o = opcoes().find(x => x.valor === v);
        $('b', btn).textContent = o ? o.texto : todos;
        el.classList.toggle('preenchido', !!v);
      }
    };
  }

  // Número com contagem animada
  function contar(el, v, formato) {
    if (!el) return;
    const de = Number(el.dataset.valor || 0);
    el.dataset.valor = v ?? 0;
    if (v == null) { el.textContent = '—'; return; }
    if (reduzMovimento || de === v) { el.textContent = formato(v); return; }
    const t0 = performance.now(); cancelAnimationFrame(el._raf);
    const passo = t => { const p = Math.min((t - t0) / 900, 1); el.textContent = formato(de + (v - de) * (1 - Math.pow(1 - p, 3))); if (p < 1) el._raf = requestAnimationFrame(passo); };
    el._raf = requestAnimationFrame(passo);
    clearTimeout(el._fim); el._fim = setTimeout(() => { cancelAnimationFrame(el._raf); el.textContent = formato(v); }, 1000); // aba em segundo plano
  }

  // Caixa "Leitura para decisão"
  function analise(alvo, itens) {
    const el = $(alvo); if (!el) return;
    const lista = itens.filter(Boolean);
    el.hidden = !lista.length;
    el.innerHTML = `<span class="analise-icone"><i data-lucide="lightbulb"></i></span><div><strong class="analise-titulo">Leitura para decisão</strong><ul>${lista.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }
  const b = t => `<strong>${t}</strong>`;

  // Gráficos (Chart.js) com o mesmo tema do Faturamento
  const graficos = {};
  function prepararChart() {
    const C = window.Chart; if (!C) return false;
    C.defaults.font.family = 'Manrope, system-ui, sans-serif';
    C.defaults.color = '#b8ccc8';
    C.defaults.borderColor = 'rgba(255,255,255,.07)';
    Object.assign(C.defaults.plugins.tooltip, { backgroundColor: 'rgba(7,23,22,.96)', borderColor: 'rgba(61,255,168,.4)', borderWidth: 1, padding: 12, cornerRadius: 12, titleColor: '#fff', bodyColor: '#cfe3df' });
    C.defaults.animation.duration = reduzMovimento ? 0 : 800;
    if (!C.registry.plugins.get('qReferencia')) {
      C.register({
        id: 'qReferencia',
        afterDatasetsDraw(chart, _a, o) {
          if (o?.valor == null) return;
          const { ctx, chartArea: a, scales: { x, y } } = chart, deitado = chart.options.indexAxis === 'y';
          const p = deitado ? x.getPixelForValue(o.valor) : y.getPixelForValue(o.valor);
          if (deitado ? (p < a.left || p > a.right) : (p < a.top || p > a.bottom)) return;
          ctx.save(); ctx.strokeStyle = 'rgba(200,245,96,.95)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.shadowColor = 'rgba(200,245,96,.8)'; ctx.shadowBlur = 8;
          ctx.beginPath();
          if (deitado) { ctx.moveTo(p, a.top); ctx.lineTo(p, a.bottom); } else { ctx.moveTo(a.left, p); ctx.lineTo(a.right, p); }
          ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
          ctx.fillStyle = '#c8f560'; ctx.font = '800 11px Manrope'; const tx = o.rotulo || '';
          if (deitado) ctx.fillText(tx, p - ctx.measureText(tx).width / 2, a.top - 6); else ctx.fillText(tx, a.right - ctx.measureText(tx).width - 4, p - 6);
          ctx.restore();
        }
      });
      C.register({
        id: 'qRotulos',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.data.datasets.forEach((ds, i) => {
            if (!ds.rotulo || !chart.isDatasetVisible(i)) return;
            chart.getDatasetMeta(i).data.forEach((el, j) => {
              const txt = ds.rotulo(ds.data[j], j); if (!txt) return;
              if (ds.rotuloDentro) {   // barras empilhadas: número no meio do pedaço, se couber
                if (Math.abs(el.base - el.y) < 13) return;
                const c = el.getCenterPoint();
                ctx.save(); ctx.font = '800 10.5px Manrope'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = '#04120f'; ctx.fillText(txt, c.x, c.y); ctx.restore();
                return;
              }
              const { x, y } = el.tooltipPosition();
              ctx.save(); ctx.font = '800 10.5px Manrope'; ctx.textBaseline = 'bottom';
              const w = ctx.measureText(txt).width + 8; ctx.fillStyle = 'rgba(4,13,12,.78)'; ctx.beginPath();
              if (chart.options.indexAxis === 'y') {   // barras deitadas: rótulo à direita da barra
                ctx.roundRect(x + 4, y - 8, w, 16, 5); ctx.fill();
                ctx.textAlign = 'left'; ctx.fillStyle = ds.rotuloCor || '#fff'; ctx.fillText(txt, x + 8, y + 6);
              } else {
                ctx.roundRect(x - w / 2, y - 21, w, 16, 5); ctx.fill();
                ctx.textAlign = 'center'; ctx.fillStyle = ds.rotuloCor || '#fff'; ctx.fillText(txt, x, y - 7);
              }
              ctx.restore();
            });
          });
        }
      });
    }
    return true;
  }
  function desenharGrafico(id, canvas, config) {
    graficos[id]?.destroy();
    if (!canvas || !prepararChart()) return;
    config.options = { maintainAspectRatio: false, layout: { padding: { top: 24, right: 8 } }, ...config.options };
    graficos[id] = new window.Chart(canvas, config);
  }

  /* ======================================================================
     5. SEÇÕES — BLOCO A
     ====================================================================== */
  const comboFazenda = combo($('#q-f-fazenda'), {
    rotulo: 'Fazenda', icone: 'map-pinned', todos: 'Todas as fazendas',
    opcoes: () => [...new Set(estado.avaliacoes.map(a => a.fazenda))].sort().map(f => ({ valor: f, texto: f, sub: `${estado.avaliacoes.filter(a => a.fazenda === f).length} avaliações` })),
    valorAtual: () => estado.fazenda,
    aoEscolher: v => { estado.fazenda = v; if (v && estado.up && !estado.avaliacoes.some(a => a.fazenda === v && a.up === estado.up)) estado.up = null; mudouFiltro(); }
  });
  const comboUp = combo($('#q-f-up'), {
    rotulo: 'UP', icone: 'square-dashed', todos: 'Todas as UPs',
    opcoes: () => [...new Set(estado.avaliacoes.filter(a => !estado.fazenda || a.fazenda === estado.fazenda).map(a => a.up))].sort().map(u => ({ valor: u, texto: u, sub: estado.avaliacoes.find(a => a.up === u)?.fazenda })),
    valorAtual: () => estado.up,
    aoEscolher: v => { estado.up = v; if (v && !estado.fazenda) estado.fazenda = estado.avaliacoes.find(a => a.up === v)?.fazenda || null; mudouFiltro(); }
  });
  function mudouFiltro() { estado.foco = null; estado.parcelaFoco = null; estado.grupo = null; estado.mostrar = 15; renderizar(); }
  $('#q-limpar').addEventListener('click', () => { estado.fazenda = null; estado.up = null; estado.mon = 'todos'; mudouFiltro(); });
  $('#q-mons').addEventListener('click', e => { const bt = e.target.closest('[data-mon]'); if (!bt) return; estado.mon = bt.dataset.mon; mudouFiltro(); });

  function renderFiltros() {
    comboFazenda.atualizar(); comboUp.atualizar();
    const mons = [...new Set(estado.avaliacoes.map(a => a.mon))].filter(Boolean).sort((a, c) => parseInt(a) - parseInt(c));
    $('#q-mons').innerHTML = ['todos', ...mons].map(m => `<button type="button" class="chip-filtro mini ${estado.mon === m ? 'ativo' : ''}" data-mon="${escapar(m)}">${m === 'todos' ? 'Todos' : escapar(m)}</button>`).join('');
    $('#q-limpar').disabled = !estado.fazenda && !estado.up && estado.mon === 'todos';
  }

  // Fundo da página pela nota final média do filtro (mesma lógica do Faturamento)
  function renderFundo(lista) {
    if (document.getElementById('aba-120')?.hidden) return;   // aba do Simulador ARS aberta: ela cuida do fundo
    const m = media(lista.map(a => a.notaFinal).filter(v => v != null));
    document.body.style.setProperty('--ader-cor', corNota(m));
    document.body.style.setProperty('--ader-cor-suave', corNota(m, .3));
  }

  // Junta a mesma UP + monitoramento numa linha, com a nota de cada avaliador lado a lado.
  // Só junta avaliações com até 30 dias entre si: a mesma UP pode ser replantada em outro ciclo.
  function agrupar(lista) {
    const g = new Map(), JANELA = 30 * 864e5;
    [...lista].sort((a, c) => (a.data || 0) - (c.data || 0)).forEach(a => {
      const base = `${a.mon}|${a.up}`;
      let n = 0;
      while (g.has(`${base}|${n}`) && Math.abs((a.data || 0) - (g.get(`${base}|${n}`)[0].data || 0)) > JANELA) n++;
      const k = `${base}|${n}`;
      (g.get(k) || g.set(k, []).get(k)).push(a);
    });
    return [...g.entries()].map(([k, avals]) => {
      const porUsuario = {};
      avals.forEach(a => { porUsuario[a.usuario] = a; }); // mesmo avaliador duas vezes: vale a mais recente
      const notas = Object.values(porUsuario).map(a => a.notaFinal).filter(v => v != null);
      return {
        k, avals, porUsuario, fazenda: avals[0].fazenda, up: avals[0].up, mon: avals[0].mon, data: avals[avals.length - 1].data,
        ultima: avals[avals.length - 1], media: media(notas), dif: notas.length > 1 ? Math.max(...notas) - Math.min(...notas) : null
      };
    });
  }

  function renderTabela(lista) {
    const grupos = agrupar(lista);
    const contagem = u => lista.filter(a => a.usuario === u).length;
    const usuarios = [...new Set(lista.map(a => a.usuario))].sort((x, y) => contagem(y) - contagem(x));
    const { k, dir } = estado.ord;
    const valorOrd = g => (k.startsWith('u:') ? g.porUsuario[k.slice(2)]?.notaFinal : g[k]);
    const dados = grupos.sort((a, c) => {
      const x = valorOrd(a), y = valorOrd(c);
      if (x == null) return 1; if (y == null) return -1;
      return (x instanceof Date || typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
    const foco = estado.foco ? lista.find(a => a.id === estado.foco) : null;
    const wUsuario = Math.max(8, 49 / Math.max(1, usuarios.length));
    const cols = [
      { k: 'fazenda', t: 'Fazenda', w: 21 }, { k: 'up', t: 'UP', w: 10 }, { k: 'mon', t: 'Monitora&shy;mento', w: 11 }, { k: 'data', t: 'Data', w: 10 },
      ...usuarios.map(u => ({ k: `u:${u}`, t: `Nota ${escapar(u)}`, w: wUsuario, u: true })), { k: 'dif', t: 'Diferença', w: 9 }
    ];
    const visiveis = dados.slice(0, estado.mostrar);
    $('#q-tabela').innerHTML = `
      <table class="q-tab q-tab-aval">
        <thead><tr>${cols.map(c => `<th scope="col" style="width:${c.w}%" class="${c.u ? 'q-th-user' : ''}"><button type="button" data-ord="${escapar(c.k)}" class="${k === c.k ? 'ativo' : ''}">${c.u ? '<i data-lucide="user-round" class="q-ico-user"></i>' : ''}${c.t}<i data-lucide="${k === c.k ? (dir > 0 ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}"></i></button></th>`).join('')}</tr></thead>
        <tbody>${visiveis.map(g => `
          <tr data-id="${escapar(g.ultima.id)}" class="${foco && g.avals.includes(foco) ? 'foco' : ''}" tabindex="0" title="Ver as parcelas no mapa">
            <td data-rotulo="Fazenda">${escapar(g.fazenda)}</td>
            <td data-rotulo="UP"><span class="q-up">${escapar(g.up)}</span></td>
            <td data-rotulo="Monitoramento">${escapar(g.mon)}</td>
            <td data-rotulo="Data">${dataTxt(g.data)}</td>
            ${usuarios.map(u => {
              const a = g.porUsuario[u];
              return `<td data-rotulo="Nota ${escapar(u)}" class="q-col-nota">${a ? `<button type="button" class="q-nota-btn ${foco && foco.id === a.id ? 'ativa' : ''}" data-id="${escapar(a.id)}" title="${escapar(u)} · ${dataTxt(a.data)}: ver as parcelas desta nota no mapa">${selo(a.notaFinal)}</button>` : '<span class="q-sem">—</span>'}</td>`;
            }).join('')}
            <td data-rotulo="Diferença">${g.dif == null ? '<span class="q-sem">—</span>' : `<span class="q-dif-cel ${g.dif >= 1 ? 'alerta' : ''}">${g.dif >= 1 ? '<i data-lucide="triangle-alert"></i>' : ''}${n1(g.dif)}</span>`}</td>
          </tr>`).join('') || `<tr><td colspan="${cols.length}" class="vazio">Nenhuma avaliação para o filtro.</td></tr>`}</tbody>
      </table>
      ${dados.length > estado.mostrar ? `<button type="button" class="fat-btn q-mais" id="q-mais"><i data-lucide="chevrons-down"></i>Mostrar mais (${Math.min(15, dados.length - estado.mostrar)} de ${dados.length - estado.mostrar} restantes)</button>` : ''}`;
    $('#q-tab-total').textContent = `${dados.length} UPs/monitoramentos · ${lista.length} avaliações`;

    // Leitura para decisão
    const comNota = lista.filter(a => a.notaFinal != null);
    const m = media(comNota.map(a => a.notaFinal));
    const abaixo = comNota.filter(a => a.notaFinal <= Q.faixas.vermelhoAte).sort((a, c) => a.notaFinal - c.notaFinal);
    const divergentes = dados.filter(g => g.dif != null && g.dif >= 1).sort((a, c) => c.dif - a.dif);
    analise('#q-analise-notas', comNota.length ? [
      `Nota final média de ${b(n1(m))} em ${b(comNota.length)} avaliações de ${b(dados.length)} UPs/monitoramentos.`,
      abaixo.length ? `${b(abaixo.length)} avaliação(ões) com nota até ${n1(Q.faixas.vermelhoAte)}: ${abaixo.slice(0, 4).map(a => `${b(a.up)} (${monCurto(a.mon)}, ${n1(a.notaFinal)})`).join(', ')}. ${b('Priorize a revisão do plantio e do controle')} nessas UPs.` : `Nenhuma avaliação abaixo de ${n1(Q.faixas.vermelhoAte)}. 🎯`,
      divergentes.length ? `${b(divergentes.length)} UP(s) com diferença de 1 ponto ou mais entre avaliadores, a maior em ${b(divergentes[0].up)} (${monCurto(divergentes[0].mon)}): ${Object.values(divergentes[0].porUsuario).map(a => `${a.usuario} ${n1(a.notaFinal)}`).join(' × ')}. ${b('Alinhe o critério de avaliação')}.` : null
    ] : []);
  }
  $('#q-tabela').addEventListener('click', e => {
    const ord = e.target.closest('[data-ord]');
    if (ord) { const k = ord.dataset.ord; estado.ord = { k, dir: estado.ord.k === k ? -estado.ord.dir : (k === 'data' || k === 'dif' || k.startsWith('u:') ? -1 : 1) }; renderizar(['tabela']); return; }
    if (e.target.closest('#q-mais')) { estado.mostrar += 15; renderizar(['tabela']); return; }
    const alvo = e.target.closest('[data-id]');   // botão da nota de um avaliador ou a linha inteira
    if (alvo) focar(alvo.dataset.id);
  });
  $('#q-tabela').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-id]'); if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focar(tr.dataset.id); } });
  function focar(id, parcela = null) { estado.foco = id; estado.parcelaFoco = parcela; renderizar(['tabela', 'parcelas', 'mapa']); $('#q-sec-parcelas')?.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' }); }

  // Mapa das parcelas (Leaflet + satélite Esri)
  let mapa = null, camada = null; const marcadores = new Map();
  function prepararMapa() {
    if (mapa || !window.L) return !!mapa;
    mapa = L.map('q-mapa', { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics' }).addTo(mapa);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: .8 }).addTo(mapa);
    camada = L.layerGroup().addTo(mapa);
    mapa.on('focus', () => mapa.scrollWheelZoom.enable());
    mapa.on('blur', () => mapa.scrollWheelZoom.disable());
    return true;
  }
  const popupParcela = (a, p) => `
    <div class="q-pop">
      <strong>${escapar(a.up)} · ${p.nome}</strong><small>${escapar(a.fazenda)} · ${escapar(a.mon)} · ${escapar(a.usuario)} (${dataTxt(a.data)})</small>
      <dl><dt>Altura média</dt><dd>${n1(p.media)} cm</dd><dt>Desvio padrão</dt><dd>${n1(p.desvio)} cm</dd><dt>CV</dt><dd style="color:${corCV(p.cv)}">${n1(p.cv)}% · ${classeCV(p.cv)}</dd><dt>Uniformidade</dt><dd>${n2(p.nota)}${p.notaCalculada ? ' (calc.)' : ''}</dd></dl>
      <p class="q-pop-alt"><b>${p.alturas.length} mudas:</b> ${p.alturas.map(nInt).join(', ') || '—'}</p>
    </div>`;
  function renderMapa(lista) {
    const aviso = $('#q-mapa-aviso');
    if (!prepararMapa()) { aviso.hidden = false; aviso.textContent = 'Não foi possível carregar o mapa (verifique a internet).'; return; }
    camada.clearLayers(); marcadores.clear();
    const pontos = lista.flatMap(a => a.parcelas.filter(p => p.coord).map(p => ({ a, p })));
    aviso.hidden = pontos.length > 0;
    if (!pontos.length) { aviso.textContent = 'Nenhuma parcela com coordenadas para este filtro.'; return; }
    // Destaque: parcelas com maior variação de altura (maiores CVs, até 5)
    const destaques = new Set([...pontos].filter(x => x.p.cv != null).sort((x, y) => y.p.cv - x.p.cv).slice(0, Math.min(5, Math.ceil(pontos.length * 0.1))).map(x => `${x.a.id}|${x.p.k}`));
    // Nota clicada na tabela: o mapa vai para as parcelas dessa avaliação; as demais ficam apagadas
    const foco = estado.foco ? lista.find(a => a.id === estado.foco) : null;
    const pontosFoco = foco ? pontos.filter(x => x.a.id === foco.id) : [];
    pontos.forEach(({ a, p }) => {
      const chave = `${a.id}|${p.k}`, cor = corCV(p.cv);
      const ehFoco = foco && a.id === foco.id, apagado = foco && !ehFoco;
      const ehDestaque = destaques.has(chave) && !apagado;
      const m = ehDestaque || ehFoco
        ? L.marker(p.coord, {
          icon: L.divIcon({ className: `q-pulso ${ehFoco ? 'q-foco' : ''}`, html: `<span style="--c:${cor}">${ehFoco ? `<b>${p.nome}</b>` : ''}</span>`, iconSize: ehFoco ? [34, 34] : [26, 26] }),
          zIndexOffset: ehFoco ? 2000 : 1000
        })
        : L.circleMarker(p.coord, { radius: apagado ? 4.5 : 6.5, color: '#04120f', weight: apagado ? 1 : 1.5, fillColor: cor, fillOpacity: apagado ? .3 : .95, opacity: apagado ? .4 : 1 });
      m.bindPopup(popupParcela(a, p), { maxWidth: 300, className: 'q-popup' });
      m.on('click', () => { estado.foco = a.id; estado.parcelaFoco = p.k; renderizar(['tabela', 'parcelas']); });
      m.addTo(camada); marcadores.set(chave, m);
    });
    mapa.invalidateSize();
    const alvo = estado.parcelaFoco && foco ? marcadores.get(`${foco.id}|${estado.parcelaFoco}`) : null;
    if (alvo) { mapa.setView(alvo.getLatLng(), 18); alvo.openPopup(); }
    else if (pontosFoco.length) mapa.fitBounds(L.latLngBounds(pontosFoco.map(x => x.p.coord)).pad(0.35), { maxZoom: 18, animate: !reduzMovimento });
    else mapa.fitBounds(L.latLngBounds(pontos.map(x => x.p.coord)).pad(0.15), { maxZoom: 16 });
    const info = $('#q-mapa-foco');
    info.hidden = !foco;
    if (foco) info.innerHTML = `<i data-lucide="crosshair"></i><span>${pontosFoco.length ? `Mostrando as ${pontosFoco.length} parcelas de` : 'Sem coordenadas nas parcelas de'} <b>${escapar(foco.up)}</b> · ${escapar(foco.mon)} · ${escapar(foco.usuario)} · nota ${selo(foco.notaFinal)}</span><button type="button" class="fat-btn" id="q-mapa-todas"><i data-lucide="maximize"></i>Ver todas</button>`;
    $('#q-mapa-legenda-dest').textContent = `${destaques.size} parcela(s) com maior variação pulsando`;
  }
  $('#q-mapa-foco').addEventListener('click', e => { if (!e.target.closest('#q-mapa-todas')) return; estado.foco = null; estado.parcelaFoco = null; renderizar(['tabela', 'parcelas', 'mapa']); });
  function focarNoMapa(a, k) {
    const m = marcadores.get(`${a.id}|${k}`);
    if (!m || !mapa) return;
    mapa.setView(m.getLatLng(), 18, { animate: !reduzMovimento });
    m.openPopup();
    $('#q-mapa').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'center' });
  }

  // Alturas e distribuição por parcela (avaliação em foco)
  // Faixas relativas à altura média da avaliação (servem para qualquer idade de muda)
  const FAIXAS = [[0, .7, 'abaixo de 70% da média'], [.7, .85, '70–85%'], [.85, 1.15, 'na média (±15%)'], [1.15, 1.3, '115–130%'], [1.3, Infinity, 'acima de 130%']];
  const CORES_FAIXA = ['#ff4d5e', '#fbbf24', '#22e07a', '#38bdf8', '#a78bfa'];
  // Cada muda vira um chip; as que fogem mais de 15% da média da parcela ganham fundo de destaque
  const FORA_MEDIA = 0.15;
  function alturasDestacadas(p) {
    if (!p.alturas.length) return '<span class="q-sem">—</span>';
    const m = p.media || media(p.alturas);
    let baixas = 0, altas = 0;
    const chips = p.alturas.map(h => {
      const desvioPct = m ? (h - m) / m : 0;
      const cls = desvioPct < -FORA_MEDIA ? (baixas++, 'baixa') : desvioPct > FORA_MEDIA ? (altas++, 'alta') : '';
      const dica = cls ? ` title="${nInt(h)} cm · ${desvioPct > 0 ? '+' : ''}${Math.round(desvioPct * 100)}% da média (${n1(m)} cm)"` : '';
      return `<span class="q-muda ${cls}"${dica}>${nInt(h)}</span>`;
    }).join('');
    const fora = baixas + altas;
    return `<div class="q-mudas">${chips}</div><small>${p.alturas.length} mudas${fora ? ` · <b class="q-fora">${fora} fora da média</b> (${baixas} abaixo, ${altas} acima)` : ' · todas na média'}</small>`;
  }

  function renderParcelas(lista) {
    const foco = avaliacaoEmFoco(lista);
    const sel = $('#q-foco');
    const opcoes = [...lista].sort((a, c) => (c.data || 0) - (a.data || 0));
    sel.innerHTML = opcoes.slice(0, 300).map(a => `<option value="${escapar(a.id)}" ${foco && a.id === foco.id ? 'selected' : ''}>${escapar(a.up)} · ${escapar(a.mon)} · ${escapar(a.usuario)} · ${dataTxt(a.data)} · nota ${n1(a.notaFinal)}</option>`).join('');
    if (!foco) { $('#q-parcelas').innerHTML = '<p class="vazio">Sem avaliação no filtro.</p>'; graficos.parc?.destroy(); return; }
    $('#q-foco-info').innerHTML = `${escapar(foco.fazenda)} · material ${escapar(foco.material || '—')} · ${foco.parcelas.length} parcelas · nota final ${selo(foco.notaFinal)}`;
    $('#q-parcelas').innerHTML = `
      <table class="q-tab q-tab-parc">
        <thead><tr><th>Parcela</th><th>Alturas das mudas (cm) <span class="q-leg-alt"><i class="baixa"></i>abaixo <i class="alta"></i>acima de ±${FORA_MEDIA * 100}% da média</span></th><th>Média</th><th>Mín.</th><th>Máx.</th><th>Desvio</th><th>CV</th><th>Uniformidade <button type="button" class="q-info" title="${escapar(REGRA_UNIF)}" aria-label="Como é calculado"><i data-lucide="info"></i></button></th></tr></thead>
        <tbody>${foco.parcelas.map(p => `
          <tr data-k="${p.k}" class="${estado.parcelaFoco === p.k ? 'foco' : ''}" tabindex="0">
            <td data-rotulo="Parcela"><span class="q-parc" style="--c:${corCV(p.cv)}">${p.nome}</span>${p.coord ? '<i data-lucide="map-pin" class="q-pin" title="Ver no mapa"></i>' : ''}</td>
            <td data-rotulo="Alturas" class="q-alturas">${alturasDestacadas(p)}</td>
            <td data-rotulo="Média"><b>${n1(p.media)}</b></td><td data-rotulo="Mín.">${nInt(p.min)}</td><td data-rotulo="Máx.">${nInt(p.max)}</td>
            <td data-rotulo="Desvio">${n1(p.desvio)}</td>
            <td data-rotulo="CV"><span class="q-cv" style="--c:${corCV(p.cv)}">${n1(p.cv)}%</span></td>
            <td data-rotulo="Uniformidade">${selo(p.nota)}${p.notaCalculada ? '<small class="q-calc" title="' + escapar(REGRA_UNIF) + '">calc.</small>' : ''}</td>
          </tr>`).join('')}</tbody>
      </table>`;
    // Distribuição: quantidade de mudas por faixa de altura + desvio padrão sobreposto
    const ps = foco.parcelas;
    desenharGrafico('parc', $('#q-graf-parc'), {
      data: {
        labels: ps.map(p => p.nome),
        datasets: [
          ...FAIXAS.map(([de, ate, rot], i) => {
            const ref = foco.alturaMedia || 1;
            return {
              type: 'bar', label: rot, stack: 'faixas', yAxisID: 'y',
              data: ps.map(p => p.alturas.filter(h => h >= de * ref && h < ate * ref).length), backgroundColor: CORES_FAIXA[i], borderRadius: 3, maxBarThickness: 70,
              rotulo: v => (v ? String(v) : null), rotuloDentro: true
            };
          }),
          { type: 'line', label: 'Desvio padrão (cm)', yAxisID: 'y2', data: ps.map(p => p.desvio), borderColor: '#ffffff', backgroundColor: '#ffffff', borderWidth: 2, pointRadius: 5, pointBackgroundColor: ps.map(p => corCV(p.cv)), tension: .3, rotulo: v => (v == null ? null : n1(v)) }
        ]
      },
      options: {
        onClick: (_e, el) => { if (el[0]) { estado.parcelaFoco = ps[el[0].index].k; renderizar(['parcelas']); focarNoMapa(foco, ps[el[0].index].k); } },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { weight: 800 } } },
          y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Mudas por faixa' }, grid: { color: 'rgba(255,255,255,.06)' } },
          y2: { position: 'right', beginAtZero: true, grid: { display: false }, title: { display: true, text: 'Desvio (cm)' } }
        },
        plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { afterTitle: it => { const p = ps[it[0].dataIndex]; return `Média ${n1(p.media)} cm · CV ${n1(p.cv)}% · uniformidade ${n2(p.nota)}`; } } } }
      }
    });
    const maior = [...ps].filter(p => p.cv != null).sort((a, c) => c.cv - a.cv)[0];
    const fracas = ps.filter(p => p.nota != null && p.nota < 8);
    analise('#q-analise-parc', [
      maior ? `Maior variação: ${b(maior.nome)} com CV de ${b(n1(maior.cv) + '%')} (${classeCV(maior.cv).toLowerCase()}), alturas entre ${nInt(maior.min)} e ${nInt(maior.max)} cm.` : null,
      fracas.length ? `${b(fracas.length)} parcela(s) com uniformidade abaixo de 8: ${fracas.map(p => `${b(p.nome)} (${n2(p.nota)})`).join(', ')}. ${b('Verifique replantio, adubação e mato-competição')} nesses pontos.` : `Todas as parcelas com uniformidade 8 ou mais. 🌱`
    ]);
  }
  $('#q-foco').addEventListener('change', e => { estado.foco = e.target.value; estado.parcelaFoco = null; renderizar(['tabela', 'parcelas', 'mapa']); });
  $('#q-parcelas').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-k]'); if (!tr) return;
    const foco = avaliacaoEmFoco(filtradas()); estado.parcelaFoco = +tr.dataset.k;
    renderizar(['parcelas']); focarNoMapa(foco, +tr.dataset.k);
  });

  /* ======================================================================
     6. BLOCO B — PROJEÇÃO DA NOTA DO MÊS (média ponderada pela área)
     ====================================================================== */
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const chaveManual = (up) => `qual:manual:${estado.ano}-${String(estado.mes).padStart(2, '0')}:${up}`;
  const lerManual = up => { try { const v = localStorage.getItem(chaveManual(up)); return v == null ? null : +v; } catch { return null; } };
  const gravarManual = (up, v) => { try { v == null ? localStorage.removeItem(chaveManual(up)) : localStorage.setItem(chaveManual(up), String(v)); } catch { /* sem armazenamento */ } };

  function mesDaLinha(l) {
    const t = norm(l['MES AVALIATORIO']);
    const m = t.match(/([a-z]+)\s*\/\s*(\d{4})/);
    if (!m) return null;
    const i = MESES.findIndex(x => norm(x) === m[1]);
    return i < 0 ? null : { mes: i + 1, ano: +m[2] };
  }
  // Nota de 120 dias de cada UP (avaliação mais recente)
  function notas120() {
    const mapa120 = new Map();
    estado.avaliacoes.filter(a => /^120/.test(a.mon) && a.notaFinal != null).sort((a, c) => (a.data || 0) - (c.data || 0)).forEach(a => mapa120.set(a.up, a));
    return mapa120;
  }

  function linhasProjecao() {
    const n120 = notas120();
    const doMes = estado.ups.filter(l => { const m = mesDaLinha(l); return m && m.mes === estado.mes && m.ano === estado.ano; });
    // Projeção de cada UP sem 120 dias: a média das avaliações dela mesma (45, 60, 90 dias…; cada monitoramento
    // pesa igual, com a média dos avaliadores). Só a UP sem nenhuma avaliação usa a média do mês (ou a geral).
    const porUP = new Map();
    estado.avaliacoes.filter(a => a.notaFinal != null && !/^120/.test(a.mon)).forEach(a => {
      const m = porUP.get(a.up) || porUP.set(a.up, new Map()).get(a.up);
      (m.get(a.mon) || m.set(a.mon, []).get(a.mon)).push(a.notaFinal);
    });
    const mediaDaUP = up => { const m = porUP.get(up); return m ? { nota: media([...m.values()].map(media)), mons: [...m.keys()] } : null; };
    const avaliadas = doMes.map(l => n120.get(l.UP)).filter(Boolean);
    let mediaMes = media(avaliadas.map(a => a.notaFinal)), origemMes = 'Projetada – média do mês';
    if (mediaMes == null) { mediaMes = media([...n120.values()].map(a => a.notaFinal)); origemMes = 'Projetada – média geral'; }
    return doMes.map(l => {
      const av = n120.get(l.UP), manual = lerManual(l.UP), propria = av ? null : mediaDaUP(l.UP);
      const auto = av ? av.notaFinal : propria?.nota ?? mediaMes;
      return {
        up: l.UP, idade: valor(l.IDADE), fazenda: limparNome(l.FAZENDA), plantio: l.PLANTIO, area: valor(l.AREA) ?? 0, material: l.MATERIAL,
        auto, avaliacao: av, nota: manual ?? auto,
        origem: manual != null ? 'Manual' : av ? 'Avaliada' : propria ? `Projetada – média da UP (${propria.mons.join(', ')})` : origemMes
      };
    });
  }
  const classeOrigem = o => (o === 'Manual' ? 'manual' : o === 'Avaliada' ? 'avaliada' : 'projetada');

  function renderFiltrosProjecao() {
    const anos = new Set([hoje.getFullYear(), estado.ano]);
    estado.ups.forEach(l => { const m = mesDaLinha(l); if (m) anos.add(m.ano); });
    $('#q-p-anos').innerHTML = [...anos].sort().map(a => `<button type="button" class="chip-filtro mini ${a === estado.ano ? 'ativo' : ''}" data-ano="${a}">${a}</button>`).join('');
    $('#q-p-meses').innerHTML = MESES.map((m, i) => {
      const n = estado.ups.filter(l => { const x = mesDaLinha(l); return x && x.mes === i + 1 && x.ano === estado.ano; }).length;
      return `<button type="button" class="chip-filtro mini ${i + 1 === estado.mes ? 'ativo' : ''} ${n ? '' : 'sem-dados'}" data-mes="${i + 1}" title="${n} UPs">${m.slice(0, 3)}${n ? `<small>${n}</small>` : ''}</button>`;
    }).join('');
  }
  $('#q-p-anos').addEventListener('click', e => { const bt = e.target.closest('[data-ano]'); if (!bt) return; estado.ano = +bt.dataset.ano; renderizar(['projecao']); });
  $('#q-p-meses').addEventListener('click', e => { const bt = e.target.closest('[data-mes]'); if (!bt) return; estado.mes = +bt.dataset.mes; renderizar(['projecao']); });

  function renderProjecao() {
    renderFiltrosProjecao();
    const linhas = linhasProjecao();
    $('#q-p-titulo-mes').textContent = `${MESES[estado.mes - 1]}/${estado.ano}`;
    $('#q-p-tabela').innerHTML = linhas.length ? `
      <table class="q-tab q-tab-proj">
        <thead><tr><th>Idade</th><th>Fazenda</th><th>UP</th><th>Plantio</th><th>Área (ha)</th><th>Material</th><th>Nota 120 dias (projeção)</th><th>Origem da nota</th></tr></thead>
        <tbody>${linhas.map(l => `
          <tr data-up="${escapar(l.up)}" class="origem-${classeOrigem(l.origem)}">
            <td data-rotulo="Idade">${nInt(l.idade)} d</td>
            <td data-rotulo="Fazenda">${escapar(l.fazenda)}</td>
            <td data-rotulo="UP"><span class="q-up">${escapar(l.up)}</span></td>
            <td data-rotulo="Plantio">${escapar(l.plantio || '—')}</td>
            <td data-rotulo="Área">${n2(l.area)}</td>
            <td data-rotulo="Material">${escapar(l.material || '—')}</td>
            <td data-rotulo="Nota 120 dias" class="q-col-edit">
              <input type="number" min="0" max="10" step="0.1" inputmode="decimal" value="${l.nota == null ? '' : (Math.round(l.nota * 100) / 100)}" aria-label="Nota 120 dias da UP ${escapar(l.up)}" style="--c:${corNota(l.nota)}">
            </td>
            <td data-rotulo="Origem"><span class="q-origem">${l.origem}</span>${l.origem === 'Manual' ? `<button type="button" class="q-reset" data-reset="${escapar(l.up)}" title="Voltar ao valor automático (${n1(l.auto)})"><i data-lucide="undo-2"></i></button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>` : `<p class="vazio">Nenhuma UP com mês avaliatório ${MESES[estado.mes - 1]}/${estado.ano} na base.</p>`;
    atualizarNotaMes(linhas);
  }

  function atualizarNotaMes(linhas = linhasProjecao()) {
    const comNota = linhas.filter(l => l.nota != null && l.area > 0);
    const area = comNota.reduce((s, l) => s + l.area, 0);
    // Sem área na base, cai para a média simples (e avisa), em vez de ficar sem nota
    const semArea = !area && linhas.some(l => l.nota != null);
    const nota = area ? comNota.reduce((s, l) => s + l.nota * l.area, 0) / area : semArea ? media(linhas.map(l => l.nota).filter(v => v != null)) : null;
    $('#q-p-formula').textContent = semArea ? 'média simples: a base não trouxe a área das UPs' : 'Σ(nota × área) ÷ Σ(área)';
    const av = comNota.filter(l => l.origem === 'Avaliada');
    const areaAv = av.reduce((s, l) => s + l.area, 0);
    const notaAv = areaAv ? av.reduce((s, l) => s + l.nota * l.area, 0) / areaAv : null;
    contar($('#q-p-nota'), nota, n2);
    $('#q-p-card').style.setProperty('--c', corNota(nota));
    $('#q-p-nota').style.color = corNota(nota);
    $('#q-p-area').textContent = `${n2(area)} ha`;
    const cont = o => linhas.filter(l => classeOrigem(l.origem) === o).length;
    $('#q-p-cont').innerHTML = `<span class="q-origem avaliada">${cont('avaliada')} avaliadas</span><span class="q-origem projetada">${cont('projetada')} projetadas</span><span class="q-origem manual">${cont('manual')} manuais</span>`;
    $('#q-p-av').innerHTML = notaAv == null ? 'sem UPs avaliadas no mês' : `${selo(notaAv)} <small>em ${n2(areaAv)} ha</small>`;
    analise('#q-analise-proj', linhas.length ? [
      `Nota final projetada de ${b(n2(nota))} para ${b(MESES[estado.mes - 1] + '/' + estado.ano)}, ponderada por ${b(n2(area) + ' ha')}.`,
      cont('projetada') ? `${b(cont('projetada'))} UP(s) ainda sem avaliação de 120 dias estão com a nota média projetada. ${b('Priorize a avaliação das UPs de maior área')}: ${linhas.filter(l => classeOrigem(l.origem) === 'projetada').sort((a, c) => c.area - a.area).slice(0, 3).map(l => `${l.up} (${n2(l.area)} ha)`).join(', ')}.` : null,
      notaAv != null && nota != null && Math.abs(nota - notaAv) >= 0.1 ? `Só com as UPs já avaliadas, a nota seria ${b(n2(notaAv))}: a projeção ${nota > notaAv ? 'eleva' : 'reduz'} o resultado em ${b(n2(Math.abs(nota - notaAv)))}.` : null
    ] : []);
    icones();
  }

  // Edição manual da nota (salva no navegador)
  let espera;
  $('#q-p-tabela').addEventListener('input', e => {
    const inp = e.target.closest('input[type=number]'); if (!inp) return;
    const up = inp.closest('tr').dataset.up;
    clearTimeout(espera);
    espera = setTimeout(() => {
      const v = inp.value === '' ? null : Math.max(0, Math.min(10, parseFloat(String(inp.value).replace(',', '.'))));
      gravarManual(up, Number.isFinite(v) ? v : null);
      const linhas = linhasProjecao();
      const l = linhas.find(x => x.up === up);
      const tr = inp.closest('tr');
      tr.className = `origem-${classeOrigem(l.origem)}`;
      tr.querySelector('.q-origem').textContent = l.origem;
      inp.style.setProperty('--c', corNota(l.nota));
      let rb = tr.querySelector('.q-reset');
      if (l.origem === 'Manual' && !rb) { tr.lastElementChild.insertAdjacentHTML('beforeend', `<button type="button" class="q-reset" data-reset="${escapar(up)}" title="Voltar ao valor automático (${n1(l.auto)})"><i data-lucide="undo-2"></i></button>`); }
      else if (l.origem !== 'Manual' && rb) rb.remove();
      atualizarNotaMes(linhas);
    }, 250);
  });
  $('#q-p-tabela').addEventListener('click', e => { const bt = e.target.closest('[data-reset]'); if (!bt) return; gravarManual(bt.dataset.reset, null); renderizar(['projecao']); });
  $('#q-p-restaurar').addEventListener('click', () => { linhasProjecao().forEach(l => gravarManual(l.up, null)); renderizar(['projecao']); });

  // Exportar (CSV com ";" e BOM: abre direto no Excel em português)
  const CAB_PROJ = ['Idade (dias)', 'Fazenda', 'UP', 'Plantio', 'Área (ha)', 'Material', 'Nota 120 dias (projeção)', 'Origem da nota'];
  function dadosExportacao() {
    const linhas = linhasProjecao();
    const num = v => (v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
    return {
      linhas: linhas.map(l => [nInt(l.idade), l.fazenda, l.up, l.plantio, num(l.area), l.material, num(l.nota), l.origem]),
      final: num(+String($('#q-p-nota').dataset.valor || ''))
    };
  }
  function baixar(conteudo, tipo, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo }));
    a.download = `Projecao_Nota_120_dias_${MESES[estado.mes - 1]}_${estado.ano}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#q-p-exportar').addEventListener('click', () => {
    const { linhas, final } = dadosExportacao();
    const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [CAB_PROJ.map(cel).join(';'), ...linhas.map(l => l.map(cel).join(';')), '', [cel('Nota final do mês (ponderada pela área)'), cel(final)].join(';')].join('\r\n');
    baixar(csv, 'text/csv;charset=utf-8', 'csv');
  });
  // Excel: planilha em HTML (abre direto no Excel, com cabeçalho formatado)
  $('#q-p-excel').addEventListener('click', () => {
    const { linhas, final } = dadosExportacao();
    const td = v => `<td>${escapar(v)}</td>`;
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1">
      <tr><th colspan="8" style="background:#0b3b2e;color:#fff;font-size:14pt">Projeção da nota de 120 dias · ${MESES[estado.mes - 1]}/${estado.ano}</th></tr>
      <tr>${CAB_PROJ.map(c => `<th style="background:#1f6f54;color:#fff">${c}</th>`).join('')}</tr>
      ${linhas.map(l => `<tr>${l.map(td).join('')}</tr>`).join('')}
      <tr><th colspan="6" style="text-align:right">Nota final do mês (ponderada pela área)</th><th style="background:#c8f560">${final}</th><td></td></tr>
    </table></body></html>`;
    baixar(html, 'application/vnd.ms-excel;charset=utf-8', 'xls');
  });

  /* ---------- Orquestração ---------- */
  const SECOES = {
    filtros: () => renderFiltros(), fundo: l => renderFundo(l), tabela: l => renderTabela(l),
    mapa: l => renderMapa(l), parcelas: l => renderParcelas(l), projecao: () => renderProjecao()
  };
  function renderizar(quais = Object.keys(SECOES)) {
    if (estado.carregando) return;
    const lista = filtradas();
    if (quais.length > 2) { raiz.classList.remove('animar'); void raiz.offsetWidth; raiz.classList.add('animar'); }
    for (const q of quais) { try { SECOES[q](lista); } catch (erro) { console.error(`Qualidade: erro ao montar "${q}"`, erro); } }
    icones();
  }

  // A mesma fazenda aparece com e sem acento ("TRES CORAÇÕES" / "TRÊS CORAÇÕES"): usa uma grafia só, a acentuada
  function unificarFazendas() {
    const grafias = new Map();
    const somar = f => { if (!f) return; const k = norm(f), g = grafias.get(k) || grafias.set(k, new Map()).get(k); g.set(f, (g.get(f) || 0) + 1); };
    estado.avaliacoes.forEach(a => somar(a.fazenda));
    estado.ups.forEach(l => somar(limparNome(l.FAZENDA)));
    const acentos = t => (t.normalize('NFD').match(/[̀-ͯ]/g) || []).length;
    const melhor = new Map([...grafias].map(([k, g]) => [k, [...g].sort((x, y) => acentos(y[0]) - acentos(x[0]) || y[1] - x[1])[0][0]]));
    estado.avaliacoes.forEach(a => { a.fazenda = melhor.get(norm(a.fazenda)) || a.fazenda; });
    estado.ups.forEach(l => { l.FAZENDA = melhor.get(norm(limparNome(l.FAZENDA))) || l.FAZENDA; });
  }

  async function carregarTudo(fresco = false) {
    const botao = $('#q-atualizar');
    botao.classList.add('girando'); botao.disabled = true;
    $('#q-status').textContent = 'Atualizando dados…';
    const [av, ups] = await Promise.allSettled([carregarAvaliacoes(fresco), carregarUps(fresco)]);
    estado.erros = {};
    if (av.status === 'fulfilled') estado.avaliacoes = av.value.map(modeloAvaliacao).filter(a => a.up && !/^teste$/i.test(a.usuario));
    else estado.erros.avaliacoes = av.reason;
    if (ups.status === 'fulfilled') estado.ups = ups.value.filter(l => l.UP);
    else estado.erros.ups = ups.reason;
    unificarFazendas();
    estado.carregando = false;
    raiz.classList.remove('carregando');
    const cache = P.avisoCache();
    $('#q-status').textContent = cache ? `Sem conexão com a planilha · dados salvos de ${new Date(cache).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const erros = Object.keys(estado.erros);
    $('#q-erros').hidden = !erros.length;
    $('#q-erros').innerHTML = erros.length ? `<i data-lucide="triangle-alert"></i><div><strong>Não consegui carregar ${erros.length > 1 ? 'as abas' : 'uma aba'} da planilha de qualidade.</strong><p>${erros.map(e => (e === 'avaliacoes' ? 'Avaliações de 120 dias' : 'Base de UPs')).join(' e ')}. Verifique a internet ou se a planilha continua pública e toque em "Atualizar dados".</p></div>` : '';
    botao.classList.remove('girando'); botao.disabled = false;
    renderizar();
  }
  $('#q-atualizar').addEventListener('click', () => carregarTudo(true));
  // Volta da aba do Simulador ARS: refaz o fundo e o tamanho do mapa
  document.addEventListener('qual:aba', ev => { if (ev.detail === '120' && !estado.carregando) { renderFundo(filtradas()); mapa?.invalidateSize(); } });
  carregarTudo();
})();
