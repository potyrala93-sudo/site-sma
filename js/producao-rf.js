/* ==========================================================================
   SMA · Silvicultura — Produção · Produção por RF
   Bloco 1: área de cada RF no ano (base oficial do RF).
   Bloco 2: conferência RF × Minha Produção (apontamentos PGO), por UP + atividade normalizada.
   Reaproveita: regra de Ano/RF do Faturamento (SMA_PLANILHAS.periodo), normalização de atividades
   (SMA_PLANILHAS.atividades) e a leitura dos apontamentos do painel Produção Realizada.
   ========================================================================== */

(() => {
  const P = window.SMA_PLANILHAS, CFG = window.SMA_DADOS?.PRODUCAO?.baseRF;
  const raiz = document.getElementById('frf');
  if (!P || !CFG || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ha = v => `${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
  const n2 = v => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = v => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
  const brl = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const inteiro = v => (v || 0).toLocaleString('pt-BR');
  const rotRF = rf => `RF${String(rf).padStart(2, '0')}`;
  const normAtiv = P.atividades.normalizar;
  const normUP = t => semAcento(t).toUpperCase().replace(/\s+/g, '').trim();
  // Fazenda para filtro/exibição: os nomes variam entre as bases ("SANTA ROSA (S-G14A )" × "Santa Rosa")
  const chaveFaz = t => semAcento(t).toUpperCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  const limparNome = t => String(t || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();

  const SITUACOES = [
    { id: 'so_rf', nome: 'Só no RF', cor: '#ff4d5e', icone: 'circle-x' },
    { id: 'so_minha', nome: 'Só na minha produção', cor: '#fb923c', icone: 'circle-plus' },
    { id: 'divergencia', nome: 'Divergência de área', cor: '#fbbf24', icone: 'triangle-alert' },
    { id: 'conferido', nome: 'Conferido', cor: '#22e07a', icone: 'circle-check' }
  ];
  const SIT = Object.fromEntries(SITUACOES.map(s => [s.id, s]));

  /* ======================================================================
     LEITURA DA BASE DO RF (colunas pelo nome, com variações aceitas)
     ====================================================================== */
  const carregarBaseRF = fresco => P.lerPlanilha(CFG.planilha, CFG.aba, { fresco, coluna: 'UP' });
  function mapearColunas(linhas) {
    const chaves = new Set(linhas.slice(0, 50).flatMap(l => Object.keys(l)));
    const achar = alias => alias.map(a => P.chaveColuna(a)).find(a => chaves.has(a)) || null;
    return Object.fromEntries(Object.entries(CFG.colunas).map(([campo, alias]) => [campo, achar(alias)]));
  }
  function prepararBaseRF(linhas) {
    const col = mapearColunas(linhas);
    const faltando = ['UP', 'ATIVIDADE', 'AREA'].filter(c => !col[c]);
    if (faltando.length) throw new Error(`a base do RF não tem as colunas ${faltando.join(', ')} (colunas encontradas: ${[...new Set(linhas.slice(0, 5).flatMap(l => Object.keys(l)))].filter(Boolean).slice(0, 25).join(', ')})`);
    const atual = P.periodo.atual();
    const dados = linhas.map(l => {
      const original = (l[col.ATIVIDADE] || '').trim(), up = normUP(l[col.UP]);
      if (!original || !up) return null;
      let ano = col.ANO ? P.num(l[col.ANO]) : 0, rf = col.RF ? P.num(l[col.RF]) : 0;
      const rfTxt = col.RF ? String(l[col.RF]) : '';
      const m = rfTxt.match(/(\d{1,2})\s*[/-]\s*(\d{4})/);   // "10/2026"
      if (m) { rf = +m[1]; ano = ano || +m[2]; }
      if (!ano) ano = atual.ano;
      const area = P.num(l[col.AREA]), tarifa = col.TARIFA ? P.num(l[col.TARIFA]) : 0;
      return {
        ANO: ano, RF: rf, fazenda: limparNome(l[col.FAZENDA]) || '—', up, ativ: normAtiv(original), ativNome: original.replace(/\s*\(D\)\s*$/i, '').trim(),
        area, valor: col.VALOR ? P.num(l[col.VALOR]) : tarifa ? area * tarifa : 0
      };
    }).filter(Boolean);
    return { dados, col };
  }

  /* ======================================================================
     ESTADO E FILTROS
     ====================================================================== */
  const estado = {
    ...P.periodo.atual(),        // ano e RF atuais (mesma regra do Faturamento); rf = null → todos os RFs
    fazendas: [], atividades: [], sit: 'todas', busca: '', ord: { k: 'sit', dir: 1 }, mostrar: 60,
    rf: P.periodo.atual().rf, base: [], minha: [], fimRF: new Map(), col: null, erroBase: null, carregando: true
  };
  const filtroComum = d => (!estado.fazendas.length || estado.fazendas.includes(chaveFaz(d.fazenda))) && (!estado.atividades.length || estado.atividades.includes(d.ativ));
  const doAno = d => P.num(d.ANO) === estado.ano;
  const doPeriodoSel = d => (estado.rf ? P.periodo.doPeriodo(d, estado.ano, estado.rf) : doAno(d));
  const rfReferencia = () => estado.rf || P.periodo.atual().rf;

  // Período: abre no RF atual (mesma regra de data do Faturamento) e permite escolher outro RF
  const pop = $('#f-periodo-pop'), btP = $('#f-periodo');
  const abrirP = sim => { pop.hidden = !sim; btP.setAttribute('aria-expanded', String(sim)); };
  btP.addEventListener('click', () => abrirP(pop.hidden));
  document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('#f-periodo-pop, #f-periodo')) abrirP(false); });
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-ano]'), r = e.target.closest('[data-rf]');
    if (a) estado.ano = +a.dataset.ano;
    else if (r) { estado.rf = +r.dataset.rf; abrirP(false); }
    else if (e.target.closest('[data-hoje]')) { Object.assign(estado, P.periodo.atual()); abrirP(false); }
    else return;
    estado.mostrar = 60; renderizar();
  });
  function renderPeriodo() {
    $('#f-periodo-rotulo').textContent = P.periodo.rotulo(estado.ano, estado.rf);
    const anos = new Set([P.periodo.atual().ano, estado.ano]);
    [...estado.base, ...estado.minha].forEach(d => { const a = P.num(d.ANO); if (a > 2000) anos.add(a); });
    $('#f-anos').innerHTML = [...anos].sort((a, b) => b - a).map(a => `<button type="button" class="${a === estado.ano ? 'ativo' : ''}" data-ano="${a}">${a}</button>`).join('');
    // RF "com dados" = lançado na base do RF
    $('#f-rfs').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(r => {
      const tem = estado.base.some(d => P.periodo.doPeriodo(d, estado.ano, r));
      return `<button type="button" class="${r === estado.rf ? 'ativo' : ''} ${tem ? 'com-dados' : ''}" data-rf="${r}" title="${tem ? 'Lançado na base do RF' : 'Ainda não lançado na base do RF'}">${rotRF(r)}</button>`;
    }).join('');
  }

  // Seleção múltipla: Fazenda e Atividade (opções das duas bases, no ano)
  const MULTI = { fazenda: 'fazendas', atividade: 'atividades' };
  function renderMulti() {
    const doA = [...estado.base, ...estado.minha].filter(doAno);
    const opcoes = {
      fazenda: [...new Map(doA.map(d => [chaveFaz(d.fazenda), chaveFaz(d.fazenda)])).values()].filter(Boolean),
      atividade: [...new Map(doA.map(d => [d.ativ, d.ativ])).values()]
    };
    Object.entries(MULTI).forEach(([campo, chave]) => {
      const caixa = $(`[data-fmulti="${campo}"]`), termo = semAcento($('input[type=search]', caixa)?.value || '').toUpperCase();
      $('.p-multi-lista', caixa).innerHTML = opcoes[campo].sort((a, b) => a.localeCompare(b, 'pt-BR')).filter(v => !termo || v.includes(termo))
        .map(v => `<label class="p-multi-op"><input type="checkbox" value="${escapar(v)}" ${estado[chave].includes(v) ? 'checked' : ''}><span>${escapar(v)}</span></label>`).join('') || '<small>Nada no ano.</small>';
      const n = estado[chave].length;
      $('.p-multi-btn b', caixa).textContent = !n ? 'Todas' : n === 1 ? estado[chave][0] : `${n} selecionadas`;
      $('.p-multi-btn', caixa).classList.toggle('preenchido', n > 0);
    });
    $('#f-limpar').disabled = !estado.fazendas.length && !estado.atividades.length && estado.sit === 'todas' && !estado.busca;
  }
  $$('[data-fmulti]').forEach(caixa => {
    const chave = MULTI[caixa.dataset.fmulti], popM = $('.p-multi-pop', caixa), bt = $('.p-multi-btn', caixa);
    const abrir = sim => { popM.hidden = !sim; bt.setAttribute('aria-expanded', String(sim)); };
    bt.addEventListener('click', () => abrir(popM.hidden));
    document.addEventListener('click', e => { if (!popM.hidden && !caixa.contains(e.target)) abrir(false); });
    popM.addEventListener('change', e => { if (e.target.type !== 'checkbox') return; estado[chave] = e.target.checked ? [...estado[chave], e.target.value] : estado[chave].filter(x => x !== e.target.value); estado.mostrar = 60; renderizar(); abrir(true); });
    popM.addEventListener('input', e => { if (e.target.type === 'search') renderMulti(); });
    popM.addEventListener('click', e => { if (e.target.closest('[data-limpar]')) { estado[chave] = []; renderizar(); } });
  });
  $('#f-limpar').addEventListener('click', () => {
    estado.fazendas = []; estado.atividades = []; estado.sit = 'todas'; estado.busca = ''; $('#f-busca').value = '';
    $$('[data-fmulti] input[type=search]').forEach(i => { i.value = ''; });
    renderizar();
  });

  /* ======================================================================
     BLOCO 2 — CONFERÊNCIA RF × MINHA PRODUÇÃO (chave: UP + atividade normalizada)
     ====================================================================== */
  function comparar() {
    const tol = CFG.toleranciaHa ?? 0.1;
    const m = new Map();
    const pegar = d => { const up = normUP(d.up), k = `${up}|${d.ativ}`; return m.get(k) || m.set(k, { k, up, ativ: d.ativ, nome: '', fazRF: '', fazMinha: '', rf: 0, minha: 0, nRF: 0, nMinha: 0 }).get(k); };
    estado.base.filter(d => doPeriodoSel(d) && filtroComum(d)).forEach(d => { const g = pegar(d); g.rf += d.area; g.nRF++; g.fazRF ||= d.fazenda; g.nome ||= d.ativNome; });
    estado.minha.filter(d => doPeriodoSel(d) && filtroComum(d)).forEach(d => {
      const g = pegar(d); g.minha += d.area; g.nMinha++; g.fazMinha ||= d.fazenda; g.nome = d.ativNome || g.nome;
      const dt = P.dataBR(d.data); if (dt && (!g.fim || dt > g.fim)) g.fim = dt;   // data fim = último apontamento no RF
    });
    // Data fim: nos RFs já fechados vem da base do RF (aba BD); no RF atual, por enquanto, da minha produção.
    // Sem data em nenhuma das duas, mostra o último apontamento dessa UP + atividade em qualquer RF.
    const ehAtual = estado.ano === P.periodo.atual().ano && estado.rf === P.periodo.atual().rf;
    const ultimo = ultimoApontamento();
    return [...m.values()].map(g => {
      const dif = g.minha - g.rf;
      const sit = !g.nMinha ? 'so_rf' : !g.nRF ? 'so_minha' : Math.abs(dif) > tol ? 'divergencia' : 'conferido';
      const doRF = !ehAtual ? estado.fimRF.get(`${estado.ano}|${estado.rf}|${g.k}`) : null;
      const outro = !doRF && !g.fim ? ultimo.get(g.k) : null;
      return {
        ...g, fazenda: g.fazRF || g.fazMinha || '—', dif, difPct: g.rf ? dif / g.rf : null, sit,
        fim: doRF || g.fim || outro?.data || null,
        fimOrigem: doRF ? 'rf' : g.fim ? 'minha' : outro ? 'outro' : null,
        fimOutroRF: outro ? P.periodo.rotulo(outro.ano, outro.rf) : null
      };
    });
  }
  // Ano do apontamento a partir da data e do RF (RF1 apontado em dezembro é do ano seguinte, e vice-versa)
  const anoDoRF = (rf, d) => d.getFullYear() + (rf <= 2 && d.getMonth() >= 10 ? 1 : rf >= 11 && d.getMonth() <= 1 ? -1 : 0);
  function prepararBD(linhas) {
    const p = CFG.bd.posicoes, mapa = new Map();
    linhas.forEach(l => {
      const rf = P.num(l[p.RF]), dt = P.dataBR(l[p.DATA]), up = normUP(l[p.UP] || ''), ativ = normAtiv(l[p.ATIVIDADE] || '');
      if (!rf || !dt || !up || !ativ) return;
      const k = `${anoDoRF(rf, dt)}|${rf}|${up}|${ativ}`;
      if (!mapa.has(k) || dt > mapa.get(k)) mapa.set(k, dt);
    });
    return mapa;
  }
  let cacheUltimo = null;
  function ultimoApontamento() {
    if (cacheUltimo?.base === estado.minha) return cacheUltimo.mapa;
    const mapa = new Map();
    estado.minha.forEach(d => {
      const dt = P.dataBR(d.data); if (!dt) return;
      const k = `${normUP(d.up)}|${d.ativ}`, atual = mapa.get(k);
      if (!atual || dt > atual.data) mapa.set(k, { data: dt, ano: P.num(d.ANO), rf: P.num(d.RF) });
    });
    cacheUltimo = { base: estado.minha, mapa };
    return mapa;
  }
  const dataTxt = d => (d ? d.toLocaleDateString('pt-BR') : '—');
  function renderBloco2() {
    if (estado.erroBase) {
      // sem a base do RF não existe conferência (senão tudo pareceria "Só na minha produção")
      $('#f-sits').innerHTML = '';
      $('#f-analise').hidden = true;
      $('#f-tab-comp').innerHTML = '<p class="vazio">A conferência aparece quando a base do RF puder ser lida.</p>';
      estado.ultimaLista = [];
      return;
    }
    const todas = comparar();
    // RF escolhido ainda não lançado na base do RF: avisa em vez de tratar tudo como "só na minha produção"
    const rfsBase = [...new Set(estado.base.filter(doAno).map(d => d.RF))].sort((a, b) => a - b);
    const semRF = estado.rf && !rfsBase.includes(estado.rf);
    const aviso = $('#f-aviso-rf');
    aviso.hidden = !semRF;
    if (semRF) aviso.innerHTML = `<i data-lucide="calendar-x"></i><span>A base do RF ainda não tem o <b>${rotRF(estado.rf)}/${estado.ano}</b>${rfsBase.length ? ` (último lançado: <b>${rotRF(rfsBase[rfsBase.length - 1])}</b>)` : ''}. Até ele ser lançado, os apontamentos deste RF aparecem como "Só na minha produção".</span>${rfsBase.length ? `<button type="button" data-ir-rf="${rfsBase[rfsBase.length - 1]}">Ver o ${rotRF(rfsBase[rfsBase.length - 1])}</button>` : ''}`;
    $('#f-b2-periodo').textContent = estado.rf ? `Período: ${P.periodo.rotulo(estado.ano, estado.rf)}.` : `Período: ${estado.ano}, todos os RFs somados.`;
    // Chips por situação
    const resumo = SITUACOES.map(s => {
      const l = todas.filter(x => x.sit === s.id);
      const area = s.id === 'so_minha' ? l.reduce((t, x) => t + x.minha, 0) : s.id === 'divergencia' ? l.reduce((t, x) => t + Math.abs(x.dif), 0) : l.reduce((t, x) => t + x.rf, 0);
      return { ...s, n: l.length, area, rotArea: s.id === 'so_minha' ? 'na minha produção' : s.id === 'divergencia' ? 'de diferença' : 'no RF' };
    });
    $('#f-sits').innerHTML = `<button type="button" class="f-sit ${estado.sit === 'todas' ? 'ativo' : ''}" data-sit="todas" style="--c:#38bdf8"><span><i></i>Todas</span><strong>${inteiro(todas.length)}</strong><small>${ha(todas.reduce((t, x) => t + x.rf, 0))} no RF · ${ha(todas.reduce((t, x) => t + x.minha, 0))} na minha</small></button>` +
      resumo.map(s => `<button type="button" class="f-sit ${estado.sit === s.id ? 'ativo' : ''}" data-sit="${s.id}" style="--c:${s.cor}"><span><i></i>${s.nome}</span><strong>${inteiro(s.n)}</strong><small>${ha(s.area)} ${s.rotArea}</small></button>`).join('');

    // Tabela
    const termo = semAcento(estado.busca).toUpperCase().trim();
    const ordemSit = Object.fromEntries(SITUACOES.map((s, i) => [s.id, i]));
    const { k, dir } = estado.ord;
    const valor = x => (k === 'sit' ? ordemSit[x.sit] * 1e9 - Math.abs(x.dif) : k === 'fazenda' ? x.fazenda : k === 'up' ? x.up : k === 'ativ' ? x.nome || x.ativ : k === 'difPct' ? (x.difPct ?? -Infinity) : k === 'fim' ? (x.fim ? x.fim.getTime() : 0) : x[k]);
    const lista = todas.filter(x => (estado.sit === 'todas' || x.sit === estado.sit) && (!termo || `${x.up} ${x.ativ} ${semAcento(x.fazenda).toUpperCase()}`.includes(termo)))
      .sort((a, b) => { const x = valor(a), y = valor(b); return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR', { numeric: true }) : x - y) * dir; });
    const th = (kk, t) => `<th scope="col"><button type="button" data-ord="${kk}" class="${k === kk ? 'ativo' : ''}">${t}<i data-lucide="${k === kk ? (dir > 0 ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}"></i></button></th>`;
    const linhaTot = (rot, l, cls, cor) => {
      const rf = l.reduce((t, x) => t + x.rf, 0), mi = l.reduce((t, x) => t + x.minha, 0);
      return `<tr class="f-tot ${cls}" ${cor ? `style="--c:${cor}"` : ''}><td colspan="5" data-rotulo="Total">${rot} · ${inteiro(l.length)} item(ns)</td><td data-rotulo="Área no RF">${ha(rf)}</td><td data-rotulo="Área na minha produção">${ha(mi)}</td><td data-rotulo="Diferença" class="${mi - rf >= 0 ? 'f-pos' : 'f-neg'}">${mi - rf > 0 ? '+' : ''}${n2(mi - rf)}</td><td data-rotulo="Diferença (%)">${rf ? pct((mi - rf) / rf) : '—'}</td></tr>`;
    };
    const visiveis = lista.slice(0, estado.mostrar);
    const totais = estado.sit === 'todas'
      ? SITUACOES.map(s => { const l = lista.filter(x => x.sit === s.id); return l.length ? linhaTot(s.nome, l, '', s.cor) : ''; }).join('') + linhaTot('Total geral', lista, 'f-tot-geral')
      : linhaTot(`Total · ${SIT[estado.sit].nome}`, lista, 'f-tot-geral', SIT[estado.sit].cor);
    $('#f-tab-comp').innerHTML = `<table class="q-tab r-tab f-tab-comp">
      <thead><tr>${th('sit', 'Situação')}${th('fazenda', 'Fazenda')}${th('up', 'UP')}${th('ativ', 'Atividade')}${th('fim', 'Data fim')}${th('rf', 'Área no RF')}${th('minha', 'Área na minha produção')}${th('dif', 'Diferença (ha)')}${th('difPct', 'Diferença (%)')}</tr></thead>
      <tbody>${visiveis.map(x => { const s = SIT[x.sit]; return `<tr style="--c:${s.cor}">
        <td data-rotulo="Situação"><span class="f-badge" style="--c:${s.cor}"><i data-lucide="${s.icone}"></i>${s.nome}</span></td>
        <td data-rotulo="Fazenda">${escapar(x.fazenda)}</td><td data-rotulo="UP"><span class="q-up">${escapar(x.up)}</span></td>
        <td data-rotulo="Atividade" class="f-ativ">${escapar(x.nome || x.ativ)}${x.nome && normAtiv(x.nome) !== x.nome ? `<small>${escapar(x.ativ)}</small>` : ''}</td>
        <td data-rotulo="Data fim" class="f-fim">${x.fim ? `<b>${dataTxt(x.fim)}</b><small>${x.fimOrigem === 'rf' ? 'base do RF' : x.fimOrigem === 'minha' ? 'minha produção' : `último apontamento · ${escapar(x.fimOutroRF)}`}</small>` : '<small>sem data</small>'}</td>
        <td data-rotulo="Área no RF">${x.nRF ? ha(x.rf) : '—'}</td><td data-rotulo="Área na minha produção">${x.nMinha ? ha(x.minha) : '—'}</td>
        <td data-rotulo="Diferença (ha)" class="${x.dif > 0 ? 'f-pos' : x.dif < 0 ? 'f-neg' : ''}">${x.dif > 0 ? '+' : ''}${n2(x.dif)}</td>
        <td data-rotulo="Diferença (%)">${x.difPct == null ? '—' : pct(x.difPct)}</td></tr>`; }).join('') || `<tr><td colspan="9" class="vazio">${estado.erroBase ? 'A base do RF não pôde ser lida, então não há como conferir.' : 'Nada para conferir com os filtros atuais.'}</td></tr>`}
      ${lista.length ? totais : ''}</tbody></table>
      ${lista.length > estado.mostrar ? `<button type="button" class="fat-btn f-mais" id="f-mais"><i data-lucide="chevrons-down"></i>Mostrar mais (${Math.min(60, lista.length - estado.mostrar)} de ${lista.length - estado.mostrar} restantes)</button>` : ''}`;

    // Leitura para decisão
    const conf = resumo.find(s => s.id === 'conferido'), soRF = resumo.find(s => s.id === 'so_rf'), soMi = resumo.find(s => s.id === 'so_minha'), div = resumo.find(s => s.id === 'divergencia');
    const maiores = todas.filter(x => x.sit === 'divergencia').sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif)).slice(0, 3);
    const el = $('#f-analise');
    const itens = todas.length ? [
      `${conf.n} de ${todas.length} combinações UP + atividade estão <strong>conferidas</strong> (${((conf.n / todas.length) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%).`,
      soRF.n ? `<strong>${soRF.n} item(ns) só no RF</strong> (${ha(soRF.area)}): estão no RF mas não aparecem nos meus apontamentos. Verifique se faltou apontar.` : null,
      soMi.n ? `<strong>${soMi.n} item(ns) só na minha produção</strong> (${ha(soMi.area)}): apontados, mas fora do RF. Verifique se precisam entrar no RF.` : null,
      maiores.length ? `Maiores divergências: ${maiores.map(x => `<strong>${escapar(x.up)}</strong> ${escapar(x.nome || x.ativ)} (${x.dif > 0 ? '+' : ''}${n2(x.dif)} ha)`).join('; ')}.` : null
    ].filter(Boolean) : [];
    el.hidden = !itens.length;
    el.innerHTML = `<span class="analise-icone"><i data-lucide="lightbulb"></i></span><div><strong class="analise-titulo">Leitura para decisão</strong><ul>${itens.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
    estado.ultimaLista = lista;
  }
  $('#f-aviso-rf').addEventListener('click', e => { const b = e.target.closest('[data-ir-rf]'); if (b) { estado.rf = +b.dataset.irRf; estado.mostrar = 60; renderizar(); } });
  $('#f-sits').addEventListener('click', e => { const b = e.target.closest('[data-sit]'); if (b) { estado.sit = b.dataset.sit; estado.mostrar = 60; renderizar(['b2', 'filtros']); } });
  $('#f-tab-comp').addEventListener('click', e => {
    const o = e.target.closest('[data-ord]');
    if (o) { const k = o.dataset.ord; estado.ord = { k, dir: estado.ord.k === k ? -estado.ord.dir : (['rf', 'minha', 'dif', 'difPct'].includes(k) ? -1 : 1) }; renderizar(['b2']); return; }
    if (e.target.closest('#f-mais')) { estado.mostrar += 60; renderizar(['b2']); }
  });
  let espera;
  $('#f-busca').addEventListener('input', e => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = e.target.value; estado.mostrar = 60; renderizar(['b2', 'filtros']); }, 180); });

  // Exportar a conferência (lista filtrada inteira)
  function linhasExport() {
    const num = v => String(Math.round((v || 0) * 100) / 100).replace('.', ',');
    return [['Situação', 'Fazenda', 'UP', 'Atividade', 'Atividade (normalizada)', 'Data fim', 'Origem da data fim', 'Área no RF (ha)', 'Área na minha produção (ha)', 'Diferença (ha)', 'Diferença (%)'],
      ...(estado.ultimaLista || []).map(x => [SIT[x.sit].nome, x.fazenda, x.up, x.nome || x.ativ, x.ativ, x.fim ? dataTxt(x.fim) : '', x.fimOrigem === 'rf' ? 'Base do RF' : x.fimOrigem === 'minha' ? 'Minha produção' : x.fimOrigem === 'outro' ? `Último apontamento (${x.fimOutroRF})` : '', num(x.rf), num(x.minha), num(x.dif), x.difPct == null ? '' : num(x.difPct * 100)])];
  }
  const nomeArq = ext => `Conferencia_RF_${estado.rf ? rotRF(estado.rf) : 'todos'}_${estado.ano}.${ext}`;
  function baixar(conteudo, tipo, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo })); a.download = nomeArq(ext);
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#f-csv').addEventListener('click', () => { const cel = v => `"${String(v).replace(/"/g, '""')}"`; baixar(linhasExport().map(l => l.map(cel).join(';')).join('\r\n'), 'text/csv;charset=utf-8', 'csv'); });
  $('#f-xls').addEventListener('click', () => {
    const l = linhasExport();
    baixar(`<html><head><meta charset="utf-8"></head><body><table border="1"><tr><th colspan="11" style="background:#0b3b2e;color:#fff;font-size:13pt">Conferência RF × Minha produção · ${estado.rf ? P.periodo.rotulo(estado.ano, estado.rf) : `${estado.ano} (todos os RFs)`}</th></tr>
      <tr>${l[0].map(h => `<th style="background:#1f6f54;color:#fff">${escapar(h)}</th>`).join('')}</tr>${l.slice(1).map(x => `<tr>${x.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`, 'application/vnd.ms-excel;charset=utf-8', 'xls');
  });

  /* ---------- Orquestração ---------- */
  const SECOES = { filtros: () => { renderPeriodo(); renderMulti(); }, b2: renderBloco2 };
  function renderizar(quais = Object.keys(SECOES)) {
    if (estado.carregando) return;
    for (const q of quais) { try { SECOES[q](); } catch (erro) { console.error(`Produção por RF: erro em "${q}"`, erro); } }
    icones();
  }
  function mostrarErro(html) {
    const el = $('#f-erros');
    el.hidden = !html;
    el.innerHTML = html ? `<i data-lucide="triangle-alert"></i><div><strong>Atenção</strong><p>${html}</p></div>` : '';
  }
  async function carregar(fresco = false) {
    const bt = $('#f-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#f-status').textContent = 'Carregando base do RF e minha produção…';
    raiz.classList.add('carregando');
    const MP = window.SMA_MINHA_PRODUCAO;
    const [base, minha, bd] = await Promise.allSettled([
      carregarBaseRF(fresco).then(prepararBaseRF),
      fresco && MP ? MP.recarregar().then(() => MP.dados()) : MP ? MP.pronto : Promise.resolve([]),
      P.lerLinhas(CFG.planilha, CFG.bd.aba, { fresco }).then(prepararBD)
    ]);
    estado.fimRF = bd.status === 'fulfilled' ? bd.value : new Map();
    if (bd.status !== 'fulfilled') console.warn('Produção por RF: aba BD (datas do RF) indisponível', bd.reason);
    if (base.status === 'fulfilled') { estado.base = base.value.dados; estado.col = base.value.col; estado.erroBase = null; }
    else { estado.base = []; estado.erroBase = base.reason; console.warn('Produção por RF: base do RF', base.reason); }
    estado.minha = minha.status === 'fulfilled' ? (minha.value || []) : [];
    const avisos = [];
    if (estado.erroBase) avisos.push(/coluna/.test(estado.erroBase.message)
      ? `Li a base do RF, mas ${escapar(estado.erroBase.message)}. Me diga os nomes certos das colunas para eu ajustar.`
      : 'Não consegui ler a <b>base do RF</b>. Ela precisa estar compartilhada como <b>"Qualquer pessoa com o link – Leitor"</b>; depois toque em "Atualizar dados".');
    if (!estado.minha.length) avisos.push('Os apontamentos da minha produção ainda não foram carregados.');
    mostrarErro(avisos.join('<br>'));
    $('#f-status').textContent = `${estado.erroBase ? 'Base do RF indisponível' : `${inteiro(estado.base.length)} linhas na base do RF`} · ${inteiro(estado.minha.length)} apontamentos · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    estado.carregando = false;
    raiz.classList.remove('carregando');
    bt.classList.remove('girando'); bt.disabled = false;
    renderizar();
  }
  $('#f-atualizar').addEventListener('click', () => carregar(true));
  renderPeriodo(); icones();
  carregar();

  // Para conferência: permite testar a comparação com dados de exemplo (console)
  window.SMA_PRODUCAO_RF = { estado, comparar, renderizar };
})();
