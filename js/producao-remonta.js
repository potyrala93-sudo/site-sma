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
    concluida: { nome: 'Concluída',        cor: '#64748b', ordem: 5 }
  };
  const ORDEM_CARDS = ['vencida', 'hoje', 'atencao', 'prazo', 'semBase', 'concluida'];
  const CARDS = ORDEM_CARDS;   // todas as situações têm cartão (clique para esconder ou mostrar)
  const URGENTES = new Set(['vencida', 'hoje', 'atencao']);

  /* ---------- Parâmetros (salvos no navegador) ---------- */
  const CHAVE = 'remonta:param';
  const padrao = () => ({ ...CFG.padrao, ref: '', remontas: [1, 2, 3] });   // ref vazio = hoje · remontas: quais ver (próxima remonta da UP)
  let par;
  try { par = { ...padrao(), ...(JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}) }; } catch { par = padrao(); }
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(par)); } catch { /* opcional */ } };
  const refData = () => deISO(par.ref) || dia0(new Date());

  // Quem faz a remonta de cada UP (Barrão ou Drone): escolhido na tabela e salvo neste navegador
  const CHAVE_MET = 'remonta:metodo';
  const METODOS = { barrao: { nome: 'Barrão', icone: 'tractor', cor: '#fb923c' }, drone: { nome: 'Drone', icone: 'plane', cor: '#38bdf8' } };
  let metodos = {};
  try { metodos = JSON.parse(localStorage.getItem(CHAVE_MET) || '{}') || {}; } catch { metodos = {}; }
  const salvarMetodos = () => { try { localStorage.setItem(CHAVE_MET, JSON.stringify(metodos)); } catch { /* opcional */ } };

  const estado = { ordem: { k: 'venc', dir: 1 }, linhas: [], calc: [], fazendas: [], visao: 'lista', busca: '', ativos: new Set(ORDEM_CARDS), todas: [],
    f: { ano: new Set(), mes: new Set(), faz: new Set(), met: new Set() }, aberto: '', lido: null, carregando: false, iniciado: false };

  // Filtros escolhidos (ano, mês, fazenda, quem faz e situação): salvos no navegador, voltam ao recarregar
  const CHAVE_FILTROS = 'remonta:filtros';
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_FILTROS) || 'null');
    if (s) {
      ['ano', 'mes', 'faz', 'met'].forEach(k => { if (Array.isArray(s[k])) estado.f[k] = new Set(s[k]); });
      if (Array.isArray(s.sit)) estado.ativos = new Set(s.sit.filter(k => ORDEM_CARDS.includes(k)));
    }
  } catch { /* sem filtros salvos */ }
  const salvarFiltros = () => {
    try { localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ ...Object.fromEntries(Object.entries(estado.f).map(([k, s]) => [k, [...s]])), sit: [...estado.ativos] })); } catch { /* opcional */ }
  };

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
      const vistos = new Map();
      estado.linhas.forEach(x => { const k = `${x.fazenda}|${x.up}`; const n = (vistos.get(k) || 0) + 1; vistos.set(k, n); x.chave = `${k}|${n}`; });
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
    // Remonta com data = feita. A próxima é a que vem depois da última lançada
    // (se a R3 tem data, a UP está concluída mesmo que a R2 esteja em branco)
    const ultima = x.r.reduce((u, d, i) => (d ? i : u), -1);
    if (ultima === 2) return { ...base, sit: 'concluida' };
    const prox = ultima + 1;
    const anterior = prox === 0 ? x.pp : x.r[prox - 1];
    if (!anterior) return { ...base, prox, sit: 'semBase' };
    const venc = somar(anterior, dias[prox]);
    const prev = [null, null, null];
    let p = venc; for (let j = prox + 1; j < 3; j++) { p = somar(p, dias[j]); prev[j] = p; }
    const resta = entre(ref, venc);
    const sit = resta < 0 ? 'vencida' : resta === 0 ? 'hoje' : resta <= +par.alerta ? 'atencao' : 'prazo';
    return { ...base, prox, venc, prev, resta, sit };
  }
  function calcular() {
    const ref = refData();
    const escolhidas = new Set((par.remontas?.length ? par.remontas : [1, 2, 3]).map(Number));
    const todas = estado.linhas.map(x => calcularUP(x, ref)).filter(u => u.prox == null || escolhidas.has(u.prox + 1));
    // Data usada no filtro de ano e mês: o vencimento da próxima remonta; sem vencimento, a última aplicação
    todas.forEach(u => { u.dataF = u.venc || [...u.r].reverse().find(Boolean) || u.pp || null; });
    estado.todas = todas;
    const calc = todas.filter(passaPeriodo);
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
      const comVenc = ups.filter(u => u.venc && u.sit !== 'concluida');
      const pior = Math.min(...ups.map(u => SIT[u.sit].ordem));
      const maisCurto = [...urg].sort((a, b) => a.venc - b.venc)[0] || null;
      return { nome, ups, urg, junto, pior, maisCurto, prox: comVenc.length ? new Date(Math.min(...comVenc.map(u => u.venc))) : null,
        programar: [...urg, ...junto], haProgramar: [...urg, ...junto].reduce((s, u) => s + u.area, 0) };
    });
  }

  // Ano, mês e fazenda (seleção múltipla; nada marcado = todos): valem para cartões, "Programar agora" e tabelas
  function passaPeriodo(u) {
    const { ano, mes, faz } = estado.f, d = u.dataF;
    if (faz.size && !faz.has(u.fazenda)) return false;
    if (ano.size && !(d && ano.has(d.getFullYear()))) return false;
    if (mes.size && !(d && mes.has(d.getMonth() + 1))) return false;
    return true;
  }

  /* ---------- Tela ---------- */
  // Ordem cronológica: o vencimento mais próximo (ou mais atrasado) primeiro; sem vencimento vai para o fim
  const porVenc = (a, b) => (a.venc ? +a.venc : Infinity) - (b.venc ? +b.venc : Infinity) || SIT[a.sit].ordem - SIT[b.sit].ordem || a.fazenda.localeCompare(b.fazenda) || a.up.localeCompare(b.up);
  const ORDENS = {
    venc: porVenc,
    sit: (a, b) => SIT[a.sit].ordem - SIT[b.sit].ordem || porVenc(a, b),
    area: (a, b) => a.area - b.area || porVenc(a, b),
    up: (a, b) => a.up.localeCompare(b.up) || porVenc(a, b),
    fazenda: (a, b) => a.fazenda.localeCompare(b.fazenda, 'pt-BR') || porVenc(a, b),
    remonta: (a, b) => (a.prox ?? 9) - (b.prox ?? 9) || porVenc(a, b),
    met: (a, b) => (metodos[a.chave] || 'z').localeCompare(metodos[b.chave] || 'z') || porVenc(a, b)
  };
  const ordenarUPs = (a, b) => (ORDENS[estado.ordem.k] || porVenc)(a, b) * estado.ordem.dir;
  const passaBusca = u => { const t = semAcento(estado.busca).toUpperCase().trim(); return !t || semAcento(`${u.fazenda} ${u.up}`).toUpperCase().includes(t); };
  const visivelSemMetodo = u => estado.ativos.has(u.sit) && passaBusca(u);
  const passaMetodo = u => !estado.f.met.size || estado.f.met.has(metodos[u.chave] || 'nenhum');
  const visivel = u => visivelSemMetodo(u) && passaMetodo(u);

  function render() {
    const ref = refData();
    $('#rm-ref-txt').textContent = dmy(ref) + (par.ref ? '' : ' (hoje)');
    $('#rm-lido').textContent = estado.lido ? estado.lido.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
    renderParam(); renderRemontas(); renderCards(); renderProgramar(); renderFiltros(); renderLista(); renderMetodos();
    icones();
  }
  function renderRemontas() {
    const sel = new Set((par.remontas || [1, 2, 3]).map(Number));
    $$('#rm-remontas [data-r]').forEach(b => { const on = b.dataset.r === 'todas' ? sel.size === 3 : sel.has(+b.dataset.r); b.classList.toggle('ativo', on); b.setAttribute('aria-pressed', String(on)); });
    $('#rm-remontas-info').textContent = sel.size === 3 ? 'Todas as remontas · clique para marcar ou desmarcar cada uma' : `Só ${[...sel].sort().map(n => `Remonta ${n}`).join(' e ')}: cartões, "Programar agora" e a ordem das fazendas consideram só ${sel.size > 1 ? 'elas' : 'ela'}`;
  }
  function renderParam() {
    const f = $('#rm-param');
    ['r1', 'r2', 'r3', 'alerta', 'junto'].forEach(k => { if (document.activeElement !== f[k]) f[k].value = par[k]; });
    if (document.activeElement !== f.ref) f.ref.value = iso(refData());
    $('#rm-hoje').hidden = !par.ref;
  }
  function renderCards() {
    $('#rm-cards').innerHTML = CARDS.map(k => {
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

  // Células de data: aplicada (✓ data), próxima a vencer (data na cor da situação), prevista (prev. data)
  function celulaData(d) { return d ? `<span class="rm-feita">✓ ${mono(dma(d))}</span>` : '<span class="rm-nada">—</span>'; }
  function celulaR(u, i) {
    if (u.r[i]) return celulaData(u.r[i]);
    if (u.prox === i && u.venc) return `<span class="rm-proxima" style="--c:${SIT[u.sit].cor}">${mono(dma(u.venc))}</span>`;
    if (u.prev[i]) return `<span class="rm-prev">prev. ${mono(dma(u.prev[i]))}</span>`;
    return '<span class="rm-nada">—</span>';
  }
  const nomeRemonta = i => `Remonta ${i + 1}`;
  function textoSituacao(u) {
    if (u.sit === 'concluida') return `R3 em ${dm(u.r[2])}`;
    if (u.sit === 'semBase') return u.prox === 0 ? 'falta o Pós + Pré' : `falta a data da ${nomeRemonta(u.prox - 1)}`;
    if (u.resta === 0) return 'vence hoje';
    return u.resta < 0 ? `venceu há ${-u.resta} d` : `vence em ${u.resta} d`;
  }
  const atencao = u => (u.avisos.length ? `<span class="rm-atencao" role="img" tabindex="0" aria-label="Atenção: ${esc(u.avisos.join('; '))}" title="${esc(u.avisos.join('\n'))}">⚠</span>` : '');
  function linhaUP(u, comFazenda, n) {
    const s = SIT[u.sit];
    return `<tr class="rm-l-${u.sit}" style="--c:${s.cor}">
      <td data-rotulo="Ordem" class="rm-n">${n}º</td>
      ${comFazenda ? `<td data-rotulo="Fazenda" class="rm-faz-cel">${esc(u.fazenda)}</td>` : ''}
      <td data-rotulo="UP" class="rm-up-cel"><span class="q-up">${esc(u.up)}</span>${atencao(u)}${u.junto ? '<span class="rm-junto" title="Vence perto das UPs urgentes desta fazenda: aproveite a ida">junto</span>' : ''}</td>
      <td data-rotulo="Área (ha)" class="num">${mono(ha(u.area))}</td>
      <td data-rotulo="Pós + Pré emergente">${celulaData(u.pp)}</td>
      <td data-rotulo="Remonta 1">${celulaR(u, 0)}</td><td data-rotulo="Remonta 2">${celulaR(u, 1)}</td><td data-rotulo="Remonta 3">${celulaR(u, 2)}</td>
      <td data-rotulo="Próxima remonta">${u.venc ? `<b class="rm-prox-nome">${nomeRemonta(u.prox)}</b>` : '<span class="rm-nada">—</span>'}</td>
      <td data-rotulo="Situação" class="rm-sit-cel"><span class="rm-selo" style="--c:${s.cor}">${s.nome}</span> <small class="rm-sit-txt">${textoSituacao(u)}</small></td>
      <td data-rotulo="Quem faz">${botoesMetodo(u)}</td>
    </tr>`;
  }
  // Cabeçalho: clicar ordena (de novo inverte); a seta mostra a coluna em uso
  const th = (k, rot, cls = '') => { const at = estado.ordem.k === k; return `<th class="${cls} rm-ordenavel ${at ? 'ativo' : ''}" aria-sort="${at ? (estado.ordem.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-ordem="${k}" title="Ordenar por ${rot.replace(/<[^>]+>/g, '')}">${rot}<i>${at ? (estado.ordem.dir > 0 ? '▲' : '▼') : '↕'}</i></button></th>`; };
  const cabecalho = comFazenda => `<thead><tr><th class="rm-n" title="Posição na ordem atual">Nº</th>${comFazenda ? th('fazenda', 'Fazenda') : ''}${th('up', 'UP')}${th('area', 'Área (ha)', 'num')}<th>Pós + Pré emergente</th><th>Remonta 1</th><th>Remonta 2</th><th>Remonta 3</th>${th('remonta', 'Próxima remonta')}${th('sit', 'Situação')}${th('met', 'Quem faz')}</tr></thead>`;
  function botoesMetodo(u) {
    const m = metodos[u.chave];
    return `<div class="rm-met" role="group" aria-label="Quem faz a remonta da UP ${esc(u.up)}">${Object.entries(METODOS).map(([k, x]) => `<button type="button" data-met="${k}" data-chave="${esc(u.chave)}" aria-pressed="${m === k}" class="${m === k ? 'ativo' : ''}" style="--c:${x.cor}" title="${m === k ? 'Clique de novo para tirar' : `Marcar: ${x.nome}`}"><i data-lucide="${x.icone}"></i><span>${x.nome}</span></button>`).join('')}</div>`;
  }

  const tabela = (ups, comFazenda) => `<table class="q-tab rm-tab ${comFazenda ? 'com-fazenda' : ''}">${cabecalho(comFazenda)}<tbody>${ups.map((u, i) => linhaUP(u, comFazenda, i + 1)).join('')}</tbody></table>`;
  const legenda = '<p class="rm-legenda"><span><span class="rm-feita">✓ 01/10/26</span> aplicada</span><span><span class="rm-proxima" style="--c:#fbbf24">01/10/26</span> próxima a vencer</span><span><span class="rm-prev">prev. 01/10/26</span> prevista</span><span><span class="rm-atencao">⚠</span> data a conferir na planilha (passe o mouse)</span></p>';

  // Ordem das fazendas: primeiro as que têm UP vencida/vencendo/em atenção (a mais atrasada antes),
  // depois as que só têm UPs no prazo, pela data mais próxima; por último as sem data base
  function ordemFazendas(lista) {
    const chave = f => {
      const urg = f.vis.filter(u => URGENTES.has(u.sit)), prazo = f.vis.filter(u => u.venc);
      return [urg.length ? 0 : prazo.length ? 1 : 2, urg.length ? Math.min(...urg.map(u => +u.venc)) : prazo.length ? Math.min(...prazo.map(u => +u.venc)) : Infinity];
    };
    return lista.map(f => ({ ...f, chave: chave(f) })).sort((a, b) => a.chave[0] - b.chave[0] || a.chave[1] - b.chave[1] || a.nome.localeCompare(b.nome));
  }
  function renderLista() {
    const el = $('#rm-lista');
    if (!estado.calc.length) { el.innerHTML = `<div class="fat-painel glass"><p class="rm-vazio">${estado.carregando ? 'Carregando…' : 'Nenhuma UP para mostrar.'}</p></div>`; return; }
    const vazio = '<div class="fat-painel glass"><p class="rm-vazio">Nenhuma UP com esses filtros.</p></div>';
    if (estado.visao === 'lista') {
      const ups = estado.calc.filter(visivel).sort(ordenarUPs);
      el.innerHTML = ups.length ? `<div class="fat-painel glass rm-tabela-wrap">${legenda}${tabela(ups, true)}</div>` : vazio;
      return;
    }
    const fazendas = ordemFazendas(estado.fazendas.map(f => ({ ...f, vis: f.ups.filter(visivel).sort(ordenarUPs) })).filter(f => f.vis.length));
    if (!fazendas.length) { el.innerHTML = vazio; return; }
    // Sequência sugerida: a ordem em que as fazendas devem ser feitas
    const seq = `<div class="fat-painel glass rm-sequencia"><span class="eyebrow">Sequência sugerida</span><ol>${fazendas.map((f, i) => {
      const u = f.vis.find(x => x.venc), s = SIT[f.vis[0].sit];
      return `<li style="--c:${s.cor}"><button type="button" data-ir="${esc(f.nome)}"><b class="rm-seq-n">${i + 1}º</b><span><b>${esc(f.nome)}</b><small>${u ? `${textoSituacao(u)} · ${mono(dm(u.venc))}` : 'sem data base'}</small></span></button></li>`;
    }).join('')}</ol></div>`;
    el.innerHTML = seq + fazendas.map((f, i) => {
      const s = SIT[f.vis[0].sit], urg = f.vis.filter(u => URGENTES.has(u.sit)), junto = f.vis.filter(u => u.junto);
      const fazer = [...urg, ...junto], haFazer = fazer.reduce((t, u) => t + u.area, 0), u0 = f.vis.find(x => x.venc);
      return `<article class="rm-fazenda fat-painel glass" id="rm-faz-${encodeURIComponent(f.nome)}" style="--c:${s.cor}">
        <header class="rm-faz-topo">
          <span class="rm-faz-n">${i + 1}º</span>
          <div class="rm-faz-nome"><h3>${esc(f.nome)}</h3><small>${f.vis.length} UP${f.vis.length > 1 ? 's' : ''} · ${mono(ha(f.vis.reduce((t, u) => t + u.area, 0)))} ha</small></div>
          ${i === 0 ? '<span class="rm-primeiro">Fazer primeiro</span>' : ''}
          <div class="rm-faz-dec">${fazer.length
            ? `<b>Ir agora: ${fazer.length} UP${fazer.length > 1 ? 's' : ''} · ${mono(ha(haFazer))} ha</b><small>prazo mais curto ${mono(dmy(urg.sort((a, b) => a.venc - b.venc)[0]?.venc || u0.venc))}${junto.length ? ` · inclui ${junto.length} para fazer junto` : ''}</small>`
            : u0 ? `<b>Próximo vencimento ${mono(dmy(u0.venc))}</b><small>${textoSituacao(u0)}</small>` : '<b>Sem data base</b><small>falta lançar datas</small>'}</div>
        </header>
        ${tabela(f.vis, false)}
      </article>`;
    }).join('');
  }

  // Filtros de seleção múltipla (caixinhas): nada marcado = todos
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const conta = (lista, f) => lista.reduce((m, u) => { const k = f(u); if (k != null) m.set(k, (m.get(k) || 0) + 1); return m; }, new Map());
  // UPs que passam por ano/mês/fazenda ignorando um deles (para contar as opções daquele filtro)
  const semFiltro = k => estado.todas.filter(u => { const s = estado.f[k]; estado.f[k] = new Set(); const ok = passaPeriodo(u); estado.f[k] = s; return ok; });
  function opcoesFiltros() {
    const comPeriodo = estado.todas.filter(passaPeriodo);
    const nAno = conta(semFiltro('ano'), u => u.dataF?.getFullYear()), nMes = conta(semFiltro('mes'), u => (u.dataF ? u.dataF.getMonth() + 1 : null)), nFaz = conta(semFiltro('faz'), u => u.fazenda);
    const nSit = conta(comPeriodo.filter(u => passaBusca(u) && passaMetodo(u)), u => u.sit);
    const nMet = conta(comPeriodo.filter(u => estado.ativos.has(u.sit) && passaBusca(u)), u => metodos[u.chave] || 'nenhum');
    const anos = [...new Set([...nAno.keys(), ...estado.f.ano])].sort((a, b) => b - a);
    return {
      ano: { rot: 'Ano', icone: 'calendar', sel: estado.f.ano, op: anos.map(v => ({ v, t: String(v), n: nAno.get(v) || 0 })) },
      mes: { rot: 'Mês', icone: 'calendar-days', sel: estado.f.mes, op: MESES.map((t, i) => ({ v: i + 1, t, n: nMes.get(i + 1) || 0 })) },
      faz: { rot: 'Fazenda', icone: 'tractor', sel: estado.f.faz, op: [...new Set([...nFaz.keys(), ...estado.f.faz])].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(v => ({ v, t: v, n: nFaz.get(v) || 0 })) },
      sit: { rot: 'Situação', icone: 'filter', sel: estado.ativos, cheio: true, op: ORDEM_CARDS.map(k => ({ v: k, t: SIT[k].nome, n: nSit.get(k) || 0, cor: SIT[k].cor })) },
      met: { rot: 'Quem faz', icone: 'users', sel: estado.f.met, op: [['barrao', 'Barrão'], ['drone', 'Drone'], ['nenhum', 'A definir']].map(([v, t]) => ({ v, t, n: nMet.get(v) || 0 })) }
    };
  }
  // Texto do botão: "Todos", o item escolhido ou "3 escolhidos"
  function resumoFiltro(o) {
    const marcados = o.op.filter(x => o.sel.has(x.v));
    if (o.cheio ? marcados.length === o.op.length : !marcados.length) return 'Todos';
    if (!marcados.length) return 'Nenhum';
    return marcados.length === 1 ? marcados[0].t : `${marcados.length} escolhidos`;
  }
  const filtrosAtivos = () => estado.f.ano.size || estado.f.mes.size || estado.f.faz.size || estado.f.met.size || estado.ativos.size !== ORDEM_CARDS.length;
  function renderFiltros() {
    const el = $('#rm-filtros'); if (!el) return;
    salvarFiltros();   // toda mudança de filtro (caixas, cartões, limpar) passa por aqui
    el.innerHTML = Object.entries(opcoesFiltros()).map(([k, o]) => {
      const ativo = o.cheio ? o.sel.size !== o.op.length : o.sel.size > 0, aberto = estado.aberto === k;
      return `<div class="rm-ms ${ativo ? 'ativo' : ''}" data-f="${k}">
        <button type="button" class="rm-ms-bt" aria-haspopup="true" aria-expanded="${aberto}"><i data-lucide="${o.icone}"></i><span>${o.rot}</span><b>${esc(resumoFiltro(o))}</b><i data-lucide="chevron-down" class="rm-ms-seta"></i></button>
        <div class="rm-ms-pop" role="group" aria-label="${o.rot}" ${aberto ? '' : 'hidden'}>
          <div class="rm-ms-acoes"><button type="button" data-todos>Marcar todos</button><button type="button" data-limpar>${o.cheio ? 'Desmarcar' : 'Limpar'}</button></div>
          <div class="rm-ms-lista">${o.op.length ? o.op.map(x => `<label class="${x.n ? '' : 'vazio'}"><input type="checkbox" value="${esc(x.v)}" ${o.sel.has(x.v) ? 'checked' : ''}>${x.cor ? `<i class="rm-ms-cor" style="--c:${x.cor}"></i>` : ''}<span>${esc(x.t)}</span><small>${x.n}</small></label>`).join('') : '<p class="rm-ms-nada">Sem opções</p>'}</div>
        </div>
      </div>`;
    }).join('') + (filtrosAtivos() ? '<button type="button" class="rm-ms-zerar" id="rm-zerar"><i data-lucide="x"></i>Limpar filtros</button>' : '');
  }
  // Valor da caixinha volta ao tipo certo (ano e mês são números)
  const valorFiltro = (k, v) => (k === 'ano' || k === 'mes' ? +v : v);
  const conjunto = k => (k === 'sit' ? estado.ativos : estado.f[k]);

  // Tabelas de Barrão e de Drone: UPs marcadas, agrupadas por fazenda na ordem de prioridade
  function renderMetodos() {
    const el = $('#rm-metodos'); if (!el) return;
    const semMarca = estado.calc.filter(u => visivelSemMetodo(u) && !metodos[u.chave]);
    el.innerHTML = Object.entries(METODOS).map(([k, x]) => {
      const ups = estado.calc.filter(u => metodos[u.chave] === k && visivelSemMetodo(u));
      const porFaz = new Map(); ups.forEach(u => (porFaz.get(u.fazenda) || porFaz.set(u.fazenda, []).get(u.fazenda)).push(u));
      const fazendas = ordemFazendas([...porFaz.entries()].map(([nome, l]) => ({ nome, vis: l.sort(ordenarUPs) })));
      const total = ups.reduce((t, u) => t + u.area, 0), urg = ups.filter(u => URGENTES.has(u.sit));
      return `<article class="rm-met-painel fat-painel glass" style="--c:${x.cor}">
        <header class="rm-met-topo"><span class="rm-met-ic"><i data-lucide="${x.icone}"></i></span><div><h3>${x.nome}</h3><small>${ups.length} UP${ups.length === 1 ? '' : 's'} · ${mono(ha(total))} ha${urg.length ? ` · <b>${urg.length} urgente${urg.length > 1 ? 's' : ''}</b>` : ''}</small></div></header>
        ${fazendas.length ? fazendas.map((f, i) => `<section class="rm-met-faz">
          <h4><span class="rm-seq-n" style="background:${SIT[f.vis[0].sit].cor}">${i + 1}º</span>${esc(f.nome)}<small>${f.vis.length} UP${f.vis.length > 1 ? 's' : ''} · ${mono(ha(f.vis.reduce((t, u) => t + u.area, 0)))} ha</small></h4>
          <table class="q-tab rm-tab rm-tab-mini"><thead><tr><th>UP</th><th class="num">Área (ha)</th><th>Remonta</th><th>Vencimento</th><th>Situação</th><th></th></tr></thead><tbody>${f.vis.map(u => `<tr style="--c:${SIT[u.sit].cor}">
            <td data-rotulo="UP"><span class="q-up">${esc(u.up)}</span>${atencao(u)}</td><td data-rotulo="Área (ha)" class="num">${mono(ha(u.area))}</td>
            <td data-rotulo="Remonta">${u.prox != null ? nomeRemonta(u.prox) : '—'}</td><td data-rotulo="Vencimento">${u.venc ? `<span class="rm-proxima" style="--c:${SIT[u.sit].cor}">${mono(dmy(u.venc))}</span>` : '—'}</td>
            <td data-rotulo="Situação"><span class="rm-selo" style="--c:${SIT[u.sit].cor}">${SIT[u.sit].nome}</span> <small class="rm-sit-txt">${textoSituacao(u)}</small></td>
            <td><button type="button" class="rm-tirar" data-met="${k}" data-chave="${esc(u.chave)}" title="Tirar desta tabela" aria-label="Tirar a UP ${esc(u.up)} da tabela ${x.nome}"><i data-lucide="x"></i></button></td></tr>`).join('')}</tbody></table>
        </section>`).join('') : `<p class="rm-vazio">Nenhuma UP marcada para ${x.nome.toLowerCase()} com esses filtros. Marque na coluna "Quem faz".</p>`}
      </article>`;
    }).join('') + (semMarca.length ? `<p class="rm-a-definir"><i data-lucide="circle-help"></i><b>${semMarca.length}</b> UP${semMarca.length > 1 ? 's' : ''} ainda sem Barrão ou Drone (${mono(ha(semMarca.reduce((t, u) => t + u.area, 0)))} ha).</p>` : '');
  }

  /* ---------- Eventos ---------- */
  $('#rm-param').addEventListener('input', e => {
    const k = e.target.name; if (!k) return;
    if (k === 'ref') par.ref = e.target.value && e.target.value !== iso(dia0(new Date())) ? e.target.value : '';
    else { const v = parseInt(e.target.value, 10); if (!Number.isFinite(v) || v < 0) return; par[k] = v; }
    salvar(); calcular(); render();
  });
  $('#rm-remontas').addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    const n = +b.dataset.r, sel = new Set((par.remontas || [1, 2, 3]).map(Number));
    if (b.dataset.r === 'todas') { par.remontas = [1, 2, 3]; }
    else { sel.has(n) ? sel.delete(n) : sel.add(n); par.remontas = sel.size ? [...sel].sort() : [1, 2, 3]; }   // clique marca ou desmarca (várias ao mesmo tempo)
    salvar(); calcular(); render();
  });
  $('#rm-hoje').addEventListener('click', () => { par.ref = ''; salvar(); calcular(); render(); });
  $('#rm-restaurar').addEventListener('click', () => { par = padrao(); salvar(); calcular(); render(); });
  $('#rm-atualizar').addEventListener('click', () => carregar(true));
  $('#rm-cards').addEventListener('click', e => {
    const b = e.target.closest('[data-sit]'); if (!b) return;
    const k = b.dataset.sit; estado.ativos.has(k) ? estado.ativos.delete(k) : estado.ativos.add(k);
    renderCards(); renderFiltros(); renderLista(); renderMetodos(); icones();
  });
  // Filtros de seleção múltipla: abrir/fechar, marcar, marcar todos, limpar
  const atualizarFiltros = () => { calcular(); render(); };
  const fecharFiltros = () => { estado.aberto = ''; renderFiltros(); icones(); };
  $('#rm-filtros').addEventListener('click', e => {
    if (e.target.closest('#rm-zerar')) { Object.values(estado.f).forEach(s => s.clear()); estado.ativos = new Set(ORDEM_CARDS); estado.aberto = ''; atualizarFiltros(); return; }
    const caixa = e.target.closest('.rm-ms'), k = caixa?.dataset.f; if (!k) return;
    if (e.target.closest('.rm-ms-bt')) { estado.aberto = estado.aberto === k ? '' : k; renderFiltros(); icones(); return; }
    const s = conjunto(k);
    if (e.target.closest('[data-todos]')) { $$('.rm-ms-lista input', caixa).forEach(i => s.add(valorFiltro(k, i.value))); atualizarFiltros(); }
    else if (e.target.closest('[data-limpar]')) { s.clear(); atualizarFiltros(); }
  });
  $('#rm-filtros').addEventListener('change', e => {
    const i = e.target.closest('.rm-ms-lista input'); if (!i) return;
    const k = i.closest('.rm-ms').dataset.f, s = conjunto(k), v = valorFiltro(k, i.value);
    i.checked ? s.add(v) : s.delete(v);
    atualizarFiltros();
  });
  // composedPath: o clique dentro do filtro redesenha a caixa, e o alvo já não está mais na página
  document.addEventListener('click', e => { if (estado.aberto && !e.composedPath().some(n => n.id === 'rm-filtros')) fecharFiltros(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && estado.aberto) fecharFiltros(); });
  let espera;
  // Quem faz: clicar marca; clicar de novo (ou no X das tabelas de Barrão/Drone) tira
  aba.addEventListener('click', e => {
    const b = e.target.closest('[data-met][data-chave]'); if (!b) return;
    const { met, chave } = b.dataset;
    if (metodos[chave] === met) delete metodos[chave]; else metodos[chave] = met;
    salvarMetodos(); renderLista(); renderMetodos(); icones();
  });
  // Ordenar pelo cabeçalho (vale para todas as tabelas de UPs)
  $('#rm-lista').addEventListener('click', e => {
    const b = e.target.closest('[data-ordem]'); if (!b) return;
    const k = b.dataset.ordem;
    estado.ordem = estado.ordem.k === k ? { k, dir: -estado.ordem.dir } : { k, dir: 1 };
    renderLista(); renderMetodos(); icones();
  });

  $('#rm-busca').addEventListener('input', e => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = e.target.value; renderFiltros(); renderLista(); renderMetodos(); icones(); }, 150); });
  $('.rm-visao').addEventListener('click', e => {
    const b = e.target.closest('[data-visao]'); if (!b) return;
    estado.visao = b.dataset.visao;
    $$('.rm-visao [data-visao]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    renderLista(); icones();
  });
  const irParaFazenda = e => {
    const b = e.target.closest('[data-ir]'); if (!b) return;
    if (estado.visao !== 'fazenda') $('.rm-visao [data-visao="fazenda"]').click();
    const alvo = document.getElementById(`rm-faz-${encodeURIComponent(b.dataset.ir)}`);
    if (!alvo) { estado.ativos = new Set(ORDEM_CARDS); estado.busca = ''; $('#rm-busca').value = ''; render(); }
    document.getElementById(`rm-faz-${encodeURIComponent(b.dataset.ir)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#rm-programar').addEventListener('click', irParaFazenda);
  $('#rm-lista').addEventListener('click', irParaFazenda);

  /* ---------- Início: só quando a aba é aberta (lê de novo a cada abertura da página) ---------- */
  function iniciar() { if (estado.iniciado) return; estado.iniciado = true; render(); carregar(); }
  document.addEventListener('producao:aba', e => { if (e.detail === 'remonta') iniciar(); });
  if (!aba.hidden) iniciar();
  // Contexto para o Folhito: situação das remontas e a ordem das fazendas na tela
  (window.SMA_CONTEXTO ||= {}).remonta = () => {
    if (aba.hidden || !estado.calc.length) return '';
    const cont = CARDS.map(k => { const l = estado.calc.filter(u => u.sit === k); return `${SIT[k].nome}: ${l.length} UPs (${ha(l.reduce((s, u) => s + u.area, 0))} ha)`; }).join('; ');
    const faz = ordemFazendas(estado.fazendas.map(f => ({ ...f, vis: f.ups.filter(u => URGENTES.has(u.sit) || u.sit === 'prazo').sort(ordenarUPs) })).filter(f => f.vis.length)).slice(0, 8)
      .map((f, i) => `${i + 1}º ${f.nome}: ${f.vis.slice(0, 4).map(u => `${u.up} ${nomeRemonta(u.prox)} ${dmy(u.venc)} (${SIT[u.sit].nome}${metodos[u.chave] ? `, ${METODOS[metodos[u.chave]].nome}` : ''})`).join(', ')}`).join('\n');
    const filtros = [['Ano', [...estado.f.ano]], ['Mês', [...estado.f.mes].map(m => MESES[m - 1])], ['Fazenda', [...estado.f.faz]]].filter(([, l]) => l.length).map(([n, l]) => `${n}: ${l.join(', ')}`).join('; ');
    return `Painel Controle de Remonta Pré-Emergente (data de referência ${dmy(refData())};${filtros ? ` filtros: ${filtros};` : ''} R1 ${par.r1} d após Pós+Pré, R2 ${par.r2} d, R3 ${par.r3} d; filtro de remonta: ${(par.remontas || [1, 2, 3]).join(', ')}).
${cont}.
Ordem sugerida das fazendas:
${faz || 'nenhuma com remonta pendente'}`;
  };
})();
