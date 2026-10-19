/* ==========================================================================
   SMA · Silvicultura — Segurança · Notas SSQV
   Planilha com Ano | Mês | Nota (mês por extenso, nota com vírgula, pode passar de 100).
   Meta e tolerância em js/dados.js → SEGURANCA.ssqv (META_NOTA). Maior é melhor.
   ========================================================================== */

(() => {
  const P = window.SMA_PLANILHAS, CFG = window.SMA_DADOS?.SEGURANCA?.ssqv;
  const raiz = document.getElementById('seg');
  if (!P || !CFG || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const META = CFG.META_NOTA, TOL = CFG.toleranciaAmarelo ?? 0.05;

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  // "Março", "MARCO", "mar", "03" → 3 (sempre pelo número, nunca em ordem alfabética)
  function numeroDoMes(v) {
    const t = semAcento(v).toLowerCase().trim();
    if (/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 12) return +t;
    const i = MESES.findIndex(m => { const n = semAcento(m).toLowerCase(); return t === n || (t.length >= 3 && n.startsWith(t.slice(0, 3))); });
    return i >= 0 ? i + 1 : null;
  }
  const fmt = (v, casas = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  const fmtSinal = (v, casas = 2) => (v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmt(Math.abs(v), casas)}`);

  // Status: na meta ou acima (verde) · até 5% abaixo (amarelo) · mais de 5% abaixo (vermelho)
  const STATUS = {
    acima: { nome: 'Acima da meta', cor: '#22e07a', icone: 'circle-check' },
    atencao: { nome: 'Até 5% abaixo', cor: '#ffc83d', icone: 'circle-alert' },
    abaixo: { nome: 'Mais de 5% abaixo', cor: '#ff4d5e', icone: 'circle-x' },
    vazio: { nome: 'Sem nota', cor: '#5b6f6b', icone: 'circle-dashed' }
  };
  const statusDe = n => (n == null ? STATUS.vazio : n >= META ? STATUS.acima : n >= META * (1 - TOL) ? STATUS.atencao : STATUS.abaixo);
  const CORES_ANOS = ['#3dffa8', '#38bdf8', '#fb923c', '#e879f9', '#facc15', '#f87171'];

  /* ---------- Estado ---------- */
  const estado = { notas: [], anos: [], ano: null, comparar: false, anosComparar: [], carregando: true };
  const notaDe = (ano, mes) => estado.notas.find(n => n.ano === ano && n.mes === mes)?.nota ?? null;
  const anterior = (ano, mes) => (mes > 1 ? notaDe(ano, mes - 1) : notaDe(ano - 1, 12));

  /* ---------- Leitura ---------- */
  async function carregar(fresco = false) {
    const bt = $('#s-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#s-status').textContent = 'Carregando notas…';
    raiz.classList.add('carregando');
    try {
      const linhas = await P.lerPlanilha(CFG.planilha, CFG.aba, { fresco, coluna: 'NOTA', cabecalho: true });
      const vistos = new Map();
      linhas.forEach(l => {
        const ano = P.num(l.ANO), mes = numeroDoMes(l.MES), txt = String(l.NOTA ?? '').trim();
        if (!ano || !mes || !txt || txt === '-') return;   // linhas vazias ou incompletas ficam de fora
        vistos.set(`${ano}-${mes}`, { ano, mes, nota: P.num(txt) });   // mês repetido: vale a última linha
      });
      estado.notas = [...vistos.values()].sort((a, b) => a.ano - b.ano || a.mes - b.mes);
      estado.anos = [...new Set(estado.notas.map(n => n.ano))].sort((a, b) => a - b);
      const atual = new Date().getFullYear();
      if (!estado.anos.includes(estado.ano)) estado.ano = estado.anos.includes(atual) ? atual : estado.anos.at(-1) ?? atual;
      estado.anosComparar = estado.anosComparar.filter(a => estado.anos.includes(a));
      if (estado.anosComparar.length < 2) estado.anosComparar = [...estado.anos];
      $('#s-erros').hidden = true;
      $('#s-status').textContent = `${estado.notas.length} meses com nota · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (erro) {
      console.warn('Segurança: falha ao ler a planilha', erro);
      const el = $('#s-erros'); el.hidden = false;
      el.innerHTML = '<i data-lucide="triangle-alert"></i><div><strong>Não consegui carregar as notas SSQV</strong><p>Verifique a internet e se a planilha está compartilhada como "Qualquer pessoa com o link – Leitor". Depois toque em "Atualizar dados".</p></div>';
      $('#s-status').textContent = 'Sem acesso à planilha';
    }
    estado.carregando = false;
    raiz.classList.remove('carregando');
    bt.classList.remove('girando'); bt.disabled = false;
    renderizar();
  }

  /* ---------- Filtros ---------- */
  function renderFiltros() {
    const multi = estado.anos.length > 1;
    $('#s-comparar').hidden = !multi;
    if (!multi) estado.comparar = false;
    $('#s-comparar').setAttribute('aria-pressed', String(estado.comparar));
    $('#s-comparar').classList.toggle('ativo', estado.comparar);
    const anos = estado.anos.length ? estado.anos : [estado.ano];
    $('#s-anos').innerHTML = `<span class="s-rot"><i data-lucide="calendar"></i>${estado.comparar ? 'Anos' : 'Ano'}</span>` + anos.map(a => {
      const ativo = estado.comparar ? estado.anosComparar.includes(a) : a === estado.ano;
      return `<button type="button" data-ano="${a}" class="${ativo ? 'ativo' : ''}" aria-pressed="${ativo}">${a}</button>`;
    }).join('');
  }
  $('#s-anos').addEventListener('click', e => {
    const b = e.target.closest('[data-ano]'); if (!b) return;
    const a = +b.dataset.ano;
    if (estado.comparar) {
      const l = estado.anosComparar;
      estado.anosComparar = l.includes(a) ? (l.length > 1 ? l.filter(x => x !== a) : l) : [...l, a].sort((x, y) => x - y);
    } else estado.ano = a;
    renderizar();
  });
  $('#s-comparar').addEventListener('click', () => {
    estado.comparar = !estado.comparar;
    if (estado.comparar && estado.anosComparar.length < 2) estado.anosComparar = [...estado.anos];   // começa comparando todos os anos
    renderizar();
  });

  /* ---------- Resumo de um ano ---------- */
  function resumo(ano) {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1, nota = notaDe(ano, mes), ant = anterior(ano, mes);
      return { mes, nota, ant, varPts: nota != null && ant != null ? nota - ant : null, varPct: nota != null && ant ? (nota / ant - 1) * 100 : null, difMeta: nota != null ? nota - META : null, status: statusDe(nota) };
    });
    const com = meses.filter(m => m.nota != null);
    const media = com.length ? com.reduce((s, m) => s + m.nota, 0) / com.length : null;
    const ord = [...com].sort((a, b) => b.nota - a.nota);
    return { ano, meses, com, media, melhor: ord[0] || null, pior: ord.at(-1) || null, naMeta: com.filter(m => m.nota >= META).length, ultimo: com.at(-1) || null };
  }

  /* ---------- KPIs ---------- */
  function renderKPIs(r) {
    const u = r.ultimo;
    $('[data-s="ultimo-mes"]').textContent = u ? `${MESES[u.mes - 1]}/${r.ano}` : 'sem nota';
    $('[data-s="ultimo"]').textContent = u ? fmt(u.nota) : '—';
    $('#s-k-ultimo').style.setProperty('--c', u ? u.status.cor : STATUS.vazio.cor);
    const v = $('[data-s="variacao"]');
    if (u && u.varPts != null) {
      const sobe = u.varPts > 0, igual = u.varPts === 0;
      v.className = `s-var ${igual ? '' : sobe ? 'sobe' : 'desce'}`;
      v.innerHTML = `<i data-lucide="${igual ? 'minus' : sobe ? 'trending-up' : 'trending-down'}"></i>${fmtSinal(u.varPts)} pts (${fmtSinal(u.varPct, 1)}%) vs ${CURTOS[(u.mes + 10) % 12]}`;
    } else v.innerHTML = u ? '<small>sem mês anterior para comparar</small>' : '';
    $('[data-s="media"]').textContent = fmt(r.media);
    $('[data-s="media-ajuda"]').textContent = r.media != null ? `${r.com.length} ${r.com.length === 1 ? 'mês' : 'meses'} · ${r.media >= META ? 'acima' : 'abaixo'} da meta (${fmt(META, 0)})` : '';
    $('[data-s="melhor"]').textContent = r.melhor ? fmt(r.melhor.nota) : '—';
    $('[data-s="melhor-mes"]').textContent = r.melhor ? MESES[r.melhor.mes - 1] : '';
    $('[data-s="pior"]').textContent = r.pior ? fmt(r.pior.nota) : '—';
    $('[data-s="pior-mes"]').textContent = r.pior ? MESES[r.pior.mes - 1] : '';
    $('[data-s="na-meta"]').textContent = r.com.length ? `${r.naMeta} de ${r.com.length}` : '—';
    $('[data-s="na-meta-barra"]').style.width = `${r.com.length ? r.naMeta / r.com.length * 100 : 0}%`;
  }

  /* ---------- Gráficos ---------- */
  let grafico = null;
  function prepararChart() {
    const C = window.Chart; if (!C) return false;
    C.defaults.color = '#9fb9b3'; C.defaults.font.family = 'Manrope, sans-serif'; C.defaults.font.weight = 600;
    C.defaults.borderColor = 'rgba(255,255,255,.06)';
    C.defaults.plugins.tooltip.backgroundColor = 'rgba(4,18,17,.95)'; C.defaults.plugins.tooltip.borderColor = 'rgba(61,255,168,.4)'; C.defaults.plugins.tooltip.borderWidth = 1;
    C.defaults.plugins.tooltip.padding = 12; C.defaults.plugins.tooltip.cornerRadius = 12;
    C.defaults.animation.duration = reduzMovimento ? 0 : 800;
    if (!C.registry.plugins.get('ssqvRotulos')) {
      // Nota no topo de cada barra/ponto; "Sem nota" nos meses vazios
      C.register({
        id: 'ssqvRotulos',
        afterDatasetsDraw(chart) {
          const { ctx, chartArea, scales: { x, y } } = chart;
          chart.data.datasets.forEach((ds, i) => {
            if (!ds.rotular || !chart.isDatasetVisible(i)) return;
            chart.getDatasetMeta(i).data.forEach((el, j) => {
              const v = ds.data[j];
              ctx.save(); ctx.textAlign = 'center';
              if (v == null) {
                if (!ds.semNota) { ctx.restore(); return; }
                const px = x.getPixelForValue(j), py = chartArea.bottom - 8;
                ctx.font = '700 10px Manrope'; ctx.fillStyle = 'rgba(159,185,179,.55)';
                ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(159,185,179,.25)';
                const w = Math.min(x.width / 12 * .62, 60);
                ctx.strokeRect(px - w / 2, y.getPixelForValue(META * .35), w, py - y.getPixelForValue(META * .35));
                if (ctx.measureText('Sem nota').width > w + 4) { ctx.fillText('Sem', px, py - 18); ctx.fillText('nota', px, py - 6); }   // coluna estreita: em 2 linhas
                else ctx.fillText('Sem nota', px, py - 6);
              } else {
                const txt = fmt(v), { x: px } = el;
                // duas linhas com notas parecidas no mesmo mês: o rótulo da menor vai para baixo do ponto
                const vizinho = chart.config.type === 'line' && chart.data.datasets.some((o, k) => k !== i && o.rotular && o.data[j] != null && o.data[j] > v && o.data[j] - v < (y.max - y.min) * .08);
                const py = vizinho ? el.y + 32 : el.y;
                ctx.font = `800 ${ds.rotuloTam || 12}px Manrope`;
                const larg = ctx.measureText(txt).width + 10;
                ctx.fillStyle = 'rgba(4,13,12,.8)'; ctx.beginPath(); ctx.roundRect(px - larg / 2, py - 24, larg, 18, 5); ctx.fill();
                ctx.fillStyle = ds.rotuloCor?.(j) || '#fff'; ctx.textBaseline = 'bottom'; ctx.fillText(txt, px, py - 9);
              }
              ctx.restore();
            });
          });
        }
      });
    }
    return true;
  }
  function desenhar(config) {
    grafico?.destroy();
    if (!prepararChart()) return;
    config.options.layout = { padding: { top: 30, right: 14, left: 4 } };
    grafico = new window.Chart($('#s-grafico'), config);
  }
  const maxEscala = vals => Math.max(META * 1.1, ...vals.filter(v => v != null)) * 1.08;

  function graficoAno(r) {
    const notas = r.meses.map(m => m.nota);
    const cores = r.meses.map(m => m.status.cor);
    desenhar({
      type: 'bar',
      data: {
        labels: CURTOS,
        datasets: [
          { type: 'bar', label: `Nota ${r.ano}`, data: notas, backgroundColor: cores.map(c => `${c}cc`), borderColor: cores, borderWidth: 1.5, borderRadius: 10, maxBarThickness: 64, rotular: true, semNota: true, rotuloCor: j => cores[j], order: 3 },
          { type: 'line', label: `Meta (${fmt(META, 0)})`, data: CURTOS.map(() => META), borderColor: '#c8f560', borderDash: [7, 6], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, order: 1 },
          { type: 'line', label: `Média do ano (${fmt(r.media)})`, data: CURTOS.map(() => r.media), borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0, pointHoverRadius: 0, order: 2, hidden: r.media == null }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, padding: 18, filter: i => i.datasetIndex !== 0 } },   // as cores das barras estão na legenda de status
          tooltip: { callbacks: { label: c => (c.dataset.type === 'bar' ? `Nota: ${c.raw == null ? 'sem nota' : `${fmt(c.raw)} · ${statusDe(c.raw).nome}`}` : `${c.dataset.label.replace(/\s*\(.*/, '')}: ${fmt(c.raw)}`) } }
        },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, suggestedMax: maxEscala(notas), ticks: { callback: v => fmt(v, 0) } } }
      }
    });
    $('#s-legenda').innerHTML = [STATUS.acima, STATUS.atencao, STATUS.abaixo, STATUS.vazio].map(s => `<span><i style="--c:${s.cor}"></i>${s.nome}</span>`).join('');
  }

  function graficoComparar(anos) {
    const todas = [];
    const datasets = anos.map((a, i) => {
      const d = Array.from({ length: 12 }, (_, m) => notaDe(a, m + 1)); todas.push(...d);
      const cor = CORES_ANOS[i % CORES_ANOS.length];
      return { type: 'line', label: String(a), data: d, borderColor: cor, backgroundColor: cor, borderWidth: 3, tension: .3, spanGaps: false, pointRadius: 5, pointHoverRadius: 7, rotular: true, rotuloTam: 11, rotuloCor: () => cor };
    });
    datasets.push({ type: 'line', label: `Meta (${fmt(META, 0)})`, data: CURTOS.map(() => META), borderColor: '#c8f560', borderDash: [7, 6], borderWidth: 2, pointRadius: 0, pointHoverRadius: 0 });
    desenhar({
      type: 'line',
      data: { labels: CURTOS, datasets },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, padding: 18 } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw == null ? 'sem nota' : fmt(c.raw)}` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: false, suggestedMin: Math.min(META * .8, ...todas.filter(v => v != null)) - 5, suggestedMax: maxEscala(todas), ticks: { callback: v => fmt(v, 0) } } }
      }
    });
    $('#s-legenda').innerHTML = anos.map((a, i) => `<span><i style="--c:${CORES_ANOS[i % CORES_ANOS.length]}"></i>${a}</span>`).join('') + '<span><i class="tracejado"></i>Meta</span>';
  }

  /* ---------- Tabela ---------- */
  const celStatus = s => `<span class="s-status" style="--c:${s.cor}"><i data-lucide="${s.icone}"></i>${s.nome}</span>`;
  function linhasTabelaAno(r) {
    const ate = r.ultimo ? Math.max(r.ultimo.mes, 1) : 0;
    return r.meses.map(m => ({
      mes: MESES[m.mes - 1], nota: m.nota, varPts: m.varPts, varPct: m.varPct, difMeta: m.difMeta, status: m.status, futuro: m.nota == null && m.mes > ate
    }));
  }
  function tabelaAno(r) {
    const linhas = linhasTabelaAno(r);
    const corpo = linhas.map(l => `<tr class="${l.nota == null ? 's-sem' : ''}" style="--sc-linha:${l.status.cor}">
      <th scope="row">${l.mes}</th>
      <td class="num"><b>${l.nota == null ? 'Sem nota' : fmt(l.nota)}</b></td>
      <td class="num ${l.varPts > 0 ? 'pos' : l.varPts < 0 ? 'neg' : ''}">${l.varPts == null ? '—' : `${fmtSinal(l.varPts)} pts <small>(${fmtSinal(l.varPct, 1)}%)</small>`}</td>
      <td class="num ${l.difMeta >= 0 ? 'pos' : l.difMeta < 0 ? 'neg' : ''}">${l.difMeta == null ? '—' : `${fmtSinal(l.difMeta)} pts`}</td>
      <td>${celStatus(l.status)}</td></tr>`).join('');
    const notas = r.com.map(m => m.nota);
    const rodape = r.com.length ? `<tr><th scope="row">Ano ${r.ano}</th><td class="num" colspan="4">Média <b>${fmt(r.media)}</b> · Máxima <b>${fmt(Math.max(...notas))}</b> (${MESES[r.melhor.mes - 1]}) · Mínima <b>${fmt(Math.min(...notas))}</b> (${MESES[r.pior.mes - 1]})</td></tr>` : '';
    $('#s-tabela').innerHTML = `<table class="tabela s-tab">
      <colgroup><col class="c-mes"><col><col><col><col class="c-status"></colgroup>
      <thead><tr><th><button type="button" disabled>Mês</button></th><th><button type="button" disabled>Nota</button></th><th><button type="button" disabled>Variação vs mês anterior</button></th><th><button type="button" disabled>Diferença para a meta</button></th><th><button type="button" disabled>Status</button></th></tr></thead>
      <tbody>${corpo}</tbody><tfoot>${rodape}</tfoot></table>`;
    $('#s-tab-sub').textContent = `Meta mensal: ${fmt(META, 0)} pontos. A variação compara com o mês imediatamente anterior (janeiro com dezembro do ano anterior).`;
  }
  function tabelaComparar(anos) {
    const rs = anos.map(resumo);
    const corpo = MESES.map((nome, i) => `<tr><th scope="row">${nome}</th>${rs.map(r => { const m = r.meses[i]; return `<td class="num"><span class="s-pont" style="--c:${m.status.cor}"></span>${m.nota == null ? '<span class="s-semtxt">Sem nota</span>' : fmt(m.nota)}</td>`; }).join('')}</tr>`).join('');
    const rod = (rot, f, casas = 2) => `<tr><th scope="row">${rot}</th>${rs.map(r => `<td class="num"><b>${r.com.length ? fmt(f(r), casas) : '—'}</b></td>`).join('')}</tr>`;
    $('#s-tabela').innerHTML = `<table class="tabela s-tab"><thead><tr><th><button type="button" disabled>Mês</button></th>${anos.map(a => `<th><button type="button" disabled>${a}</button></th>`).join('')}</tr></thead>
      <tbody>${corpo}</tbody><tfoot>${rod('Média', r => r.media)}${rod('Máxima', r => r.melhor.nota)}${rod('Mínima', r => r.pior.nota)}${rod('Meses na meta', r => r.naMeta, 0)}</tfoot></table>`;
    $('#s-tab-sub').textContent = `Comparação entre ${anos.join(', ')} · meta mensal ${fmt(META, 0)} pontos.`;
  }

  /* ---------- Exportar e imprimir ---------- */
  function dadosExport() {
    if (estado.comparar) {
      const anos = estado.anosComparar;
      return { cab: ['Mês', ...anos.map(String)], linhas: MESES.map((nome, i) => [nome, ...anos.map(a => { const n = notaDe(a, i + 1); return n == null ? 'Sem nota' : fmt(n); })]), nome: `Notas_SSQV_${anos.join('-')}` };
    }
    const r = resumo(estado.ano);
    return {
      cab: ['Mês', 'Nota', 'Variação (pts)', 'Variação (%)', 'Diferença para a meta', 'Status'],
      linhas: linhasTabelaAno(r).map(l => [l.mes, l.nota == null ? 'Sem nota' : fmt(l.nota), l.varPts == null ? '' : fmtSinal(l.varPts), l.varPct == null ? '' : fmtSinal(l.varPct, 1), l.difMeta == null ? '' : fmtSinal(l.difMeta), l.status.nome]),
      nome: `Notas_SSQV_${estado.ano}`
    };
  }
  function baixar(conteudo, tipo, nome) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo })); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#s-csv').addEventListener('click', () => {
    const d = dadosExport(), cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    baixar([d.cab.map(cel).join(';'), ...d.linhas.map(l => l.map(cel).join(';'))].join('\r\n'), 'text/csv;charset=utf-8', `${d.nome}.csv`);
  });
  $('#s-xls').addEventListener('click', () => {
    const d = dadosExport();
    baixar(`<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${d.cab.map(h => `<th style="background:#1f6f54;color:#fff">${escapar(h)}</th>`).join('')}</tr>${d.linhas.map(l => `<tr>${l.map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</table><p>Meta mensal: ${fmt(META, 0)}</p></body></html>`, 'application/vnd.ms-excel;charset=utf-8', `${d.nome}.xls`);
  });
  $('#s-pdf').addEventListener('click', async () => {
    if (!window.SMA_PDF) return;
    const bt = $('#s-pdf'), rot = $('span', bt), orig = rot.textContent;
    bt.disabled = true; rot.textContent = 'Gerando…';
    try {
      const foto = async el => (await window.SMA_PDF.capturar(el)).toDataURL('image/png');
      const [kpis, graf, tab] = await Promise.all([foto($('.s-kpis')), foto($('#s-grafico').closest('.fat-painel')), foto($('#s-tabela'))]);
      const titulo = estado.comparar ? `Comparação ${estado.anosComparar.join(' × ')}` : `Ano ${estado.ano}`;
      const pagina = `<div class="p-pdf-mini"><b>Segurança · Notas SSQV · ${titulo}</b><span>SMA Silvicultura · meta ${fmt(META, 0)} · ${new Date().toLocaleDateString('pt-BR')}</span></div>
        <img class="s-pdf-img" src="${kpis}" alt=""><img class="s-pdf-img" src="${graf}" alt=""><img class="s-pdf-img" src="${tab}" alt=""><p class="s-pdf-rod">${escapar($('#s-rodape').textContent)}</p>`;
      await window.SMA_PDF.gerar([pagina], `Notas_SSQV_${estado.comparar ? estado.anosComparar.join('-') : estado.ano}.pdf`, { retrato: true });
      rot.textContent = 'PDF baixado ✓';
    } catch (erro) { console.error('Segurança: PDF', erro); alert(`Não consegui gerar o PDF (${erro.message}).`); }
    finally { bt.disabled = false; setTimeout(() => { rot.textContent = orig; }, 2000); }
  });

  /* ---------- Orquestração ---------- */
  function renderizar() {
    if (estado.carregando) return;
    renderFiltros();
    $('#s-meta-rot').textContent = fmt(META, 0);
    const r = resumo(estado.comparar ? Math.max(...estado.anosComparar) : estado.ano);
    renderKPIs(r);
    if (estado.comparar && estado.anosComparar.length > 1) {
      $('#s-graf-eyebrow').textContent = 'Comparação entre anos'; graficoComparar(estado.anosComparar); tabelaComparar(estado.anosComparar);
    } else {
      $('#s-graf-eyebrow').textContent = `Mês a mês · ${r.ano}`; graficoAno(r); tabelaAno(r);
    }
    const ult = estado.notas.at(-1);
    $('#s-rodape').innerHTML = ult ? `<i data-lucide="calendar-check"></i>Última nota lançada: <b>${MESES[ult.mes - 1]}/${ult.ano}</b>` : 'Nenhuma nota lançada na planilha.';
    icones();
  }

  $('#s-atualizar').addEventListener('click', () => carregar(true));
  icones();
  carregar();
})();
