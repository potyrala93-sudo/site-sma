/* ==========================================================================
   SMA · Silvicultura — Produção · Plantio
   Parte A: acompanhamento por UP (cabeçalho localizado pela coluna TALHÃO; diferença e % recalculados)
   Parte B: plantio acumulado por RF × meta (gráfico combinado + cards)
   Parte C: detalhe do RF ao clicar no card (UPs plantadas, subtotais por tipo e por fazenda)
   Mesma regra de Ano/RF do Faturamento (SMA_PLANILHAS.periodo).
   ========================================================================== */

(() => {
  const P = window.SMA_PLANILHAS, CFG = window.SMA_DADOS?.PRODUCAO?.plantio;
  const raiz = document.getElementById('plantio');
  if (!P || !CFG || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ha = v => `${(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
  const n2 = v => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = v => `${((v || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const inteiro = v => (v || 0).toLocaleString('pt-BR');
  const dataTxt = d => (d ? d.toLocaleDateString('pt-BR') : '—');
  const rotRF = rf => `RF${String(rf).padStart(2, '0')}`;
  const limpo = v => { const t = String(v ?? '').trim(); return !t || /^#(N\/A|REF|VALUE|DIV)/i.test(t) || t === '-' ? '' : t; };
  const limparNome = t => String(t || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  const corFaixa = p => (p >= CFG.faixas.verdeDesde ? '#22e07a' : p >= CFG.faixas.amareloDesde ? '#fbbf24' : '#ff4d5e');

  const STATUS = {
    Finalizado: { cor: '#22e07a', icone: 'circle-check' },
    'Em andamento': { cor: '#fbbf24', icone: 'loader' },
    Pendente: { cor: '#ff4d5e', icone: 'clock-alert' }
  };
  function padronizarStatus(t) {
    const s = semAcento(limpo(t)).toUpperCase();
    if (/^FINALIZAD/.test(s)) return 'Finalizado';
    if (/ANDAMENTO/.test(s)) return 'Em andamento';
    if (/PENDENTE/.test(s)) return 'Pendente';
    return s ? s.charAt(0) + s.slice(1).toLowerCase() : 'Sem status';
  }

  /* ======================================================================
     LEITURA
     ====================================================================== */
  // cabecalho: linha onde termina o cabeçalho (usada só no caminho alternativo do Google, que perde os nomes das colunas numéricas)
  const ler = (fonte, coluna, fresco, cabecalho = true) => P.lerPlanilha(fonte.planilha, fonte.aba, { fresco, coluna, cabecalho });
  function prepararUps(linhas) {
    return linhas.filter(l => limpo(l.TALHAO)).map(l => {
      const total = P.num(limpo(l['HA TOTAL'])), real = P.num(limpo(l['HA REALIZADA']));
      const rf = P.num(limpo(l.RF)), ano = P.num(limpo(l.ANO));
      const enc = limparNome(limpo(l.ENCARREGADO));
      return {
        up: limpo(l.TALHAO).toUpperCase(), fazenda: limparNome(limpo(l.FAZENDAS)) || '—', ANO: ano || null, RF: rf || null,
        encarregado: enc || 'Não informado',
        encarregados: enc ? enc.split(/\s*\/\s*/).map(x => x.trim().toUpperCase()).filter(Boolean) : ['NÃO INFORMADO'],
        inicio: P.dataBR(limpo(l['DATA INICIO'])), fim: P.dataBR(limpo(l['DATA FIM'])),
        total, real, dif: real - total, pct: total ? real / total : 0,   // recalculados (não usa as colunas da planilha)
        material: (() => { const m = limpo(l['TIPO INSUMO']); return !m || m === '?' ? 'Não informado' : m.toUpperCase(); })(),
        status: padronizarStatus(l.STATUS), obs: limpo(l.OBSERVACAO)
      };
    });
  }
  const prepararResumo = linhas => linhas.filter(l => P.num(l.ANO) && P.num(l.RF)).map(l => {
    const total = P.num(l.TOTAL), meta = P.num(l['META DE PLANTIO']);
    return { ANO: P.num(l.ANO), RF: P.num(l.RF), mes: limparNome(l.MES), manual: P.num(l['PLANTIO MANUAL']), pilha: P.num(l['PLANTIO MANUAL - PILHA']), total, meta, pct: meta ? total / meta : 0 };
  }).sort((a, b) => a.ANO - b.ANO || a.RF - b.RF);
  const prepararDetalhe = linhas => linhas.filter(l => limpo(l.UP)).map(l => ({
    ANO: P.num(l.ANO), RF: P.num(l.RF), mes: limparNome(l.MES), fazenda: limparNome(l.FAZENDA) || '—', up: limpo(l.UP).toUpperCase(), area: P.num(l['AREA PLANTADA']), tipo: limparNome(l.TIPO) || '—'
  }));

  /* ======================================================================
     ESTADO E FILTROS (Parte A)
     ====================================================================== */
  const atual = P.periodo.atual();
  const estado = {
    ano: atual.ano, rf: atual.rf,            // padrão: ano e RF atuais (rf null = todos os RFs)
    fazendas: [], encarregados: [], materiais: [], status: [],
    busca: '', ord: { k: 'fazenda', dir: 1 }, mostrar: 60,
    anoB: atual.ano,
    ups: [], resumo: [], detalhe: [], carregando: true
  };
  // RF inicial: o RF atual; se ele ainda não tem plantio lançado, o último RF com plantio (com aviso)
  function escolherPeriodoInicial() {
    const temNoAtual = estado.ups.some(u => u.RF && P.periodo.doPeriodo(u, atual.ano, atual.rf));
    const ult = estado.ups.filter(u => u.ANO && u.RF).sort((a, b) => (b.ANO * 100 + b.RF) - (a.ANO * 100 + a.RF))[0];
    estado.padrao = temNoAtual || !ult ? { ano: atual.ano, rf: atual.rf } : { ano: ult.ANO, rf: ult.RF };
    estado.ano = estado.padrao.ano; estado.rf = estado.padrao.rf;
    estado.avisoPadrao = !temNoAtual && ult ? `O ${rotRF(atual.rf)}/${atual.ano} ainda não tem plantio lançado; abrindo no ${rotRF(ult.RF)}/${ult.ANO}, o último com dados.` : '';
  }
  // Período: mesma regra do Faturamento. UPs pendentes sem RF aparecem em "Todos os RFs" e no RF de abertura.
  function noPeriodo(u) {
    const pad = estado.padrao || { ano: atual.ano, rf: atual.rf };
    if (u.status === 'Pendente' && !u.RF) return !estado.rf || (estado.ano === pad.ano && estado.rf === pad.rf);
    if (!estado.rf) return u.ANO === estado.ano;
    return P.periodo.doPeriodo(u, estado.ano, estado.rf);
  }
  const passaFiltros = (u, ignorar = null) =>
    (ignorar === 'fazenda' || !estado.fazendas.length || estado.fazendas.includes(u.fazenda)) &&
    (ignorar === 'status' || !estado.status.length || estado.status.includes(u.status));
  const filtradas = () => estado.ups.filter(u => noPeriodo(u) && passaFiltros(u));

  // Período (popover)
  const pop = $('#pl-periodo-pop'), btP = $('#pl-periodo');
  const abrirP = sim => { pop.hidden = !sim; btP.setAttribute('aria-expanded', String(sim)); };
  btP.addEventListener('click', () => abrirP(pop.hidden));
  document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('#pl-periodo-pop, #pl-periodo')) abrirP(false); });
  pop.addEventListener('click', e => {
    const a = e.target.closest('[data-ano]'), r = e.target.closest('[data-rf]');
    if (a) estado.ano = +a.dataset.ano;
    else if (r) { estado.rf = +r.dataset.rf; abrirP(false); }
    else if (e.target.closest('[data-todos]')) { estado.rf = null; abrirP(false); }
    else if (e.target.closest('[data-hoje]')) { estado.ano = (estado.padrao || atual).ano; estado.rf = (estado.padrao || atual).rf; abrirP(false); }
    else return;
    estado.mostrar = 60; renderizar(['filtros', 'a']);
  });
  function renderPeriodo() {
    $('#pl-periodo-rotulo').textContent = estado.rf ? P.periodo.rotulo(estado.ano, estado.rf) : `${estado.ano} · Todos os RFs`;
    const anos = new Set([atual.ano, estado.ano, ...estado.ups.map(u => u.ANO).filter(Boolean)]);
    $('#pl-anos').innerHTML = [...anos].sort((a, b) => b - a).map(a => `<button type="button" class="${a === estado.ano ? 'ativo' : ''}" data-ano="${a}">${a}</button>`).join('');
    $('#pl-rfs').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(r => {
      const tem = estado.ups.some(u => P.periodo.doPeriodo(u, estado.ano, r));
      return `<button type="button" class="${r === estado.rf ? 'ativo' : ''} ${tem ? 'com-dados' : ''}" data-rf="${r}">${rotRF(r)}</button>`;
    }).join('');
    $('[data-todos]', pop).classList.toggle('ativo', !estado.rf);
  }

  // Seleção múltipla: Fazenda
  const MULTI = { fazenda: 'fazendas' };
  const valoresDe = { fazenda: u => [u.fazenda] };
  function renderMulti() {
    Object.entries(MULTI).forEach(([campo, chave]) => {
      const caixa = $(`[data-plmulti="${campo}"]`), termo = semAcento($('input[type=search]', caixa)?.value || '').toUpperCase();
      const base = estado.ups.filter(u => noPeriodo(u) && passaFiltros(u, campo));
      const cont = new Map(); base.forEach(u => valoresDe[campo](u).forEach(v => cont.set(v, (cont.get(v) || 0) + 1)));
      $('.p-multi-lista', caixa).innerHTML = [...cont.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR')).filter(v => !termo || semAcento(v).toUpperCase().includes(termo))
        .map(v => `<label class="p-multi-op"><input type="checkbox" value="${escapar(v)}" ${estado[chave].includes(v) ? 'checked' : ''}><span>${escapar(v)}</span><small>${cont.get(v)} UP(s)</small></label>`).join('') || '<small>Nada no período.</small>';
      const n = estado[chave].length;
      $('.p-multi-btn b', caixa).textContent = !n ? (campo === 'fazenda' ? 'Todas' : 'Todos') : n === 1 ? estado[chave][0] : `${n} selecionados`;
      $('.p-multi-btn', caixa).classList.toggle('preenchido', n > 0);
    });
    // Status: chips
    const base = estado.ups.filter(u => noPeriodo(u) && passaFiltros(u, 'status'));
    $('#pl-f-status').innerHTML = Object.keys(STATUS).map(s => { const n = base.filter(u => u.status === s).length; return `<button type="button" class="chip-filtro mini pl-chip-st ${estado.status.includes(s) ? 'ativo' : ''}" data-st="${s}" style="--c:${STATUS[s].cor}" aria-pressed="${estado.status.includes(s)}"><i></i>${s}<small>${n}</small></button>`; }).join('');
    $('#pl-limpar').disabled = !estado.fazendas.length && !estado.status.length && !estado.busca;
  }
  $$('[data-plmulti]').forEach(caixa => {
    const chave = MULTI[caixa.dataset.plmulti], popM = $('.p-multi-pop', caixa), bt = $('.p-multi-btn', caixa);
    const abrir = sim => { popM.hidden = !sim; bt.setAttribute('aria-expanded', String(sim)); };
    bt.addEventListener('click', () => abrir(popM.hidden));
    document.addEventListener('click', e => { if (!popM.hidden && !caixa.contains(e.target)) abrir(false); });
    popM.addEventListener('change', e => { if (e.target.type !== 'checkbox') return; estado[chave] = e.target.checked ? [...estado[chave], e.target.value] : estado[chave].filter(x => x !== e.target.value); estado.mostrar = 60; renderizar(['filtros', 'a']); abrir(true); });
    popM.addEventListener('input', e => { if (e.target.type === 'search') renderMulti(); });
    popM.addEventListener('click', e => { if (e.target.closest('[data-limpar]')) { estado[chave] = []; renderizar(['filtros', 'a']); } });
  });
  $('#pl-f-status').addEventListener('click', e => { const b = e.target.closest('[data-st]'); if (!b) return; const s = b.dataset.st; estado.status = estado.status.includes(s) ? estado.status.filter(x => x !== s) : [...estado.status, s]; renderizar(['filtros', 'a']); });
  $('#pl-limpar').addEventListener('click', () => {
    Object.assign(estado, { fazendas: [], status: [], busca: '' }); $('#pl-busca').value = '';
    $$('[data-plmulti] input[type=search]').forEach(i => { i.value = ''; });
    renderizar(['filtros', 'a']);
  });

  /* ======================================================================
     PARTE A — CARDS, GRÁFICO UP POR UP E TABELA
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
  function renderCards(l) {
    const total = l.reduce((s, u) => s + u.total, 0), real = l.reduce((s, u) => s + u.real, 0), p = total ? real / total : 0;
    contar($('[data-pl="total"]'), total, ha);
    contar($('[data-pl="real"]'), real, ha);
    contar($('[data-pl="dif"]'), real - total, v => `${v > 0 ? '+' : ''}${n2(v)} ha`);
    contar($('[data-pl="pct"]'), p, pct);
    $('.pl-kpi-dif').classList.toggle('neg', real - total < -0.005);
    $('#pl-barra-pct').style.width = `${Math.min(100, p * 100)}%`;
    $('#pl-barra-pct').style.background = corFaixa(p);
    $('#pl-cont').innerHTML = Object.keys(STATUS).map(s => `<span style="--c:${STATUS[s].cor}"><b>${l.filter(u => u.status === s).length}</b>${s === 'Finalizado' ? 'finalizadas' : s === 'Em andamento' ? 'em andamento' : 'pendentes'}</span>`).join('');
    const pend = l.filter(u => u.status === 'Pendente' && !u.RF).length;
    $('#pl-a-sub').textContent = `${inteiro(l.length)} UP(s) em ${estado.rf ? P.periodo.rotulo(estado.ano, estado.rf) : `${estado.ano} (todos os RFs)`}${pend ? ` · inclui ${pend} pendente(s) sem RF` : ''}.`;
    const aviso = $('#pl-aviso');
    const naAbertura = estado.padrao && estado.ano === estado.padrao.ano && estado.rf === estado.padrao.rf;
    aviso.hidden = !(estado.avisoPadrao && naAbertura);
    if (!aviso.hidden) aviso.innerHTML = `<i data-lucide="calendar-x"></i><span>${escapar(estado.avisoPadrao)}</span>`;
  }

  let graficoA;
  function renderGraficoA(l) {
    const C = window.Chart, canvas = $('#pl-graf'); if (!C || !canvas) return;
    const ups = [...l].sort((a, b) => a.fazenda.localeCompare(b.fazenda, 'pt-BR') || a.up.localeCompare(b.up, 'pt-BR', { numeric: true }));
    // largura proporcional ao nº de UPs: rola para o lado quando não couber
    const largo = $('#pl-graf-largo');
    largo.style.width = `${Math.max($('#pl-graf-rolagem').clientWidth || 600, ups.length * 46 + 80)}px`;
    graficoA?.destroy();
    if (!ups.length) { graficoA = null; return; }
    C.defaults.font.family = 'Manrope, system-ui, sans-serif'; C.defaults.color = '#b8ccc8';
    // separadores de fazenda (troca de fazenda no eixo X)
    const trocas = ups.map((u, i) => (i === 0 || u.fazenda !== ups[i - 1].fazenda ? i : null)).filter(i => i != null);
    graficoA = new C(canvas, {
      type: 'bar',
      data: {
        labels: ups.map(u => u.up),
        datasets: [
          { label: 'Há a fazer', data: ups.map(u => u.total), backgroundColor: 'rgba(56,189,248,.55)', borderColor: '#38bdf8', borderWidth: 1, borderRadius: 5, maxBarThickness: 20 },
          { label: 'Há realizada', data: ups.map(u => u.real), backgroundColor: ups.map(u => corFaixa(u.pct)), borderRadius: 5, maxBarThickness: 20 }
        ]
      },
      options: {
        maintainAspectRatio: false, animation: { duration: reduzMovimento ? 0 : 700 }, layout: { padding: { top: 64 } },
        scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 60, font: { size: 10, weight: 700 } } }, y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: v => v.toLocaleString('pt-BR') } } },
        plugins: {
          legend: { position: 'bottom', align: 'start', labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { backgroundColor: 'rgba(7,23,22,.96)', borderColor: 'rgba(61,255,168,.4)', borderWidth: 1, padding: 12, callbacks: {
            title: it => ups[it[0].dataIndex].up,
            afterTitle: it => { const u = ups[it[0].dataIndex]; return `${u.fazenda}\nMaterial: ${u.material}`; },
            label: it => ` ${it.dataset.label}: ${ha(it.raw)}`,
            afterBody: it => { const u = ups[it[0].dataIndex]; return [`% realizado: ${pct(u.pct)}`, `Status: ${u.status}`]; }
          } }
        }
      },
      plugins: [{
        id: 'plRotulos',
        afterDatasetsDraw(ch) {
          const { ctx, chartArea: a } = ch;
          // nome da fazenda acima de cada grupo
          ctx.save(); ctx.font = '800 10px Manrope'; ctx.fillStyle = '#c8f560'; ctx.textBaseline = 'top';
          trocas.forEach(i => {
            const x = ch.scales.x.getPixelForValue(i) - 18;
            if (i) { ctx.strokeStyle = 'rgba(200,245,96,.3)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(x - 4, a.top - 30); ctx.lineTo(x - 4, a.bottom); ctx.stroke(); ctx.setLineDash([]); }
            const nome = ups[i].fazenda.replace(/\s*\(.*\)/, ''); ctx.fillText(nome.length > 26 ? nome.slice(0, 25) + '…' : nome, x, a.top - 28);
          });
          ctx.restore();
          // rótulos de dados nas duas barras, na vertical (cabem mesmo com muitas UPs)
          [[0, u => u.total, '#9adcf5'], [1, u => u.real, '#ecfffb']].forEach(([ds, val, cor]) => {
            if (!ch.isDatasetVisible(ds)) return;
            ch.getDatasetMeta(ds).data.forEach((b, i) => {
              const v = val(ups[i]);
              const txt = v.toLocaleString('pt-BR', { minimumFractionDigits: v >= 100 ? 0 : 1, maximumFractionDigits: v >= 100 ? 0 : 1 });
              ctx.save(); ctx.font = '700 9.5px Manrope'; ctx.fillStyle = cor; ctx.textBaseline = 'middle';
              ctx.translate(b.x, b.y - 5); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'left';
              ctx.fillText(txt, 0, 0);
              ctx.restore();
            });
          });
        }
      }]
    });
  }

  function renderTabela(l) {
    const termo = semAcento(estado.busca).toUpperCase().trim();
    const { k, dir } = estado.ord;
    const val = u => (k === 'inicio' || k === 'fim' ? (u[k] ? u[k].getTime() : 0) : u[k]);
    const lista = l.filter(u => !termo || semAcento(`${u.up} ${u.fazenda} ${u.encarregado} ${u.material} ${u.status}`).toUpperCase().includes(termo))
      .sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'string' ? x.localeCompare(y, 'pt-BR', { numeric: true }) : x - y; return (r || a.up.localeCompare(b.up, 'pt-BR', { numeric: true })) * dir; });
    const th = (kk, t) => `<th scope="col"><button type="button" data-ord="${kk}" class="${k === kk ? 'ativo' : ''}">${t}<i data-lucide="${k === kk ? (dir > 0 ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}"></i></button></th>`;
    const tot = lista.reduce((t, u) => ({ total: t.total + u.total, real: t.real + u.real }), { total: 0, real: 0 });
    const vis = lista.slice(0, estado.mostrar);
    $('#pl-tabela').innerHTML = `<table class="q-tab r-tab pl-tab">
      <thead><tr>${th('fazenda', 'Fazenda')}${th('up', 'UP')}${th('material', 'Material genético')}${th('encarregado', 'Encarregado')}${th('inicio', 'Data início')}${th('fim', 'Data fim')}${th('total', 'Há a fazer')}${th('real', 'Há realizada')}${th('dif', 'Diferença')}${th('pct', '%')}${th('status', 'Status')}</tr></thead>
      <tbody>${vis.map(u => { const s = STATUS[u.status] || { cor: '#94a3b8', icone: 'circle' }; return `<tr style="--c:${s.cor}" ${u.obs ? `title="${escapar(u.obs)}"` : ''}>
        <td data-rotulo="Fazenda">${escapar(u.fazenda)}</td><td data-rotulo="UP"><span class="q-up">${escapar(u.up)}</span></td>
        <td data-rotulo="Material genético">${escapar(u.material)}</td><td data-rotulo="Encarregado">${escapar(u.encarregado)}</td>
        <td data-rotulo="Data início">${dataTxt(u.inicio)}</td><td data-rotulo="Data fim">${dataTxt(u.fim)}</td>
        <td data-rotulo="Há a fazer">${n2(u.total)}</td><td data-rotulo="Há realizada"><b>${n2(u.real)}</b></td>
        <td data-rotulo="Diferença" class="${u.dif < -0.005 ? 'f-neg' : u.dif > 0.005 ? 'f-pos' : ''}">${u.dif > 0 ? '+' : ''}${n2(u.dif)}</td>
        <td data-rotulo="%"><span class="r-pct" style="--c:${corFaixa(u.pct)}"><i style="width:${Math.min(100, u.pct * 100)}%"></i><b>${pct(u.pct)}</b></span></td>
        <td data-rotulo="Status"><span class="f-badge" style="--c:${s.cor}"><i data-lucide="${s.icone}"></i>${escapar(u.status)}</span>${u.obs ? '<i data-lucide="message-square-text" class="pl-obs" aria-label="Tem observação"></i>' : ''}</td></tr>`; }).join('') || '<tr><td colspan="11" class="vazio">Nenhuma UP no filtro.</td></tr>'}
      ${lista.length ? `<tr class="p-total"><td colspan="6" data-rotulo="Total"><b>Total · ${inteiro(lista.length)} UP(s)</b></td><td data-rotulo="Há a fazer"><b>${n2(tot.total)}</b></td><td data-rotulo="Há realizada"><b>${n2(tot.real)}</b></td><td data-rotulo="Diferença" class="${tot.real - tot.total < -0.005 ? 'f-neg' : ''}"><b>${n2(tot.real - tot.total)}</b></td><td data-rotulo="%"><b>${pct(tot.total ? tot.real / tot.total : 0)}</b></td><td></td></tr>` : ''}
      </tbody></table>
      ${lista.length > estado.mostrar ? `<button type="button" class="fat-btn f-mais" id="pl-mais"><i data-lucide="chevrons-down"></i>Mostrar mais (${Math.min(60, lista.length - estado.mostrar)} de ${lista.length - estado.mostrar} restantes)</button>` : ''}`;
    estado.listaA = lista;
  }
  $('#pl-tabela').addEventListener('click', e => {
    const o = e.target.closest('[data-ord]');
    if (o) { const k = o.dataset.ord; estado.ord = { k, dir: estado.ord.k === k ? -estado.ord.dir : (['total', 'real', 'pct', 'inicio', 'fim'].includes(k) ? -1 : 1) }; renderizar(['tabela']); return; }
    if (e.target.closest('#pl-mais')) { estado.mostrar += 60; renderizar(['tabela']); }
  });
  let esperaBusca;
  $('#pl-busca').addEventListener('input', e => { clearTimeout(esperaBusca); esperaBusca = setTimeout(() => { estado.busca = e.target.value; estado.mostrar = 60; renderizar(['tabela']); }, 180); });

  /* ======================================================================
     PARTE B — PLANTIO ACUMULADO × META
     ====================================================================== */
  let graficoB;
  function renderB() {
    const anos = [...new Set([atual.ano, ...estado.resumo.map(r => r.ANO)])].sort((a, b) => b - a);
    $('#pl-anos-b').innerHTML = anos.map(a => `<button type="button" class="chip-filtro mini ${a === estado.anoB ? 'ativo' : ''}" data-anob="${a}">${a}</button>`).join('');
    const rs = estado.resumo.filter(r => r.ANO === estado.anoB);
    let acum = 0, acumMeta = 0;
    const comAcum = rs.map(r => ({ ...r, acum: (acum += r.total), acumMeta: (acumMeta += r.meta) }));
    const tot = { total: acum, meta: acumMeta, p: acumMeta ? acum / acumMeta : 0 };
    $('#pl-b-kpis').innerHTML = rs.length ? `
      <article class="kpi glass"><span class="kpi-rot">Plantado em ${estado.anoB}</span><strong class="kpi-val">${ha(tot.total)}</strong></article>
      <article class="kpi glass"><span class="kpi-rot">Meta acumulada</span><strong class="kpi-val">${ha(tot.meta)}</strong></article>
      <article class="kpi glass" style="--c:${corFaixa(tot.p)}"><span class="kpi-rot">% da meta no ano</span><strong class="kpi-val pl-cor">${pct(tot.p)}</strong><span class="pl-barra"><i style="width:${Math.min(100, tot.p * 100)}%;background:${corFaixa(tot.p)}"></i></span></article>` : '';

    // Cards por RF (o do RF atual em destaque): total em destaque, barra de % e lista de valores
    $('#pl-cards').innerHTML = comAcum.map(r => {
      const cor = corFaixa(r.pct), eAtual = r.ANO === atual.ano && r.RF === atual.rf;
      const linha = (rot, v, cls = '') => `<li class="${cls}"><span>${rot}</span><b>${v}</b></li>`;
      return `<button type="button" class="pl-card glass ${eAtual ? 'atual' : ''}" data-ano="${r.ANO}" data-rf="${r.RF}" style="--c:${cor}" aria-label="Ver as UPs plantadas no ${rotRF(r.RF)} de ${r.ANO}">
        <header><span class="f-rf-chip">${rotRF(r.RF)}</span><span class="pl-card-mes">${escapar(r.mes.toLowerCase())} · ${r.ANO}</span>${eAtual ? '<span class="pl-atual">RF atual</span>' : ''}</header>
        <div class="pl-card-total"><span>Total plantado</span><strong>${ha(r.total)}</strong><em style="--c:${cor}">${pct(r.pct)} da meta</em></div>
        <span class="pl-barra pl-card-barra"><i style="width:${Math.min(100, r.pct * 100)}%;background:${cor}"></i></span>
        <ul class="pl-card-lista">
          ${linha('Plantio manual', ha(r.manual))}
          ${linha('Plantio manual – pilha', ha(r.pilha))}
          ${linha('Meta de plantio', ha(r.meta), 'meta')}
          ${linha('Acumulado no ano', ha(r.acum), 'acum')}
          ${linha('Meta acumulada', ha(r.acumMeta))}
        </ul>
        <span class="pl-card-ver"><i data-lucide="list"></i>Ver UPs plantadas</span>
      </button>`;
    }).join('') || `<p class="vazio">Sem dados de plantio em ${estado.anoB}.</p>`;

    // Gráfico de linha: meta de plantio × total plantado por RF
    const C = window.Chart, canvas = $('#pl-graf-b'); if (!C || !canvas) return;
    graficoB?.destroy();
    const labels = comAcum.map(r => rotRF(r.RF));
    const ehAtual = r => r.ANO === atual.ano && r.RF === atual.rf;
    graficoB = new C(canvas, {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Total plantado', data: comAcum.map(r => r.total), borderColor: '#3dffa8', backgroundColor: 'rgba(61,255,168,.12)', borderWidth: 3, tension: .3, fill: true,
          pointRadius: comAcum.map(r => (ehAtual(r) ? 8 : 5)), pointBackgroundColor: comAcum.map(r => corFaixa(r.pct)), pointBorderColor: comAcum.map(r => (ehAtual(r) ? '#c8f560' : '#04120f')), pointBorderWidth: 2 },
        { label: 'Meta de plantio', data: comAcum.map(r => r.meta), borderColor: '#fbbf24', backgroundColor: '#fbbf24', borderWidth: 2.5, borderDash: [7, 5], tension: .3, pointRadius: 3 }
      ] },
      options: {
        maintainAspectRatio: false, animation: { duration: reduzMovimento ? 0 : 800 }, layout: { padding: { top: 30, right: 16 } }, interaction: { mode: 'index', intersect: false },
        onClick: (_e, el) => { const r = comAcum[el[0]?.index]; if (r) abrirDetalhe(r.ANO, r.RF); },
        scales: {
          x: { grid: { display: false }, ticks: { font: { weight: 800 } } },
          y: { beginAtZero: true, title: { display: true, text: 'ha' }, grid: { color: 'rgba(255,255,255,.06)' }, ticks: { callback: v => v.toLocaleString('pt-BR') } }
        },
        plugins: {
          legend: { labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { backgroundColor: 'rgba(7,23,22,.96)', borderColor: 'rgba(61,255,168,.4)', borderWidth: 1, padding: 12, callbacks: { label: it => ` ${it.dataset.label}: ${ha(it.raw)}`, afterBody: it => [`% da meta: ${pct(comAcum[it[0].dataIndex].pct)}`] } }
        }
      },
      plugins: [{
        id: 'plRotB',
        afterDatasetsDraw(ch) {
          const { ctx } = ch;
          // rótulo do total plantado (acima do ponto) e da meta (abaixo), com o % da meta
          ch.getDatasetMeta(0).data.forEach((p, i) => {
            const r = comAcum[i];
            ctx.save(); ctx.font = '800 11px Manrope'; ctx.textAlign = 'center'; ctx.fillStyle = '#ecfffb';
            ctx.fillText(r.total.toLocaleString('pt-BR', { maximumFractionDigits: 0 }), p.x, p.y - 12);
            ctx.font = '800 9.5px Manrope'; ctx.fillStyle = corFaixa(r.pct); ctx.fillText(pct(r.pct), p.x, p.y - 25);
            ctx.restore();
          });
          // rótulo da meta abaixo do ponto (sempre, para ler as duas séries)
          ch.getDatasetMeta(1).data.forEach((p, i) => {
            ctx.save(); ctx.font = '700 10px Manrope'; ctx.textAlign = 'center'; ctx.fillStyle = '#fbbf24';
            ctx.fillText(`meta ${comAcum[i].meta.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, p.x, p.y + 18); ctx.restore();
          });
        }
      }]
    });
  }
  $('#pl-anos-b').addEventListener('click', e => { const b = e.target.closest('[data-anob]'); if (b) { estado.anoB = +b.dataset.anob; renderizar(['b']); } });
  $('#pl-cards').addEventListener('click', e => { const c = e.target.closest('.pl-card'); if (c) abrirDetalhe(+c.dataset.ano, +c.dataset.rf); });

  /* ======================================================================
     PARTE C — DETALHE DO RF (modal)
     ====================================================================== */
  const modal = $('#pl-modal');
  const det = { ano: null, rf: null, busca: '' };
  function abrirDetalhe(ano, rf) {
    Object.assign(det, { ano, rf, busca: '' }); $('#pl-det-busca').value = '';
    renderDetalhe(); modal.hidden = false; $('[data-fechar]', modal).focus();
  }
  const linhasDetalhe = () => {
    const t = semAcento(det.busca).toUpperCase().trim();
    return estado.detalhe.filter(d => P.periodo.doPeriodo(d, det.ano, det.rf) && (!t || semAcento(`${d.fazenda} ${d.up} ${d.tipo}`).toUpperCase().includes(t)))
      .sort((a, b) => a.fazenda.localeCompare(b.fazenda, 'pt-BR') || a.up.localeCompare(b.up, 'pt-BR', { numeric: true }));
  };
  function renderDetalhe() {
    const l = linhasDetalhe(), total = l.reduce((s, d) => s + d.area, 0);
    const r = estado.resumo.find(x => x.ANO === det.ano && x.RF === det.rf);
    $('#pl-modal-tit span').textContent = `Plantio do ${rotRF(det.rf)} · ${r?.mes || ''} ${det.ano}`;
    const soma = chave => { const m = new Map(); l.forEach(d => m.set(d[chave], (m.get(d[chave]) || 0) + d.area)); return [...m].sort((a, b) => b[1] - a[1]); };
    $('#pl-det-resumo').innerHTML = `
      <div class="pl-det-tot"><span>Total plantado</span><strong>${ha(total)}</strong><small>${l.length} UP(s)${r ? ` · resumo do RF: ${ha(r.total)}` : ''}</small></div>
      <div class="pl-det-sub"><span>Por tipo</span>${soma('tipo').map(([k, v]) => `<p><b>${escapar(k)}</b><em>${ha(v)}</em></p>`).join('') || '<p>—</p>'}</div>
      <div class="pl-det-sub"><span>Por fazenda</span>${soma('fazenda').map(([k, v]) => `<p><b>${escapar(k)}</b><em>${ha(v)}</em></p>`).join('') || '<p>—</p>'}</div>`;
    // tabela com subtotal por fazenda
    let html = '', fazAtual = null, subtotal = 0, nSub = 0;
    const fechar = () => { if (fazAtual != null) html += `<tr class="p-subtotal" style="--c:#38bdf8"><td colspan="2" data-rotulo="Subtotal">Subtotal · ${escapar(fazAtual)} (${nSub} UP)</td><td data-rotulo="Área plantada"><b>${n2(subtotal)}</b></td><td></td></tr>`; };
    l.forEach(d => {
      if (d.fazenda !== fazAtual) { fechar(); fazAtual = d.fazenda; subtotal = 0; nSub = 0; }
      subtotal += d.area; nSub++;
      html += `<tr><td data-rotulo="Fazenda">${escapar(d.fazenda)}</td><td data-rotulo="UP"><span class="q-up">${escapar(d.up)}</span></td><td data-rotulo="Área plantada">${n2(d.area)}</td><td data-rotulo="Tipo">${escapar(d.tipo)}</td></tr>`;
    });
    fechar();
    $('#pl-det-tab').innerHTML = `<table class="q-tab r-tab pl-det"><thead><tr><th>Fazenda</th><th>UP</th><th>Área plantada (ha)</th><th>Tipo</th></tr></thead>
      <tbody>${html || '<tr><td colspan="4" class="vazio">Nenhuma UP neste RF.</td></tr>'}${l.length ? `<tr class="p-total"><td colspan="2" data-rotulo="Total"><b>Total</b></td><td data-rotulo="Área plantada"><b>${n2(total)}</b></td><td></td></tr>` : ''}</tbody></table>`;
    icones();
  }
  let esperaDet;
  $('#pl-det-busca').addEventListener('input', e => { clearTimeout(esperaDet); esperaDet = setTimeout(() => { det.busca = e.target.value; renderDetalhe(); }, 160); });
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-fechar]')) modal.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });

  /* ---------- Exportar ---------- */
  const num = v => String(Math.round((v || 0) * 100) / 100).replace('.', ',');
  function baixar(conteudo, tipo, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo })); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const csv = linhas => linhas.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const xls = (titulo, linhas) => `<html><head><meta charset="utf-8"></head><body><table border="1"><tr><th colspan="${linhas[0].length}" style="background:#0b3b2e;color:#fff;font-size:13pt">${escapar(titulo)}</th></tr>
    <tr>${linhas[0].map(h => `<th style="background:#1f6f54;color:#fff">${escapar(h)}</th>`).join('')}</tr>${linhas.slice(1).map(x => `<tr>${x.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
  const linhasA = () => [['Fazenda', 'UP', 'Material genético', 'Encarregado', 'Data início', 'Data fim', 'Há a fazer', 'Há realizada', 'Diferença', '%', 'Status', 'Observação'],
    ...(estado.listaA || []).map(u => [u.fazenda, u.up, u.material, u.encarregado, dataTxt(u.inicio), dataTxt(u.fim), num(u.total), num(u.real), num(u.dif), num(u.pct * 100), u.status, u.obs])];
  const perTxt = () => (estado.rf ? `${rotRF(estado.rf)}_${estado.ano}` : `${estado.ano}_todos`);
  $('#pl-csv').addEventListener('click', () => baixar(csv(linhasA()), 'text/csv;charset=utf-8', `Plantio_por_UP_${perTxt()}.csv`));
  $('#pl-xls').addEventListener('click', () => baixar(xls(`Plantio por UP · ${perTxt().replace('_', ' ')}`, linhasA()), 'application/vnd.ms-excel;charset=utf-8', `Plantio_por_UP_${perTxt()}.xls`));
  const linhasC = () => [['Fazenda', 'UP', 'Área plantada (ha)', 'Tipo'], ...linhasDetalhe().map(d => [d.fazenda, d.up, num(d.area), d.tipo])];
  $('#pl-det-csv').addEventListener('click', () => baixar(csv(linhasC()), 'text/csv;charset=utf-8', `Plantio_${rotRF(det.rf)}_${det.ano}.csv`));
  $('#pl-det-xls').addEventListener('click', () => baixar(xls(`Plantio do ${rotRF(det.rf)} · ${det.ano}`, linhasC()), 'application/vnd.ms-excel;charset=utf-8', `Plantio_${rotRF(det.rf)}_${det.ano}.xls`));

  /* ---------- Orquestração ---------- */
  const SECOES = {
    filtros: () => { renderPeriodo(); renderMulti(); },
    a: () => { const l = filtradas(); renderCards(l); renderGraficoA(l); renderTabela(l); },
    tabela: () => renderTabela(filtradas()),
    b: renderB
  };
  function renderizar(quais = ['filtros', 'a', 'b']) {
    if (estado.carregando) return;
    for (const q of quais) { try { SECOES[q](); } catch (erro) { console.error(`Plantio: erro em "${q}"`, erro); } }
    icones();
  }
  async function carregar(fresco = false) {
    const bt = $('#pl-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#pl-status').textContent = 'Carregando plantio…';
    raiz.classList.add('carregando');
    const [ups, resumo, detalhe] = await Promise.allSettled([ler(CFG.ups, 'TALHAO', fresco, 5), ler(CFG.resumo, 'META DE PLANTIO', fresco), ler(CFG.detalhe, 'AREA PLANTADA', fresco)]);
    const falhas = [];
    if (ups.status === 'fulfilled') estado.ups = prepararUps(ups.value); else falhas.push('acompanhamento por UP');
    if (!estado.ups.some(u => u.ANO && u.RF) && estado.ups.length) falhas.push('colunas ANO/RF da planilha de UPs');
    if (!estado.iniciado) { escolherPeriodoInicial(); estado.iniciado = true; }
    if (resumo.status === 'fulfilled') estado.resumo = prepararResumo(resumo.value); else falhas.push('plantio acumulado');
    if (detalhe.status === 'fulfilled') estado.detalhe = prepararDetalhe(detalhe.value); else falhas.push('detalhe por UP');
    const el = $('#pl-erros');
    el.hidden = !falhas.length;
    el.innerHTML = falhas.length ? `<i data-lucide="triangle-alert"></i><div><strong>Não consegui ler: ${falhas.join(', ')}</strong><p>Verifique a internet e se as planilhas estão como "Qualquer pessoa com o link – Leitor", depois toque em "Atualizar dados".</p></div>` : '';
    $('#pl-status').textContent = `${inteiro(estado.ups.length)} UPs · ${estado.resumo.length} RFs no resumo · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    estado.carregando = false;
    raiz.classList.remove('carregando');
    bt.classList.remove('girando'); bt.disabled = false;
    renderizar();
  }
  $('#pl-atualizar').addEventListener('click', () => carregar(true));
  document.addEventListener('producao:aba', e => { if (e.detail === 'plantio' && !estado.carregando) renderizar(['a', 'b']); });
  renderPeriodo(); icones();
  carregar();

  window.SMA_PLANTIO = { estado, recarregar: carregar };
})();
