/* ==========================================================================
   SMA · Silvicultura — Segurança · Inspeções TERMAC
   Planilha "Vencimento das Inspeções TERMAC" (JFI Serviços).
   Atualizar: botão "Atualizar com imagem" → a IA do servidor lê a foto da planilha
   (/api/termac/ler) → a tabela aparece para conferir/corrigir → "Salvar" guarda para todos
   (/api/termac). Sem IA, "Editar dados" abre a mesma tabela para digitar.
   A situação segue o status da própria planilha (não é recalculada pela data):
     Vencido   → Validade = Vencido
     Reprovado → Resultado = Reprovado (mesmo com validade em dia)
     Atenção   → Validade = Atenção! e Resultado = Aprovado
     Liberado  → Validade = Válido e Resultado = Aprovado
   Bloqueado = Vencido + Reprovado (não deve operar).
   ========================================================================== */

(() => {
  const raiz = document.getElementById('aba-termac');
  if (!raiz) return;

  // Planilha de 26/10/2026 (usada enquanto nada novo for salvo)
  const PADRAO = {
    planilha: { unidade: 'São Miguel Arcanjo', tst: 'Glaucia Ferreira', data: '2026-10-26' },
    linhas: [
      ['428', 'Caminhão', 'FGP1J98', 'SMA', '2026-10-28', 'Atenção!', 'Aprovado', '-'],
      ['431', 'Munck', 'BZA0H55', 'SMA', '2027-01-21', 'Válido', 'Reprovado', 'Eucatex'],
      ['-', 'Munck', 'RVX1D77', 'SMA', '2026-11-03', 'Atenção!', 'Aprovado', '-'],
      ['-', 'Munck', 'RVP7J58', 'SMA', '2026-11-09', 'Atenção!', 'Aprovado', '-'],
      ['-', 'Caminhão de Apoio PIPA', 'QST4H55', 'SMA', '2026-11-03', 'Atenção!', 'Aprovado', '-'],
      ['-', 'Apoio', 'ELO5G93', 'SMA', '2027-01-21', 'Válido', 'Reprovado', 'Manutenção'],
      ['Alugado', 'Munck', 'SFK1B13', 'SMA', '2026-12-29', 'Válido', 'Reprovado', 'Manutenção'],
      ['-', 'Comboio', 'RVI8H39', 'SMA', '2026-11-11', 'Atenção!', 'Aprovado', '-'],
      ['-', 'Pipa', 'RTZ7C20', 'SMA', '2026-12-09', 'Válido', 'Aprovado', '-'],
      ['-', 'Caminhão', 'RUZ9B58', 'SMA', '2026-11-11', 'Atenção!', 'Aprovado', '-'],
      ['305', 'Pipa', 'ERF0G52', 'SMA', '2025-05-14', 'Vencido', 'Vencido', 'Manutenção SMA - modificar para ter carroceria'],
      ['425', 'Caminhão', 'GDI5A15', 'SMA', '2026-08-26', 'Vencido', 'Vencido', 'Reforma até 2027'],
      ['-', 'Caminhão Suplementar', 'TLH5J49', 'SMA', '2026-11-21', 'Atenção!', 'Reprovado', 'Manutenção'],
      ['-', 'Caminhão Suplementar', 'GGL2E04', 'SMA', '2026-11-18', 'Atenção!', 'Aprovado', '-'],
      ['-', 'Caminhão de Apoio', 'SVI4H85', 'SMA', '2026-12-28', 'Válido', 'Aprovado', 'Eucatex'],
      ['497', 'Caminhão Prancha', 'URJ1F92', 'SMA', '2027-01-05', 'Válido', 'Aprovado', '-'],
      ['TRA 392', 'Trator', '7200J', 'SMA', '2026-11-09', 'Atenção!', 'Aprovado', '-'],
      ['TRA 393', 'Trator', '7200J', 'SMA', '2026-11-09', 'Atenção!', 'Aprovado', '-'],
      ['TRA 511', 'Trator', '6150J', 'SMA', '2027-01-18', 'Válido', 'Aprovado', 'Eucatex'],
      ['TRA 395', 'Trator', '6150J', 'SMA', '2026-11-04', 'Atenção!', 'Aprovado', '-'],
      ['TRA 563', 'Trator', '6150J', 'SMA', '2026-11-16', 'Atenção!', 'Aprovado', 'Eucatex'],
      ['TRA 498', 'Trator', '6150J', 'SMA', '2026-11-12', 'Atenção!', 'Aprovado', 'Eucatex'],
      ['TRA 441', 'Trator', '6150J', 'SMA', '2026-12-12', 'Válido', 'Aprovado', '-'],
      ['TRA 490', 'Trator', '6150J', 'SMA', '2026-12-14', 'Válido', 'Aprovado', 'Eucatex'],
      ['IMP0203', 'Implemento/Ripper', '-', 'SMA', '2026-01-26', 'Vencido', 'Vencido', 'Manutenção reforma'],
      ['IMP5356', 'Implemento/Multiuso', '-', 'SMA', '2026-11-23', 'Atenção!', 'Aprovado', 'Eucatex'],
      ['IMP5528', 'Implemento/Multiuso', '-', 'SMA', '2026-05-13', 'Vencido', 'Vencido', 'Parado em Santa Elisa'],
      ['IMP5530', 'Implemento/Ripper', '-', 'SMA', '2026-06-02', 'Vencido', 'Vencido', 'Manutenção'],
      ['IMP5628', 'Implemento/Ripper', '-', 'SMA', '2027-01-18', 'Válido', 'Aprovado', 'Eucatex'],
      ['IMP5616', 'Implemento/Ripper', '-', 'SMA', '2026-10-13', 'Vencido', 'Vencido', 'Manutenção'],
      ['IMP5610', 'Implemento/Multiuso', '-', 'SMA', '2026-11-23', 'Atenção!', 'Aprovado', '-'],
      ['IMP5645', 'Implemento/Multiuso', '-', 'SMA', '2026-10-26', 'Atenção!', 'Aprovado', '-'],
      ['IMP0036', 'Implemento/Multiuso', '-', 'SMA', '2026-10-14', 'Vencido', 'Vencido', 'Manutenção'],
      ['IMP5201', 'Implemento/Subsolador', '-', 'SMA', '2026-12-14', 'Válido', 'Aprovado', 'Eucatex'],
      ['1104', 'Reserva', 'AUA3H02', 'SMA', '2026-12-17', 'Válido', 'Aprovado', '-'],
      ['1015', 'Thomaz', 'ASZ9I12', 'SMA', '2027-01-01', 'Válido', 'Aprovado', '-'],
      ['1215', 'Thomaz', 'AVX4I00', 'SMA', '2026-11-18', 'Atenção!', 'Aprovado', '-'],
      ['1016', 'Thomaz', 'ASZ9I10', 'SMA', '2026-11-30', 'Válido', 'Aprovado', '-']
    ].map(([frota, tipo, placa, regional, venc, validade, resultado, obs]) => ({ frota, tipo, placa, regional, venc, validade, resultado, obs })),
    atualizado: null
  };

  /* ---------- Regras ---------- */
  const SIT = {
    vencido: { nome: 'Vencido', cor: '#dc2626', icone: 'octagon-x' },
    reprovado: { nome: 'Reprovado', cor: '#f87171', icone: 'circle-x' },
    atencao: { nome: 'Atenção', cor: '#f59e0b', icone: 'triangle-alert' },
    liberado: { nome: 'Liberado', cor: '#22c55e', icone: 'circle-check' }
  };
  const ORDEM = ['vencido', 'reprovado', 'atencao', 'liberado'];
  const PLURAL = { vencido: 'vencidos', reprovado: 'reprovados', atencao: 'em atenção', liberado: 'liberados' };
  const UM = { vencido: 'vencido', reprovado: 'reprovado', atencao: 'em atenção', liberado: 'liberado' };
  const situacao = (validade, resultado) =>
    /vencid/i.test(validade) ? 'vencido' : /reprovad/i.test(resultado) ? 'reprovado' : /aten/i.test(validade) ? 'atencao' : 'liberado';
  const CATEGORIAS = ['Caminhões e apoio', 'Munck', 'Tratores', 'Implementos', 'Thomaz'];
  const categoria = tipo => (/^Implemento/i.test(tipo) ? 'Implementos' : /Munck/i.test(tipo) ? 'Munck' : /Trator/i.test(tipo) ? 'Tratores' : /Thomaz/i.test(tipo) ? 'Thomaz' : 'Caminhões e apoio');

  /* ---------- Ajudantes ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataBR = iso => { if (!iso) return '—'; const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${a}`; };
  const hojeISO = () => new Date().toLocaleDateString('sv-SE');
  const diasAte = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 864e5);
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const icones = () => window.lucide?.createIcons();
  const nomeItem = it => (it.frota !== '-' && !/alugad/i.test(it.frota) ? it.frota : it.placa);
  // dias até vencer, em texto e com o tom do destaque
  const dias = it => {
    const d = diasAte(it.venc);
    if (d < 0) return { d, txt: `venceu há ${-d} ${-d === 1 ? 'dia' : 'dias'}`, tom: 'vencido' };
    if (d === 0) return { d, txt: 'vence hoje', tom: 'hoje' };
    return { d, txt: `faltam ${d} ${d === 1 ? 'dia' : 'dias'}`, tom: d <= 7 ? 'perto' : d <= 30 ? 'mes' : 'longe' };
  };
  const pilula = k => `<span class="t-sit" style="--c:${SIT[k].cor}"><i data-lucide="${SIT[k].icone}"></i>${SIT[k].nome}</span>`;
  const placaTxt = it => (it.modelo ? `${esc(it.placa)} <small class="t-mod">modelo</small>` : esc(it.placa));

  /* ---------- Estado ---------- */
  const estado = { dados: PADRAO, origem: 'padrao', onde: '', ia: false, filtro: '', busca: '', ord: { col: 'prio', dir: 1 }, mesCal: hojeISO().slice(0, 7) };
  let itens = [];
  function montarItens() {
    itens = estado.dados.linhas.map((l, i) => ({
      ...l, n: i + 1, sit: situacao(l.validade, l.resultado), cat: categoria(l.tipo),
      modelo: /^TRA/i.test(l.frota) && /^\d{4}J$/i.test(l.placa)   // nos tratores a coluna "Placa" traz o modelo (7200J, 6150J)
    }));
  }
  const conta = k => itens.filter(it => it.sit === k).length;
  const P = () => estado.dados.planilha;

  /* ---------- Cabeçalho, resumo e KPIs ---------- */
  function topo() {
    const v = conta('vencido'), r = conta('reprovado'), a = conta('atencao'), l = conta('liberado');
    const fonte = estado.origem === 'servidor' ? `atualizada em ${new Date(estado.dados.atualizado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
      : estado.origem === 'navegador' ? 'salva só neste navegador' : 'planilha transcrita no site';
    $('#t-cab-txt').innerHTML = `<span class="eyebrow">JFI Serviços · TERMAC</span><h2 class="fat-sec-titulo">Inspeções TERMAC · <span class="serif">${esc(P().unidade)}</span></h2>
      <p class="t-cab-info"><span><i data-lucide="hard-hat"></i>TST responsável: <b>${esc(P().tst)}</b></span><span><i data-lucide="calendar"></i>Planilha de <b>${dataBR(P().data)}</b></span><span><i data-lucide="database"></i>${fonte}</span></p>`;
    $('#t-resumo').innerHTML = `<i data-lucide="shield-alert"></i><p><b>${v + r} de ${itens.length}</b> equipamentos estão <b class="t-bloq">bloqueados</b> (${v} vencidos, ${r} reprovados); <b class="t-aten">${a} em atenção</b>.</p>`;
    const cards = [['', 'Total', itens.length, 'equipamentos na planilha', '#3dffa8', 'list'], ['vencido', 'Vencidos', v, 'não operar', SIT.vencido.cor, SIT.vencido.icone],
      ['reprovado', 'Reprovados', r, 'não operar', SIT.reprovado.cor, SIT.reprovado.icone], ['atencao', 'Atenção', a, 'renovar a inspeção', SIT.atencao.cor, SIT.atencao.icone],
      ['liberado', 'Liberados', l, 'válidos e aprovados', SIT.liberado.cor, SIT.liberado.icone]];
    $('#t-kpis').innerHTML = cards.map(([k, rot, val, aj, cor, ic]) => `<button type="button" class="kpi glass t-kpi${estado.filtro === k ? ' ativo' : ''}${k && k !== 'liberado' && val ? ' t-alerta' : ''}" data-filtro="${k}" style="--c:${cor}" title="Mostrar na tabela">
        <span class="icon-box"><i data-lucide="${ic}"></i></span><span class="kpi-rot">${rot}</span><strong class="kpi-val">${val}</strong><small class="kpi-ajuda">${aj}${val && k ? ` · ${Math.round(val / itens.length * 100)}%` : ''}</small></button>`).join('');
  }

  /* ---------- Destaque: o que precisa de ação, com os dias ---------- */
  function destaques() {
    const grupos = [
      { k: 'vencido', titulo: 'Vencidos', sub: 'não operar' },
      { k: 'reprovado', titulo: 'Reprovados', sub: 'não operar' },
      { k: 'atencao', titulo: 'Atenção', sub: 'renovar a inspeção' }
    ].map(g => ({ ...g, l: itens.filter(it => it.sit === g.k).sort((a, b) => a.venc.localeCompare(b.venc)) }));
    $('#t-dest').innerHTML = grupos.map(g => `<article class="t-dest glass t-dest-${g.k}" style="--c:${SIT[g.k].cor}">
        <header><i data-lucide="${SIT[g.k].icone}"></i><b>${g.titulo}</b><span>${g.l.length}</span><small>${g.sub}</small></header>
        ${g.l.length ? `<ul>${g.l.map(it => { const d = dias(it); return `<li><button type="button" data-ir="${esc(nomeItem(it))}"><span class="t-dest-nome"><b>${esc(nomeItem(it))}</b><small>${esc(it.tipo)}${it.obs !== '-' ? ` · ${esc(it.obs)}` : ''}</small></span><span class="t-dias t-dias-${d.tom}">${esc(d.txt)}</span></button></li>`; }).join('')}</ul>` : '<p class="t-dest-vazio">Nenhum.</p>'}
      </article>`).join('');
  }

  /* ---------- Gráficos ---------- */
  const graficos = {}, configs = {};
  // rótulos de dados: número dentro de cada pedaço e o total no topo
  const rotulos = {
    id: 'tRotulos',
    afterDatasetsDraw(chart, _a, op) {
      const { ctx } = chart, cor = op?.cor || getComputedStyle(document.documentElement).getPropertyValue('--texto-forte').trim() || '#e6fff5';
      ctx.save(); ctx.font = '800 11.5px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((ds, di) => {
        if (!chart.isDatasetVisible(di)) return;
        chart.getDatasetMeta(di).data.forEach((el, i) => {
          const v = ds.data[i]; if (!v || Math.abs(el.base - el.y) < 12) return;
          ctx.fillStyle = '#1a1205'; ctx.fillText(v, el.x, (el.y + el.base) / 2);
        });
      });
      chart.data.labels.forEach((_l, i) => {
        let soma = 0, ponta = null;
        chart.data.datasets.forEach((ds, di) => { if (!chart.isDatasetVisible(di) || !ds.data[i]) return; soma += ds.data[i]; const el = chart.getDatasetMeta(di).data[i]; if (!ponta || el.y < ponta.y) ponta = el; });
        if (soma && ponta) { ctx.fillStyle = cor; ctx.fillText(soma, ponta.x, ponta.y - 11); }
      });
      ctx.restore();
    }
  };
  function configEmpilhado(labels, porRotulo) {
    return {
      type: 'bar',
      data: { labels, datasets: ORDEM.map(k => ({ label: SIT[k].nome, data: labels.map((_l, i) => porRotulo(i).filter(it => it.sit === k).length), backgroundColor: `${SIT[k].cor}d9`, borderColor: SIT[k].cor, borderWidth: 1.5, borderRadius: 5, maxBarThickness: 56 })) },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, padding: 14 } }, tooltip: { backgroundColor: 'rgba(4,18,17,.95)', borderColor: 'rgba(61,255,168,.4)', borderWidth: 1, padding: 12, cornerRadius: 12 } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
      plugins: [rotulos]
    };
  }
  const mesesDados = () => [...new Set(itens.map(it => it.venc.slice(0, 7)))].sort();
  function desenharGraficos() {
    const C = window.Chart; if (!C) return;
    C.defaults.color = '#9fb9b3'; C.defaults.font.family = 'Manrope, sans-serif'; C.defaults.font.weight = 600; C.defaults.borderColor = 'rgba(255,255,255,.06)';
    const meses = mesesDados();
    configs['t-g-cat'] = configEmpilhado(CATEGORIAS, i => itens.filter(it => it.cat === CATEGORIAS[i]));
    configs['t-g-mes'] = configEmpilhado(meses.map(m => `${MESES[+m.slice(5) - 1]}/${m.slice(2, 4)}`), i => itens.filter(it => it.venc.startsWith(meses[i])));
    ['t-g-cat', 't-g-mes'].forEach(id => { graficos[id]?.destroy(); graficos[id] = new C(document.getElementById(id), configs[id]); });
  }

  /* ---------- Calendário ---------- */
  function gradeMes(mes, chip) {
    const [a, m] = mes.split('-').map(Number);
    const desloc = (new Date(a, m - 1, 1).getDay() + 6) % 7, nDias = new Date(a, m, 0).getDate();
    const celulas = [];
    for (let i = 0; i < desloc; i++) celulas.push('<div class="t-cal-dia vazio"></div>');
    for (let d = 1; d <= nDias; d++) {
      const iso = `${mes}-${String(d).padStart(2, '0')}`, l = itens.filter(it => it.venc === iso).sort((x, y) => ORDEM.indexOf(x.sit) - ORDEM.indexOf(y.sit));
      const fds = [5, 6].includes((desloc + d - 1) % 7);
      celulas.push(`<div class="t-cal-dia${iso === hojeISO() ? ' hoje' : ''}${iso < hojeISO() ? ' passou' : ''}${fds ? ' fds' : ''}${l.length ? ' tem' : ''}"><span class="t-cal-num">${d}</span>${l.map(chip).join('')}</div>`);
    }
    return `<div class="t-cal">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(x => `<span class="t-cal-sem">${x}</span>`).join('')}${celulas.join('')}</div>`;
  }
  function calendario() {
    const mes = estado.mesCal, [a, m] = mes.split('-').map(Number);
    const doMes = itens.filter(it => it.venc.startsWith(mes));
    $('#t-cal-nav').innerHTML = `<button type="button" class="fat-btn" data-cal="-1" aria-label="Mês anterior"><i data-lucide="chevron-left"></i></button>
      <strong>${MESES_LONGOS[m - 1]} ${a}</strong>
      <button type="button" class="fat-btn" data-cal="1" aria-label="Próximo mês"><i data-lucide="chevron-right"></i></button>
      <button type="button" class="fat-btn" data-cal="hoje"><i data-lucide="calendar-check"></i><span>Hoje</span></button>
      <span class="t-cal-resumo">${doMes.length ? ORDEM.filter(k => doMes.some(it => it.sit === k)).map(k => `<span style="--c:${SIT[k].cor}"><i></i>${doMes.filter(it => it.sit === k).length} ${doMes.filter(it => it.sit === k).length === 1 ? UM[k] : PLURAL[k]}</span>`).join('') : 'nenhum vencimento neste mês'}</span>`;
    $('#t-cal-meses').innerHTML = mesesDados().map(k => { const n = itens.filter(it => it.venc.startsWith(k)), ruim = n.some(it => it.sit === 'vencido' || it.sit === 'reprovado'); return `<button type="button" data-mes="${k}" class="${k === mes ? 'ativo' : ''}${ruim ? ' ruim' : ''}">${MESES[+k.slice(5) - 1]}/${k.slice(2, 4)} <b>${n.length}</b></button>`; }).join('');
    $('#t-cal').innerHTML = gradeMes(mes, it => { const d = dias(it); return `<button type="button" class="t-cal-item" data-ir="${esc(nomeItem(it))}" style="--c:${SIT[it.sit].cor}" title="${esc(`${nomeItem(it)} · ${it.tipo} · ${SIT[it.sit].nome} · ${d.txt}${it.obs !== '-' ? ` · ${it.obs}` : ''}`)}"><b>${esc(nomeItem(it))}</b><small>${esc(it.tipo)}</small></button>`; });
  }

  /* ---------- Tabela completa ---------- */
  const COLS = [{ t: 'Frota', n: 'frota' }, { t: 'Tipo', n: 'tipo' }, { t: 'Placa', n: 'placa' }, { t: 'Regional', n: 'regional' }, { t: 'Vencimento', n: 'venc' }, { t: 'Dias', n: 'venc' }, { t: 'Validade', n: 'validade' }, { t: 'Resultado', n: 'resultado' }, { t: 'Situação', n: 'prio' }, { t: 'Observações', n: 'obs' }];
  const porPrioridade = (a, b) => ORDEM.indexOf(a.sit) - ORDEM.indexOf(b.sit) || a.venc.localeCompare(b.venc);
  function completa() {
    const q = semAcento(estado.busca).trim();
    const { col, dir } = estado.ord;
    const l = itens.filter(it => (!estado.filtro || it.sit === estado.filtro) && (!q || q.split(/\s+/).every(t => semAcento([it.frota, it.tipo, it.placa, it.regional, dataBR(it.venc), it.validade, it.resultado, SIT[it.sit].nome, it.obs, it.cat].join(' ')).includes(t))))
      .sort((a, b) => (col === 'prio' ? porPrioridade(a, b) : String(a[col]).localeCompare(String(b[col]), 'pt-BR', { numeric: true })) * dir || a.n - b.n);
    $$('#t-filtros [data-filtro]').forEach(b => b.classList.toggle('ativo', b.dataset.filtro === estado.filtro));
    $('#t-todos-sub').textContent = `${l.length} de ${itens.length} equipamentos${estado.filtro ? ` · ${SIT[estado.filtro].nome}` : ''}${q ? ` · busca "${estado.busca}"` : ''}. Vencidos, reprovados e em atenção ficam em destaque. Toque no nome da coluna para ordenar.`;
    $('#t-todos').innerHTML = l.length ? `<table class="tabela t-tab t-tab-todos"><thead><tr>${COLS.map(c => `<th data-ord="${c.n}" class="t-ordena${estado.ord.col === c.n && c.t !== 'Dias' ? (dir > 0 ? ' asc' : ' desc') : ''}"><button type="button">${c.t}</button></th>`).join('')}</tr></thead>
      <tbody>${l.map(it => { const d = dias(it); return `<tr class="t-l-${it.sit}${it.sit === 'atencao' && d.d <= 7 ? ' t-l-urgente' : ''}" style="--c:${SIT[it.sit].cor}"><th scope="row">${esc(it.frota)}</th><td>${esc(it.tipo)}</td><td>${placaTxt(it)}</td><td>${esc(it.regional)}</td><td>${dataBR(it.venc)}</td>
        <td><span class="t-dias t-dias-${d.tom}">${esc(d.txt)}</span></td><td>${esc(it.validade)}</td><td>${esc(it.resultado)}</td><td>${pilula(it.sit)}</td><td class="t-obs">${esc(it.obs)}</td></tr>`; }).join('')}</tbody></table>`
      : '<p class="tabela vazio">Nenhum equipamento com esse filtro.</p>';
    icones();
  }

  /* ---------- Conferência ---------- */
  function conferencia() {
    const soma = ORDEM.reduce((s, k) => s + conta(k), 0), ok = soma === itens.length;
    const avisos = [];
    itens.filter(it => it.sit !== 'vencido' && diasAte(it.venc) < 0).forEach(it => avisos.push(`<b>${esc(nomeItem(it))}</b> (${esc(it.tipo)}): o vencimento ${dataBR(it.venc)} já passou, mas a planilha diz "${esc(it.validade)}".`));
    itens.filter(it => it.sit !== 'vencido' && diasAte(it.venc) === 0).forEach(it => avisos.push(`<b>${esc(nomeItem(it))}</b> (${esc(it.tipo)}) <b>vence hoje</b> (${dataBR(it.venc)}) e ainda está como "${esc(it.validade)}".`));
    itens.filter(it => /aten/i.test(it.validade) && /reprovad/i.test(it.resultado)).forEach(it => avisos.push(`<b>${esc(it.placa)}</b> (${esc(it.tipo)}): validade "Atenção!" com resultado "Reprovado" — contado como <b>Reprovado</b> (bloqueado).`));
    const rep = {}; itens.filter(it => it.placa !== '-').forEach(it => (rep[it.placa] = rep[it.placa] || []).push(it));
    Object.entries(rep).filter(([, l]) => l.length > 1).forEach(([p, l]) => avisos.push(`"${esc(p)}" aparece ${l.length} vezes na coluna Placa (${l.map(it => esc(it.frota)).join(', ')})${l.every(it => it.modelo) ? ': é o modelo do trator, não a placa' : ''}.`));
    const semFrota = itens.filter(it => it.frota === '-');
    if (semFrota.length) avisos.push(`${semFrota.length} equipamentos sem número de frota (${semFrota.map(it => esc(it.placa)).join(', ')}).`);
    itens.filter(it => /alugad/i.test(it.frota)).forEach(it => avisos.push(`<b>${esc(it.placa)}</b> (${esc(it.tipo)}) está como frota "Alugado", sem número.`));
    if (itens.some(it => /vencid/i.test(it.resultado))) avisos.push('Nos vencidos, a coluna Resultado diz "Vencido" em vez de Aprovado/Reprovado: não dá para saber o resultado da última inspeção.');
    if (itens.some(it => /ileg/i.test(Object.values(it).join(' ')))) avisos.push('Há campos marcados como "[ilegível]": corrija em "Editar dados".');
    $('#t-conf').innerHTML = `<p class="t-conf-soma ${ok ? 'ok' : 'erro'}"><i data-lucide="${ok ? 'circle-check' : 'circle-x'}"></i>Soma das situações: ${ORDEM.map(k => `${SIT[k].nome} ${conta(k)}`).join(' + ')} = <b>${soma}</b> ${ok ? '=' : '≠'} ${itens.length} linhas da planilha.</p>
      ${avisos.length ? `<ul class="t-conf-lista">${avisos.map(a => `<li>${a}</li>`).join('')}</ul>` : '<p>Nenhuma inconsistência encontrada.</p>'}`;
  }

  /* ---------- Atualizar: ler a imagem com a IA e conferir antes de salvar ---------- */
  const OPC_VAL = ['Válido', 'Atenção!', 'Vencido'], OPC_RES = ['Aprovado', 'Reprovado', 'Vencido'];
  const opcoes = (lista, v) => [...new Set([...lista, v])].map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('');
  const linhaEdicao = l => `<tr>
      <td><input data-c="frota" value="${esc(l.frota)}" aria-label="Frota"></td><td><input data-c="tipo" value="${esc(l.tipo)}" aria-label="Tipo"></td>
      <td><input data-c="placa" value="${esc(l.placa)}" aria-label="Placa"></td><td><input data-c="regional" value="${esc(l.regional)}" aria-label="Regional"></td>
      <td><input data-c="venc" type="date" value="${esc(l.venc)}" aria-label="Vencimento" required></td>
      <td><select data-c="validade" aria-label="Validade">${opcoes(OPC_VAL, l.validade)}</select></td><td><select data-c="resultado" aria-label="Resultado">${opcoes(OPC_RES, l.resultado)}</select></td>
      <td><input data-c="obs" value="${esc(l.obs)}" aria-label="Observações"></td>
      <td class="t-ed-sit"></td><td><button type="button" class="t-ed-tirar" title="Tirar esta linha" aria-label="Tirar esta linha"><i data-lucide="trash-2"></i></button></td></tr>`;
  function abrirEdicao(dados, aviso = '', duvidas = new Set()) {
    const dlg = $('#t-dlg');
    $('#t-dlg-corpo').innerHTML = `${aviso}
      <div class="t-ed-cab"><label>Unidade<input id="t-ed-unidade" value="${esc(dados.planilha.unidade)}"></label><label>TST responsável<input id="t-ed-tst" value="${esc(dados.planilha.tst)}"></label><label>Data da planilha<input id="t-ed-data" type="date" value="${esc(dados.planilha.data || hojeISO())}"></label></div>
      <p class="t-ed-conta" id="t-ed-conta"></p>
      <div class="t-ed-wrap"><table class="tabela t-tab t-ed"><thead><tr>${['Frota', 'Tipo', 'Placa', 'Regional', 'Vencimento', 'Validade', 'Resultado', 'Observações', 'Situação', ''].map(t => `<th>${t}</th>`).join('')}</tr></thead>
      <tbody id="t-ed-linhas">${dados.linhas.map(linhaEdicao).join('')}</tbody></table></div>
      <button type="button" class="fat-btn" id="t-ed-mais"><i data-lucide="plus"></i><span>Adicionar linha</span></button>`;
    $$('#t-ed-linhas tr').forEach((tr, i) => tr.classList.toggle('t-ed-duvida', duvidas.has(i)));
    contarEdicao();
    if (!dlg.open) dlg.showModal();
    $('#t-ed-linhas tr.t-ed-duvida')?.scrollIntoView({ block: 'center' });
  }
  const lerEdicao = () => ({
    planilha: { unidade: $('#t-ed-unidade')?.value.trim() || '-', tst: $('#t-ed-tst')?.value.trim() || '-', data: $('#t-ed-data')?.value || hojeISO() },
    linhas: $$('#t-ed-linhas tr').map(tr => Object.fromEntries($$('[data-c]', tr).map(x => [x.dataset.c, x.value.trim() || (x.dataset.c === 'venc' ? '' : '-')])))
  });
  // situação de cada linha e a soma, enquanto a pessoa corrige
  function contarEdicao() {
    const linhas = lerEdicao().linhas, c = {};
    $$('#t-ed-linhas tr').forEach((tr, i) => {
      const k = situacao(linhas[i].validade, linhas[i].resultado); c[k] = (c[k] || 0) + 1;
      $('.t-ed-sit', tr).innerHTML = pilula(k);
      tr.classList.toggle('t-ed-erro', !linhas[i].venc || /ileg/i.test(Object.values(linhas[i]).join(' ')));
    });
    $('#t-ed-conta').innerHTML = `<b>${linhas.length} linhas</b> · ${ORDEM.map(k => `${SIT[k].nome} ${c[k] || 0}`).join(' · ')} · <b>${(c.vencido || 0) + (c.reprovado || 0)} bloqueados</b>. Confira com a imagem e corrija o que precisar antes de salvar.`;
    icones();
  }
  $('#t-dlg').addEventListener('change', e => { if (e.target.closest('#t-ed-linhas')) contarEdicao(); });
  $('#t-dlg').addEventListener('click', e => {
    if (e.target.closest('.t-ed-tirar')) { e.target.closest('tr').remove(); contarEdicao(); }
    else if (e.target.closest('#t-ed-mais')) { $('#t-ed-linhas').insertAdjacentHTML('beforeend', linhaEdicao({ frota: '-', tipo: '', placa: '-', regional: 'SMA', venc: '', validade: 'Válido', resultado: 'Aprovado', obs: '-' })); contarEdicao(); $('#t-ed-linhas tr:last-child input')?.focus(); }
    else if (e.target.closest('[data-fechar]') || e.target === $('#t-dlg')) $('#t-dlg').close();
  });
  // guarda a planilha para todos (servidor); sem onde guardar lá, fica neste navegador
  async function salvar(d) {
    const r = await fetch('api/termac', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planilha: d.planilha, linhas: d.linhas }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { estado.dados = j.dados; estado.origem = 'servidor'; try { localStorage.removeItem('termac:dados'); } catch (_) {} return 'servidor'; }
    if (j.navegador) {
      estado.dados = { planilha: d.planilha, linhas: d.linhas, atualizado: new Date().toISOString() }; estado.origem = 'navegador';
      try { localStorage.setItem('termac:dados', JSON.stringify(estado.dados)); } catch (_) {}
      return 'navegador';
    }
    throw new Error(j.erro || `erro ${r.status}`);
  }
  // aviso no canto depois de atualizar, com "Desfazer"
  function aviso(html, desfazer) {
    $('.t-toast')?.remove();
    const el = document.createElement('div'); el.className = 't-toast'; el.setAttribute('role', 'status');
    el.innerHTML = `<i data-lucide="circle-check"></i><div>${html}</div>${desfazer ? '<button type="button" class="fat-btn" data-desfazer><i data-lucide="undo-2"></i><span>Desfazer</span></button>' : ''}<button type="button" class="t-toast-x" aria-label="Fechar"><i data-lucide="x"></i></button>`;
    el.addEventListener('click', async e => {
      if (e.target.closest('.t-toast-x')) el.remove();
      else if (e.target.closest('[data-desfazer]')) { el.remove(); try { await salvar(desfazer); renderTudo(); aviso('Voltou para a planilha anterior.'); } catch (ex) { alert(`Não consegui desfazer: ${ex.message}`); } }
    });
    document.body.appendChild(el); icones();
    setTimeout(() => el.remove(), 20000);
  }
  const resumoTxt = linhas => { const c = {}; linhas.forEach(l => { const k = situacao(l.validade, l.resultado); c[k] = (c[k] || 0) + 1; }); return `${linhas.length} equipamentos · ${(c.vencido || 0) + (c.reprovado || 0)} bloqueados (${c.vencido || 0} vencidos, ${c.reprovado || 0} reprovados) · ${c.atencao || 0} em atenção`; };
  $('#t-ed-salvar').addEventListener('click', async () => {
    const d = lerEdicao();
    if (!d.linhas.length) { alert('Nenhuma linha para salvar.'); return; }
    const semData = d.linhas.findIndex(l => !l.venc);
    if (semData >= 0) { alert(`A linha ${semData + 1} está sem data de vencimento.`); return; }
    const bt = $('#t-ed-salvar'), rot = $('span', bt), orig = rot.textContent; bt.disabled = true; rot.textContent = 'Salvando…';
    const antes = estado.dados;
    try {
      const onde = await salvar(d);
      $('#t-dlg').close(); renderTudo();
      aviso(`<b>Planilha atualizada</b>${onde === 'navegador' ? ' (só neste navegador)' : ''}: ${resumoTxt(d.linhas)}.`, antes);
    } catch (ex) { alert(`Não consegui salvar: ${ex.message}`); }
    finally { bt.disabled = false; rot.textContent = orig; }
  });
  // reduz a foto (a planilha continua legível) para caber no envio
  const reduzir = arquivo => new Promise((ok, falha) => {
    const img = new Image(), url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const k = Math.min(1, 2400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', 0.9));
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir a imagem.')); };
    img.src = url;
  });
  // linha "boa": tem data, validade e resultado conhecidos
  const linhaBoa = l => /^\d{4}-\d{2}-\d{2}$/.test(l.venc) && OPC_VAL.includes(l.validade) && OPC_RES.includes(l.resultado) && l.tipo && l.tipo !== '-';
  // Subir a imagem → ler (IA do servidor, se houver; senão o leitor do navegador) → salvar sozinho.
  // Só abre a conferência quando alguma linha ficou em dúvida.
  $('#t-arquivo').addEventListener('change', async e => {
    const arq = e.target.files?.[0]; e.target.value = ''; if (!arq) return;
    const bt = $('#t-atualizar'), rot = $('span', bt), orig = rot.textContent; bt.disabled = true; rot.textContent = 'Lendo a imagem…';
    raiz.classList.add('t-lendo');
    let L = null, por = '';
    try {
      if (estado.ia) {
        try {
          const r = await fetch('api/termac/ler', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: await reduzir(arq) }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j.leitura?.linhas?.length) { L = { planilha: j.leitura.planilha, linhas: j.leitura.linhas, duvidas: [] }; por = 'IA'; }
        } catch (_) { /* cai no leitor do navegador */ }
      }
      if (!L) {
        if (!window.SMA_TERMAC_OCR) throw new Error('o leitor de imagem não carregou');
        L = await window.SMA_TERMAC_OCR.ler(arq, { anterior: estado.dados, progresso: t => { rot.textContent = t; } });
        por = 'leitor';
      }
      if (!L.linhas.length) throw new Error('não achei a tabela na imagem');
      if (L.planilha.unidade === '-') L.planilha.unidade = P().unidade;
      if (L.planilha.tst === '-') L.planilha.tst = P().tst;
      const duvidas = new Set([...(L.duvidas || []).map(d => d.linha), ...L.linhas.map((l, i) => (linhaBoa(l) ? null : i)).filter(i => i != null)]);
      if (duvidas.size) {
        abrirEdicao(L, `<p class="t-ed-aviso"><i data-lucide="scan-text"></i>Li <b>${L.linhas.length} linhas</b> da imagem. <b>${duvidas.size} ${duvidas.size === 1 ? 'ficou' : 'ficaram'} em dúvida</b> (marcadas em amarelo): confira só elas e salve.</p>`, duvidas);
        return;
      }
      const antes = estado.dados;
      rot.textContent = 'Salvando…';
      const onde = await salvar(L);
      renderTudo();
      aviso(`<b>Planilha atualizada pela imagem</b>${onde === 'navegador' ? ' (só neste navegador)' : ''}: ${resumoTxt(L.linhas)}.`, antes);
    } catch (ex) { alert(`Não consegui ler a imagem: ${ex.message}. Use um print da planilha inteira, reto e nítido.`); }
    finally { bt.disabled = false; rot.textContent = orig; raiz.classList.remove('t-lendo'); }
  });
  $('#t-atualizar').addEventListener('click', () => $('#t-arquivo').click());
  $('#t-editar').addEventListener('click', () => abrirEdicao(estado.dados));

  /* ---------- PDF (páginas claras) ---------- */
  function fotoGrafico(id, w, h) {
    const cfg = configs[id]; if (!cfg || !window.Chart) return '';
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.style.cssText = `position:fixed;left:-9999px;top:0;width:${w}px;height:${h}px`; document.body.appendChild(cv);
    const tinta = '#33524a', fonte = { family: 'Manrope, sans-serif', size: 12, weight: 700 };
    const g = new window.Chart(cv, { type: cfg.type, data: { labels: [...cfg.data.labels], datasets: cfg.data.datasets.map(d => ({ ...d, data: [...d.data] })) },
      options: { ...cfg.options, responsive: false, animation: false, devicePixelRatio: 2,
        scales: { x: { ...cfg.options.scales.x, ticks: { color: tinta, font: fonte }, grid: { display: false } }, y: { ...cfg.options.scales.y, ticks: { color: tinta, font: fonte, precision: 0 }, grid: { color: '#e3ece8' } } },
        plugins: { ...cfg.options.plugins, tooltip: { enabled: false }, legend: { ...cfg.options.plugins.legend, labels: { ...cfg.options.plugins.legend.labels, color: tinta, font: fonte } }, tRotulos: { cor: '#0b2a23' } } },
      plugins: [rotulos] });
    const url = cv.toDataURL('image/png'); g.destroy(); cv.remove(); return url;
  }
  const cabPDF = titulo => `<header class="tp-cab"><div><span>JFI Serviços · Inspeções TERMAC</span><h1>${esc(P().unidade)} · <em>${titulo}</em></h1></div><p>TST responsável: ${esc(P().tst)}<br>Planilha de ${dataBR(P().data)} · gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></header>`;
  const proxMes = m => { const [y, mm] = m.split('-').map(Number); const d = new Date(y, mm, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  function paginasPDF() {
    const v = conta('vencido'), r = conta('reprovado'), a = conta('atencao'), l = conta('liberado');
    const kp = [['Total', itens.length, '#1f6f54'], ['Vencidos', v, SIT.vencido.cor], ['Reprovados', r, '#e05252'], ['Atenção', a, '#d97706'], ['Liberados', l, '#16a34a']];
    const pags = [`${cabPDF('Resumo')}
      <p class="tp-frase"><b>${v + r} de ${itens.length}</b> equipamentos estão <b class="v">bloqueados</b> (${v} vencidos, ${r} reprovados); <b class="a">${a} em atenção</b>.</p>
      <div class="tp-kpis">${kp.map(([t, n, c]) => `<div style="border-top-color:${c};--k:${c}"><small>${t}</small><strong>${n}</strong></div>`).join('')}</div>
      <div class="tp-graf2"><figure><figcaption>Situação por categoria</figcaption><img src="${fotoGrafico('t-g-cat', 500, 300)}" alt=""></figure><figure><figcaption>Vencimentos por mês</figcaption><img src="${fotoGrafico('t-g-mes', 500, 300)}" alt=""></figure></div>`];
    // calendário: o mês aberto na tela e o seguinte
    const chipPDF = it => `<span class="tp-chip" style="border-left-color:${SIT[it.sit].cor};background:${SIT[it.sit].cor}22"><b>${esc(nomeItem(it))}</b></span>`;
    pags.push(`${cabPDF('Calendário de vencimentos')}<div class="tp-cals">${[estado.mesCal, proxMes(estado.mesCal)].map(m => `<div><h2>${MESES_LONGOS[+m.slice(5) - 1]} ${m.slice(0, 4)}</h2>${gradeMes(m, chipPDF)}</div>`).join('')}</div>
      <p class="tp-leg">${ORDEM.map(k => `<span><i style="background:${SIT[k].cor}"></i>${SIT[k].nome}</span>`).join('')}</p>`);
    // tabela por prioridade (vencidos, reprovados, atenção, liberados)
    const ord = [...itens].sort(porPrioridade);
    for (let i = 0; i < ord.length; i += 15) {
      pags.push(`${cabPDF(`Equipamentos${i ? ' (continuação)' : ''}`)}<table class="tp-tab"><colgroup><col style="width:9%"><col style="width:17%"><col style="width:9%"><col style="width:10%"><col style="width:13%"><col style="width:11%"><col style="width:31%"></colgroup>
        <thead><tr>${['Frota', 'Tipo', 'Placa', 'Vencimento', 'Dias', 'Situação', 'Observações'].map(t => `<th>${t}</th>`).join('')}</tr></thead>
        <tbody>${ord.slice(i, i + 15).map(it => { const d = dias(it); return `<tr class="tp-${it.sit}"><td style="border-left-color:${SIT[it.sit].cor}"><b>${esc(it.frota)}</b></td><td>${esc(it.tipo)}</td><td>${esc(it.placa)}</td><td>${dataBR(it.venc)}</td><td class="tp-d-${d.tom}">${esc(d.txt)}</td><td><span class="tp-sit"><i style="background:${SIT[it.sit].cor}"></i>${SIT[it.sit].nome}</span></td><td>${esc(it.obs)}</td></tr>`; }).join('')}</tbody></table>
        <p class="tp-pe">${Math.min(i + 15, ord.length)} de ${ord.length} · ordem: vencidos, reprovados, atenção e liberados, do vencimento mais antigo para o mais novo</p>`);
    }
    return pags;
  }
  const nomeArq = ext => `Inspecoes_TERMAC_${P().unidade.replace(/[^\p{L}\p{N}]+/gu, '_')}_${hojeISO()}.${ext}`;
  async function exportar(bt, faz) {
    if (!window.SMA_PDF) return;
    const rot = $('span', bt), orig = rot.textContent; bt.disabled = true; rot.textContent = 'Gerando…';
    try { await faz(rot); rot.textContent = 'Pronto ✓'; }
    catch (ex) { console.error('TERMAC: exportar', ex); rot.textContent = 'Não consegui'; }
    finally { bt.disabled = false; setTimeout(() => { rot.textContent = orig; }, 2500); }
  }
  $('#t-pdf').addEventListener('click', e => exportar(e.currentTarget, rot => window.SMA_PDF.gerar(paginasPDF(), nomeArq('pdf'), { progresso: (i, n) => { rot.textContent = `Página ${i}/${n}…`; } })));

  /* ---------- Imagem para compartilhar (WhatsApp) ---------- */
  function cartaoImagem() {
    const v = conta('vencido'), r = conta('reprovado'), a = conta('atencao'), l = conta('liberado');
    const lista = (k, titulo) => {
      const g = itens.filter(it => it.sit === k).sort((x, y) => x.venc.localeCompare(y.venc));
      return g.length ? `<section class="tc-grupo" style="--c:${SIT[k].cor}"><h3>${titulo}<span>${g.length}</span></h3><ul>${g.map(it => { const d = dias(it); return `<li><b>${esc(nomeItem(it))}</b><span>${esc(it.tipo)}${it.obs !== '-' ? ` · ${esc(it.obs)}` : ''}</span><em class="tc-d-${d.tom}">${esc(d.txt)}</em></li>`; }).join('')}</ul></section>` : '';
    };
    return `<header class="tc-cab"><span>JFI Serviços · Inspeções TERMAC</span><h1>${esc(P().unidade)}</h1><p>TST: ${esc(P().tst)} · planilha de ${dataBR(P().data)} · situação em ${dataBR(hojeISO())}</p></header>
      <p class="tc-frase"><b>${v + r} de ${itens.length}</b> equipamentos bloqueados (${v} vencidos, ${r} reprovados) · <b class="a">${a} em atenção</b> · ${l} liberados</p>
      <div class="tc-kpis">${[['Vencidos', v, SIT.vencido.cor], ['Reprovados', r, '#e05252'], ['Atenção', a, '#d97706'], ['Liberados', l, '#16a34a']].map(([t, n, c]) => `<div style="border-top-color:${c}"><strong style="color:${c}">${n}</strong><small>${t}</small></div>`).join('')}</div>
      ${lista('vencido', 'Vencidos · não operar')}${lista('reprovado', 'Reprovados · não operar')}${lista('atencao', 'Atenção · renovar a inspeção')}
      <footer class="tc-pe">SMA Silvicultura · Unidade São Miguel · painel de Segurança</footer>`;
  }
  $('#t-imagem').addEventListener('click', e => exportar(e.currentTarget, async () => {
    const el = document.createElement('div'); el.className = 't-cartao'; el.innerHTML = cartaoImagem(); document.body.appendChild(el);
    try {
      const cv = await window.SMA_PDF.capturar(el, { fundo: '#ffffff' });
      const blob = await new Promise(ok => cv.toBlob(ok, 'image/png'));
      const arq = new File([blob], nomeArq('png'), { type: 'image/png' });
      // no celular abre o "compartilhar" (WhatsApp etc.); no computador baixa o arquivo
      if (navigator.canShare?.({ files: [arq] }) && matchMedia('(pointer: coarse)').matches) {
        try { await navigator.share({ files: [arq], title: 'Inspeções TERMAC' }); return; } catch (ex) { if (ex.name === 'AbortError') return; }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = arq.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    } finally { el.remove(); }
  }));

  /* ---------- Folhito: o que está na tela ---------- */
  (window.SMA_CONTEXTO ||= {}).termac = () => {
    if (raiz.hidden) return '';
    const l = k => itens.filter(it => it.sit === k).map(it => `${nomeItem(it)} ${it.tipo} (${dias(it).txt}${it.obs !== '-' ? `, ${it.obs}` : ''})`).join('; ');
    return `Painel Inspeções TERMAC (${P().unidade}, TST ${P().tst}, planilha de ${dataBR(P().data)}, hoje ${dataBR(hojeISO())}). ${conta('vencido') + conta('reprovado')} de ${itens.length} bloqueados.
Vencidos (${conta('vencido')}): ${l('vencido')}.
Reprovados (${conta('reprovado')}): ${l('reprovado')}.
Atenção (${conta('atencao')}): ${l('atencao')}.
Liberados: ${conta('liberado')}.`;
  };

  /* ---------- Eventos ---------- */
  const irPara = nome => {
    estado.busca = nome; estado.filtro = ''; $('#t-busca').value = nome; topo(); completa(); icones();
    $('#t-todos-sec').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  raiz.addEventListener('click', e => {
    const ir = e.target.closest('[data-ir]'); if (ir) { irPara(ir.dataset.ir); return; }
    const f = e.target.closest('[data-filtro]');
    if (f) { estado.filtro = estado.filtro === f.dataset.filtro ? '' : f.dataset.filtro; topo(); completa(); icones(); if (f.classList.contains('t-kpi')) $('#t-todos-sec').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const o = e.target.closest('th[data-ord]');
    if (o) { const col = o.dataset.ord; estado.ord = { col, dir: estado.ord.col === col ? -estado.ord.dir : 1 }; completa(); return; }
    const c = e.target.closest('[data-cal]');
    if (c) {
      if (c.dataset.cal === 'hoje') estado.mesCal = hojeISO().slice(0, 7);
      else { const [y, m] = estado.mesCal.split('-').map(Number); const d = new Date(y, m - 1 + Number(c.dataset.cal), 1); estado.mesCal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
      calendario(); icones(); return;
    }
    const m = e.target.closest('[data-mes]'); if (m) { estado.mesCal = m.dataset.mes; calendario(); icones(); }
  });
  $('#t-busca').addEventListener('input', e => { estado.busca = e.target.value; completa(); });

  function renderTudo() {
    montarItens();
    topo(); destaques(); desenharGraficos(); calendario(); completa(); conferencia(); icones();
  }
  // dados: o que foi salvo no servidor; senão o salvo neste navegador; senão a planilha transcrita
  async function carregar() {
    try {
      const r = await fetch('api/termac', { cache: 'no-store' }); const j = await r.json();
      estado.ia = Boolean(j.ia); estado.onde = j.onde || '';
      if (j.dados?.linhas?.length) { estado.dados = j.dados; estado.origem = 'servidor'; return; }
    } catch (_) { /* sem servidor (site aberto direto do arquivo) */ }
    try { const s = JSON.parse(localStorage.getItem('termac:dados') || 'null'); if (s?.linhas?.length) { estado.dados = s; estado.origem = 'navegador'; } } catch (_) {}
  }
  let pronto = null;
  function mostrar() {
    if (pronto) { pronto.then(() => Object.values(graficos).forEach(g => g.resize())); return; }
    renderTudo();   // mostra já com o que tem e troca quando o servidor responder
    pronto = carregar().then(() => { if (estado.origem !== 'padrao') renderTudo(); });
  }
  window.SMA_TERMAC = { mostrar };
})();
