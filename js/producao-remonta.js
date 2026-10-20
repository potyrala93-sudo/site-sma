/* ==========================================================================
   SMA · Silvicultura — Produção · Controle de Remonta Pré-Emergente
   Lê a aba BASE (colunas pelo nome do cabeçalho), calcula a próxima remonta de cada UP (R1, R2, R3),
   o vencimento, a situação e as inconsistências; agrupa por fazenda ("Fazer junto") e mostra
   cartões, "Programar agora", gráfico semanal e as tabelas (por fazenda ou lista por UP).
   Parâmetros no topo da aba (salvos no navegador); padrões em js/dados.js → PRODUCAO.remonta.
   ========================================================================== */

(() => {
  const D = window.SMA_DADOS, P = window.SMA_PLANILHAS;
  const CFG = D?.PRODUCAO?.remonta;
  const aba = document.getElementById('aba-remonta');
  if (!CFG || !P || !aba) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ha = v => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const DIA = 864e5;
  const dia0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const somar = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const entre = (a, b) => Math.round((dia0(b) - dia0(a)) / DIA);
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deISO = t => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const dmy = d => (d ? d.toLocaleDateString('pt-BR') : '—');
  const dm = d => (d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  const dma = d => (d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');
  const mono = t => `<span class="rm-mono">${t}</span>`;

  /* ---------- Situações ---------- */
  const SIT = {
    vencida:   { nome: 'Vencida',          cor: '#ff4d5e', ordem: 0 },
    hoje:      { nome: 'Vence hoje',       cor: '#e11d48', ordem: 1 },
    atencao:   { nome: 'Atenção',          cor: '#fbbf24', ordem: 2 },
    prazo:     { nome: 'No prazo',         cor: '#22e07a', ordem: 3 },
    semBase:   { nome: 'Sem data base',    cor: '#94a3b8', ordem: 4 },
    antiga:    { nome: 'Pendência antiga', cor: '#b07a4a', ordem: 5 },
    concluida: { nome: 'Concluída',        cor: '#64748b', ordem: 6 }
  };
  const ORDEM_CARDS = ['vencida', 'hoje', 'atencao', 'prazo', 'semBase', 'antiga', 'concluida'];
  const URGENTES = new Set(['vencida', 'hoje', 'atencao']);

  /* ---------- Parâmetros (salvos no navegador) ---------- */
  const CHAVE = 'remonta:param';
  const padrao = () => ({ ...CFG.padrao, ref: '' });   // ref vazio = hoje
  let par;
  try { par = { ...padrao(), ...(JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}) }; } catch { par = padrao(); }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(par)); } catch { /* opcional */ } };
  const refData = () => deISO(par.ref) || dia0(new Date());

  const estado = { linhas: [], calc: [], fazendas: [], visao: 'lista', busca: '', ativos: new Set(['vencida', 'hoje', 'atencao', 'prazo', 'semBase']), lido: null, carregando: false, iniciado: false };

  /* ---------- Leitura ---------- */
  // dd/mm/aaaa → Date; "-", vazio, "#VALUE!" e datas antes de 2000 (29/01/1900) = vazio
  function data(t) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(t ?? '').trim());
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return d.getFullYear() < 2000 || d.getDate() !== +m[1] ? null : d;
  }
  const nomeFazenda = t => String(t ?? '').replace(/\s+/g, ' ').replace(/\s+\)/g, ')').trim();
  // Colunas pelo nome (sem acento, maiúsculas); "Plantio" é a coluna exata (não "Dias do Plantio" nem "Replantio")
  const COL = { faz: 'FAZENDA', up: 'UP NOVA', area: 'AREA DA UP', plantio: 'PLANTIO', pp: 'POS + PRE EMERGENTE', r1: 'APLIC HERB MECAN PRE EMERGENTE REMONT 1', r2: 'APLIC HERB MECAN PRE EMERGENTE REMONT 2', r3: 'APLIC HERB MECAN PRE EMERGENTE REMONT 3' };
  async function carregar(fresco = false) {
    if (estado.carregando) return;
    estado.carregando = true;
    const bt = $('#rm-atualizar'); bt.disabled = true; bt.classList.add('girando');
    $('#rm-status').textContent = 'Lendo a planilha de remontas…';
    try {
      const linhas = await P.lerPlanilha(CFG.planilha, CFG.aba, { fresco, coluna: 'UP NOVA', cabecalho: true });
      const faltam = Object.entries(COL).filter(([, n]) => !linhas.length || !(n in linhas[0])).map(([, n]) => n);
      if (faltam.length) throw new Error(`coluna(s) não encontrada(s): ${faltam.join(', ')}`);
      estado.linhas = linhas.map((l, i) => ({
        id: i, fazenda: nomeFazenda(l[COL.faz]), up: String(l[COL.up] ?? '').trim().toUpperCase(), area: P.num(l[COL.area]),
        plantio: data(l[COL.plantio]), pp: data(l[COL.pp]), r: [data(l[COL.r1]), data(l[COL.r2]), data(l[COL.r3])]
      })).filter(x => x.fazenda && x.up && x.up !== '-');
      estado.lido = new Date();
      $('#rm-erros').hidden = true;
      const cache = P.avisoCache?.();
      $('#rm-status').textContent = `${estado.linhas.length} UPs · aba BASE${cache ? ' · última leitura salva no navegador' : ''}`;
    } catch (erro) {
      console.warn('Remonta: falha ao ler a planilha', erro);
      const el = $('#rm-erros'); el.hidden = false;
      el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>Não consegui ler a planilha de remontas</strong><p>${esc(erro.message)}. Verifique se ela está compartilhada como "Qualquer pessoa com o link" e clique em Atualizar.</p></div>`;
      $('#rm-status').textContent = 'Sem acesso à planilha';
    } finally {
      estado.carregando = false; bt.disabled = false; bt.classList.remove('girando');
      calcular(); render();
    }
  }

  /* ---------- Cálculo por UP ---------- */
  function calcularUP(x, ref) {
    const dias = [+par.r1, +par.r2, +par.r3];
    const avisos = [];
    [['Pós + Pré', x.pp], ['R1', x.r[0]], ['R2', x.r[1]], ['R3', x.r[2]]].forEach(([n, d]) => { if (d && d > ref) avisos.push(`${n} com data no futuro (${dm(d)})`); });
    if (x.r[2] && !x.r[1]) avisos.push('R3 lançada sem R2');
    if (x.r[1] && !x.r[0]) avisos.push('R2 lançada sem R1');
    if (x.r[0] && x.pp && x.r[0] < x.pp) avisos.push('R1 antes do Pós + Pré');
    if (x.r[1] && x.r[0] && x.r[1] < x.r[0]) avisos.push('R2 antes da R1');
    if (x.r[2] && x.r[1] && x.r[2] < x.r[1]) avisos.push('R3 antes da R2');
    const diasPlantio = x.plantio ? entre(x.plantio, ref) : null;
    const base = { ...x, avisos, diasPlantio, prev: [null, null, null], prox: null, venc: null, resta: null };
    if (x.r.every(Boolean)) return { ...base, sit: 'concluida' };
    const prox = x.r.findIndex(d => !d);
    const anterior = prox === 0 ? x.pp : x.r[prox - 1];
    if (!anterior) return { ...base, prox, sit: 'semBase' };
    const venc = somar(anterior, dias[prox]);
    const prev = [null, null, null];
    let p = venc; for (let j = prox + 1; j < 3; j++) { p = somar(p, dias[j]); prev[j] = p; }
    const resta = entre(ref, venc);
    const sit = resta < 0 ? (-resta > +par.antiga ? 'antiga' : 'vencida') : resta === 0 ? 'hoje' : resta <= +par.alerta ? 'atencao' : 'prazo';
    return { ...base, prox, venc, prev, resta, sit };
  }
  function calcular() {
    const ref = refData();
    const calc = estado.linhas.map(x => calcularUP(x, ref));
    // Fazer junto: UPs "No prazo" que vencem até X dias depois do maior vencimento entre as urgentes da fazenda
    const porFaz = new Map();
    calc.forEach(u => (porFaz.get(u.fazenda) || porFaz.set(u.fazenda, []).get(u.fazenda)).push(u));
    porFaz.forEach(ups => {
      const urg = ups.filter(u => URGENTES.has(u.sit));
      if (!urg.length) return;
      const limite = somar(new Date(Math.max(...urg.map(u => u.venc))), +par.junto);
      ups.forEach(u => { if (u.sit === 'prazo' && u.venc <= limite) u.junto = true; });
    });
    estado.calc = calc;
    estado.fazendas = [...porFaz.entries()].map(([nome, ups]) => {
      const urg = ups.filter(u => URGENTES.has(u.sit)), junto = ups.filter(u => u.junto);
      const comVenc = ups.filter(u => u.venc && u.sit !== 'antiga' && u.sit !== 'concluida');
      const pior = Math.min(...ups.map(u => SIT[u.sit].ordem));
      const maisCurto = [...urg].sort((a, b) => a.venc - b.venc)[0] || null;
      return { nome, ups, urg, junto, pior, maisCurto, prox: comVenc.length ? new Date(Math.min(...comVenc.map(u => u.venc))) : null,
        programar: [...urg, ...junto], haProgramar: [...urg, ...junto].reduce((s, u) => s + u.area, 0) };
    });
  }

  /* ---------- Tela ---------- */
  // Ordem cronológica: o vencimento mais próximo (ou mais atrasado) primeiro; sem vencimento vai para o fim
  const ordenarUPs = (a, b) => (a.venc ? +a.venc : Infinity) - (b.venc ? +b.venc : Infinity) || SIT[a.sit].ordem - SIT[b.sit].ordem || a.fazenda.localeCompare(b.fazenda) || a.up.localeCompare(b.up);
  const passaBusca = u => { const t = semAcento(estado.busca).toUpperCase().trim(); return !t || semAcento(`${u.fazenda} ${u.up}`).toUpperCase().includes(t); };
  const visivel = u => estado.ativos.has(u.sit) && passaBusca(u);

  function render() {
    const ref = refData();
    $('#rm-ref-txt').textContent = dmy(ref) + (par.ref ? '' : ' (hoje)');
    $('#rm-lido').textContent = estado.lido ? estado.lido.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    renderParam(); renderCards(); renderProgramar(); renderLista();
    icones();
  }
  function renderParam() {
    const f = $('#rm-param');
    ['r1', 'r2', 'r3', 'alerta', 'junto', 'antiga'].forEach(k => { if (document.activeElement !== f[k]) f[k].value = par[k]; });
    if (document.activeElement !== f.ref) f.ref.value = iso(refData());
    $('#rm-hoje').hidden = !par.ref;
  }
  function renderCards() {
    $('#rm-cards').innerHTML = ORDEM_CARDS.map(k => {
      const l = estado.calc.filter(u => u.sit === k), s = SIT[k], on = estado.ativos.has(k);
      return `<button type="button" class="rm-card glass ${on ? 'ativo' : ''} ${k === 'hoje' && l.length ? 'pulsa' : ''}" data-sit="${k}" aria-pressed="${on}" style="--c:${s.cor}">
        <span class="rm-card-rot"><i></i>${s.nome}</span><strong class="rm-mono">${l.length}</strong><small><span class="rm-mono">${ha(l.reduce((t, u) => t + u.area, 0))}</span> ha</small>
        <em>${on ? 'na lista' : 'oculto'}</em></button>`;
    }).join('');
  }
  function renderProgramar() {
    const l = estado.fazendas.filter(f => f.urg.length).sort((a, b) => a.maisCurto.venc - b.maisCurto.venc);
    $('#rm-programar').innerHTML = l.length ? l.map(f => `
      <article class="rm-prog glass" style="--c:${SIT[f.maisCurto.sit].cor}">
        <header><b>${esc(f.nome)}</b><span class="rm-selo" style="--c:${SIT[f.maisCurto.sit].cor}">${SIT[f.maisCurto.sit].nome}</span></header>
        <p>${resumoFazenda(f)}</p>
        ${f.junto.length ? `<p class="rm-junto-txt"><i data-lucide="link-2"></i>Fazer junto: ${f.junto.sort((a, b) => a.venc - b.venc).map(u => `<b>${esc(u.up)}</b> ${mono(`(${dm(u.venc)})`)}`).join(', ')}</p>` : ''}
        <button type="button" class="rm-ir" data-ir="${esc(f.nome)}">Ver fazenda <i data-lucide="arrow-down"></i></button>
      </article>`).join('') : '<p class="rm-vazio"><i data-lucide="shield-check"></i>Nenhuma fazenda com remonta vencida, vencendo hoje ou em atenção.</p>';
  }
  const resumoFazenda = f => `Programar a fazenda: <b>${f.programar.length} UP${f.programar.length > 1 ? 's' : ''}</b>, ${mono(ha(f.haProgramar))} ha. Prazo mais curto: ${mono(dmy(f.maisCurto.venc))} na UP <b>${esc(f.maisCurto.up)}</b>.`;

  // Célula de remonta: aplicada ✓, próxima (cor da situação) ou projeção
  function celulaR(u, i) {
    if (u.r[i]) return `<span class="rm-feita">✓ ${mono(dma(u.r[i]))}</span>`;
    if (u.prox === i && u.venc) return `<span class="rm-proxima" style="--c:${SIT[u.sit].cor}">${mono(dma(u.venc))}</span>`;
    if (u.prev[i]) return `<span class="rm-prev">prev. ${mono(dma(u.prev[i]))}</span>`;
    return '<span class="rm-nada">—</span>';
  }
  function textoSituacao(u) {
    if (u.sit === 'concluida') return 'R1, R2 e R3 aplicadas';
    if (u.sit === 'semBase') return u.prox === 0 ? 'sem Pós + Pré para calcular a R1' : `sem a data da R${u.prox} para calcular a R${u.prox + 1}`;
    const r = `R${u.prox + 1}`;
    if (u.resta === 0) return `${r} · vence hoje`;
    return u.resta < 0 ? `${r} · venceu há ${-u.resta} d` : `${r} · vence em ${u.resta} d`;
  }
  function linhaUP(u, comFazenda) {
    const s = SIT[u.sit];
    return `<tr class="rm-l-${u.sit}" style="--c:${s.cor}">
      ${comFazenda ? `<td data-rotulo="Fazenda" class="rm-faz-cel">${esc(u.fazenda)}</td>` : ''}
      <td data-rotulo="UP"><span class="q-up">${esc(u.up)}</span>${u.junto ? '<span class="rm-junto" title="Vence perto das UPs urgentes desta fazenda: aproveite a ida">Fazer junto</span>' : ''}</td>
      <td data-rotulo="Vencimento">${u.venc ? `<span class="rm-venc" style="--c:${s.cor}">${mono(dmy(u.venc))}</span><small class="rm-sit-txt">R${u.prox + 1}</small>` : '<span class="rm-nada">—</span>'}</td>
      <td data-rotulo="Área (ha)" class="num">${mono(ha(u.area))}</td>
      <td data-rotulo="Dias de plantio" class="num">${u.diasPlantio != null ? mono(u.diasPlantio) : '—'}</td>
      <td data-rotulo="Pós + Pré">${u.pp ? mono(dma(u.pp)) : '<span class="rm-nada">—</span>'}</td>
      <td data-rotulo="Remonta 1">${celulaR(u, 0)}</td><td data-rotulo="Remonta 2">${celulaR(u, 1)}</td><td data-rotulo="Remonta 3">${celulaR(u, 2)}</td>
      <td data-rotulo="Situação"><span class="rm-selo" style="--c:${s.cor}">${s.nome}</span><small class="rm-sit-txt">${textoSituacao(u)}</small>
        ${u.avisos.map(a => `<small class="rm-aviso">⚠ ${esc(a)}</small>`).join('')}</td>
    </tr>`;
  }
  const cabecalho = comFazenda => `<thead><tr>${comFazenda ? '<th>Fazenda</th>' : ''}<th>UP</th><th>Vencimento</th><th class="num">Área (ha)</th><th class="num">Dias de plantio</th><th>Pós + Pré</th><th>Remonta 1</th><th>Remonta 2</th><th>Remonta 3</th><th>Situação</th></tr></thead>`;
  const tabela = (ups, comFazenda) => `<div class="rm-rolagem"><table class="q-tab rm-tab">${cabecalho(comFazenda)}<tbody>${ups.map(u => linhaUP(u, comFazenda)).join('')}</tbody></table></div>`;

  function renderLista() {
    const el = $('#rm-lista');
    if (!estado.calc.length) { el.innerHTML = `<div class="fat-painel glass"><p class="rm-vazio">${estado.carregando ? 'Carregando…' : 'Nenhuma UP para mostrar.'}</p></div>`; return; }
    if (estado.visao === 'lista') {
      const ups = estado.calc.filter(visivel).sort(ordenarUPs);
      el.innerHTML = ups.length ? `<div class="fat-painel glass">${tabela(ups, true)}</div>` : '<div class="fat-painel glass"><p class="rm-vazio">Nenhuma UP com esses filtros.</p></div>';
      return;
    }
    const primeiro = f => (f.vis[0]?.venc ? +f.vis[0].venc : Infinity);
    const fazendas = estado.fazendas.map(f => ({ ...f, vis: f.ups.filter(visivel).sort(ordenarUPs) })).filter(f => f.vis.length)
      .sort((a, b) => primeiro(a) - primeiro(b) || a.pior - b.pior || a.nome.localeCompare(b.nome));
    el.innerHTML = fazendas.length ? fazendas.map(f => {
      const cor = SIT[ORDEM_CARDS.find(k => SIT[k].ordem === f.pior)].cor;
      return `<article class="rm-fazenda fat-painel glass" id="rm-faz-${encodeURIComponent(f.nome)}" style="--c:${cor}">
        <header class="rm-faz-topo"><div><h3>${esc(f.nome)}</h3><small>${f.ups.length} UP${f.ups.length > 1 ? 's' : ''} · ${mono(ha(f.ups.reduce((s, u) => s + u.area, 0)))} ha${f.vis.length < f.ups.length ? ` · ${f.vis.length} na lista` : ''}</small></div>${f.vis[0]?.venc ? `<span class="rm-faz-prox">Primeiro vencimento: ${mono(dmy(f.vis[0].venc))}</span>` : ''}</header>
        ${f.urg.length ? `<div class="rm-faz-prog"><p><i data-lucide="calendar-check"></i>${resumoFazenda(f)}</p>${f.junto.length ? `<p class="rm-junto-txt"><i data-lucide="link-2"></i>Fazer junto: ${f.junto.map(u => `<b>${esc(u.up)}</b> ${mono(`(${dm(u.venc)})`)}`).join(', ')}</p>` : ''}</div>` : ''}
        ${tabela(f.vis, false)}
      </article>`;
    }).join('') : '<div class="fat-painel glass"><p class="rm-vazio">Nenhuma UP com esses filtros.</p></div>';
  }

  /* ---------- Eventos ---------- */
  $('#rm-param').addEventListener('input', e => {
    const k = e.target.name; if (!k) return;
    if (k === 'ref') par.ref = e.target.value && e.target.value !== iso(dia0(new Date())) ? e.target.value : '';
    else { const v = parseInt(e.target.value, 10); if (!Number.isFinite(v) || v < 0) return; par[k] = v; }
    salvar(); calcular(); render();
  });
  $('#rm-hoje').addEventListener('click', () => { par.ref = ''; salvar(); calcular(); render(); });
  $('#rm-restaurar').addEventListener('click', () => { par = padrao(); salvar(); calcular(); render(); });
  $('#rm-atualizar').addEventListener('click', () => carregar(true));
  $('#rm-cards').addEventListener('click', e => {
    const b = e.target.closest('[data-sit]'); if (!b) return;
    const k = b.dataset.sit; estado.ativos.has(k) ? estado.ativos.delete(k) : estado.ativos.add(k);
    renderCards(); renderLista(); icones();
  });
  let espera;
  $('#rm-busca').addEventListener('input', e => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = e.target.value; renderLista(); icones(); }, 150); });
  $('.rm-visao').addEventListener('click', e => {
    const b = e.target.closest('[data-visao]'); if (!b) return;
    estado.visao = b.dataset.visao;
    $$('.rm-visao [data-visao]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderLista(); icones();
  });
  $('#rm-programar').addEventListener('click', e => {
    const b = e.target.closest('[data-ir]'); if (!b) return;
    if (estado.visao !== 'fazenda') $('.rm-visao [data-visao="fazenda"]').click();
    const alvo = document.getElementById(`rm-faz-${encodeURIComponent(b.dataset.ir)}`);
    if (!alvo) { estado.ativos = new Set(ORDEM_CARDS); estado.busca = ''; $('#rm-busca').value = ''; render(); }
    document.getElementById(`rm-faz-${encodeURIComponent(b.dataset.ir)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  /* ---------- Início: só quando a aba é aberta (lê de novo a cada abertura da página) ---------- */
  function iniciar() { if (estado.iniciado) return; estado.iniciado = true; render(); carregar(); }
  document.addEventListener('producao:aba', e => { if (e.detail === 'remonta') iniciar(); });
  if (!aba.hidden) iniciar();
})();
