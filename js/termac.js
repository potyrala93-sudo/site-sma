/* ==========================================================================
   SMA · Silvicultura — Segurança · Inspeções TERMAC
   Dados transcritos da planilha "Vencimento das Inspeções TERMAC" (JFI Serviços).
   A situação segue o status da própria planilha (não é recalculada pela data):
     Vencido   → Validade = Vencido
     Reprovado → Resultado = Reprovado (mesmo com validade em dia)
     Atenção   → Validade = Atenção! e Resultado = Aprovado
     Liberado  → Validade = Válido e Resultado = Aprovado
   Bloqueado = Vencido + Reprovado (não deve operar).
   Para atualizar: troque a lista LINHAS (e a data da planilha).
   ========================================================================== */

(() => {
  const raiz = document.getElementById('aba-termac');
  if (!raiz) return;

  const PLANILHA = { unidade: 'São Miguel Arcanjo', tst: 'Glaucia Ferreira', data: '2026-10-26' };

  // [Frota, Tipo, Placa, Regional, Vencimento (aaaa-mm-dd), Validade, Resultado, Observações]
  const LINHAS = [
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
  ];

  /* ---------- Regras ---------- */
  const SIT = {
    vencido: { nome: 'Vencido', cor: '#dc2626', icone: 'octagon-x' },
    reprovado: { nome: 'Reprovado', cor: '#f87171', icone: 'circle-x' },
    atencao: { nome: 'Atenção', cor: '#f59e0b', icone: 'triangle-alert' },
    liberado: { nome: 'Liberado', cor: '#22c55e', icone: 'circle-check' }
  };
  const ORDEM = ['vencido', 'reprovado', 'atencao', 'liberado'];
  const situacao = (validade, resultado) =>
    validade === 'Vencido' ? 'vencido' : resultado === 'Reprovado' ? 'reprovado' : validade === 'Atenção!' ? 'atencao' : 'liberado';
  const CATEGORIAS = ['Caminhões e apoio', 'Munck', 'Tratores', 'Implementos', 'Thomaz'];
  const categoria = tipo => (/^Implemento/i.test(tipo) ? 'Implementos' : /Munck/i.test(tipo) ? 'Munck' : /Trator/i.test(tipo) ? 'Tratores' : /Thomaz/i.test(tipo) ? 'Thomaz' : 'Caminhões e apoio');

  const itens = LINHAS.map(([frota, tipo, placa, regional, venc, validade, resultado, obs], i) => ({
    n: i + 1, frota: frota || '-', tipo, placa, regional, venc, validade, resultado, obs: obs || '-',
    sit: situacao(validade, resultado), cat: categoria(tipo),
    modelo: /^TRA/i.test(frota) && /^\d{4}J$/i.test(placa)   // nos tratores a coluna "Placa" traz o modelo (7200J, 6150J)
  }));

  /* ---------- Ajudantes ---------- */
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dataBR = iso => { const [a, m, d] = String(iso).split('-'); return `${d}/${m}/${a}`; };
  const hojeISO = () => new Date().toLocaleDateString('sv-SE');
  const diasAte = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / 864e5);
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const icones = () => window.lucide?.createIcons();
  const pilula = k => `<span class="t-sit" style="--c:${SIT[k].cor}"><i data-lucide="${SIT[k].icone}"></i>${SIT[k].nome}</span>`;
  const placaTxt = it => (it.modelo ? `${esc(it.placa)} <small class="t-mod">modelo</small>` : esc(it.placa));
  const prazoTxt = it => { const d = diasAte(it.venc); return d < 0 ? `<small class="t-prazo vencido">venceu há ${-d} d</small>` : d === 0 ? '<small class="t-prazo hoje">vence hoje</small>' : d <= 7 ? `<small class="t-prazo perto">faltam ${d} d</small>` : `<small class="t-prazo">faltam ${d} d</small>`; };

  const estado = { filtro: '', busca: '', ord: { col: 'venc', dir: 1 } };
  const conta = k => itens.filter(it => it.sit === k).length;

  /* ---------- Cabeçalho, resumo e KPIs ---------- */
  function topo() {
    const v = conta('vencido'), r = conta('reprovado'), a = conta('atencao'), l = conta('liberado');
    $('#t-cab').innerHTML = `<div><span class="eyebrow">JFI Serviços · TERMAC</span><h2 class="fat-sec-titulo">Inspeções TERMAC · <span class="serif">${esc(PLANILHA.unidade)}</span></h2>
        <p class="t-cab-info"><span><i data-lucide="hard-hat"></i>TST responsável: <b>${esc(PLANILHA.tst)}</b></span><span><i data-lucide="calendar"></i>Planilha de <b>${dataBR(PLANILHA.data)}</b></span></p></div>`;
    $('#t-resumo').innerHTML = `<i data-lucide="shield-alert"></i><p><b>${v + r} de ${itens.length}</b> equipamentos estão <b class="t-bloq">bloqueados</b> (${v} vencidos, ${r} reprovados); <b class="t-aten">${a} em atenção</b>.</p>`;
    const cards = [['', 'Total', itens.length, 'equipamentos na planilha', '#3dffa8', 'list'], ['vencido', 'Vencidos', v, 'não operar', SIT.vencido.cor, SIT.vencido.icone],
      ['reprovado', 'Reprovados', r, 'não operar', SIT.reprovado.cor, SIT.reprovado.icone], ['atencao', 'Atenção', a, 'renovar a inspeção', SIT.atencao.cor, SIT.atencao.icone],
      ['liberado', 'Liberados', l, 'válidos e aprovados', SIT.liberado.cor, SIT.liberado.icone]];
    $('#t-kpis').innerHTML = cards.map(([k, rot, val, aj, cor, ic]) => `<button type="button" class="kpi glass t-kpi${estado.filtro === k ? ' ativo' : ''}" data-filtro="${k}" style="--c:${cor}" title="Mostrar na tabela completa">
        <span class="icon-box"><i data-lucide="${ic}"></i></span><span class="kpi-rot">${rot}</span><strong class="kpi-val">${val}</strong><small class="kpi-ajuda">${aj}${val && k ? ` · ${Math.round(val / itens.length * 100)}%` : ''}</small></button>`).join('');
  }

  /* ---------- Gráficos ---------- */
  const graficos = {};
  // rótulos de dados: número dentro de cada pedaço da barra e o total na ponta
  const rotulos = {
    id: 'tRotulos',
    afterDatasetsDraw(chart) {
      const { ctx } = chart, cor = getComputedStyle(document.documentElement).getPropertyValue('--texto-forte').trim() || '#e6fff5';
      ctx.save(); ctx.font = '800 11.5px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((ds, di) => {
        if (!chart.isDatasetVisible(di)) return;
        chart.getDatasetMeta(di).data.forEach((el, i) => {
          const v = ds.data[i]; if (!v || Math.abs(el.base - el.y) < 12) return;
          ctx.fillStyle = '#1a1205'; ctx.fillText(v, el.x, (el.y + el.base) / 2);
        });
      });
      chart.data.labels.forEach((_l, i) => {
        let soma = 0, topo = null;
        chart.data.datasets.forEach((ds, di) => { if (!chart.isDatasetVisible(di) || !ds.data[i]) return; soma += ds.data[i]; const el = chart.getDatasetMeta(di).data[i]; if (!topo || el.y < topo.y) topo = el; });
        if (soma && topo) { ctx.fillStyle = cor; ctx.fillText(soma, topo.x, topo.y - 11); }
      });
      ctx.restore();
    }
  };
  function empilhado(id, labels, porRotulo) {
    const C = window.Chart; if (!C) return;
    graficos[id]?.destroy();
    C.defaults.color = '#9fb9b3'; C.defaults.font.family = 'Manrope, sans-serif'; C.defaults.font.weight = 600; C.defaults.borderColor = 'rgba(255,255,255,.06)';
    graficos[id] = new C(document.getElementById(id), {
      type: 'bar',
      data: { labels, datasets: ORDEM.map(k => ({ label: SIT[k].nome, data: labels.map((_l, i) => porRotulo(i).filter(it => it.sit === k).length), backgroundColor: `${SIT[k].cor}d9`, borderColor: SIT[k].cor, borderWidth: 1.5, borderRadius: 5, maxBarThickness: 56 })) },
      options: { responsive: true, maintainAspectRatio: false, layout: { padding: { top: 22 } }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, padding: 14 } }, tooltip: { backgroundColor: 'rgba(4,18,17,.95)', borderColor: 'rgba(61,255,168,.4)', borderWidth: 1, padding: 12, cornerRadius: 12 } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } },
      plugins: [rotulos]
    });
  }
  function desenharGraficos() {
    empilhado('t-g-cat', CATEGORIAS, i => itens.filter(it => it.cat === CATEGORIAS[i]));
    const meses = [...new Set(itens.map(it => it.venc.slice(0, 7)))].sort();
    empilhado('t-g-mes', meses.map(m => `${MESES[+m.slice(5) - 1]}/${m.slice(2, 4)}`), i => itens.filter(it => it.venc.startsWith(meses[i])));
  }

  /* ---------- Tabelas ---------- */
  const tabela = (cols, linhas, classe = '') => `<table class="tabela t-tab ${classe}"><thead><tr>${cols.map(c => `<th${c.n ? ` data-ord="${c.n}" class="t-ordena${estado.ord.col === c.n ? (estado.ord.dir > 0 ? ' asc' : ' desc') : ''}"` : ''}><button type="button"${c.n ? '' : ' disabled'}>${c.t}</button></th>`).join('')}</tr></thead><tbody>${linhas}</tbody></table>`;
  function bloqueados() {
    const l = itens.filter(it => it.sit === 'vencido' || it.sit === 'reprovado').sort((a, b) => a.venc.localeCompare(b.venc));
    $('#t-bloq-sub').textContent = `${l.length} equipamentos que não devem operar, do vencimento mais antigo para o mais novo.`;
    $('#t-bloq').innerHTML = tabela([{ t: 'Frota' }, { t: 'Tipo' }, { t: 'Placa' }, { t: 'Vencimento' }, { t: 'Situação' }, { t: 'Observações' }],
      l.map(it => `<tr style="--c:${SIT[it.sit].cor}"><th scope="row">${esc(it.frota)}</th><td>${esc(it.tipo)}</td><td>${placaTxt(it)}</td><td>${dataBR(it.venc)}${prazoTxt(it)}</td><td>${pilula(it.sit)}</td><td class="t-obs">${esc(it.obs)}</td></tr>`).join(''));
  }
  function agenda() {
    const l = itens.filter(it => it.sit === 'atencao').sort((a, b) => a.venc.localeCompare(b.venc));
    const urg = l.filter(it => diasAte(it.venc) <= 7).length;
    $('#t-agenda-sub').textContent = `${l.length} em atenção, do mais próximo para o mais distante${urg ? ` · ${urg} vencem hoje ou em até 7 dias (destacados)` : ''}.`;
    $('#t-agenda').innerHTML = tabela([{ t: 'Vencimento' }, { t: 'Frota' }, { t: 'Tipo' }, { t: 'Placa' }, { t: 'Observações' }],
      l.map(it => { const d = diasAte(it.venc); return `<tr class="${d <= 0 ? 't-hoje' : d <= 7 ? 't-perto' : ''}" style="--c:${SIT.atencao.cor}"><th scope="row">${dataBR(it.venc)}${prazoTxt(it)}</th><td>${esc(it.frota)}</td><td>${esc(it.tipo)}</td><td>${placaTxt(it)}</td><td class="t-obs">${esc(it.obs)}</td></tr>`; }).join(''));
  }
  const COLS = [{ t: 'Frota', n: 'frota' }, { t: 'Tipo', n: 'tipo' }, { t: 'Placa', n: 'placa' }, { t: 'Regional', n: 'regional' }, { t: 'Vencimento', n: 'venc' }, { t: 'Validade', n: 'validade' }, { t: 'Resultado', n: 'resultado' }, { t: 'Situação', n: 'sit' }, { t: 'Observações', n: 'obs' }];
  function completa() {
    const q = semAcento(estado.busca).trim();
    const { col, dir } = estado.ord;
    const l = itens.filter(it => (!estado.filtro || it.sit === estado.filtro) && (!q || q.split(/\s+/).every(t => semAcento([it.frota, it.tipo, it.placa, it.regional, dataBR(it.venc), it.validade, it.resultado, SIT[it.sit].nome, it.obs, it.cat].join(' ')).includes(t))))
      .sort((a, b) => (col === 'sit' ? ORDEM.indexOf(a.sit) - ORDEM.indexOf(b.sit) : String(a[col]).localeCompare(String(b[col]), 'pt-BR', { numeric: true })) * dir || a.n - b.n);
    $$('#t-filtros [data-filtro]').forEach(b => b.classList.toggle('ativo', b.dataset.filtro === estado.filtro));
    $('#t-todos-sub').textContent = `${l.length} de ${itens.length} equipamentos${estado.filtro ? ` · ${SIT[estado.filtro].nome}` : ''}${q ? ` · busca "${estado.busca}"` : ''}. Toque no nome da coluna para ordenar.`;
    $('#t-todos').innerHTML = l.length ? tabela(COLS, l.map(it => `<tr style="--c:${SIT[it.sit].cor}"><th scope="row">${esc(it.frota)}</th><td>${esc(it.tipo)}</td><td>${placaTxt(it)}</td><td>${esc(it.regional)}</td><td>${dataBR(it.venc)}</td><td>${esc(it.validade)}</td><td>${esc(it.resultado)}</td><td>${pilula(it.sit)}</td><td class="t-obs">${esc(it.obs)}</td></tr>`).join(''), 't-tab-todos') : '<p class="tabela vazio">Nenhum equipamento com esse filtro.</p>';
    icones();
  }

  /* ---------- Conferência ---------- */
  function conferencia() {
    const soma = ORDEM.reduce((s, k) => s + conta(k), 0);
    const ok = soma === itens.length;
    const avisos = [];
    itens.filter(it => it.sit !== 'vencido' && diasAte(it.venc) < 0).forEach(it => avisos.push(`<b>${esc(it.frota !== '-' ? it.frota : it.placa)}</b> (${esc(it.tipo)}): o vencimento ${dataBR(it.venc)} já passou, mas a planilha diz "${esc(it.validade)}".`));
    itens.filter(it => it.sit !== 'vencido' && diasAte(it.venc) === 0).forEach(it => avisos.push(`<b>${esc(it.frota !== '-' ? it.frota : it.placa)}</b> (${esc(it.tipo)}) <b>vence hoje</b> (${dataBR(it.venc)}) e ainda está como "${esc(it.validade)}".`));
    itens.filter(it => it.validade === 'Atenção!' && it.resultado === 'Reprovado').forEach(it => avisos.push(`<b>${esc(it.placa)}</b> (${esc(it.tipo)}): validade "Atenção!" com resultado "Reprovado" — contado como <b>Reprovado</b> (bloqueado).`));
    const rep = {}; itens.filter(it => it.placa !== '-').forEach(it => (rep[it.placa] = rep[it.placa] || []).push(it));
    Object.entries(rep).filter(([, l]) => l.length > 1).forEach(([p, l]) => avisos.push(`"${esc(p)}" aparece ${l.length} vezes na coluna Placa (${l.map(it => esc(it.frota)).join(', ')})${l.every(it => it.modelo) ? ': é o modelo do trator, não a placa' : ''}.`));
    const semFrota = itens.filter(it => it.frota === '-');
    if (semFrota.length) avisos.push(`${semFrota.length} equipamentos sem número de frota (${semFrota.map(it => esc(it.placa)).join(', ')}).`);
    itens.filter(it => /alugad/i.test(it.frota)).forEach(it => avisos.push(`<b>${esc(it.placa)}</b> (${esc(it.tipo)}) está como frota "Alugado", sem número.`));
    if (itens.some(it => it.resultado === 'Vencido')) avisos.push(`Nos vencidos, a coluna Resultado diz "Vencido" em vez de Aprovado/Reprovado: não dá para saber o resultado da última inspeção.`);
    $('#t-conf').innerHTML = `<p class="t-conf-soma ${ok ? 'ok' : 'erro'}"><i data-lucide="${ok ? 'circle-check' : 'circle-x'}"></i>Soma das situações: ${ORDEM.map(k => `${SIT[k].nome} ${conta(k)}`).join(' + ')} = <b>${soma}</b> ${ok ? '=' : '≠'} ${itens.length} linhas da planilha.</p>
      <ul class="t-conf-lista">${avisos.map(a => `<li>${a}</li>`).join('')}</ul>`;
  }

  /* ---------- Folhito: o que está na tela ---------- */
  (window.SMA_CONTEXTO ||= {}).termac = () => {
    if (raiz.hidden) return '';
    const l = k => itens.filter(it => it.sit === k).map(it => `${it.frota !== '-' ? it.frota : it.placa} ${it.tipo} (vence ${dataBR(it.venc)}${it.obs !== '-' ? `, ${it.obs}` : ''})`).join('; ');
    return `Painel Inspeções TERMAC ${planilhaTxt()}. ${conta('vencido') + conta('reprovado')} de ${itens.length} bloqueados.
Vencidos (${conta('vencido')}): ${l('vencido')}.
Reprovados (${conta('reprovado')}): ${l('reprovado')}.
Atenção (${conta('atencao')}): ${l('atencao')}.
Liberados: ${conta('liberado')}.`;
  };
  const planilhaTxt = () => `(${PLANILHA.unidade}, TST ${PLANILHA.tst}, planilha de ${dataBR(PLANILHA.data)}, hoje ${dataBR(hojeISO())})`;

  /* ---------- Eventos ---------- */
  raiz.addEventListener('click', e => {
    const f = e.target.closest('[data-filtro]');
    if (f) {
      estado.filtro = estado.filtro === f.dataset.filtro ? '' : f.dataset.filtro;
      topo(); completa();
      if (f.classList.contains('t-kpi')) $('#t-todos-sec').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const o = e.target.closest('th[data-ord]');
    if (o) { estado.ord = { col: o.dataset.ord, dir: estado.ord.col === o.dataset.ord ? -estado.ord.dir : 1 }; completa(); }
  });
  $('#t-busca').addEventListener('input', e => { estado.busca = e.target.value; completa(); });

  let pronto = false;
  function mostrar() {
    if (pronto) { Object.values(graficos).forEach(g => g.resize()); return; }
    pronto = true;
    topo(); desenharGraficos(); bloqueados(); agenda(); completa(); conferencia(); icones();
  }
  window.SMA_TERMAC = { mostrar };
})();
