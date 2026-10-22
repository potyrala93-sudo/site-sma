/* ==========================================================================
   SMA · Silvicultura — Simulador de Janelas ARS (aba da Qualidade)
   A partir da data de plantio (Dia 0), calcula a data mínima e máxima de cada
   operação de pré-plantio, plantio e pós-plantio.
   ========================================================================== */

(() => {
  const raiz = document.getElementById('ars');
  if (!raiz) return;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Regras (dias corridos em relação ao Dia 0) ---------- */
  const FASES = {
    pre: { n: 1, nome: 'Pré-plantio', cor: '#c8f560' },
    plantio: { n: 2, nome: 'Plantio', cor: '#3dffa8' },
    pos: { n: 3, nome: 'Pós-plantio', cor: '#38bdf8' }
  };
  // aplica(e): a operação vale para as escolhas feitas · ref 'corte': conta a partir da data do corte
  const OPERACOES = [
    { id: 'precorte', fase: 'pre', nome: 'Formiga Pré-corte', icone: 'bug', min: -120, max: -10, ref: 'corte', obs: 'Relativo à data do corte. Operação mecanizada.' },
    { id: 'preinicial', fase: 'pre', nome: 'Formiga Pré-inicial', icone: 'bug', min: -120, max: -35 },
    { id: 'corretivo', fase: 'pre', nome: 'Corretivo', icone: 'layers', min: -90, max: 90, obs: 'Pode ocorrer antes ou depois do plantio.' },
    { id: 'dessecacao', fase: 'pre', nome: 'Dessecação', icone: 'leaf', min: -90, max: -30 },
    { id: 'fert-com', fase: 'pre', nome: 'Fertilização de base · com TUIT antes', icone: 'package', min: -30, max: -10, aplica: e => e.tuit === 'com', obs: 'Com TUIT aplicado antes, a fertilização encerra 10 dias antes do plantio. Respeite o intervalo de uso do TUIT.' },
    { id: 'fert-sem', fase: 'pre', nome: 'Fertilização de base · sem TUIT antes', icone: 'package', min: -30, max: 0, aplica: e => e.tuit === 'sem' },
    { id: 'emerg-com', fase: 'pre', nome: 'Pré/Pós-emergente (1ª monta) · com pós-emergente', icone: 'sprout', min: -15, max: -1, aplica: e => e.pos === 'com' },
    { id: 'emerg-sem', fase: 'pre', nome: 'Pré/Pós-emergente (1ª monta) · sem pós-emergente', icone: 'sprout', min: -15, max: 10, aplica: e => e.pos === 'sem' },
    { id: 'form-liq', fase: 'pre', nome: 'Combate à formiga · Líquido (monta)', icone: 'droplet', min: -20, max: -5, aplica: e => e.formiga === 'liquido', obs: 'Em caso de TUIT, combinar com o preparo: aplicar de 15 a 45 dias após a dessecação.' },
    { id: 'form-isca', fase: 'pre', nome: 'Combate à formiga · Isca I (1º repasse)', icone: 'bug', min: -10, max: 45, aplica: e => e.formiga === 'isca', obs: 'Alternativa ao líquido.' },
    { id: 'isca2', fase: 'pre', nome: 'Combate Isca I (2º repasse)', icone: 'bug', fora: true, semDatas: true, obs: 'Conforme necessidade. Fora do ARS.' },
    { id: 'plantio', fase: 'plantio', nome: 'Plantio', icone: 'trees', min: 0, max: 0, obs: 'Dia 0 = data informada.' },
    { id: 'fert-manual', fase: 'pos', nome: 'Fertilização manual de base', icone: 'hand', min: 0, max: 30, aplica: e => e.declivosa === 'sim', naoAplicaTxt: 'Só para áreas declivosas', obs: 'Somente áreas declivosas.' },
    { id: 'replantio', fase: 'pos', nome: 'Replantio', icone: 'shovel', min: 5, max: 45, obs: 'Repor as mudas falhadas dentro desta janela.' },
    { id: 'remonta-liq', fase: 'pos', nome: 'Combate líquido (remonta)', icone: 'droplet', min: 10, max: 40 },
    { id: 'remonta-pre', fase: 'pos', nome: 'Pré-emergente (remonta)', icone: 'sprout', min: 15, max: 60 },
    { id: 'trimonta', fase: 'pos', nome: 'Pré-emergente (trimonta)', icone: 'sprout', min: 40, max: null, fora: true, obs: 'Após 40 dias. Fora do ARS.' }
  ];

  /* ---------- Datas ---------- */
  const DIA = 864e5;
  const deISO = t => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], 12) : null; };
  const paraISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const somar = (d, n) => new Date(d.getTime() + n * DIA);
  const dias = (a, b) => Math.round((a - b) / DIA);
  const br = d => (d ? d.toLocaleDateString('pt-BR') : '—');
  const brCurto = d => (d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  const sinal = n => (n > 0 ? `+${n}` : String(n));
  const hoje = () => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; };

  /* ---------- Estado (fica salvo no navegador) ---------- */
  const CHAVE = 'ars:entradas';
  let e;
  try { e = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { e = null; }
  e = Object.assign({ plantio: paraISO(somar(hoje(), 30)), corte: '', ref: '', dessec: '', tuit: 'sem', pos: 'sem', formiga: 'liquido', declivosa: 'nao' }, e || {});
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch { /* sem armazenamento */ } };

  /* ---------- Cálculo ---------- */
  function calcular() {
    const d0 = deISO(e.plantio), corte = deISO(e.corte), ref = deISO(e.ref) || hoje();
    if (!d0) return { d0: null, ref, linhas: [] };
    const linhas = OPERACOES.map(op => {
      const aplica = !op.aplica || op.aplica(e);
      if (op.aplica && !aplica && !op.naoAplicaTxt) return null;   // alternativa não escolhida: não aparece
      const base = op.ref === 'corte' ? corte : d0;
      let ini = null, fim = null, status;
      if (!op.semDatas && base) { ini = somar(base, op.min); fim = op.max == null ? null : somar(base, op.max); }
      if (!aplica) status = 'Não se aplica';
      else if (op.fora) status = 'Fora do ARS';
      else if (!base) status = 'Sem data do corte';
      else status = ref < ini ? 'Aguardando' : ref <= fim ? 'Na janela' : 'Vencida';
      // posição na linha do tempo, sempre em dias a partir do plantio
      const dIni = ini ? dias(ini, d0) : null, dFim = fim ? dias(fim, d0) : null;
      return { op, ini, fim, dIni, dFim, status, aplica, duracao: ini && fim ? dias(fim, ini) + 1 : null };
    }).filter(Boolean);
    return { d0, ref, corte, linhas };
  }

  const CLASSE = { 'Aguardando': 'aguardando', 'Na janela': 'janela', 'Vencida': 'vencida', 'Fora do ARS': 'fora', 'Não se aplica': 'na', 'Sem data do corte': 'sem' };
  const ICONE_STATUS = { 'Aguardando': 'hourglass', 'Na janela': 'play', 'Vencida': 'alarm-clock-off', 'Fora do ARS': 'info', 'Não se aplica': 'minus', 'Sem data do corte': 'circle-help' };
  const selo = s => `<span class="ars-st ${CLASSE[s]}"><i data-lucide="${ICONE_STATUS[s]}"></i>${s}</span>`;

  /* ---------- Renderização ---------- */
  function render() {
    const r = calcular();
    renderEntradas(r);
    renderValidacoes(r);
    renderCards(r);
    renderGantt(r);
    renderTabela(r);
    icones();
  }

  function renderEntradas(r) {
    $('#ars-plantio').value = e.plantio; $('#ars-corte').value = e.corte; $('#ars-dessec').value = e.dessec;
    $('#ars-ref').value = e.ref || paraISO(hoje());
    $$('.ars-or').forEach(g => {
      const v = e[g.dataset.campo];
      $$('button', g).forEach((b, i) => { const at = b.dataset.valor === v; b.classList.toggle('ativo', at); b.setAttribute('aria-pressed', String(at)); if (at) g.classList.toggle('sem', i === 1); });
    });
    const rel = $('#ars-plantio-rel');
    if (!r.d0) { rel.innerHTML = '<b class="ars-erro">Informe a data de plantio</b>'; return; }
    const n = dias(r.d0, r.ref);
    rel.innerHTML = n > 0 ? `Faltam <b>${n} dias</b> para o plantio` : n < 0 ? `Plantio feito há <b>${-n} dias</b>` : '<b>O plantio é hoje!</b>';
  }

  function renderValidacoes(r) {
    const av = [];
    if (!r.d0) av.push({ t: 'erro', i: 'calendar-x', h: 'Informe a <b>data de plantio</b> (Dia 0) para calcular as janelas.' });
    if (!r.corte) av.push({ t: 'aviso', i: 'axe', h: 'Data do corte não informada: a <b>Formiga Pré-corte</b> fica sem cálculo.' });
    if (r.d0 && e.tuit === 'com') {
      const dess = deISO(e.dessec), iniFert = somar(r.d0, -30);
      if (!dess) av.push({ t: 'aviso', i: 'leaf', h: '<b>Com TUIT antes</b>: registre a data da <b>Dessecação</b>. TUIT + dessecante exige outro dessecante em menos de 45 dias e o formulário preenchido.' });
      else {
        const n = dias(iniFert, dess);
        av.push(n >= 45 || n < 0
          ? { t: 'erro', i: 'triangle-alert', h: `Regra dos 45 dias: a dessecação (${br(dess)}) está a <b>${Math.abs(n)} dias</b> do início da fertilização (${br(iniFert)}). Precisa ser menor que 45 dias.` }
          : { t: 'ok', i: 'badge-check', h: `Regra dos 45 dias atendida: dessecação ${n} dias antes do início da fertilização. Lembre de preencher o formulário.` });
      }
    }
    const passaram = r.linhas.filter(l => l.aplica && !l.op.fora && l.ini && r.ref > l.ini && l.op.id !== 'plantio');
    const vencidas = passaram.filter(l => l.status === 'Vencida');
    const abertas = passaram.filter(l => l.status === 'Na janela');
    if (vencidas.length) av.push({ t: 'erro', i: 'alarm-clock-off', h: `${vencidas.length} operação(ões) com a janela <b>vencida</b> em ${br(r.ref)}: ${vencidas.map(l => `<b>${escapar(l.op.nome)}</b> (até ${brCurto(l.fim)})`).join(', ')}.` });
    if (abertas.length) av.push({ t: 'aviso', i: 'hourglass', h: `A data mínima já passou e a janela segue aberta: ${abertas.map(l => `<b>${escapar(l.op.nome)}</b> (fecha em ${brCurto(l.fim)}, ${dias(l.fim, r.ref)} dia(s))`).join(', ')}.` });
    $('#ars-validacoes').innerHTML = av.map(a => `<p class="ars-val ${a.t}"><i data-lucide="${a.i}"></i><span>${a.h}</span></p>`).join('');
  }

  function renderCards(r) {
    const ativos = r.linhas.filter(l => l.aplica && !l.op.fora && l.ini);
    const cont = s => ativos.filter(l => l.status === s).length;
    const prox = ativos.filter(l => l.status === 'Aguardando' && dias(l.ini, r.ref) <= 7).length;
    $('#ars-k-plantio').textContent = r.d0 ? br(r.d0) : '—';
    $('#ars-k-plantio-sub').textContent = r.d0 ? r.d0.toLocaleDateString('pt-BR', { weekday: 'long' }) + ` · referência ${br(r.ref)}` : 'informe a data';
    $('#ars-k-janela').textContent = cont('Na janela');
    $('#ars-k-vencidas').textContent = cont('Vencida');
    $('#ars-k-proximas').textContent = prox;
    // Fundo da página: vermelho se há vencidas, amarelo se algo abre em 7 dias, verde se em dia
    const cor = cont('Vencida') ? '#ff4d5e' : prox ? '#ffc83d' : '#22e07a';
    raiz.dataset.cor = cor;
    if (!$('#aba-ars').hidden) pintarFundo(cor);
  }

  function renderGantt(r) {
    const el = $('#ars-gantt');
    if (!r.d0) { el.innerHTML = '<p class="vazio">Informe a data de plantio.</p>'; return; }
    const refDia = dias(r.ref, r.d0);
    const pontos = r.linhas.flatMap(l => [l.dIni, l.dFim]).filter(v => v != null);
    const lo = Math.floor((Math.min(-120, refDia, ...pontos) - 5) / 15) * 15;
    const hi = Math.ceil((Math.max(90, refDia, ...pontos) + 5) / 15) * 15;
    const pct = d => ((d - lo) / (hi - lo)) * 100;
    const passo = hi - lo > 300 ? 30 : 15;
    const ticks = []; for (let d = lo; d <= hi; d += passo) ticks.push(d);

    const eixo = cls => `<div class="ars-g-eixo ${cls}"><span class="ars-g-lab"></span><div class="ars-g-trilha">${ticks.map(d => `<span style="left:${pct(d)}%" class="${d === 0 ? 'zero' : ''}">${d === 0 ? 'Dia 0' : sinal(d)}</span>`).join('')}</div></div>`;
    let html = eixo('');
    for (const f of Object.keys(FASES)) {
      const linhas = r.linhas.filter(l => l.op.fase === f);
      html += `<div class="ars-g-fase" style="--c:${FASES[f].cor}"><b>${FASES[f].n}</b>${FASES[f].nome}</div>`;
      html += linhas.map(l => {
        const c = CLASSE[l.status];
        let barra = '';
        if (l.op.semDatas) barra = `<span class="ars-g-txt" style="left:2%">Conforme necessidade · fora do ARS</span>`;
        else if (l.dIni == null) barra = `<span class="ars-g-txt" style="left:2%">Informe a data do corte</span>`;
        else if (l.op.id === 'plantio') barra = `<span class="ars-g-dia0" style="left:${pct(0)}%" title="Plantio · ${br(r.d0)}"><i data-lucide="sprout"></i></span><span class="ars-g-rot fora-barra" style="left:calc(${pct(0)}% + 20px)">${br(r.d0)}</span>`;
        else {
          const a = pct(l.dIni), b = l.dFim == null ? 100 : pct(l.dFim);
          const w = Math.max(b - a, .8);
          const rot = `${brCurto(l.ini)} → ${l.fim ? brCurto(l.fim) : 'sem limite'}`;
          const dentro = w > 13;
          barra = `<span class="ars-g-barra ${l.op.fora ? 'fora' : ''} ${l.dFim == null ? 'aberta' : ''}" style="left:${a}%;width:${w}%" title="${escapar(l.op.nome)}: ${br(l.ini)} a ${l.fim ? br(l.fim) : 'sem limite'} (${sinal(l.dIni)} a ${l.dFim == null ? '…' : sinal(l.dFim)} dias)">${dentro ? `<span class="ars-g-rot">${rot}</span>` : ''}</span>${dentro ? '' : `<span class="ars-g-rot fora-barra" style="left:calc(${Math.min(a + w, 86)}% + 6px)">${rot}</span>`}`;
        }
        return `<div class="ars-g-linha st-${c} ${l.aplica ? '' : 'nao-aplica'}" style="--c:${l.op.fora || !l.aplica ? '#94a3b8' : FASES[f].cor}">
          <span class="ars-g-lab"><i data-lucide="${l.op.icone}"></i><span>${escapar(l.op.nome)}</span><em class="ars-g-ponto ${c}" title="${l.status}"></em></span>
          <div class="ars-g-trilha">${barra}</div></div>`;
      }).join('');
    }
    html += eixo('base');
    html += `<div class="ars-g-marcas" aria-hidden="true"><span class="m-zero" style="left:${pct(0)}%"></span><span class="m-ref" style="left:${pct(refDia)}%"><em>${refDia === 0 ? 'Hoje = Dia 0' : `Ref. ${brCurto(r.ref)}`}</em></span></div>`;
    el.innerHTML = html;
  }

  function renderTabela(r) {
    const el = $('#ars-tabela');
    if (!r.d0) { el.innerHTML = '<p class="vazio">Informe a data de plantio.</p>'; return; }
    el.innerHTML = `<table class="q-tab ars-tab">
      <thead><tr><th>Fase</th><th>Operação</th><th>Data mínima</th><th>Data máxima</th><th>Duração</th><th>Status</th></tr></thead>
      <tbody>${r.linhas.map(l => `<tr class="st-${CLASSE[l.status]}">
        <td data-rotulo="Fase"><span class="ars-fase" style="--c:${FASES[l.op.fase].cor}">${FASES[l.op.fase].n} · ${FASES[l.op.fase].nome}</span></td>
        <td data-rotulo="Operação"><span class="ars-op"><i data-lucide="${l.op.icone}"></i><span><b>${escapar(l.op.nome)}</b>${l.op.obs ? `<small>${escapar(l.op.obs)}</small>` : ''}</span></span></td>
        <td data-rotulo="Data mínima">${l.ini ? `<b>${br(l.ini)}</b><small>${sinal(l.dIni)} d</small>` : '—'}</td>
        <td data-rotulo="Data máxima">${l.fim ? `<b>${br(l.fim)}</b><small>${sinal(l.dFim)} d</small>` : l.ini ? 'sem limite' : '—'}</td>
        <td data-rotulo="Duração">${l.duracao ? `${l.duracao} dia${l.duracao > 1 ? 's' : ''}` : '—'}</td>
        <td data-rotulo="Status">${selo(l.status)}</td></tr>`).join('')}</tbody></table>`;
  }

  /* ---------- Eventos ---------- */
  const campos = { 'ars-plantio': 'plantio', 'ars-corte': 'corte', 'ars-ref': 'ref', 'ars-dessec': 'dessec' };
  Object.entries(campos).forEach(([id, k]) => $(`#${id}`).addEventListener('change', ev => {
    e[k] = ev.target.value;
    if (k === 'ref' && e.ref === paraISO(hoje())) e.ref = '';   // referência = hoje continua acompanhando o dia
    salvar(); render();
  }));
  $$('.ars-or').forEach(g => g.addEventListener('click', ev => { const b = ev.target.closest('button[data-valor]'); if (!b) return; e[g.dataset.campo] = b.dataset.valor; salvar(); render(); }));

  // Exportar e imprimir
  const CAB = ['Fase', 'Operação', 'Data mínima', 'Data máxima', 'Dias (mín.)', 'Dias (máx.)', 'Duração (dias)', 'Status', 'Observação'];
  const linhasExp = () => { const r = calcular(); return { r, l: r.linhas.map(l => [FASES[l.op.fase].nome, l.op.nome, br(l.ini), l.fim ? br(l.fim) : (l.ini ? 'sem limite' : '—'), l.dIni ?? '', l.dFim ?? '', l.duracao ?? '', l.status, l.op.obs || '']) }; };
  const nomeArq = r => `Janelas_ARS_plantio_${r.d0 ? paraISO(r.d0) : 'sem-data'}`;
  function baixar(conteudo, tipo, nome) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo })); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#ars-csv').addEventListener('click', () => {
    const { r, l } = linhasExp(); const cel = v => `"${String(v).replace(/"/g, '""')}"`;
    baixar([`${cel('Data de plantio (Dia 0)')};${cel(br(r.d0))}`, `${cel('Data de referência')};${cel(br(r.ref))}`, '', CAB.map(cel).join(';'), ...l.map(x => x.map(cel).join(';'))].join('\r\n'), 'text/csv;charset=utf-8', nomeArq(r) + '.csv');
  });
  $('#ars-xls').addEventListener('click', () => {
    const { r, l } = linhasExp();
    const html = `<html><head><meta charset="utf-8"></head><body><table border="1">
      <tr><th colspan="9" style="background:#0b3b2e;color:#fff;font-size:14pt">Simulador de Janelas ARS · Plantio (Dia 0): ${br(r.d0)} · referência ${br(r.ref)}</th></tr>
      <tr>${CAB.map(c => `<th style="background:#1f6f54;color:#fff">${c}</th>`).join('')}</tr>
      ${l.map(x => `<tr>${x.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    baixar(html, 'application/vnd.ms-excel;charset=utf-8', nomeArq(r) + '.xls');
  });
  $('#ars-imprimir').addEventListener('click', () => {
    document.body.classList.add('imprimindo-ars');
    const fim = () => { document.body.classList.remove('imprimindo-ars'); window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    window.print();
    setTimeout(fim, 1500);
  });

  // Imagem das métricas do ARS
  const zoom = $('#ars-zoom');
  $('#ars-img-abrir').addEventListener('click', () => { zoom.hidden = false; $('#ars-zoom-fechar').focus(); });
  const fechar = () => { zoom.hidden = true; };
  $('#ars-zoom-fechar').addEventListener('click', fechar);
  zoom.addEventListener('click', ev => { if (ev.target === zoom) fechar(); });
  document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !zoom.hidden) fechar(); });

  /* ---------- Abas da página de Qualidade ---------- */
  const SUB = {
    '120': 'Notas das avaliações de campo, uniformidade das mudas em cada parcela e a nota projetada do mês, direto da planilha.',
    'ars': 'Informe a data de plantio e veja a data mínima e máxima de cada operação do ARS, com status e linha do tempo.',
    'prontuario': 'A ficha completa de cada UP: tudo o que foi apontado, o plantio, as equipes, o clima de cada atividade e uma análise.',
    'n1': 'Entrega de N1: confira se cada atividade realizada no RF tem a UP registrada na base de qualidade correspondente.',
    'relatorio': 'Relatório técnico de qualidade: registre os pontos encontrados na UP com fotos e observações; a IA complementa e você ajusta antes de salvar e imprimir.'
  };
  const ABAS = ['120', 'ars', 'prontuario', 'n1', 'relatorio'];
  function pintarFundo(cor) { document.body.style.setProperty('--ader-cor', cor); document.body.style.setProperty('--ader-cor-suave', cor + '4d'); }
  function abrirAba(aba, trocarHash = true) {
    if (!ABAS.includes(aba)) aba = '120';
    const ars = aba === 'ars';
    ABAS.forEach(a => { const el = $(`#aba-${a}`); if (el) el.hidden = a !== aba; });
    $$('.q-abas [data-aba]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.aba === aba)));
    $('.q-abas').style.setProperty('--i', ABAS.indexOf(aba));
    $('#q-sub').textContent = SUB[aba];
    if (ars) { render(); pintarFundo(raiz.dataset.cor || '#22e07a'); }
    document.dispatchEvent(new CustomEvent('qual:aba', { detail: aba }));
    // o prontuário guarda a UP aberta no endereço (?up=...) para compartilhar o link
    if (trocarHash) history.replaceState(null, '', aba === '120' ? location.pathname : `${aba === 'prontuario' ? location.search : location.pathname}#${aba}`);
  }
  window.SMA_QUALIDADE_ABA = abrirAba;
  $('.q-abas').addEventListener('click', ev => { const b = ev.target.closest('[data-aba]'); if (b) abrirAba(b.dataset.aba); });
  $('.q-abas').addEventListener('keydown', ev => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const i = ABAS.indexOf($$('.q-abas [data-aba]').find(b => b.getAttribute('aria-selected') === 'true')?.dataset.aba);
    const alvo = ABAS[(i + (ev.key === 'ArrowRight' ? 1 : ABAS.length - 1)) % ABAS.length];
    $(`.q-abas [data-aba="${alvo}"]`).focus(); abrirAba(alvo);
  });
  render();
  if (location.hash === '#ars') abrirAba('ars', false);
  else if (location.hash === '#n1') abrirAba('n1', false);
  else if (location.hash === '#relatorio') abrirAba('relatorio', false);
  else if (location.hash === '#prontuario' || new URLSearchParams(location.search).has('up')) abrirAba('prontuario', false);
})();
