/* ==========================================================================
   SMA · Silvicultura — Produção · Produção Realizada
   Camadas: 1) leitura da aba de apontamentos  2) normalização e grupos de atividade
            3) filtros (Ano/RF igual ao Faturamento, Fazenda, Equipe)  4) cálculos
            5) KPIs, tabelas, gráfico  6) exportar e PDF  7) abas da página
   ========================================================================== */

(() => {
  const P = window.SMA_PLANILHAS, R = window.SMA_DADOS?.PRODUCAO?.realizada;
  const raiz = document.getElementById('real');
  if (!P || !R || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ha = v => `${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
  const n2 = v => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = v => `${((v || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const inteiro = v => (v || 0).toLocaleString('pt-BR');
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* ======================================================================
     1-2. LEITURA, NORMALIZAÇÃO E GRUPOS
     ====================================================================== */
  // Cabeçalho localizado pela coluna "Área Apontada" (as linhas de controle acima dele são ignoradas)
  const carregarApontamentos = fresco => P.lerPlanilha(R.planilha, R.aba, { fresco, coluna: 'AREA APONTADA' });

  // Normalização ("Replantio(D)" → "REPLANTIO") e grupos: funções compartilhadas em js/planilhas.js
  const normalizarAtividade = P.atividades.normalizar;
  const grupoDe = P.atividades.grupo;
  const limparFazenda = t => String(t || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  const PALAVRAS_MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'na', 'no', 'em', 'com', 'sem', 'a', 'o']);
  // Nome legível: a grafia original mais usada (sem "(D)"), em formato de frase quando vier toda em maiúsculas
  function nomeLegivel(grafias) {
    const melhor = [...grafias.entries()].sort((a, b) => (semAcento(b[0]) !== b[0]) - (semAcento(a[0]) !== a[0]) || b[1] - a[1])[0][0];
    const t = melhor.replace(/\s*\(D\)\s*$/i, '').replace(/\s+/g, ' ').trim();
    if (t !== t.toUpperCase()) return t;
    return t.toLowerCase().split(' ').map((p, i) => (i && PALAVRAS_MINUSCULAS.has(p) ? p : /^[ivx]+$/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
  }

  function preparar(linhas) {
    const grafias = new Map();   // atividade normalizada → Map(grafia original → contagem)
    const dados = [];
    for (const l of linhas) {
      const original = (l.ATIVIDADE || '').trim(), data = (l.DATA || '').trim();
      if (!original || !data) continue;   // ignora linhas sem atividade ou sem data
      const ativ = normalizarAtividade(original);
      if (!ativ) continue;
      const g = grafias.get(ativ) || grafias.set(ativ, new Map()).get(ativ);
      g.set(original, (g.get(original) || 0) + 1);
      dados.push({ ANO: l.ANO, RF: l.RF, data, fazenda: limparFazenda(l.FAZENDA) || '—', up: l.UP, equipe: (l.EQUIPE || '').trim() || '—', ativ, grupo: grupoDe(ativ), area: P.num(l['AREA APONTADA']) });
    }
    const nomes = new Map([...grafias].map(([k, g]) => [k, nomeLegivel(g)]));
    dados.forEach(d => { d.ativNome = nomes.get(d.ativ); });
    return dados;
  }

  /* ======================================================================
     3. ESTADO E FILTROS
     ====================================================================== */
  const estado = {
    ...P.periodo.atual(),             // mesma regra e mesmo padrão do Faturamento: ano e RF atuais
    fazendas: [], equipes: [],        // vazio = todas
    grupo: null, busca: '', abertas: new Set(),
    ord: { k: 'area', dir: -1 },
    dados: [], carregando: true
  };
  const doPeriodo = d => P.periodo.doPeriodo(d, estado.ano, estado.rf);
  const filtradas = () => estado.dados.filter(d => doPeriodo(d) && (!estado.fazendas.length || estado.fazendas.includes(d.fazenda)) && (!estado.equipes.length || estado.equipes.includes(d.equipe)));

  // Período (popover Ano/RF, igual ao Faturamento)
  const pop = $('#r-periodo-pop'), btPeriodo = $('#r-periodo');
  const abrirPeriodo = sim => { pop.hidden = !sim; btPeriodo.setAttribute('aria-expanded', String(sim)); };
  btPeriodo.addEventListener('click', () => abrirPeriodo(pop.hidden));
  document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('#r-periodo-pop, #r-periodo')) abrirPeriodo(false); });
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-ano]'), r = e.target.closest('[data-rf]'), h = e.target.closest('[data-hoje]');
    if (a) estado.ano = +a.dataset.ano;
    else if (r) { estado.rf = +r.dataset.rf; abrirPeriodo(false); }
    else if (h) { Object.assign(estado, P.periodo.atual()); abrirPeriodo(false); }
    else return;
    estado.grupo = null; estado.abertas.clear();
    renderizar();
  });
  function renderPeriodo() {
    $('#r-periodo-rotulo').textContent = P.periodo.rotulo(estado.ano, estado.rf);
    const anos = new Set([P.periodo.atual().ano, estado.ano]);
    estado.dados.forEach(d => { const a = P.num(d.ANO); if (a > 2000) anos.add(a); });
    $('#r-anos').innerHTML = [...anos].sort((a, b) => b - a).map(a => `<button type="button" class="${a === estado.ano ? 'ativo' : ''}" data-ano="${a}">${a}</button>`).join('');
    $('#r-rfs').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(r => {
      const tem = estado.dados.some(d => P.periodo.doPeriodo(d, estado.ano, r));
      return `<button type="button" class="${r === estado.rf ? 'ativo' : ''} ${tem ? 'com-dados' : ''}" data-rf="${r}" title="${tem ? 'Com dados' : 'Sem dados'}">RF${String(r).padStart(2, '0')}</button>`;
    }).join('');
  }

  // Seleção múltipla (Fazenda e Equipe): opções do período escolhido
  const MULTI = { fazenda: 'fazendas', equipe: 'equipes' };
  function renderMulti() {
    const doRF = estado.dados.filter(doPeriodo);
    Object.entries(MULTI).forEach(([campo, chave]) => {
      const caixa = $(`[data-multi="${campo}"]`);
      // as opções de um filtro respeitam o outro filtro
      const base = doRF.filter(d => campo === 'fazenda' ? (!estado.equipes.length || estado.equipes.includes(d.equipe)) : (!estado.fazendas.length || estado.fazendas.includes(d.fazenda)));
      const cont = new Map(); base.forEach(d => cont.set(d[campo], (cont.get(d[campo]) || 0) + d.area));
      estado[chave] = estado[chave].filter(v => cont.has(v) || estado[chave].length === 0);
      const termo = semAcento($('input[type=search]', caixa)?.value || '').toLowerCase();
      const opcoes = [...cont.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).filter(v => !termo || semAcento(v).toLowerCase().includes(termo));
      $('.p-multi-lista', caixa).innerHTML = opcoes.map(v => `<label class="p-multi-op"><input type="checkbox" value="${escapar(v)}" ${estado[chave].includes(v) ? 'checked' : ''}><span>${escapar(v)}</span><small>${ha(cont.get(v))}</small></label>`).join('') || '<small>Nada no período.</small>';
      const n = estado[chave].length;
      $('.p-multi-btn b', caixa).textContent = !n ? 'Todas' : n === 1 ? estado[chave][0] : `${n} selecionadas`;
      $('.p-multi-btn', caixa).classList.toggle('preenchido', n > 0);
    });
    $('#r-limpar').disabled = !estado.fazendas.length && !estado.equipes.length && !estado.grupo && !estado.busca;
  }
  $$('[data-multi]').forEach(caixa => {
    const chave = MULTI[caixa.dataset.multi], popM = $('.p-multi-pop', caixa), bt = $('.p-multi-btn', caixa);
    const abrir = sim => { popM.hidden = !sim; bt.setAttribute('aria-expanded', String(sim)); if (sim) $('input[type=search]', caixa)?.focus(); };
    bt.addEventListener('click', () => abrir(popM.hidden));
    document.addEventListener('click', e => { if (!popM.hidden && !caixa.contains(e.target)) abrir(false); });
    popM.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      const v = e.target.value;
      estado[chave] = e.target.checked ? [...estado[chave], v] : estado[chave].filter(x => x !== v);
      estado.abertas.clear(); renderizar();
    });
    popM.addEventListener('input', e => { if (e.target.type === 'search') renderMulti(); });
    popM.addEventListener('click', e => {
      if (e.target.closest('[data-todas]') || e.target.closest('[data-limpar]')) { estado[chave] = []; estado.abertas.clear(); renderizar(); }
    });
  });
  $('#r-limpar').addEventListener('click', () => {
    estado.fazendas = []; estado.equipes = []; estado.grupo = null; estado.busca = ''; $('#r-busca').value = ''; estado.abertas.clear();
    $$('[data-multi] input[type=search]').forEach(i => { i.value = ''; });
    renderizar();
  });

  /* ======================================================================
     4. CÁLCULOS
     ====================================================================== */
  // Área, dias trabalhados (datas distintas) e rendimento de um conjunto de linhas
  function medir(linhas) {
    const area = linhas.reduce((s, d) => s + d.area, 0);
    const dias = new Set(linhas.map(d => d.data)).size;
    return { area, dias, rend: dias ? area / dias : 0 };
  }
  const agrupar = (linhas, chave) => {
    const m = new Map();
    linhas.forEach(d => { const k = chave(d); (m.get(k) || m.set(k, []).get(k)).push(d); });
    return m;
  };
  // O grupo de apoio (horas máquina) aparece, mas sua área não entra no total
  const somaArea = linhas => linhas.filter(d => !d.grupo.apoio).reduce((s, d) => s + d.area, 0);

  function calcular() {
    const linhas = filtradas();
    const total = somaArea(linhas);
    const geral = { ...medir(linhas.filter(d => !d.grupo.apoio)), dias: new Set(linhas.map(d => d.data)).size };
    geral.rend = geral.dias ? total / geral.dias : 0;
    const grupos = [...agrupar(linhas, d => d.grupo.nome)].map(([nome, l]) => {
      const g = l[0].grupo, m = medir(l);
      return { nome, g, ...m, pct: g.apoio || !total ? null : m.area / total, linhas: l };
    }).sort((a, b) => (a.g.apoio - b.g.apoio) || b.area - a.area);
    const atividades = [...agrupar(linhas, d => d.ativ)].map(([ativ, l]) => {
      const m = medir(l);
      return { ativ, nome: l[0].ativNome, grupo: l[0].grupo, ...m, pct: l[0].grupo.apoio || !total ? null : m.area / total, linhas: l };
    });
    return { linhas, total, geral, grupos, atividades, nAtivs: atividades.length, nFaz: new Set(linhas.map(d => d.fazenda)).size };
  }

  /* ======================================================================
     5. TELA
     ====================================================================== */
  function contar(el, v, fmt) {
    if (!el) return;
    const de = Number(el.dataset.valor || 0); el.dataset.valor = v;
    if (reduzMovimento || de === v) { el.textContent = fmt(v); return; }
    const t0 = performance.now(); cancelAnimationFrame(el._raf);
    const passo = t => { const p = Math.min((t - t0) / 900, 1); el.textContent = fmt(de + (v - de) * (1 - Math.pow(1 - p, 3))); if (p < 1) el._raf = requestAnimationFrame(passo); };
    el._raf = requestAnimationFrame(passo);
    clearTimeout(el._fim); el._fim = setTimeout(() => { cancelAnimationFrame(el._raf); el.textContent = fmt(v); }, 1000);
  }

  function renderKPIs(c) {
    contar($('[data-r="area"]'), c.total, ha);
    contar($('[data-r="ativs"]'), c.nAtivs, v => inteiro(Math.round(v)));
    contar($('[data-r="faz"]'), c.nFaz, v => inteiro(Math.round(v)));
    $('#r-periodo-txt').textContent = `${P.periodo.rotulo(estado.ano, estado.rf)} · ${inteiro(c.linhas.length)} apontamentos`;
  }

  const thOrd = (k, t) => `<th scope="col"><button type="button" data-ord="${k}" class="${estado.ord.k === k ? 'ativo' : ''}">${t}<i data-lucide="${estado.ord.k === k ? (estado.ord.dir > 0 ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}"></i></button></th>`;
  const celPct = v => (v == null ? '<span class="r-sem">não soma</span>' : `<span class="r-pct"><i style="width:${Math.min(100, v * 100)}%"></i><b>${pct(v)}</b></span>`);
  const celRend = (area, rend) => (area > 0 ? `${n2(rend)} <small>ha/dia</small>` : '—');

  function renderGrupos(c) {
    $('#r-tab-grupos').innerHTML = `<table class="q-tab r-tab r-tab-grupos">
      <thead><tr><th>Grupo</th><th>Área realizada</th><th>% do total</th><th>Dias trab.</th><th>Rendimento/dia</th></tr></thead>
      <tbody>${c.grupos.map(g => `<tr data-grupo="${escapar(g.nome)}" class="${estado.grupo === g.nome ? 'foco' : ''} ${g.g.apoio ? 'r-apoio' : ''}" tabindex="0" style="--c:${g.g.cor}" title="Ver só as atividades de ${escapar(g.nome)}">
        <td data-rotulo="Grupo"><span class="r-grupo"><i></i>${escapar(g.nome)}</span></td>
        <td data-rotulo="Área realizada"><b>${ha(g.area)}</b></td>
        <td data-rotulo="% do total">${celPct(g.pct)}</td>
        <td data-rotulo="Dias trabalhados">${inteiro(g.dias)}</td>
        <td data-rotulo="Rendimento/dia">${celRend(g.area, g.rend)}</td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhum apontamento no filtro.</td></tr>'}
      ${c.grupos.length ? `<tr class="p-total"><td data-rotulo="Total"><b>Total</b></td><td data-rotulo="Área realizada"><b>${ha(c.total)}</b></td><td data-rotulo="% do total"><b>100,0%</b></td><td data-rotulo="Dias trabalhados"><b>${inteiro(c.geral.dias)}</b></td><td data-rotulo="Rendimento/dia"><b>${celRend(c.total, c.geral.rend)}</b></td></tr>` : ''}
      </tbody></table>`;
  }
  $('#r-tab-grupos').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-grupo]'); if (!tr) return;
    estado.grupo = estado.grupo === tr.dataset.grupo ? null : tr.dataset.grupo;
    estado.abertas.clear(); renderizar(['grupos', 'ativ', 'filtros']);
    if (estado.grupo) $('#r-ativ-tit').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
  });
  $('#r-tab-grupos').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-grupo]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); } });

  function atividadesVisiveis(c) {
    const termo = semAcento(estado.busca).toUpperCase().trim();
    const { k, dir } = estado.ord;
    const valor = a => (k === 'nome' ? a.nome : k === 'grupo' ? a.grupo.nome : k === 'pct' ? (a.pct ?? -1) : a[k]);
    return c.atividades
      .filter(a => (!estado.grupo || a.grupo.nome === estado.grupo) && (!termo || a.ativ.includes(termo) || semAcento(a.grupo.nome).toUpperCase().includes(termo)))
      .sort((a, b) => { const x = valor(a), y = valor(b); return (typeof x === 'string' ? x.localeCompare(y, 'pt-BR') : x - y) * dir; });
  }
  function detalheFazendas(a) {
    const faz = [...agrupar(a.linhas, d => d.fazenda)].map(([nome, l]) => ({ nome, ...medir(l) })).sort((x, y) => y.area - x.area);
    return `<tr class="r-detalhe"><td colspan="6"><div class="r-det-caixa">
      <table class="q-tab r-tab r-tab-det"><thead><tr><th>Fazenda</th><th>Área realizada</th><th>% da atividade</th><th>Dias trab.</th><th>Rendimento/dia</th></tr></thead>
      <tbody>${faz.map(f => `<tr><td data-rotulo="Fazenda">${escapar(f.nome)}</td><td data-rotulo="Área realizada">${ha(f.area)}</td><td data-rotulo="% da atividade">${a.area > 0 ? celPct(f.area / a.area) : '—'}</td><td data-rotulo="Dias trabalhados">${inteiro(f.dias)}</td><td data-rotulo="Rendimento/dia">${celRend(f.area, f.rend)}</td></tr>`).join('')}
      <tr class="p-subtotal" style="--c:${a.grupo.cor}"><td data-rotulo="Subtotal">Subtotal · ${faz.length} fazenda(s)</td><td data-rotulo="Área">${ha(a.area)}</td><td data-rotulo="%">${a.area > 0 ? '100,0%' : '—'}</td><td data-rotulo="Dias">${inteiro(a.dias)}</td><td data-rotulo="Rendimento">${celRend(a.area, a.rend)}</td></tr></tbody></table>
    </div></td></tr>`;
  }
  function renderAtividades(c) {
    const lista = atividadesVisiveis(c);
    const tot = medir(lista.flatMap(a => a.linhas));
    const totArea = lista.filter(a => !a.grupo.apoio).reduce((s, a) => s + a.area, 0);
    const chip = $('#r-chip-grupo');
    chip.hidden = !estado.grupo;
    if (estado.grupo) chip.innerHTML = `Grupo: ${escapar(estado.grupo)} <button type="button" aria-label="Mostrar todos os grupos"><i data-lucide="x"></i></button>`;
    $('#r-tab-ativ').innerHTML = `<table class="q-tab r-tab r-tab-ativ">
      <thead><tr>${thOrd('nome', 'Atividade (agrupada)')}${thOrd('grupo', 'Grupo')}${thOrd('area', 'Área realizada')}${thOrd('pct', '% do total')}${thOrd('dias', 'Dias trab.')}${thOrd('rend', 'Rendimento/dia')}</tr></thead>
      <tbody>${lista.map(a => {
        const aberta = estado.abertas.has(a.ativ);
        return `<tr data-ativ="${escapar(a.ativ)}" class="r-linha ${aberta ? 'aberta' : ''} ${a.grupo.apoio ? 'r-apoio' : ''}" tabindex="0" aria-expanded="${aberta}" style="--c:${a.grupo.cor}">
          <td data-rotulo="Atividade"><span class="r-ativ"><i data-lucide="chevron-right" class="r-seta"></i><span><b>${escapar(a.nome)}</b><small>${escapar(a.ativ)}</small></span></span></td>
          <td data-rotulo="Grupo"><span class="r-grupo"><i></i>${escapar(a.grupo.nome)}</span></td>
          <td data-rotulo="Área realizada"><b>${ha(a.area)}</b></td>
          <td data-rotulo="% do total">${celPct(a.pct)}</td>
          <td data-rotulo="Dias trabalhados">${inteiro(a.dias)}</td>
          <td data-rotulo="Rendimento/dia">${celRend(a.area, a.rend)}</td></tr>${aberta ? detalheFazendas(a) : ''}`;
      }).join('') || '<tr><td colspan="6" class="vazio">Nenhuma atividade encontrada.</td></tr>'}
      ${lista.length ? `<tr class="p-total"><td data-rotulo="Total" colspan="2"><b>Total · ${lista.length} atividade(s)</b></td><td data-rotulo="Área realizada"><b>${ha(totArea)}</b></td><td data-rotulo="% do total"><b>${c.total ? pct(totArea / c.total) : '—'}</b></td><td data-rotulo="Dias trabalhados"><b>${inteiro(tot.dias)}</b></td><td data-rotulo="Rendimento/dia"><b>${celRend(totArea, tot.dias ? totArea / tot.dias : 0)}</b></td></tr>` : ''}
      </tbody></table>`;
  }
  $('#r-tab-ativ').addEventListener('click', e => {
    const o = e.target.closest('[data-ord]');
    if (o) { const k = o.dataset.ord; estado.ord = { k, dir: estado.ord.k === k ? -estado.ord.dir : (k === 'nome' || k === 'grupo' ? 1 : -1) }; renderizar(['ativ']); return; }
    const tr = e.target.closest('tr[data-ativ]'); if (!tr) return;
    const k = tr.dataset.ativ;
    estado.abertas.has(k) ? estado.abertas.delete(k) : estado.abertas.add(k);
    renderizar(['ativ']);
  });
  $('#r-tab-ativ').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-ativ]'); if (tr && e.target === tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tr.click(); } });
  $('#r-chip-grupo').addEventListener('click', e => { if (e.target.closest('button')) { estado.grupo = null; renderizar(['grupos', 'ativ', 'filtros']); } });
  let esperaBusca;
  $('#r-busca').addEventListener('input', e => { clearTimeout(esperaBusca); esperaBusca = setTimeout(() => { estado.busca = e.target.value; renderizar(['ativ', 'filtros']); }, 180); });

  function renderAnalise(c) {
    const el = $('#r-analise');
    const gs = c.grupos.filter(g => !g.g.apoio && g.area > 0);
    const ats = c.atividades.filter(a => !a.grupo.apoio && a.area > 0).sort((a, b) => b.area - a.area);
    const rendTop = [...ats].filter(a => a.dias >= 3).sort((a, b) => b.rend - a.rend)[0];
    const itens = gs.length ? [
      `${gs[0].nome} lidera com <strong>${ha(gs[0].area)}</strong> (${pct(gs[0].pct)} da área realizada em ${P.periodo.rotulo(estado.ano, estado.rf)}).`,
      ats[0] ? `Atividade com mais área: <strong>${escapar(ats[0].nome)}</strong>, ${ha(ats[0].area)} em ${ats[0].dias} dia(s) (${n2(ats[0].rend)} ha/dia).` : null,
      rendTop ? `Maior rendimento diário (com 3 dias ou mais): <strong>${escapar(rendTop.nome)}</strong>, ${n2(rendTop.rend)} ha/dia.` : null
    ].filter(Boolean) : [];
    el.hidden = !itens.length;
    el.innerHTML = `<span class="analise-icone"><i data-lucide="lightbulb"></i></span><div><strong class="analise-titulo">Leitura para decisão</strong><ul>${itens.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }

  let ultimo = null;
  const SECOES = {
    filtros: () => { renderPeriodo(); renderMulti(); }, kpis: c => renderKPIs(c), grupos: c => renderGrupos(c),
    ativ: c => renderAtividades(c), analise: c => renderAnalise(c)
  };
  function renderizar(quais = Object.keys(SECOES)) {
    if (estado.carregando) return;
    const c = quais.length > 3 || !ultimo ? (ultimo = calcular()) : ultimo;
    for (const q of quais) { try { SECOES[q](c); } catch (erro) { console.error(`Produção Realizada: erro em "${q}"`, erro); } }
    icones();
  }
  // Filtros que mudam a base pedem recálculo completo
  const renderizarTudo = renderizar;

  /* ======================================================================
     6. EXPORTAR E PDF
     ====================================================================== */
  const periodoTxt = () => P.periodo.rotulo(estado.ano, estado.rf);
  const filtrosTxt = () => `Período: ${periodoTxt()} · Fazendas: ${estado.fazendas.join(', ') || 'todas'} · Equipes: ${estado.equipes.join(', ') || 'todas'}${estado.grupo ? ` · Grupo: ${estado.grupo}` : ''}`;
  function tabelasExport() {
    const c = ultimo || calcular();
    const num = v => String(Math.round((v || 0) * 100) / 100).replace('.', ',');
    const grupos = [['Grupo', 'Área realizada (ha)', '% do total', 'Dias trabalhados', 'Rendimento/dia (ha/dia)'],
      ...c.grupos.map(g => [g.nome, num(g.area), g.pct == null ? 'não soma' : num(g.pct * 100), g.dias, num(g.rend)]),
      ['TOTAL', num(c.total), '100', c.geral.dias, num(c.geral.rend)]];
    const ativs = [['Atividade (agrupada)', 'Grupo', 'Área realizada (ha)', '% do total', 'Dias trabalhados', 'Rendimento/dia (ha/dia)'],
      ...atividadesVisiveis(c).map(a => [a.nome, a.grupo.nome, num(a.area), a.pct == null ? 'não soma' : num(a.pct * 100), a.dias, num(a.rend)])];
    const det = [['Atividade (agrupada)', 'Fazenda', 'Área realizada (ha)', '% da atividade', 'Dias trabalhados', 'Rendimento/dia (ha/dia)'],
      ...atividadesVisiveis(c).flatMap(a => [...agrupar(a.linhas, d => d.fazenda)].map(([f, l]) => { const m = medir(l); return [a.nome, f, num(m.area), a.area > 0 ? num(m.area / a.area * 100) : '', m.dias, num(m.rend)]; }))];
    return { grupos, ativs, det };
  }
  function baixar(conteudo, tipo, ext) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo }));
    a.download = `Producao_Realizada_RF${String(estado.rf).padStart(2, '0')}_${estado.ano}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#r-csv').addEventListener('click', () => {
    const { grupos, ativs, det } = tabelasExport();
    const cel = v => `"${String(v).replace(/"/g, '""')}"`, bloco = (t, l) => [cel(t), ...l.map(x => x.map(cel).join(';'))].join('\r\n');
    baixar([cel(`Produção Realizada · ${filtrosTxt()}`), '', bloco('PRODUÇÃO POR GRUPO', grupos), '', bloco('PRODUÇÃO POR ATIVIDADE', ativs), '', bloco('DETALHAMENTO POR FAZENDA', det)].join('\r\n'), 'text/csv;charset=utf-8', 'csv');
  });
  $('#r-xls').addEventListener('click', () => {
    const { grupos, ativs, det } = tabelasExport();
    const tab = (t, l) => `<tr><th colspan="${l[0].length}" style="background:#0b3b2e;color:#fff;font-size:12pt;text-align:left">${t}</th></tr>
      <tr>${l[0].map(h => `<th style="background:#1f6f54;color:#fff">${escapar(h)}</th>`).join('')}</tr>${l.slice(1).map(x => `<tr>${x.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}<tr></tr>`;
    baixar(`<html><head><meta charset="utf-8"></head><body><table border="1"><tr><th colspan="6" style="font-size:14pt">Produção Realizada · ${escapar(filtrosTxt())}</th></tr>${tab('Produção por grupo', grupos)}${tab('Produção por atividade', ativs)}${tab('Detalhamento por fazenda', det)}</table></body></html>`, 'application/vnd.ms-excel;charset=utf-8', 'xls');
  });
  $('#r-pdf').addEventListener('click', async () => {
    if (!window.SMA_PDF) return;
    const bt = $('#r-pdf'), rot = $('span', bt), orig = rot.textContent;
    bt.disabled = true; rot.textContent = 'Preparando…';
    try {
      const cab = `<header class="p-print-cab"><div class="p-pc-titulo"><img src="assets/img/folhito/folhito-rosto.png" alt="" onerror="this.remove()"><div><h1>Produção Realizada</h1><p>SMA Silvicultura · Unidade São Miguel · emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></div></div>
        <div class="p-pc-sup"><div><small>Período de apontamento</small><b>${periodoTxt()}</b></div></div><p class="p-pc-filtros">${escapar(filtrosTxt())}</p></header>`;
      const mini = `<div class="p-pdf-mini"><b>Produção Realizada</b><span>${escapar(filtrosTxt())}</span></div>`;
      const c = ultimo || calcular();
      const kpi = (ic, rot, v) => `<article class="kpi"><span class="icon-box"><i data-lucide="${ic}"></i></span><span class="kpi-rot">${rot}</span><strong class="kpi-val">${v}</strong></article>`;
      const kpis = `<div class="p-cards r-pdf-kpis">${kpi('land-plot', 'Área total realizada', ha(c.total))}${kpi('list-checks', 'Atividades', inteiro(c.nAtivs))}${kpi('map-pinned', 'Fazendas atendidas', inteiro(c.nFaz))}</div>`;
      const linhasAtiv = $$('#r-tab-ativ tbody tr').map(tr => tr.outerHTML), cabAtiv = $('#r-tab-ativ thead').outerHTML;
      const pags = [`${cab}${kpis}<h2 class="p-pdf-tit">Produção por grupo</h2>${$('#r-tab-grupos').innerHTML}`];
      const POR = 16;
      for (let i = 0; i < linhasAtiv.length; i += POR) pags.push(`${mini}<h2 class="p-pdf-tit">Produção por atividade${linhasAtiv.length > POR ? ` <small>(${i / POR + 1}/${Math.ceil(linhasAtiv.length / POR)})</small>` : ''}</h2><table class="q-tab r-tab r-tab-ativ">${cabAtiv}<tbody>${linhasAtiv.slice(i, i + POR).join('')}</tbody></table>`);
      await window.SMA_PDF.gerar(pags, `Producao_Realizada_RF${String(estado.rf).padStart(2, '0')}_${estado.ano}.pdf`, { progresso: (i, n) => { rot.textContent = `Gerando ${i}/${n}…`; } });
      rot.textContent = 'PDF baixado ✓';
    } catch (erro) {
      console.error('Produção Realizada: falha no PDF', erro);
      mostrarErro(`Não consegui gerar o PDF (${escapar(erro.message)}).`);
      rot.textContent = orig;
    } finally { bt.disabled = false; setTimeout(() => { rot.textContent = orig; }, 2500); }
  });
  function mostrarErro(html) {
    const el = $('#r-erros');
    el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>Atenção</strong><p>${html}</p></div>`;
    el.hidden = !html; icones();
  }

  /* ---------- Carga ---------- */
  async function carregar(fresco = false) {
    const bt = $('#r-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#r-status').textContent = 'Carregando apontamentos…';
    raiz.classList.add('carregando');
    try {
      estado.dados = preparar(await carregarApontamentos(fresco));
      $('#r-erros').hidden = true;
      $('#r-status').textContent = `${inteiro(estado.dados.length)} apontamentos · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (erro) {
      console.warn('Produção Realizada: falha ao ler a planilha', erro);
      mostrarErro('Não consegui ler a planilha de apontamentos. Verifique a internet e se ela está compartilhada como <b>"Qualquer pessoa com o link – Leitor"</b>, depois toque em "Atualizar dados".');
      $('#r-status').textContent = 'Sem acesso à planilha';
    }
    estado.carregando = false; ultimo = null;
    raiz.classList.remove('carregando');
    bt.classList.remove('girando'); bt.disabled = false;
    renderizarTudo();
  }
  $('#r-atualizar').addEventListener('click', () => carregar(true));

  /* ======================================================================
     7. ABAS DA PÁGINA DE PRODUÇÃO
     ====================================================================== */
  const ABAS = ['real', 'rf', 'plantio', 'prog'];
  const SUB = {
    real: 'Área realizada por grupo e por atividade, com dias trabalhados e rendimento, direto dos apontamentos.',
    rf: 'Conferência do RF (abre no RF atual): a base do RF × a minha produção (apontamentos), UP por UP, com a data fim de cada atividade.',
    plantio: 'Acompanhamento do plantio UP por UP, o plantio acumulado do ano contra a meta e o detalhe de cada RF.',
    prog: 'Programe a execução das atividades por fazenda e UP: o sistema distribui as áreas pelas equipes e monta o calendário.'
  };
  const HASH = { real: '', rf: '#rf', plantio: '#plantio', prog: '#programacao' };
  const STATUS = { real: '#r-status', rf: '#f-status', plantio: '#pl-status', prog: '#p-status' };
  const sub = $('.fat-hero .fat-sub');
  function abrirAba(aba, trocarHash = true) {
    ABAS.forEach(a => { $(`#aba-${a}`).hidden = a !== aba; $(STATUS[a]).hidden = a !== aba; });
    $$('.p-abas [data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    $('.p-abas').style.setProperty('--i', ABAS.indexOf(aba));
    $('#p-destaque').hidden = aba !== 'prog';
    if (sub) sub.textContent = SUB[aba];
    try { localStorage.setItem('producao:aba', aba); } catch { /* opcional */ }
    if (trocarHash) history.replaceState(null, '', HASH[aba] || location.pathname + location.search);
    document.dispatchEvent(new CustomEvent('producao:aba', { detail: aba }));
  }
  $('.p-abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) abrirAba(b.dataset.aba); });
  $('.p-abas').addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const atual = $$('.p-abas [data-aba]').findIndex(b => b.getAttribute('aria-selected') === 'true');
    const prox = (atual + (e.key === 'ArrowRight' ? 1 : -1) + ABAS.length) % ABAS.length;
    $$('.p-abas [data-aba]')[prox].focus(); abrirAba(ABAS[prox]);
  });
  let abaInicial = 'real';
  try { abaInicial = localStorage.getItem('producao:aba') || 'real'; } catch { /* padrão */ }
  if (location.hash === '#programacao') abaInicial = 'prog';
  if (location.hash === '#rf') abaInicial = 'rf';
  if (location.hash === '#plantio') abaInicial = 'plantio';
  abrirAba(ABAS.includes(abaInicial) ? abaInicial : 'real', false);

  // A mesma leitura dos apontamentos (Minha Produção) é compartilhada com o painel Produção por RF
  let avisar;
  const pronto = new Promise(r => { avisar = r; });
  window.SMA_MINHA_PRODUCAO = { pronto, dados: () => estado.dados, recarregar: () => carregar(true) };

  renderPeriodo(); icones();
  carregar().then(() => avisar(estado.dados));
})();
