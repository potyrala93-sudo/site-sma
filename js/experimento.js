/* ==========================================================================
   SMA · Silvicultura — Experimento (laboratório de análise livre)
   Pedido em linguagem natural → especificação (IA do servidor ou intérprete local)
   → cálculo local sobre os dados reais (js/experimento-motor.js) → visualização + análise.
   ========================================================================== */

(() => {
  const X = window.SMA_EXPERIMENTO, P = window.SMA_PLANILHAS;
  if (!X || !P || !document.getElementById('x-area')) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const comServidor = /^https?:$/.test(location.protocol);
  const espera = ms => new Promise(r => setTimeout(r, ms));
  const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const CORES = ['#3dffa8', '#22d3ee', '#c8f560', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf', '#fb923c', '#60a5fa', '#e879f9', '#a3e635', '#f87171'];
  const NOMES_TIPO = { barra: 'Barras', barra_horizontal: 'Barras horizontais', linha: 'Linha', area: 'Área', pizza: 'Pizza', rosca: 'Rosca', dispersao: 'Dispersão', combinado: 'Combinado', mapa_calor: 'Mapa de calor', treemap: 'Treemap', funil: 'Funil', gauge: 'Medidor', kpi: 'Indicador', tabela: 'Tabela', ranking: 'Ranking' };

  /* ---------- Estado ---------- */
  const estado = {
    global: { ...P.periodo.atual(), fazendas: [], equipes: [] },   // mesma regra de período do Faturamento
    ia: false, carregando: null, cards: [], salvos: [], ondeSalvos: 'navegador'
  };

  /* ======================================================================
     BASES E FILTROS GLOBAIS
     ====================================================================== */
  async function carregar(fresco = false) {
    const bt = $('#x-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#x-status').textContent = 'Conectando às bases…';
    estado.carregando = X.carregarBases(fresco);
    try {
      const { erros } = await estado.carregando;
      const cat = X.catalogo();
      const ok = cat.filter(b => b.linhas > 0);
      $('#x-status').innerHTML = `${ok.length} bases conectadas · ${ok.reduce((s, b) => s + b.linhas, 0).toLocaleString('pt-BR')} registros · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const falhas = Object.keys(erros);
      const el = $('#x-erros');
      el.hidden = !falhas.length;
      if (falhas.length) { el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>Algumas bases não carregaram</strong><p>${falhas.map(f => escapar(X.BASES[f].nome)).join(', ')}. As análises usam as demais. Verifique a internet e se as planilhas estão como "Qualquer pessoa com o link – Leitor".</p></div>`; }
      renderFiltros(); renderExemplos();
      estado.cards.forEach(c => recalcular(c));
    } catch (erro) {
      console.error('Experimento: falha ao carregar as bases', erro);
      $('#x-status').textContent = 'Não consegui ler as bases agora';
    }
    bt.classList.remove('girando'); bt.disabled = false; icones();
  }
  function renderFiltros() {
    const anos = new Set([P.periodo.atual().ano]);
    X.dados.pgo.forEach(r => r.ANO && anos.add(r.ANO));
    $('#x-f-ano').innerHTML = `<option value="">Todos</option>${[...anos].sort((a, b) => b - a).map(a => `<option value="${a}" ${a === estado.global.ano ? 'selected' : ''}>${a}</option>`).join('')}`;
    $('#x-f-rf').innerHTML = `<option value="">Todos</option>${Array.from({ length: 12 }, (_, i) => i + 1).map(r => `<option value="${r}" ${r === estado.global.rf ? 'selected' : ''}>RF${String(r).padStart(2, '0')}</option>`).join('')}`;
    $$('[data-multi]').forEach(caixa => {
      const campo = caixa.dataset.multi, chave = campo === 'FAZENDA' ? 'fazendas' : 'equipes';
      const termo = ($('input[type=search]', caixa)?.value || '').toLowerCase();
      const valores = [...new Set(['pgo', 'faturamento', 'qualidade', 'base_ups'].flatMap(b => (X.dados[b] || []).map(r => r[campo])).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      $('.p-multi-lista', caixa).innerHTML = valores.filter(v => !termo || v.toLowerCase().includes(termo)).map(v => `<label class="p-multi-op"><input type="checkbox" value="${escapar(v)}" ${estado.global[chave].includes(v) ? 'checked' : ''}><span>${escapar(v)}</span></label>`).join('');
      const n = estado.global[chave].length;
      $('.p-multi-btn b', caixa).textContent = !n ? 'Todas' : n === 1 ? estado.global[chave][0] : `${n} selecionadas`;
      $('.p-multi-btn', caixa).classList.toggle('preenchido', n > 0);
    });
  }
  const mudouFiltro = () => { renderFiltros(); estado.cards.forEach(c => recalcular(c, true)); };
  $('#x-f-ano').addEventListener('change', e => { estado.global.ano = +e.target.value || null; mudouFiltro(); });
  $('#x-f-rf').addEventListener('change', e => { estado.global.rf = +e.target.value || null; mudouFiltro(); });
  $$('[data-multi]').forEach(caixa => {
    const chave = caixa.dataset.multi === 'FAZENDA' ? 'fazendas' : 'equipes', pop = $('.p-multi-pop', caixa), bt = $('.p-multi-btn', caixa);
    const abrir = sim => { pop.hidden = !sim; bt.setAttribute('aria-expanded', String(sim)); };
    bt.addEventListener('click', () => abrir(pop.hidden));
    document.addEventListener('click', e => { if (!pop.hidden && !caixa.contains(e.target)) abrir(false); });
    pop.addEventListener('change', e => { if (e.target.type !== 'checkbox') return; estado.global[chave] = e.target.checked ? [...estado.global[chave], e.target.value] : estado.global[chave].filter(x => x !== e.target.value); mudouFiltro(); abrir(true); });
    pop.addEventListener('input', e => { if (e.target.type === 'search') renderFiltros(); });
    pop.addEventListener('click', e => { if (e.target.closest('[data-limpar]')) { estado.global[chave] = []; mudouFiltro(); } });
  });
  $('#x-atualizar').addEventListener('click', () => carregar(true));

  /* ======================================================================
     IA DO SERVIDOR (com o intérprete local como reserva)
     ====================================================================== */
  async function verificarIA() {
    if (comServidor) {
      try { const r = await fetch('api/experimento/status', { cache: 'no-store' }); if (r.ok) estado.ia = !!(await r.json()).ia; } catch { estado.ia = false; }
    }
    $('#x-modo').textContent = estado.ia ? 'IA conectada' : 'Intérprete local';
    $('#x-modo-sub').textContent = estado.ia ? 'Claude monta a visualização e escreve a análise' : 'IA do servidor desligada: pedidos comuns funcionam assim mesmo';
    $('.x-nucleo').classList.toggle('ia', estado.ia);
  }
  async function postarIA(acao, corpo) {
    const r = await fetch(`api/experimento/${acao}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || `erro ${r.status}`);
    return j;
  }
  const globalTxt = () => ({ ano: estado.global.ano || 'todos', rf: estado.global.rf || 'todos', fazendas: estado.global.fazendas, equipes: estado.global.equipes });

  // Pedido → especificação validada
  async function especificar(pedido, atual = null) {
    const avisos = [];
    if (estado.ia) {
      try {
        const { especificacao } = await postarIA('especificar', { pedido, catalogo: X.catalogoParaIA(), global: globalTxt(), ...(atual ? { atual } : {}) });
        if (especificacao?.erro) return { ok: false, problemas: [especificacao.erro], sugestao: especificacao.sugestao, origem: 'ia' };
        const v = X.validar(especificacao);
        if (v.ok) return { ...v, origem: 'ia' };
        avisos.push(`A especificação da IA tinha problemas (${v.problemas.join(' ')}); usei o intérprete local.`);
      } catch (erro) { avisos.push(`IA indisponível agora (${erro.message}); usei o intérprete local.`); }
    }
    const v = atual ? X.ajustarLocal(pedido, atual) : X.interpretar(pedido);
    return { ...v, origem: 'local', avisos };
  }
  async function analisar(card) {
    if (!estado.ia) return X.analisarLocal(card.esp, card.res);
    const compacto = { dims: card.res.dims, colunas: card.res.colunas, notas: card.res.notas, linhas: card.res.linhas.slice(0, 60).map(l => ({ ...Object.fromEntries(card.res.dims.map(d => [d, X.formatarChave(l.chave[d])])), ...Object.fromEntries(card.res.colunas.map(c => [c.rotulo, l.v[c.id] == null ? null : Math.round(l.v[c.id] * 100) / 100])) })) };
    try { const { analise } = await postarIA('analisar', { pedido: card.pedido, especificacao: card.esp, resultado: compacto }); return { ...analise, origem: 'ia' }; }
    catch { return X.analisarLocal(card.esp, card.res); }
  }

  /* ======================================================================
     CARDS
     ====================================================================== */
  function novoCard(pedido, extra = {}) {
    const card = { id: novoId(), pedido, esp: null, res: null, analise: null, salvoId: null, grafico: null, ...extra };
    const el = document.createElement('article');
    el.className = 'x-card glass';
    el.dataset.id = card.id;
    el.innerHTML = `
      <header class="x-card-topo">
        <div class="x-card-tit"><span class="x-selo temp">Temporário</span><h3>${escapar(pedido)}</h3><p class="x-card-pedido"><i data-lucide="message-square-quote"></i>${escapar(pedido)}</p></div>
        <div class="x-card-acoes">
          <button type="button" class="x-ac" data-ac="salvar" title="Salvar"><i data-lucide="bookmark-plus"></i><span>Salvar</span></button>
          <button type="button" class="x-ac" data-ac="ajustar" title="Ajustar em linguagem natural"><i data-lucide="sliders-horizontal"></i><span>Ajustar</span></button>
          <button type="button" class="x-ac" data-ac="cheia" title="Tela cheia"><i data-lucide="maximize-2"></i></button>
          <div class="x-exp-wrap"><button type="button" class="x-ac" data-ac="exportar" title="Exportar"><i data-lucide="download"></i></button>
            <div class="x-exp-menu glass" hidden><button type="button" data-ac="png"><i data-lucide="image"></i>PNG</button><button type="button" data-ac="pdf"><i data-lucide="file-down"></i>PDF</button></div></div>
          <button type="button" class="x-ac perigo" data-ac="excluir" title="Excluir"><i data-lucide="trash-2"></i></button>
        </div>
      </header>
      <form class="x-ajuste" hidden><i data-lucide="sliders-horizontal"></i><input type="text" placeholder='Ex.: "agora só da equipe BV", "troque para linhas", "mostre os 5 maiores"' aria-label="Ajuste"><button type="submit" class="fat-btn fat-atualizar"><span>Aplicar</span></button></form>
      <div class="x-avisos"></div>
      <div class="x-palco"><div class="x-viz"></div></div>
      <details class="x-dados"><summary><i data-lucide="table-2"></i>Ver os dados calculados</summary><div class="x-dados-tab"></div></details>
      <section class="x-analise" aria-label="Análise"></section>`;
    $('#x-area').prepend(el);
    card.el = el;
    estado.cards.unshift(card);
    $('#x-vazio').hidden = true;
    icones();
    return card;
  }
  const cardDe = el => estado.cards.find(c => c.id === el.closest('.x-card')?.dataset.id);

  // Criação (ou ajuste) com a animação de materialização
  async function criar(pedido, { card = null, esp = null, analise = null, salvo = null } = {}) {
    pedido = pedido.trim(); if (!pedido) return;
    lembrarPedido(pedido);
    const ajuste = !!card && !esp;
    const alvo = card || novoCard(pedido, salvo ? { salvoId: salvo.id, nomeSalvo: salvo.nome } : {});
    if (salvo) marcarSalvo(alvo, salvo.nome);
    alvo.el.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
    const anima = animacao(alvo.el.querySelector('.x-palco'), pedido);
    const t0 = performance.now();
    try {
      await estado.carregando;
      let v;
      if (esp) v = { ...X.validar(esp), origem: 'salvo', avisos: [] };
      else v = await especificar(ajuste ? pedido : pedido, ajuste ? alvo.esp : null);
      if (!v.ok) {
        await anima.parar(t0, true);
        mostrarProblema(alvo, v);
        return;
      }
      alvo.esp = v.especificacao; alvo.origem = v.origem;
      if (ajuste) alvo.pedido = `${alvo.pedido} → ${pedido}`;
      alvo.res = X.executar(alvo.esp, estado.global);
      anima.fase('Materializando visualização…');
      await anima.parar(t0);
      renderCard(alvo, v.avisos || []);
      // análise (salva: mostra a última; senão, gera)
      if (analise) { alvo.analise = analise; renderAnalise(alvo, true); }
      else { renderAnalise(alvo, false, true); alvo.analise = await analisar(alvo); renderAnalise(alvo); }
    } catch (erro) {
      console.error('Experimento: erro ao criar', erro);
      await anima.parar(t0, true);
      mostrarProblema(alvo, { problemas: [`Algo deu errado ao calcular: ${erro.message}`] });
    }
  }
  function mostrarProblema(card, v) {
    const cat = X.catalogo().filter(b => b.linhas);
    card.el.querySelector('.x-viz').innerHTML = `
      <div class="x-problema">
        <span class="x-problema-ico"><i data-lucide="circle-help"></i></span>
        <div><strong>Não consegui montar essa análise</strong>
          <ul>${(v.problemas || []).map(p => `<li>${escapar(p)}</li>`).join('')}</ul>
          ${v.sugestao ? `<p><b>Sugestão:</b> ${escapar(v.sugestao)}</p>` : ''}
          <p>Tente citar <b>o que medir</b> (área, faturamento, nota, rendimento, apontamentos) e <b>como agrupar</b> (por equipe, fazenda, atividade, grupo, RF, dia, supervisor).</p>
          <details><summary>Bases e colunas disponíveis</summary>${cat.map(b => `<p><b>${escapar(b.nome)}</b>: ${b.campos.map(c => escapar(c.nome)).join(', ')}</p>`).join('')}</details>
        </div>
      </div>`;
    card.el.querySelector('.x-dados').hidden = true;
    icones();
  }

  function renderCard(card, avisos = []) {
    const { esp, res, el } = card;
    $('.x-card-tit h3', el).textContent = esp.titulo || card.pedido;
    $('.x-card-pedido', el).innerHTML = `<i data-lucide="message-square-quote"></i>${escapar(card.pedido)}<span class="x-tipo">${NOMES_TIPO[esp.tipo]} · ${card.origem === 'ia' ? 'IA' : card.origem === 'salvo' ? 'salvo' : 'intérprete local'}</span>`;
    $('.x-avisos', el).innerHTML = [...avisos, ...res.notas].map(n => `<p><i data-lucide="info"></i>${escapar(n)}</p>`).join('');
    $('.x-dados', el).hidden = false;
    renderViz(card);
    renderTabelaDados(card);
    icones();
  }
  // Filtros globais mudaram: recalcula com os dados atuais
  function recalcular(card, avisarAnalise = false) {
    if (!card.esp) return;
    card.res = X.executar(card.esp, estado.global);
    renderCard(card);
    if (avisarAnalise) {
      if (card.analise?.origem === 'ia') renderAnalise(card, true);
      else { card.analise = X.analisarLocal(card.esp, card.res); renderAnalise(card); }
    }
  }

  /* ---------- Visualizações ---------- */
  const fmt = (v, c) => X.formatar(v, c?.formato);
  // Rótulo compacto para dentro do gráfico: 1,5 mil · R$ 2,3 mi · 12,5%
  function curto(v, c) {
    if (v == null || !Number.isFinite(v)) return '';
    const f = c?.formato, a = Math.abs(v);
    const num = a >= 1e6 ? `${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : a >= 1e4 ? `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: a >= 100 ? 0 : 1 });
    return f === 'brl' ? `R$ ${num}` : f === 'pct' ? `${num}%` : num;
  }
  const chaveTxt = (l, dims) => dims.map(d => X.formatarChave(l.chave[d])).join(' · ') || 'Total';
  function prepararChart() {
    const C = window.Chart; if (!C) return null;
    C.defaults.font.family = 'Manrope, system-ui, sans-serif'; C.defaults.color = '#a9c4c4'; C.defaults.borderColor = 'rgba(120,255,220,.08)';
    Object.assign(C.defaults.plugins.tooltip, { backgroundColor: 'rgba(4,16,18,.92)', borderColor: 'rgba(34,211,238,.45)', borderWidth: 1, padding: 12, cornerRadius: 12, titleColor: '#fff', bodyColor: '#d6f5f0' });
    return C;
  }
  // Rótulos de dados em todos os gráficos
  const ROTULOS = {
    id: 'xRotulos',
    afterDatasetsDraw(ch, _a, o) {
      if (!o?.formatar) return;
      const { ctx } = ch, tipo = ch.config.type, horizontal = ch.options.indexAxis === 'y';
      ch.data.datasets.forEach((ds, i) => {
        const meta = ch.getDatasetMeta(i); if (!ch.isDatasetVisible(i) || meta.data.length > (o.max || 30)) return;
        meta.data.forEach((el, j) => {
          const v = ds.data[j]; const valor = typeof v === 'object' && v ? v.y : v;
          if (valor == null) return;
          let txt = curto(valor, ds._col);
          ctx.save(); ctx.font = '700 10.5px Manrope'; ctx.fillStyle = '#ecfffb'; ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 4;
          // rótulo que não cabe na largura da barra é omitido (o valor continua no tooltip e na tabela)
          if (tipo === 'bar' && !horizontal && ctx.measureText(txt).width > (el.width || 0) + 14) { ctx.restore(); return; }
          if (tipo === 'line' && meta.data.length > 16 && j % Math.ceil(meta.data.length / 12)) { ctx.restore(); return; }
          if (tipo === 'pie' || tipo === 'doughnut') {
            const tot = ds.data.reduce((s, x) => s + (x || 0), 0); if (!tot || valor / tot < 0.04) { ctx.restore(); return; }
            txt = `${(valor / tot * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
            const p = el.tooltipPosition(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, p.x, p.y);
          } else if (horizontal) { ctx.textBaseline = 'middle'; ctx.fillText(txt, el.x + 6, el.y); }
          else { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, el.x, el.y - 6); }
          ctx.restore();
        });
      });
    }
  };
  const BRILHO = { id: 'xBrilho', beforeDatasetsDraw(ch) { ch.ctx.save(); ch.ctx.shadowColor = 'rgba(61,255,168,.35)'; ch.ctx.shadowBlur = 14; }, afterDatasetsDraw(ch) { ch.ctx.restore(); } };

  function renderViz(card) {
    const { esp, res, el } = card;
    const viz = $('.x-viz', el);
    card.grafico?.destroy(); card.grafico = null;
    viz.className = `x-viz t-${esp.tipo}`;
    if (!res.linhas.length) { viz.innerHTML = '<p class="x-sem-dados"><i data-lucide="search-x"></i>Nenhum dado para esse pedido com os filtros atuais.</p>'; return; }
    const ys = esp.eixos.y.map(id => res.colunas.find(c => c.id === id)).filter(Boolean);
    const c0 = ys[0];
    const HTML = { kpi: vizKPI, tabela: vizTabela, ranking: vizRanking, mapa_calor: vizCalor, treemap: vizTreemap, funil: vizFunil, gauge: vizGauge };
    if (HTML[esp.tipo]) { viz.innerHTML = HTML[esp.tipo](card, ys); return; }
    const C = prepararChart(); if (!C) { viz.innerHTML = vizTabela(card, ys); return; }
    viz.innerHTML = '<div class="x-canvas"><canvas></canvas></div>';
    const canvas = $('canvas', viz);
    const x = esp.eixos.x, serie = esp.eixos.serie && res.dims.length > 1 ? esp.eixos.serie : null;
    const rotulosX = [...new Set(res.linhas.map(l => (x ? X.formatarChave(l.chave[x]) : 'Total')))];
    let datasets, tipo = { barra: 'bar', barra_horizontal: 'bar', linha: 'line', area: 'line', pizza: 'pie', rosca: 'doughnut', dispersao: 'scatter', combinado: 'bar' }[esp.tipo] || 'bar';
    const cor = (i, a = 1) => CORES[i % CORES.length] + (a < 1 ? Math.round(a * 255).toString(16).padStart(2, '0') : '');
    if (tipo === 'scatter') {
      datasets = [{ label: `${ys[0].rotulo} × ${ys[1].rotulo}`, data: res.linhas.map(l => ({ x: l.v[ys[0].id], y: l.v[ys[1].id], nome: chaveTxt(l, res.dims) })), backgroundColor: cor(1, .85), pointRadius: 6, pointHoverRadius: 9, _col: ys[1] }];
    } else if (serie) {
      const series = [...new Set(res.linhas.map(l => X.formatarChave(l.chave[serie])))];
      datasets = series.map((s, i) => ({
        label: s, _col: c0, backgroundColor: cor(i, tipo === 'line' ? .2 : .85), borderColor: cor(i), borderWidth: tipo === 'line' ? 2.5 : 0, borderRadius: 6, fill: esp.tipo === 'area', tension: .35, pointRadius: 3,
        data: rotulosX.map(rx => { const l = res.linhas.find(l => X.formatarChave(l.chave[x]) === rx && X.formatarChave(l.chave[serie]) === s); return l ? l.v[c0.id] : null; })
      }));
    } else {
      datasets = ys.map((c, i) => ({
        label: c.rotulo, _col: c, type: esp.tipo === 'combinado' && i > 0 ? 'line' : undefined, yAxisID: esp.tipo === 'combinado' && i > 0 ? 'y2' : 'y',
        backgroundColor: tipo === 'pie' || tipo === 'doughnut' ? rotulosX.map((_, j) => cor(j, .9)) : cor(i, tipo === 'line' ? .18 : .85),
        borderColor: tipo === 'pie' || tipo === 'doughnut' ? '#04100f' : cor(i), borderWidth: tipo === 'line' || (esp.tipo === 'combinado' && i > 0) ? 2.5 : (tipo === 'pie' || tipo === 'doughnut' ? 2 : 0),
        borderRadius: 6, fill: esp.tipo === 'area', tension: .35, pointRadius: 3,
        data: rotulosX.map(rx => { const l = res.linhas.find(l => (x ? X.formatarChave(l.chave[x]) : 'Total') === rx); return l ? l.v[c.id] : null; })
      }));
    }
    const horizontal = esp.tipo === 'barra_horizontal';
    if (horizontal) $('.x-canvas', viz).style.height = `${Math.max(320, rotulosX.length * 30 + 60)}px`;
    const eixoValor = { beginAtZero: true, grid: { color: 'rgba(120,255,220,.07)' }, ticks: { callback: v => Number(v).toLocaleString('pt-BR') } };
    const eixoCat = { grid: { display: false }, ticks: { autoSkip: !horizontal, maxRotation: 50, callback(v) { const t = this.getLabelForValue(v); return t.length > 26 ? t.slice(0, 25) + '…' : t; } } };
    card.grafico = new C(canvas, {
      type: tipo, data: { labels: tipo === 'scatter' ? undefined : rotulosX, datasets },
      options: {
        maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
        animation: reduzMovimento ? false : { duration: 1100, easing: 'easeOutQuart' },
        layout: { padding: { top: 26, right: horizontal ? 90 : 16 } },
        scales: tipo === 'pie' || tipo === 'doughnut' ? {} : tipo === 'scatter'
          ? { x: { ...eixoValor, title: { display: true, text: ys[0].rotulo } }, y: { ...eixoValor, title: { display: true, text: ys[1].rotulo } } }
          : { x: horizontal ? eixoValor : eixoCat, y: horizontal ? eixoCat : eixoValor, ...(esp.tipo === 'combinado' && ys.length > 1 ? { y2: { ...eixoValor, position: 'right', grid: { display: false } } } : {}) },
        plugins: {
          legend: { display: datasets.length > 1 || tipo === 'pie' || tipo === 'doughnut', labels: { usePointStyle: true, boxWidth: 8, color: '#cfeee8' } },
          tooltip: { callbacks: { label: it => { const ds = it.dataset; if (tipo === 'scatter') return ` ${it.raw.nome}: ${fmt(it.raw.x, ys[0])} · ${fmt(it.raw.y, ys[1])}`; return ` ${ds.label}: ${fmt(it.raw, ds._col)}`; } } },
          xRotulos: { formatar: (v, c) => fmt(v, c), max: 28 }
        }
      },
      plugins: [ROTULOS, BRILHO]
    });
  }
  function vizKPI(card, ys) {
    const { res } = card;
    const total = c => { const vs = res.linhas.map(l => l.v[c.id]).filter(v => v != null); if (!vs.length) return null; return ['pct', 'nota', 'ha_dia', 'num'].includes(c.formato) && vs.length > 1 ? vs.reduce((s, v) => s + v, 0) / vs.length : vs.reduce((s, v) => s + v, 0); };
    return `<div class="x-kpis">${ys.map((c, i) => `<div class="x-kpi" style="--c:${CORES[i % CORES.length]}"><span>${escapar(c.rotulo)}</span><strong>${fmt(total(c), c)}</strong>${res.linhas.length > 1 ? `<small>${['pct', 'nota', 'ha_dia', 'num'].includes(c.formato) ? 'média de' : 'soma de'} ${res.linhas.length} grupos</small>` : ''}</div>`).join('')}</div>`;
  }
  function vizTabela(card) {
    const { res } = card;
    return `<div class="x-tab-wrap"><table class="q-tab x-tab"><thead><tr>${res.dims.map(d => `<th>${escapar(d.replace(/_/g, ' '))}</th>`).join('')}${res.colunas.map(c => `<th>${escapar(c.rotulo)}</th>`).join('')}</tr></thead>
      <tbody>${res.linhas.map(l => `<tr>${res.dims.map(d => `<td data-rotulo="${escapar(d)}">${escapar(X.formatarChave(l.chave[d]))}</td>`).join('')}${res.colunas.map(c => `<td data-rotulo="${escapar(c.rotulo)}"><b>${fmt(l.v[c.id], c)}</b></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function vizRanking(card, ys) {
    const { res } = card, c = ys[0];
    const max = Math.max(...res.linhas.map(l => Math.abs(l.v[c.id] || 0)), 1);
    return `<ol class="x-ranking">${res.linhas.map((l, i) => `<li style="--p:${Math.abs(l.v[c.id] || 0) / max};--c:${CORES[i % CORES.length]}"><b class="x-pos">${i + 1}º</b><span class="x-rk-nome">${escapar(chaveTxt(l, res.dims))}</span><span class="x-rk-barra"><i></i></span><strong>${fmt(l.v[c.id], c)}</strong>${ys[1] ? `<small>${escapar(ys[1].rotulo)}: ${fmt(l.v[ys[1].id], ys[1])}</small>` : ''}</li>`).join('')}</ol>`;
  }
  function vizCalor(card, ys) {
    const { res, esp } = card, c = ys[0], x = esp.eixos.x, s = esp.eixos.serie;
    const linhas = [...new Set(res.linhas.map(l => X.formatarChave(l.chave[x])))], cols = [...new Set(res.linhas.map(l => X.formatarChave(l.chave[s])))];
    const vals = res.linhas.map(l => l.v[c.id]).filter(v => v != null), mx = Math.max(...vals, 1), mn = Math.min(...vals, 0);
    const cel = (a, b) => res.linhas.find(l => X.formatarChave(l.chave[x]) === a && X.formatarChave(l.chave[s]) === b);
    return `<div class="x-tab-wrap"><table class="x-calor"><thead><tr><th>${escapar(x)} \\ ${escapar(s)}</th>${cols.map(b => `<th>${escapar(b)}</th>`).join('')}</tr></thead><tbody>${linhas.map(a => `<tr><th>${escapar(a)}</th>${cols.map(b => {
      const l = cel(a, b), v = l?.v[c.id]; const p = v == null ? 0 : (v - mn) / (mx - mn || 1);
      return `<td style="--p:${p.toFixed(3)}" title="${escapar(a)} · ${escapar(b)}: ${fmt(v, c)}">${v == null ? '' : fmt(v, c)}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  function vizTreemap(card, ys) {
    const { res } = card, c = ys[0];
    const itens = res.linhas.map((l, i) => ({ nome: chaveTxt(l, res.dims), v: Math.max(0, l.v[c.id] || 0), cor: CORES[i % CORES.length] })).filter(i => i.v > 0).sort((a, b) => b.v - a.v);
    const total = itens.reduce((s, i) => s + i.v, 0);
    // fatiamento binário alternando a direção (simples e legível)
    const caixas = [];
    (function dividir(lista, x, y, w, h, vertical) {
      if (!lista.length) return;
      if (lista.length === 1) { caixas.push({ ...lista[0], x, y, w, h }); return; }
      const soma = lista.reduce((s, i) => s + i.v, 0); let acc = 0, k = 0;
      while (k < lista.length - 1 && acc + lista[k].v < soma / 2) acc += lista[k++].v;
      if (k === 0) { acc = lista[0].v; k = 1; }
      const f = acc / soma, a = lista.slice(0, k), b = lista.slice(k);
      if (vertical) { dividir(a, x, y, w * f, h, !vertical); dividir(b, x + w * f, y, w * (1 - f), h, !vertical); }
      else { dividir(a, x, y, w, h * f, !vertical); dividir(b, x, y + h * f, w, h * (1 - f), !vertical); }
    })(itens, 0, 0, 100, 100, true);
    return `<div class="x-treemap">${caixas.map(b => `<div style="left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%;--c:${b.cor}" title="${escapar(b.nome)}: ${fmt(b.v, c)}"><b>${escapar(b.nome)}</b><span>${fmt(b.v, c)} · ${(b.v / total * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span></div>`).join('')}</div>`;
  }
  function vizFunil(card, ys) {
    const { res } = card, c = ys[0];
    const itens = [...res.linhas].sort((a, b) => (b.v[c.id] || 0) - (a.v[c.id] || 0)), mx = Math.max(...itens.map(l => l.v[c.id] || 0), 1);
    return `<div class="x-funil">${itens.map((l, i) => `<div class="x-funil-n" style="--p:${Math.max(.12, (l.v[c.id] || 0) / mx)};--c:${CORES[i % CORES.length]}"><span>${escapar(chaveTxt(l, res.dims))}</span><b>${fmt(l.v[c.id], c)}</b></div>`).join('')}</div>`;
  }
  function vizGauge(card, ys) {
    const { res } = card, c = ys[0];
    const vs = res.linhas.map(l => l.v[c.id]).filter(v => v != null);
    const media = ['pct', 'nota'].includes(c.formato) || vs.length === 1;
    const valor = vs.length ? (media ? vs.reduce((s, v) => s + v, 0) / vs.length : vs.reduce((s, v) => s + v, 0)) : 0;
    let max = c.formato === 'pct' ? Math.max(100, valor) : c.formato === 'nota' ? 10 : null;
    let refTxt = '';
    if (ys[1]) { const ref = res.linhas.reduce((s, l) => s + (l.v[ys[1].id] || 0), 0); max = ref || max; refTxt = `${escapar(ys[1].rotulo)}: ${fmt(ref, ys[1])}`; }
    if (!max) max = valor * 1.25 || 1;
    const p = Math.max(0, Math.min(1, valor / max));
    const corG = p < .8 ? '#ff5470' : p < .95 ? '#fbbf24' : '#3dffa8';
    return `<div class="x-gauge" style="--p:${p};--c:${corG}"><svg viewBox="0 0 200 120" aria-hidden="true"><path d="M20 110 A80 80 0 0 1 180 110" class="x-g-fundo"/><path d="M20 110 A80 80 0 0 1 180 110" class="x-g-valor" pathLength="100" style="stroke-dashoffset:${100 - p * 100}"/></svg>
      <strong>${fmt(valor, c)}</strong><span>${escapar(c.rotulo)}${ys[1] ? '' : max ? ` · escala até ${fmt(max, c)}` : ''}</span>${refTxt ? `<small>${refTxt} · ${(p * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small>` : ''}</div>`;
  }
  function renderTabelaDados(card) {
    const { res } = card;
    $('.x-dados-tab', card.el).innerHTML = `<table class="q-tab x-tab"><thead><tr>${res.dims.map(d => `<th>${escapar(d.replace(/_/g, ' '))}</th>`).join('')}${res.colunas.map(c => `<th>${escapar(c.rotulo)}</th>`).join('')}</tr></thead>
      <tbody>${res.linhas.slice(0, 200).map(l => `<tr>${res.dims.map(d => `<td data-rotulo="${escapar(d)}">${escapar(X.formatarChave(l.chave[d]))}</td>`).join('')}${res.colunas.map(c => `<td data-rotulo="${escapar(c.rotulo)}">${fmt(l.v[c.id], c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  /* ---------- Texto analítico ---------- */
  function renderAnalise(card, desatualizada = false, carregando = false) {
    const el = $('.x-analise', card.el);
    if (carregando) { el.innerHTML = '<div class="x-escrevendo"><i data-lucide="sparkles"></i><span>Escrevendo a leitura dos números</span><em></em></div>'; icones(); return; }
    const a = card.analise; if (!a) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <header><span class="analise-icone"><i data-lucide="brain-circuit"></i></span><strong class="analise-titulo">Leitura analítica</strong><small>${a.origem === 'ia' ? 'gerada pela IA a partir dos números calculados' : 'gerada a partir dos números calculados'}</small>
        ${desatualizada || estado.ia ? `<button type="button" class="x-ac" data-ac="regenerar"><i data-lucide="refresh-ccw"></i><span>Regenerar análise</span></button>` : ''}</header>
      ${desatualizada ? '<p class="x-aviso-analise"><i data-lucide="clock-alert"></i>Os dados ou filtros mudaram desde esta análise.</p>' : ''}
      <div class="x-an-grid">
        <div class="x-an-bloco"><h4><i data-lucide="file-text"></i>Resumo</h4><p>${escapar(a.resumo)}</p></div>
        ${a.destaques?.length ? `<div class="x-an-bloco"><h4><i data-lucide="trending-up"></i>Destaques</h4><ul>${a.destaques.map(d => `<li>${escapar(d)}</li>`).join('')}</ul></div>` : ''}
        ${a.atencao?.length ? `<div class="x-an-bloco atencao"><h4><i data-lucide="triangle-alert"></i>Pontos de atenção</h4><ul>${a.atencao.map(d => `<li>${escapar(d)}</li>`).join('')}</ul></div>` : ''}
        ${a.sugestao ? `<div class="x-an-bloco sugestao"><h4><i data-lucide="compass"></i>Próxima análise</h4><p>${escapar(a.sugestao)}</p><button type="button" class="fat-btn" data-sugestao="${escapar(a.sugestao)}"><i data-lucide="corner-down-right"></i>Usar este pedido</button></div>` : ''}
      </div>`;
    icones();
  }

  /* ---------- Ações dos cards ---------- */
  $('#x-area').addEventListener('click', async e => {
    const bt = e.target.closest('[data-ac]'), card = cardDe(e.target);
    const sug = e.target.closest('[data-sugestao]');
    if (sug) { $('#x-pedido').value = sug.dataset.sugestao; $('#x-pedido').focus(); window.scrollTo({ top: $('#x-form').getBoundingClientRect().top + scrollY - 110, behavior: reduzMovimento ? 'auto' : 'smooth' }); return; }
    if (!bt || !card) return;
    const ac = bt.dataset.ac;
    if (ac === 'excluir') {
      if (!confirm('Tem certeza que deseja excluir esta visualização?')) return;
      card.grafico?.destroy(); card.el.remove();
      estado.cards = estado.cards.filter(c => c !== card);
      $('#x-vazio').hidden = estado.cards.length > 0;
    } else if (ac === 'ajustar') {
      const f = $('.x-ajuste', card.el); f.hidden = !f.hidden; if (!f.hidden) $('input', f).focus();
    } else if (ac === 'cheia') telaCheia(card);
    else if (ac === 'exportar') { const m = $('.x-exp-menu', card.el); m.hidden = !m.hidden; }
    else if (ac === 'png' || ac === 'pdf') { $('.x-exp-menu', card.el).hidden = true; exportar(card, ac); }
    else if (ac === 'salvar') abrirSalvar(card);
    else if (ac === 'regenerar') { renderAnalise(card, false, true); card.analise = await analisar(card); renderAnalise(card); if (card.salvoId) atualizarSalvo(card); }
  });
  $('#x-area').addEventListener('submit', e => {
    const f = e.target.closest('.x-ajuste'); if (!f) return;
    e.preventDefault();
    const card = cardDe(f), txt = $('input', f).value.trim(); if (!txt || !card.esp) return;
    $('input', f).value = ''; f.hidden = true;
    criar(txt, { card });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.x-exp-wrap')) $$('.x-exp-menu').forEach(m => { m.hidden = true; }); });

  function telaCheia(card) {
    const el = card.el;
    const sair = () => { el.classList.remove('x-cheia'); document.body.classList.remove('x-tem-cheia'); setTimeout(() => card.grafico?.resize(), 60); };
    if (el.classList.contains('x-cheia')) { if (document.fullscreenElement) document.exitFullscreen(); sair(); return; }
    el.classList.add('x-cheia'); document.body.classList.add('x-tem-cheia');
    el.requestFullscreen?.().catch(() => {});
    const aoSair = () => { if (!document.fullscreenElement) { sair(); document.removeEventListener('fullscreenchange', aoSair); } };
    document.addEventListener('fullscreenchange', aoSair);
    setTimeout(() => card.grafico?.resize(), 120);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.x-cheia').forEach(el => { const c = estado.cards.find(x => x.el === el); if (c) telaCheia(c); }); });

  async function exportar(card, formato) {
    if (!window.SMA_PDF || !card.esp) return;
    const nome = (card.esp.titulo || 'Experimento').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60);
    card.el.classList.add('x-exportando');
    try {
      const canvas = await window.SMA_PDF.capturar(card.el);
      const png = canvas.toDataURL('image/png');
      if (formato === 'png') { const a = document.createElement('a'); a.href = png; a.download = `${nome}.png`; document.body.appendChild(a); a.click(); a.remove(); }
      else {
        const pag = `<div class="p-pdf-mini"><b>Experimento · SMA Silvicultura</b><span>${escapar(filtrosTxt())} · emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span></div>
          <div class="x-pdf-img"><img src="${png}" alt=""></div>`;
        await window.SMA_PDF.gerar([pag], `${nome}.pdf`);
      }
    } catch (erro) { alert(`Não consegui exportar (${erro.message}).`); }
    finally { card.el.classList.remove('x-exportando'); }
  }
  const filtrosTxt = () => `Ano ${estado.global.ano || 'todos'} · RF ${estado.global.rf ? String(estado.global.rf).padStart(2, '0') : 'todos'} · Fazendas: ${estado.global.fazendas.join(', ') || 'todas'} · Equipes: ${estado.global.equipes.join(', ') || 'todas'}`;

  /* ======================================================================
     ANIMAÇÃO DE CRIAÇÃO (grade holográfica, rede neural, partículas de dados, terminal)
     ====================================================================== */
  function animacao(palco, pedido) {
    palco.classList.add('gerando');
    const cat = X.catalogo();
    const campos = [...new Set(cat.flatMap(b => b.campos.map(c => c.nome)))];
    const amostras = [...campos, ...cat.flatMap(b => b.campos.flatMap(c => (c.valores || []).slice(0, 3))), ...['Σ', 'Δ', '∫', '0,94', '1.284,6', '37,2%', 'ha', 'R$']];
    const CURTO = { pgo: 'PGO', faturamento: 'Faturamento', faturamento_diario: 'Diário', frota: 'Frota', estrutura: 'Estrutura', qualidade: 'Qualidade', base_ups: 'UPs', programacao: 'Calendário' };
    const bases = cat.filter(b => b.linhas).map(b => CURTO[b.id] || b.id).slice(0, 5).join(', ');
    const dimsTxt = (pedido.match(/equipe|fazenda|atividade|grupo|supervisor|rf|dia|up/gi) || ['FAZENDA', 'EQUIPE']).slice(0, 2).map(s => s.toUpperCase()).join(' × ');
    const linhas = ['Iniciando núcleo analítico...', `Conectando às bases ${bases}...`, `Cruzando dimensões: ${dimsTxt}...`, 'Calibrando eixos quânticos...', estado.ia ? 'Consultando a IA (só o catálogo, nunca a base inteira)...' : 'Interpretando o pedido no núcleo local...', 'Materializando visualização...'];
    const camada = document.createElement('div');
    camada.className = 'x-gerador';
    camada.innerHTML = `<canvas></canvas><div class="x-scan"></div><div class="x-terminal" role="status" aria-live="polite"></div><div class="x-gerador-nucleo"><span></span></div>`;
    palco.appendChild(camada);
    const term = $('.x-terminal', camada);
    let iLinha = 0, parado = false, raf = 0;
    const digitar = async () => {
      while (!parado && iLinha < linhas.length) {
        const p = document.createElement('p'); term.appendChild(p);
        const txt = `> ${linhas[iLinha++]}`;
        for (let k = 1; k <= txt.length && !parado; k += 2) { p.textContent = txt.slice(0, k + 1); await espera(reduzMovimento ? 0 : 12); }
        p.textContent = txt;
        if (iLinha < linhas.length) await espera(reduzMovimento ? 60 : 160);
      }
    };
    const digitacao = digitar();
    if (!reduzMovimento) {
      const cv = $('canvas', camada), ctx = cv.getContext('2d');
      const ajustar = () => { const r = camada.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); };
      ajustar();
      const W = () => cv.width / devicePixelRatio, H = () => cv.height / devicePixelRatio;
      const nos = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random() - .5) * .0016, vy: (Math.random() - .5) * .0016, f: Math.random() * 6 }));
      const parts = Array.from({ length: 26 }, () => novaParticula());
      function novaParticula() { const a = Math.random() * Math.PI * 2, r = .55 + Math.random() * .35; return { a, r, t: amostras[Math.floor(Math.random() * amostras.length)], v: .0025 + Math.random() * .004, gira: (Math.random() - .5) * .01 }; }
      const t0 = performance.now();
      const quadro = t => {
        const w = W(), h = H(), s = (t - t0) / 1000, cx = w / 2, cy = h / 2;
        ctx.clearRect(0, 0, w, h);
        // grade holográfica em perspectiva
        ctx.save(); ctx.strokeStyle = 'rgba(34,211,238,.16)'; ctx.lineWidth = 1;
        const hor = h * .42, fuga = cx;
        for (let i = -12; i <= 12; i++) { ctx.beginPath(); ctx.moveTo(fuga + i * 6, hor); ctx.lineTo(cx + i * w * .12, h); ctx.stroke(); }
        for (let j = 0; j < 14; j++) { const p = ((j / 14) + (s * .25) % (1 / 14)) ; const y = hor + Math.pow(p, 2.2) * (h - hor); ctx.globalAlpha = .25 + p * .6; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
        ctx.restore();
        // rede neural
        nos.forEach(n => { n.x += n.vx; n.y += n.vy; if (n.x < .05 || n.x > .95) n.vx *= -1; if (n.y < .05 || n.y > .9) n.vy *= -1; });
        ctx.save();
        for (let i = 0; i < nos.length; i++) for (let j = i + 1; j < nos.length; j++) {
          const a = nos[i], b = nos[j], dx = (a.x - b.x) * w, dy = (a.y - b.y) * h, d = Math.hypot(dx, dy);
          if (d < 130) { ctx.strokeStyle = `rgba(61,255,168,${(1 - d / 130) * .45})`; ctx.beginPath(); ctx.moveTo(a.x * w, a.y * h); ctx.lineTo(b.x * w, b.y * h); ctx.stroke(); }
        }
        nos.forEach(n => { const pul = 2 + Math.sin(s * 4 + n.f) * 1.4; ctx.fillStyle = 'rgba(200,255,240,.9)'; ctx.shadowColor = '#3dffa8'; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(n.x * w, n.y * h, pul, 0, Math.PI * 2); ctx.fill(); });
        ctx.restore();
        // fragmentos de dados sugados para o centro
        ctx.save(); ctx.font = '600 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
        parts.forEach((p, i) => {
          p.r -= p.v; p.a += p.gira;
          if (p.r < .04) parts[i] = novaParticula();
          const x = cx + Math.cos(p.a) * p.r * w * .55, y = cy + Math.sin(p.a) * p.r * h * .55;
          ctx.globalAlpha = Math.min(1, p.r * 1.6); ctx.fillStyle = i % 3 ? '#7dfcd6' : '#67e8f9'; ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 8;
          ctx.fillText(p.t, x, y);
        });
        ctx.restore();
        raf = requestAnimationFrame(quadro);
      };
      raf = requestAnimationFrame(quadro);
    }
    return {
      fase() { /* as mensagens do terminal seguem a sequência fixa */ },
      async parar(t0, comErro = false) {
        const minimo = reduzMovimento ? 600 : 2500;
        const falta = minimo - (performance.now() - t0);
        if (falta > 0) await espera(falta);
        if (!comErro) await Promise.race([digitacao, espera(1800)]);   // deixa o terminal terminar a última linha
        parado = true;
        const ult = term.lastElementChild; if (ult && !comErro) ult.className = 'ok';
        if (!comErro && !reduzMovimento) { camada.classList.add('glitch'); await espera(380); }
        cancelAnimationFrame(raf);
        camada.remove();
        palco.classList.remove('gerando');
        if (!comErro) { palco.classList.remove('materializa'); void palco.offsetWidth; palco.classList.add('materializa'); }
      }
    };
  }

  /* ======================================================================
     PEDIDOS: formulário, exemplos e histórico
     ====================================================================== */
  $('#x-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#x-pedido').value.trim(); if (!t) return;
    $('#x-pedido').value = '';
    criar(t);
  });
  $('#x-pedido').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#x-form').requestSubmit(); } });
  function renderExemplos() {
    const cat = X.catalogo(), valor = (base, campo, i = 0) => cat.find(b => b.id === base)?.campos.find(c => c.nome === campo)?.valores?.[i];
    const eq = valor('pgo', 'EQUIPE') || 'BN', faz = valor('pgo', 'FAZENDA'), grupo = valor('pgo', 'GRUPO_ATIVIDADE');
    const exemplos = [
      'Compare a área realizada por equipe nos últimos 3 RFs',
      'Faturamento por fazenda x área da UP',
      'Ranking das atividades com menor rendimento por dia',
      `Área realizada por dia da equipe ${eq}`,
      'Participação de cada grupo de atividade na área (rosca)',
      'Mapa de calor da área por equipe e grupo de atividade',
      'Faturamento total por supervisor nos últimos 3 RFs em linhas',
      'Nota final média por fazenda',
      'Aderência média do RF atual (medidor)',
      faz ? `Área realizada por atividade na fazenda ${faz}` : null,
      grupo ? `Treemap da área de ${grupo.toLowerCase()} por atividade` : null
    ].filter(Boolean);
    $('#x-exemplos').innerHTML = `<span class="x-ajuda-rot"><i data-lucide="lightbulb"></i>Exemplos</span>${exemplos.map(t => `<button type="button" class="x-chip" data-pedido="${escapar(t)}">${escapar(t)}</button>`).join('')}`;
    icones();
  }
  const HIST = 'exp:historico';
  const historico = () => { try { return JSON.parse(sessionStorage.getItem(HIST) || '[]'); } catch { return []; } };
  function lembrarPedido(t) {
    const h = [t, ...historico().filter(x => x !== t)].slice(0, 8);
    try { sessionStorage.setItem(HIST, JSON.stringify(h)); } catch { /* opcional */ }
    renderHistorico();
  }
  function renderHistorico() {
    const h = historico(), el = $('#x-historico');
    el.hidden = !h.length;
    el.innerHTML = `<span class="x-ajuda-rot"><i data-lucide="history"></i>Últimos pedidos</span>${h.map(t => `<button type="button" class="x-chip hist" data-pedido="${escapar(t)}">${escapar(t)}</button>`).join('')}`;
    icones();
  }
  $('.x-ajudas').addEventListener('click', e => { const b = e.target.closest('[data-pedido]'); if (b) { $('#x-pedido').value = b.dataset.pedido; $('#x-pedido').focus(); } });

  /* ======================================================================
     SALVOS (servidor do site; sem servidor, neste navegador) — disponíveis para todos os usuários
     ====================================================================== */
  const LOCAL = 'exp:salvos';
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || '[]'); } catch { return []; } };
  async function listarSalvos() {
    if (comServidor) {
      try { const r = await fetch('api/experimentos', { cache: 'no-store' }); if (r.ok) { estado.salvos = (await r.json()).experimentos || []; estado.ondeSalvos = 'servidor'; return; } } catch { /* navegador */ }
    }
    estado.salvos = lerLocal(); estado.ondeSalvos = 'navegador';
  }
  async function gravarSalvo(item) {
    if (estado.ondeSalvos === 'servidor') {
      const r = await fetch(`api/experimentos/${item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `erro ${r.status}`);
    } else localStorage.setItem(LOCAL, JSON.stringify([...lerLocal().filter(x => x.id !== item.id), item]));
  }
  async function excluirSalvo(id) {
    if (estado.ondeSalvos === 'servidor') { const r = await fetch(`api/experimentos/${id}`, { method: 'DELETE' }); if (!r.ok) throw new Error(`erro ${r.status}`); }
    else localStorage.setItem(LOCAL, JSON.stringify(lerLocal().filter(x => x.id !== id)));
  }
  const modal = $('#x-modal-salvar');
  let cardSalvando = null;
  function abrirSalvar(card) {
    if (!card.esp) return;
    cardSalvando = card;
    $('#x-salvar-nome').value = card.nomeSalvo || card.esp.titulo || card.pedido;
    $('#x-salvar-info').textContent = `${estado.ondeSalvos === 'servidor' ? 'Fica salvo no servidor do site, disponível para todos os usuários do dashboard.' : 'Sem o servidor do site, fica salvo só neste navegador.'} Guarda o pedido, a especificação e a última análise; ao reabrir, recalcula com os dados atualizados.`;
    modal.hidden = false; icones();
    setTimeout(() => $('#x-salvar-nome').select(), 30);
  }
  async function confirmarSalvar() {
    const card = cardSalvando, nome = $('#x-salvar-nome').value.trim();
    if (!card || !nome) return;
    const agora = new Date().toISOString(), anterior = estado.salvos.find(s => s.id === card.salvoId);
    const item = { id: card.salvoId || novoId(), nome, pedido: card.pedido, especificacao: card.esp, analise: card.analise, tipo: card.esp.tipo, criadoEm: anterior?.criadoEm || agora, atualizadoEm: agora, ordem: anterior?.ordem ?? (Math.max(0, ...estado.salvos.map(s => s.ordem || 0)) + 1) };
    try {
      await gravarSalvo(item);
      card.salvoId = item.id; card.nomeSalvo = nome;
      marcarSalvo(card, nome);
      modal.hidden = true;
      await listarSalvos(); renderSalvos();
    } catch (erro) { $('#x-salvar-info').textContent = `Não consegui salvar: ${erro.message}`; }
  }
  async function atualizarSalvo(card) {
    const s = estado.salvos.find(x => x.id === card.salvoId); if (!s) return;
    try { await gravarSalvo({ ...s, analise: card.analise, especificacao: card.esp, atualizadoEm: new Date().toISOString() }); await listarSalvos(); renderSalvos(); } catch { /* segue */ }
  }
  function marcarSalvo(card, nome) {
    const selo = $('.x-selo', card.el); selo.className = 'x-selo salvo'; selo.textContent = 'Salvo';
    $('[data-ac="salvar"] span', card.el).textContent = 'Salvar alterações';
    card.el.classList.add('salvo'); card.el.title = nome;
  }
  $('#x-salvar-ok').addEventListener('click', confirmarSalvar);
  $('#x-salvar-nome').addEventListener('keydown', e => { if (e.key === 'Enter') confirmarSalvar(); });
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-fechar]')) modal.hidden = true; });

  function renderSalvos() {
    $('#x-n-salvos').textContent = estado.salvos.length;
    $('#x-salvos-onde').innerHTML = estado.ondeSalvos === 'servidor' ? '<i data-lucide="server"></i>No servidor do site · visíveis para todos' : '<i data-lucide="hard-drive"></i>Neste navegador';
    const termo = ($('#x-salvos-busca').value || '').toLowerCase();
    const lista = [...estado.salvos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).filter(s => !termo || `${s.nome} ${s.pedido}`.toLowerCase().includes(termo));
    $('#x-salvos').innerHTML = lista.length ? lista.map((s, i) => `
      <article class="x-salvo glass" draggable="true" data-salvo="${s.id}">
        <div class="x-salvo-ico"><i data-lucide="${{ linha: 'chart-line', area: 'chart-area', pizza: 'chart-pie', rosca: 'chart-pie', dispersao: 'chart-scatter', mapa_calor: 'grid-3x3', treemap: 'layout-dashboard', funil: 'filter', gauge: 'gauge', kpi: 'square-asterisk', tabela: 'table-2', ranking: 'list-ordered', barra_horizontal: 'chart-bar' }[s.tipo] || 'chart-column'}"></i></div>
        <div class="x-salvo-txt"><strong>${escapar(s.nome)}</strong><small>${escapar(NOMES_TIPO[s.tipo] || s.tipo)} · criado em ${new Date(s.criadoEm).toLocaleDateString('pt-BR')}</small><p>${escapar(s.pedido)}</p></div>
        <footer>
          <button type="button" class="fat-btn" data-abrir="${s.id}"><i data-lucide="play"></i>Abrir</button>
          <span class="p-setas"><button type="button" data-mover="${s.id}" data-dir="-1" ${i === 0 || termo ? 'disabled' : ''} aria-label="Mover para antes"><i data-lucide="chevron-left"></i></button><button type="button" data-mover="${s.id}" data-dir="1" ${i === lista.length - 1 || termo ? 'disabled' : ''} aria-label="Mover para depois"><i data-lucide="chevron-right"></i></button></span>
          <button type="button" class="fat-btn p-excluir" data-excluir="${s.id}" aria-label="Excluir ${escapar(s.nome)}"><i data-lucide="trash-2"></i></button>
        </footer>
      </article>`).join('') : `<p class="p-salvas-vazio"><i data-lucide="archive"></i>${estado.salvos.length ? 'Nada encontrado na busca.' : 'Nenhum experimento salvo ainda. Crie uma visualização e toque em "Salvar".'}</p>`;
    icones();
  }
  $('#x-salvos-busca').addEventListener('input', renderSalvos);
  async function reordenar(ids) {
    const mudados = [];
    ids.forEach((id, i) => { const s = estado.salvos.find(x => x.id === id); if (s && s.ordem !== i) { s.ordem = i; mudados.push(s); } });
    renderSalvos();
    try { for (const s of mudados) await gravarSalvo(s); } catch { /* a ordem fica só nesta tela */ }
  }
  $('#x-salvos').addEventListener('click', async e => {
    const ab = e.target.closest('[data-abrir]'), mv = e.target.closest('[data-mover]'), ex = e.target.closest('[data-excluir]');
    if (ab) {
      const s = estado.salvos.find(x => x.id === ab.dataset.abrir); if (!s) return;
      abrirAba('trabalho');
      const ja = estado.cards.find(c => c.salvoId === s.id);
      if (ja) { ja.el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
      criar(s.pedido, { esp: s.especificacao, analise: s.analise ? { ...s.analise } : null, salvo: s });
    } else if (mv) {
      const ids = [...estado.salvos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(s => s.id);
      const i = ids.indexOf(mv.dataset.mover), j = i + +mv.dataset.dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]]; reordenar(ids);
    } else if (ex) {
      const s = estado.salvos.find(x => x.id === ex.dataset.excluir);
      if (!s || !confirm(`Tem certeza que deseja excluir "${s.nome}"?`)) return;
      try { await excluirSalvo(s.id); await listarSalvos(); renderSalvos(); estado.cards.filter(c => c.salvoId === s.id).forEach(c => { c.salvoId = null; const selo = $('.x-selo', c.el); selo.className = 'x-selo temp'; selo.textContent = 'Temporário'; }); }
      catch (erro) { alert(`Não consegui excluir: ${erro.message}`); }
    }
  });
  let arrastando = null;
  $('#x-salvos').addEventListener('dragstart', e => { const c = e.target.closest('[data-salvo]'); if (!c) return; arrastando = c.dataset.salvo; c.classList.add('arrastando'); try { e.dataTransfer.setData('text/plain', arrastando); } catch { /* ok */ } });
  $('#x-salvos').addEventListener('dragover', e => { if (arrastando && e.target.closest('[data-salvo]')) e.preventDefault(); });
  $('#x-salvos').addEventListener('drop', e => {
    const alvo = e.target.closest('[data-salvo]'); if (!arrastando || !alvo) return;
    e.preventDefault();
    const ids = [...estado.salvos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map(s => s.id).filter(id => id !== arrastando);
    ids.splice(ids.indexOf(alvo.dataset.salvo), 0, arrastando); arrastando = null; reordenar(ids);
  });
  $('#x-salvos').addEventListener('dragend', () => { arrastando = null; $$('.x-salvo').forEach(x => x.classList.remove('arrastando')); });

  /* ---------- Abas ---------- */
  function abrirAba(aba) {
    const t = aba === 'trabalho';
    $('#aba-trabalho').hidden = !t; $('#aba-salvos').hidden = t;
    $$('.x-abas [data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    $('.x-abas').classList.toggle('sem', !t);
    if (t) estado.cards.forEach(c => c.grafico?.resize());
  }
  $('.x-abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) abrirAba(b.dataset.aba); });

  // As visualizações temporárias somem ao sair: avisa se houver algo não salvo
  window.addEventListener('beforeunload', e => { if (estado.cards.some(c => c.esp && !c.salvoId)) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Início ---------- */
  document.body.style.setProperty('--ader-cor', '#22d3ee');
  document.body.style.setProperty('--ader-cor-suave', 'rgba(34,211,238,.25)');
  renderExemplos(); renderHistorico(); icones();
  verificarIA();
  listarSalvos().then(renderSalvos);
  carregar();
})();
