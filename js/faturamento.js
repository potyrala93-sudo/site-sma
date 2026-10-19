/* ==========================================================================
   SMA · Silvicultura — Painel de Faturamento
   Camadas: 1) leitura das planilhas  2) conversão de dados  3) filtros/estado
            4) componentes (cards, tabelas, gráficos)  5) renderização das seções
   ========================================================================== */

(() => {
  const F = window.SMA_DADOS.FATURAMENTO;
  const raiz = document.getElementById('fat');
  if (!F || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ======================================================================
     1. LEITURA DAS PLANILHAS (módulo compartilhado js/planilhas.js)
     2. CONVERSÃO E FORMATAÇÃO (padrão brasileiro)
     ====================================================================== */
  const { num, dataBR, obterDados } = window.SMA_PLANILHAS;

  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtBRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const fmtNum = new Intl.NumberFormat('pt-BR');
  const brl = v => fmtBRL.format(v || 0);
  const brlCurto = v => {
    const a = Math.abs(v);
    if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
    return fmtBRL0.format(v);
  };
  const pct = v => `${((v || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const dia = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  // Escala de cores da aderência, em passos de 1%:
  //   0% a 80%   → tons de VERMELHO (quanto mais perto de 0%, mais forte)
  //   81% a 95%  → tons de AMARELO
  //   96% a 100% → tons de VERDE
  //   acima de 100% → VERDE cada vez mais escuro
  function hslAderencia(a) {
    const p = Math.max(0, Math.floor((a || 0) * 100 + 1e-9));
    let t;
    if (p <= 80) { t = p / 80; return [2 + t * 6, 100 - t * 18, 40 + t * 24]; }           // vermelho forte → vermelho claro
    if (p <= 95) { t = (p - 81) / 14; return [40 + t * 12, 100, 50 + t * 8]; }            // âmbar → amarelo
    if (p <= 100) { t = (p - 96) / 4; return [138 + t * 6, 78 + t * 6, 52 - t * 4]; }     // verde vivo
    t = Math.min(1, (p - 101) / 49); return [146 + t * 4, 84 + t * 8, 44 - t * 18];      // verde mais escuro
  }
  function hslParaRgb([h, s, l]) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return [f(0), f(8), f(4)];
  }
  function corAderencia(a, alfa = 1) {
    const [r, g, b] = hslParaRgb(hslAderencia(a));
    return alfa === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alfa})`;
  }
  // Mesma cor, clareada o suficiente para ser lida como texto sobre o fundo escuro
  function corTextoAderencia(a) {
    const [h, s, l] = hslAderencia(a);
    const [r, g, b] = hslParaRgb([h, s, Math.max(l, 60)]);
    return `rgb(${r}, ${g}, ${b})`;
  }
  // Cor do texto em cima da cor da aderência (escuro sobre cores claras, branco sobre escuras)
  const textoSobre = a => { const [r, g, b] = hslParaRgb(hslAderencia(a)); return (0.299 * r + 0.587 * g + 0.114 * b) > 140 ? '#081a12' : '#ffffff'; };

  /* ======================================================================
     3. ESTADO E FILTROS
     ====================================================================== */

  const hoje = new Date();
  const lerSessao = (k, padrao) => { try { const v = sessionStorage.getItem(k); return v == null ? padrao : JSON.parse(v); } catch { return padrao; } };
  const gravarSessao = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* opcional */ } };

  const estado = {
    pessoa: null,                 // 'anderson' | 'carina' | 'juliano' | 'joyce'
    ...window.SMA_PLANILHAS.periodo.atual(),   // ano e RF atuais (outubro → RF10)
    comOR: true,
    somarNegociar: lerSessao('fat:somarNegociar', true), // soma os VALORES A SEREM NEGOCIADOS no TOTAL e na ADERÊNCIA
    supervisorOp: null,           // filtro do faturamento diário / frota
    equipeOp: null,
    frotasSel: null,              // Set de frotas escolhidas (null = padrão)
    dados: {},                    // abas carregadas
    erros: {},                    // abas com falha
    carregando: true,
    atualizadoEm: null
  };
  const pessoaAtual = () => F.pessoas.find(p => p.id === estado.pessoa);

  // Cor de cada supervisor (destaque das equipes nas tabelas)
  const COR_SUP = { Carina: '#3dffa8', Juliano: '#38bdf8', Joyce: '#c8f560' };
  const corSup = s => COR_SUP[s] || '#9fb6b2';
  const pessoaDoSup = s => F.pessoas.find(p => p.supervisor === s);

  // Coluna conforme o toggle "Outras Receitas": com → coluna "(OR)", sem → coluna equivalente sem "(OR)"
  const col = (linha, nome) => {
    const comOR = `${nome} (OR)`;
    return num(estado.comOR && comOR in linha ? linha[comOR] : linha[nome]);
  };
  const doPeriodo = l => window.SMA_PLANILHAS.periodo.doPeriodo(l, estado.ano, estado.rf);

  // Supervisor de cada equipe: planilha de estrutura (coluna SUPERVISOR) para o RF dela; senão a coluna da própria linha
  function supervisorDe(equipe, linha) {
    const est = estado.dados.estrutura || [];
    const doRF = est.find(e => e.EQUIPE === equipe && num(e.RF) === estado.rf);
    if (doRF) return doRF.SUPERVISOR;
    if (linha?.SUPERVISOR) return linha.SUPERVISOR;
    return est.find(e => e.EQUIPE === equipe)?.SUPERVISOR || null;
  }

  function equipesDoSupervisor(sup) {
    const set = new Set();
    (estado.dados.estrutura || []).filter(e => e.SUPERVISOR === sup && (num(e.RF) === estado.rf)).forEach(e => set.add(e.EQUIPE));
    (estado.dados.anderson || []).filter(doPeriodo).forEach(l => { if (supervisorDe(l.EQUIPE, l) === sup) set.add(l.EQUIPE); });
    const p = pessoaDoSup(sup);
    (estado.dados[p?.id] || []).filter(doPeriodo).forEach(l => set.add(l.EQUIPE));
    if (!set.size) (estado.dados.estrutura || []).filter(e => e.SUPERVISOR === sup).forEach(e => set.add(e.EQUIPE));
    return [...set].sort();
  }

  // Linha da planilha → modelo usado em cards, tabelas e gráficos.
  // "total" já considera a opção de somar os valores a serem negociados; "totalBase" é o TOTAL da planilha.
  function modelo(l) {
    const totalBase = num(l.TOTAL), metaAcum = col(l, 'META ACUMULADA'), aNegociar = num(l['VALORES A SEREM NEGOCIADOS']);
    const total = totalBase + (estado.somarNegociar ? aNegociar : 0);
    const aderBase = metaAcum ? totalBase / metaAcum : 0;
    return {
      equipe: l.EQUIPE,
      supervisor: supervisorDe(l.EQUIPE, l),
      du: num(l['D.U']), dp: num(l['D.P']),
      metaMensal: col(l, 'META MENSAL'), metaDiaria: col(l, 'META DIARIA'),
      produzido: num(l.PRODUZIDO), negociacao: num(l.NEGOCIACAO),
      totalBase, aNegociar, total, metaAcum,
      dif: total - metaAcum,
      aderBase,
      aderPotencial: metaAcum ? (totalBase + aNegociar) / metaAcum : 0,
      aderencia: metaAcum ? total / metaAcum : 0
    };
  }
  const temValor = m => m.totalBase || m.metaAcum || m.metaMensal || m.produzido;
  const linhasDe = pessoa => (estado.dados[pessoa] || []).filter(doPeriodo).map(modelo).filter(temValor);
  const linhasAtuais = () => linhasDe(estado.pessoa || 'anderson');

  function totais(linhas) {
    const s = k => linhas.reduce((a, l) => a + (l[k] || 0), 0);
    const t = {
      du: Math.max(0, ...linhas.map(l => l.du)), dp: Math.max(0, ...linhas.map(l => l.dp)),
      metaMensal: s('metaMensal'), metaDiaria: s('metaDiaria'), produzido: s('produzido'),
      negociacao: s('negociacao'), totalBase: s('totalBase'), aNegociar: s('aNegociar'),
      total: s('total'), metaAcum: s('metaAcum')
    };
    t.dif = t.total - t.metaAcum;
    t.aderencia = t.metaAcum ? t.total / t.metaAcum : 0;
    t.aderBase = t.metaAcum ? t.totalBase / t.metaAcum : 0;
    t.aderPotencial = t.metaAcum ? (t.totalBase + t.aNegociar) / t.metaAcum : 0;
    return t;
  }

  // Equipes no escopo do faturamento diário / frota
  function escopoEquipes() {
    if (estado.equipeOp) return [estado.equipeOp];
    if (estado.supervisorOp) return equipesDoSupervisor(estado.supervisorOp);
    const p = pessoaAtual();
    return p?.supervisor ? equipesDoSupervisor(p.supervisor) : null; // null = todas
  }

  /* ======================================================================
     4. COMPONENTES REUTILIZÁVEIS
     ====================================================================== */

  // Número com contagem animada (de onde parou até o novo valor)
  function contar(el, valor, formato) {
    const de = Number(el.dataset.valor || 0);
    el.dataset.valor = valor;
    if (reduzMovimento || de === valor) { el.textContent = formato(valor); return; }
    const t0 = performance.now(), dur = 1100;
    cancelAnimationFrame(el._raf);
    const passo = t => {
      const p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      el.textContent = formato(de + (valor - de) * e);
      if (p < 1) el._raf = requestAnimationFrame(passo);
    };
    el._raf = requestAnimationFrame(passo);
  }

  // Tabela sem rolagem: colunas com largura fixa (cabem na tela) e, em telas estreitas, cada equipe vira um card
  const COLUNAS = [
    { k: 'equipe', t: 'Equipe', tipo: 'equipe' },
    { k: 'du', t: 'D.U', tipo: 'int' }, { k: 'dp', t: 'D.P', tipo: 'int' },
    { k: 'metaMensal', t: 'Meta mensal' }, { k: 'metaDiaria', t: 'Meta diária' },
    { k: 'produzido', t: 'Produzido' }, { k: 'negociacao', t: 'Negociação' },
    { k: 'total', t: 'Total' }, { k: 'metaAcum', t: 'Meta acumulada' },
    { k: 'dif', t: 'DIF', tipo: 'dif' }, { k: 'aderencia', t: 'Aderência', tipo: 'ader' }
  ];
  const ordenacao = {}; // por tabela

  function celula(c, v, linha, rodape) {
    const rot = `data-rotulo="${c.t}"`;
    if (c.tipo === 'equipe') {
      if (rodape) return `<th scope="row" class="col-equipe"><span class="equipe-chip total">Total</span></th>`;
      const p = pessoaDoSup(linha.supervisor);
      return `<th scope="row" class="col-equipe" style="--sc:${corSup(linha.supervisor)}"><span class="equipe-chip">${escapar(v)}</span>${linha.supervisor ? `<span class="equipe-sup">${p ? `<img data-foto-pessoa="${p.id}" alt="">` : ''}${escapar(linha.supervisor)}</span>` : ''}</th>`;
    }
    if (c.tipo === 'int') return `<td ${rot}>${fmtNum.format(v)}</td>`;
    if (c.tipo === 'dif') return `<td ${rot} class="${v >= 0 ? 'pos' : 'neg'}">${brl(v)}</td>`;
    if (c.tipo === 'ader') return `<td ${rot} class="col-ader"><span class="ader-badge" style="--c:${corAderencia(v)};--ct:${textoSobre(v)}">${pct(v)}</span><span class="mini-barra"><i style="width:${Math.min(v, 1.5) / 1.5 * 100}%;background:${corAderencia(v)}"></i></span></td>`;
    return `<td ${rot}>${brl(v)}</td>`;
  }

  function tabelaEquipes(id, linhas) {
    const ord = ordenacao[id] || { k: 'aderencia', dir: -1 };
    const dados = [...linhas].sort((a, b) => (typeof a[ord.k] === 'string' ? a[ord.k].localeCompare(b[ord.k]) : a[ord.k] - b[ord.k]) * ord.dir);
    const t = totais(linhas);
    return `
      <div class="tabela-wrap" data-tabela="${id}">
        <table class="tabela">
          <colgroup><col class="c-equipe"><col class="c-dia"><col class="c-dia">${COLUNAS.slice(3, -1).map(() => '<col>').join('')}<col class="c-ader"></colgroup>
          <thead><tr>${COLUNAS.map(c => `<th scope="col"><button type="button" data-ordenar="${c.k}" class="${ord.k === c.k ? 'ativo' : ''}" aria-label="Ordenar por ${c.t}">${c.t}<i data-lucide="${ord.k === c.k ? (ord.dir > 0 ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'}"></i></button></th>`).join('')}</tr></thead>
          <tbody>${dados.map(l => `<tr style="--sc-linha:${corSup(l.supervisor)}">${COLUNAS.map(c => celula(c, l[c.k], l)).join('')}</tr>`).join('') || `<tr><td colspan="${COLUNAS.length}" class="vazio">Sem dados para este período.</td></tr>`}</tbody>
          ${dados.length > 1 ? `<tfoot><tr>${COLUNAS.map(c => celula(c, t[c.k], null, true)).join('')}</tr></tfoot>` : ''}
        </table>
      </div>`;
  }

  raiz.addEventListener('click', e => {
    const b = e.target.closest('[data-ordenar]');
    if (!b) return;
    const id = b.closest('[data-tabela]').dataset.tabela;
    const atual = ordenacao[id] || { k: 'aderencia', dir: -1 };
    ordenacao[id] = { k: b.dataset.ordenar, dir: atual.k === b.dataset.ordenar ? -atual.dir : (b.dataset.ordenar === 'equipe' ? 1 : -1) };
    renderizar(['tabela', 'ranking']);
  });

  // Frase de análise (caixa com ícone) logo abaixo de cada gráfico
  function analise(alvo, itens) {
    const el = $(alvo);
    if (!el) return;
    const lista = itens.filter(Boolean);
    el.hidden = !lista.length;
    el.innerHTML = `<span class="analise-icone"><i data-lucide="lightbulb"></i></span><div><strong class="analise-titulo">Leitura para decisão</strong><ul>${lista.map(i => `<li>${i}</li>`).join('')}</ul></div>`;
  }
  const b = t => `<strong>${t}</strong>`;

  // Gráficos (Chart.js) com tema do site, brilho neon, referência de 100% e rótulos de dados
  const graficos = {};
  function prepararChart() {
    if (!window.Chart) return false;
    const C = window.Chart;
    C.defaults.font.family = 'Manrope, system-ui, sans-serif';
    C.defaults.color = '#b8ccc8';
    C.defaults.borderColor = 'rgba(255,255,255,.07)';
    C.defaults.plugins.tooltip.backgroundColor = 'rgba(7,23,22,.96)';
    C.defaults.plugins.tooltip.borderColor = 'rgba(61,255,168,.4)';
    C.defaults.plugins.tooltip.borderWidth = 1;
    C.defaults.plugins.tooltip.padding = 12;
    C.defaults.plugins.tooltip.cornerRadius = 12;
    C.defaults.plugins.tooltip.titleColor = '#fff';
    C.defaults.plugins.tooltip.bodyColor = '#cfe3df';
    C.defaults.animation.duration = reduzMovimento ? 0 : 900;
    if (!C.registry.plugins.get('brilho')) {
      C.register({
        id: 'brilho',
        beforeDatasetDraw(chart, args) {
          const ds = chart.data.datasets[args.index];
          if (!ds.brilho) return;
          chart.ctx.save(); ds._brilhando = true;
          chart.ctx.shadowColor = ds.brilho; chart.ctx.shadowBlur = ds.forcaBrilho || 14;
        },
        afterDatasetDraw(chart, args) {
          const ds = chart.data.datasets[args.index];
          if (ds._brilhando) { chart.ctx.restore(); ds._brilhando = false; }
        }
      });
      C.register({
        id: 'referencia',
        afterDatasetsDraw(chart, _a, opts) {
          if (opts?.valor == null) return;
          const { ctx, chartArea, scales: { y } } = chart;
          const py = y.getPixelForValue(opts.valor);
          if (py < chartArea.top || py > chartArea.bottom) return;
          ctx.save();
          ctx.strokeStyle = 'rgba(200,245,96,.9)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
          ctx.shadowColor = 'rgba(200,245,96,.8)'; ctx.shadowBlur = 8;
          ctx.beginPath(); ctx.moveTo(chartArea.left, py); ctx.lineTo(chartArea.right, py); ctx.stroke();
          ctx.setLineDash([]); ctx.shadowBlur = 0;
          ctx.fillStyle = '#c8f560'; ctx.font = '700 11px Manrope';
          ctx.fillText(opts.rotulo || '', chartArea.right - ctx.measureText(opts.rotulo || '').width - 4, py - 6); // à direita: barras mais baixas
          ctx.restore();
        }
      });
      // Rótulos de dados: cada dataset informa o texto de cada ponto em ds.rotulo(valor, indice)
      C.register({
        id: 'rotulos',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          chart.data.datasets.forEach((ds, i) => {
            if (!ds.rotulo || !chart.isDatasetVisible(i)) return;
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((el, j) => {
              const txt = ds.rotulo(ds.data[j], j);
              if (!txt || el.skip) return;
              const { x, y } = el.tooltipPosition ? el.tooltipPosition() : el;
              const dentro = ds.rotuloDentro && el.height > 22;
              ctx.save();
              ctx.font = `800 ${ds.rotuloTamanho || 11}px Manrope`;
              ctx.textAlign = 'center';
              ctx.textBaseline = dentro ? 'middle' : 'bottom';
              const ty = dentro ? el.y + el.height / 2 : y - (ds.type === 'bar' || chart.config.type === 'bar' ? 6 : 10);
              const largura = ctx.measureText(txt).width + 10;
              if (!dentro) { // fundo escuro para o rótulo ficar legível sobre as linhas
                ctx.fillStyle = 'rgba(4,13,12,.78)';
                ctx.beginPath(); ctx.roundRect(x - largura / 2, ty - 17, largura, 17, 5); ctx.fill();
              }
              ctx.fillStyle = ds.rotuloCor || '#fff';
              ctx.fillText(txt, x, dentro ? ty : ty - 3);
              ctx.restore();
            });
          });
        }
      });
    }
    return true;
  }

  function desenharGrafico(id, canvas, config) {
    graficos[id]?.destroy();
    if (!canvas || !prepararChart()) return;
    config.options = config.options || {};
    config.options.layout = { padding: { top: 26, right: 12, left: 4 } }; // espaço para os rótulos
    graficos[id] = new window.Chart(canvas, config);
  }

  const gradiente = (cor1, cor2) => ctx => {
    const { chart } = ctx; const a = chart.chartArea;
    if (!a) return cor2;
    const g = chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, cor1); g.addColorStop(1, cor2);
    return g;
  };

  /* ======================================================================
     5. RENDERIZAÇÃO DAS SEÇÕES
     ====================================================================== */

  function renderKPIs() {
    const alvo = $('#fat-kpis');
    const t = totais(linhasAtuais());
    const v = (id, valor, f = brl) => { const el = $(`[data-kpi="${id}"]`, alvo); if (el) contar(el, valor, f); };
    v('metaMensal', t.metaMensal); v('metaDiaria', t.metaDiaria); v('metaAcum', t.metaAcum);
    v('total', t.total); v('produzido', t.produzido); v('negociacao', t.negociacao); v('aNegociar', t.aNegociar);
    v('du', t.du, n => fmtNum.format(Math.round(n))); v('dp', t.dp, n => fmtNum.format(Math.round(n)));
    v('dif', t.dif); v('aderencia', t.aderencia, pct);
    const difCard = $('[data-card="dif"]', alvo);
    difCard.classList.toggle('negativo', t.dif < 0);
    difCard.classList.toggle('positivo', t.dif >= 0);
    $('[data-kpi="difIcone"]', alvo).innerHTML = `<i data-lucide="${t.dif >= 0 ? 'trending-up' : 'trending-down'}"></i>`;
    $('#fat-neg-status').textContent = estado.somarNegociar ? 'somado ao total' : 'fora do total';
    $('#fat-neg-status').classList.toggle('ativo', estado.somarNegociar);
    $('#fat-total-rot').textContent = estado.somarNegociar ? 'Total + valores a negociar' : 'Total';
    $('#fat-ader-rot').textContent = estado.somarNegociar ? 'Aderência com valores a negociar' : 'Aderência';
    // Anel de progresso da aderência
    const anel = $('#fat-anel');
    anel.style.setProperty('--p', Math.min(t.aderencia, 1));
    anel.style.setProperty('--c', corAderencia(t.aderencia));
    $('#fat-anel-extra').hidden = t.aderencia <= 1;
    $('#fat-anel-extra').textContent = `+${pct(t.aderencia - 1)} acima da meta`;
    // Barra produzido / negociação / a negociar dentro do card TOTAL
    const soma = t.produzido + t.negociacao + (estado.somarNegociar ? t.aNegociar : 0) || 1;
    $('#fat-total-barra').innerHTML = `<i style="width:${t.produzido / soma * 100}%"></i><i style="width:${t.negociacao / soma * 100}%"></i>${estado.somarNegociar ? `<i style="width:${t.aNegociar / soma * 100}%"></i>` : ''}`;
    aplicarFundo(t.aderencia);
    $('#fat-destaque-ader').textContent = pct(t.aderencia);
    $('#fat-destaque-ader').style.setProperty('--c', corTextoAderencia(t.aderencia));

    // Leitura rápida: quanto falta, ritmo necessário x ritmo atual e projeção do mês
    const restantes = Math.max(0, t.du - t.dp);
    const falta = t.metaMensal - t.total;
    const ritmo = t.dp ? t.total / t.dp : 0;
    const necessario = restantes ? falta / restantes : 0;
    const projecao = t.total + ritmo * restantes;
    const itens = [];
    if (t.metaMensal <= 0) itens.push('Sem meta mensal cadastrada para este período.');
    else if (falta <= 0) itens.push(`🎯 Meta mensal ${b('já batida')}: ${b(brl(-falta))} acima. Mantenha o ritmo para ampliar a margem.`);
    else {
      itens.push(`Faltam ${b(brl(falta))} para a meta mensal. ${restantes ? `Com ${b(restantes + ' dias úteis')} restantes, o ritmo necessário é ${b(brl(necessario) + '/dia')}, contra ${b(brl(ritmo) + '/dia')} até agora (${b(pct(necessario ? ritmo / necessario : 0))} do necessário).` : 'Não há mais dias úteis no período.'}`);
      if (restantes) itens.push(projecao >= t.metaMensal
        ? `No ritmo atual, o mês fecha em ${b(brl(projecao))} (${b(pct(projecao / t.metaMensal))} da meta): ${b('meta ao alcance')}.`
        : `No ritmo atual, o mês fecha em ${b(brl(projecao))} (${b(pct(projecao / t.metaMensal))} da meta). É preciso ${b('acelerar ' + pct(necessario / (ritmo || 1) - 1))} a produção diária para fechar na meta.`);
    }
    if (t.aNegociar > 0) itens.push(estado.somarNegociar
      ? `Os ${b(brl(t.aNegociar))} a negociar já estão somados. Sem eles, a aderência seria ${b(pct(t.aderBase))}: fechar essas negociações é decisivo.`
      : `Fechar os ${b(brl(t.aNegociar))} a negociar elevaria a aderência de ${b(pct(t.aderBase))} para ${b(pct(t.aderPotencial))}.`);
    analise('#fat-analise-kpi', itens);
    icones();
  }

  function aplicarFundo(aderencia) {
    document.body.style.setProperty('--ader-cor', corAderencia(aderencia, 1));
    document.body.style.setProperty('--ader-cor-suave', corAderencia(aderencia, .3));
  }

  function renderTabela() {
    $('#fat-tabela').innerHTML = tabelaEquipes('equipes', linhasAtuais());
    aplicarFotos();
  }

  function renderGraficoAderencia() {
    const linhas = linhasAtuais().filter(l => l.metaAcum > 0).sort((a, c) => c.aderencia - a.aderencia);
    const base = linhas.map(l => +(l.aderBase * 100).toFixed(1));
    const extra = linhas.map(l => Math.max(0, +((l.aderPotencial - l.aderBase) * 100).toFixed(1)));
    const somado = estado.somarNegociar;
    desenharGrafico('aderencia', $('#fat-grafico-ader'), {
      type: 'bar',
      data: {
        labels: linhas.map(l => l.equipe),
        datasets: [
          {
            label: 'Aderência (produzido + negociação)', data: base, stack: 'a',
            backgroundColor: linhas.map(l => corAderencia(l.aderBase, .92)), borderRadius: 6, borderSkipped: false,
            brilho: 'rgba(61,255,168,.35)', forcaBrilho: 10,
            rotulo: (v, i) => extra[i] < 0.5 ? `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%` : null
          },
          {
            label: somado ? 'Valores a negociar (somados)' : 'Potencial com valores a negociar', data: extra, stack: 'a',
            backgroundColor: linhas.map(l => corAderencia(l.aderPotencial, somado ? .6 : .26)),
            borderColor: linhas.map(l => corAderencia(l.aderPotencial, .85)), borderWidth: { top: 1.5, left: 0, right: 0, bottom: 0 },
            borderRadius: 6, borderSkipped: false,
            rotulo: (v, i) => v >= 0.5 ? `${(base[i] + v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%` : null
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { weight: 800 }, color: '#fff' } },
          y: { stacked: true, beginAtZero: true, suggestedMax: 120, ticks: { callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,.06)' } }
        },
        plugins: {
          legend: { labels: { usePointStyle: true, pointStyle: 'rectRounded', boxWidth: 10 } },
          referencia: { valor: 100, rotulo: 'Meta 100%' },
          tooltip: {
            callbacks: {
              title: it => `Equipe ${it[0].label} · ${linhas[it[0].dataIndex].supervisor || ''}`,
              label: it => {
                const l = linhas[it.dataIndex];
                return it.datasetIndex === 0
                  ? ` Sem negociar: ${pct(l.aderBase)} (${brl(l.totalBase)} de ${brl(l.metaAcum)})`
                  : ` Com valores a negociar: ${pct(l.aderPotencial)} (+${brl(l.aNegociar)})`;
              }
            }
          }
        }
      }
    });

    // Análise: quem está abaixo, maior gap em R$, quem vira o jogo com as negociações
    if (!linhas.length) return analise('#fat-analise-ader', []);
    const abaixo = linhas.filter(l => l.aderencia < 1);
    const gap = [...abaixo].sort((a, c) => (c.metaAcum - c.total) - (a.metaAcum - a.total));
    const viram = linhas.filter(l => l.aderBase < 1 && l.aderPotencial >= 1);
    const melhor = linhas[0], pior = linhas[linhas.length - 1];
    const itens = [
      abaixo.length
        ? `${b(abaixo.length + ' de ' + linhas.length)} equipes estão abaixo de 100%. Maior distância em reais: ${gap.slice(0, 3).map(l => `${b(l.equipe)} (faltam ${brl(l.metaAcum - l.total)})`).join(', ')}. ${b('Priorize essas equipes')}: elas concentram ${b(pct(gap.slice(0, 3).reduce((s, l) => s + (l.metaAcum - l.total), 0) / Math.max(1, abaixo.reduce((s, l) => s + (l.metaAcum - l.total), 0))))} do que falta.`
        : `🎯 ${b('Todas as equipes')} estão com aderência igual ou acima de 100%.`,
      viram.length ? `Fechando as negociações pendentes, ${viram.map(l => b(l.equipe)).join(', ')} ${viram.length > 1 ? 'passam' : 'passa'} de 100%: ${b('acelere essas negociações')}.` : null,
      `Destaque: ${b(melhor.equipe)} lidera com ${b(pct(melhor.aderencia))}; ${b(pior.equipe)} tem a menor aderência (${pct(pior.aderencia)}) e merece atenção imediata.`
    ];
    analise('#fat-analise-ader', itens);
  }

  // Estrutura do supervisor (planilha de estrutura): usa o RF selecionado ou, se ele não existir lá, o RF mais recente
  const ICONE_ESTRUTURA = t => /colab/i.test(t) ? 'users' : /trator/i.test(t) ? 'tractor' : /caminh/i.test(t) ? 'truck' : /drone/i.test(t) ? 'plane' : 'box';
  function estruturaDoSupervisor(sup) {
    const est = (estado.dados.estrutura || []).filter(e => e.SUPERVISOR === sup);
    if (!est.length) return null;
    const rfs = [...new Set(est.map(e => num(e.RF)))];
    const rf = rfs.includes(estado.rf) ? estado.rf : Math.max(...rfs);
    const linhas = est.filter(e => num(e.RF) === rf);
    const porTipo = new Map(), porEquipe = new Map();
    linhas.forEach(e => {
      const qtd = num(e.TOTAL), tipo = e.ESTRUTURA.trim();
      porTipo.set(tipo, (porTipo.get(tipo) || 0) + qtd);
      const eq = porEquipe.get(e.EQUIPE) || [];
      eq.push({ tipo, qtd }); porEquipe.set(e.EQUIPE, eq);
    });
    const ordem = t => /colab/i.test(t) ? 0 : /trator/i.test(t) ? 1 : /caminh/i.test(t) ? 2 : 3;
    const tipos = [...porTipo.entries()].sort((a, c) => ordem(a[0]) - ordem(c[0]) || a[0].localeCompare(c[0]));
    const somaTipo = re => tipos.filter(([t]) => re.test(t)).reduce((s, [, q]) => s + q, 0);
    return { rf, tipos, porEquipe, colaboradores: somaTipo(/colab/i), tratores: somaTipo(/trator/i), caminhoes: somaTipo(/caminh/i), outros: somaTipo(/^(?!.*(colab|trator|caminh)).*/i) };
  }
  function blocoEstrutura(sup) {
    const e = estruturaDoSupervisor(sup);
    if (!e) return '';
    return `
      <div class="sup-estrutura">
        <div class="sup-est-topo">
          <span class="eyebrow">Estrutura${e.rf !== estado.rf ? ` · RF${String(e.rf).padStart(2, '0')}` : ''}</span>
          <div class="est-resumo">
            ${e.tipos.map(([t, q]) => `<span class="est-item"><i data-lucide="${ICONE_ESTRUTURA(t)}"></i><b>${fmtNum.format(q)}</b> ${escapar(t)}</span>`).join('')}
          </div>
        </div>
        <div class="est-equipes">
          ${[...e.porEquipe.entries()].sort((a, c) => a[0].localeCompare(c[0])).map(([eq, itens]) => `
            <div class="est-equipe"><span class="equipe-chip">${escapar(eq)}</span>
              <span>${itens.map(i => `<i data-lucide="${ICONE_ESTRUTURA(i.tipo)}"></i>${fmtNum.format(i.qtd)} ${escapar(i.tipo)}`).join('<em>·</em>')}</span></div>`).join('')}
        </div>
      </div>`;
  }

  function renderRanking() {
    const linhas = linhasDe('anderson');
    const sups = F.pessoas.filter(p => p.supervisor);
    const grupos = sups.map(p => {
      const ls = linhas.filter(l => l.supervisor === p.supervisor);
      return { pessoa: p, linhas: ls, t: totais(ls) };
    }).filter(g => g.linhas.length);
    const ranking = [...grupos].sort((a, c) => c.t.aderencia - a.t.aderencia);

    const ordemPodio = [1, 0, 2].map(i => ranking[i]).filter(Boolean);
    const medalhas = ['ouro', 'prata', 'bronze'];
    $('#fat-podio').innerHTML = ordemPodio.map(g => {
      const pos = ranking.indexOf(g);
      return `
        <div class="podio-lugar lugar-${pos + 1}" style="--c:${corAderencia(g.t.aderencia)};--ct:${corTextoAderencia(g.t.aderencia)}">
          <div class="podio-foto"><img data-foto-pessoa="${g.pessoa.id}" alt="Foto de ${g.pessoa.nome}"><span class="medalha ${medalhas[pos]}" aria-hidden="true"><i data-lucide="${pos === 0 ? 'crown' : 'medal'}"></i></span></div>
          <strong>${g.pessoa.nome}</strong>
          <span class="podio-ader">${pct(g.t.aderencia)}</span>
          <div class="podio-base"><span>${pos + 1}º</span></div>
        </div>`;
    }).join('') || '<p class="vazio">Sem dados de supervisores para este período.</p>';

    const p = pessoaAtual();
    const visiveis = p?.supervisor ? grupos.filter(g => g.pessoa.supervisor === p.supervisor) : ranking;
    $('#fat-supervisores').innerHTML = visiveis.map(g => `
      <article class="sup-card glass spot" style="--c:${corAderencia(g.t.aderencia)};--ct:${corTextoAderencia(g.t.aderencia)};--sc:${corSup(g.pessoa.supervisor)}">
        <header class="sup-topo">
          <span class="sup-foto"><img data-foto-pessoa="${g.pessoa.id}" alt="Foto de ${g.pessoa.nome}"></span>
          <div class="sup-info">
            <span class="eyebrow">${ranking.indexOf(g) + 1}º lugar · ${g.linhas.length} equipe${g.linhas.length > 1 ? 's' : ''}</span>
            <h3>${g.pessoa.nome}</h3>
            <div class="sup-metricas">
              <span><small>Total</small>${brl(g.t.total)}</span>
              <span><small>Meta acumulada</small>${brl(g.t.metaAcum)}</span>
              <span class="${g.t.dif >= 0 ? 'pos' : 'neg'}"><small>DIF</small>${brl(g.t.dif)}</span>
            </div>
          </div>
          <div class="sup-ader"><small>Aderência</small><strong>${pct(g.t.aderencia)}</strong></div>
        </header>
        ${blocoEstrutura(g.pessoa.supervisor)}
        ${tabelaEquipes('sup-' + g.pessoa.id, g.linhas)}
      </article>`).join('');

    // Análise do ranking
    if (ranking.length) {
      const lider = ranking[0], ultimo = ranking[ranking.length - 1];
      const faltaUltimo = ultimo.t.metaAcum - ultimo.t.total;
      analise('#fat-analise-ranking', [
        `${b(lider.pessoa.nome)} lidera com ${b(pct(lider.t.aderencia))}${ranking[1] ? `, ${b((lider.t.aderencia - ranking[1].t.aderencia) * 100 > 0 ? ((lider.t.aderencia - ranking[1].t.aderencia) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' p.p.' : 'empatado')} à frente de ${ranking[1].pessoa.nome}` : ''}.`,
        faltaUltimo > 0 ? `${b(ultimo.pessoa.nome)} precisa de ${b(brl(faltaUltimo))} para chegar a 100% da meta acumulada. Pior equipe dela${ultimo.pessoa.id === 'juliano' ? 'e' : ''}: ${b([...ultimo.linhas].sort((a, c) => a.aderencia - c.aderencia)[0].equipe)} (${pct([...ultimo.linhas].sort((a, c) => a.aderencia - c.aderencia)[0].aderencia)}).` : `Todos os supervisores estão com a meta acumulada batida. 🎯`,
        !estado.somarNegociar && ranking.some(g => g.t.aderPotencial >= 1 && g.t.aderencia < 1)
          ? `Com as negociações pendentes, ${ranking.filter(g => g.t.aderPotencial >= 1 && g.t.aderencia < 1).map(g => b(g.pessoa.nome)).join(' e ')} ${ranking.filter(g => g.t.aderPotencial >= 1 && g.t.aderencia < 1).length > 1 ? 'chegariam' : 'chegaria'} a 100%.` : null
      ]);
    } else analise('#fat-analise-ranking', []);
    aplicarFotos();
    icones();
  }

  // Botões de supervisor / equipe (usados pelo diário e pela frota)
  function renderFiltroOperacional() {
    const p = pessoaAtual();
    if (p?.supervisor) estado.supervisorOp = p.supervisor;
    const sups = p?.supervisor ? F.pessoas.filter(x => x.id === p.id) : F.pessoas.filter(x => x.supervisor);
    $('#fat-op-sups').innerHTML = (p?.supervisor ? '' : `<button type="button" class="chip-filtro ${!estado.supervisorOp ? 'ativo' : ''}" data-sup="">Visão total</button>`) +
      sups.map(s => `<button type="button" class="chip-filtro ${estado.supervisorOp === s.supervisor ? 'ativo' : ''}" data-sup="${s.supervisor}"><img data-foto-pessoa="${s.id}" alt="">${s.nome}</button>`).join('');
    const equipes = estado.supervisorOp ? equipesDoSupervisor(estado.supervisorOp) : [];
    const linha2 = $('#fat-op-equipes');
    linha2.hidden = !equipes.length;
    linha2.innerHTML = equipes.length ? `<button type="button" class="chip-filtro mini ${!estado.equipeOp ? 'ativo' : ''}" data-equipe="">Todas as equipes</button>` +
      equipes.map(e => `<button type="button" class="chip-filtro mini ${estado.equipeOp === e ? 'ativo' : ''}" data-equipe="${e}">Equipe ${e}</button>`).join('') : '';
    aplicarFotos();
  }
  $('#fat-op').addEventListener('click', e => {
    const s = e.target.closest('[data-sup]'), q = e.target.closest('[data-equipe]');
    if (s) { estado.supervisorOp = s.dataset.sup || null; estado.equipeOp = null; estado.frotasSel = null; }
    else if (q) { estado.equipeOp = q.dataset.equipe || null; estado.frotasSel = null; }
    else return;
    renderizar(['op', 'diario', 'frota']);
  });

  // Agrupa observações parecidas em motivos (ex.: "Manutençã Mecanica" e "manutenção mecânica")
  function motivo(texto) {
    const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (/manut|mecanic|quebr|oficina|pneu|hidraul/.test(t)) return 'Manutenção / quebra';
    if (/agua/.test(t)) return 'Falta de água';
    if (/chuva|chov/.test(t)) return 'Chuva';
    if (/epi/.test(t)) return 'Espera de EPI';
    if (/hexagon|gps|sistema|tablet/.test(t)) return 'Sistema / equipamento eletrônico';
    if (/combust|diesel|abastec/.test(t)) return 'Combustível / abastecimento';
    if (/falta de (operador|pessoal|gente)|operador/.test(t)) return 'Falta de operador';
    if (/muda/.test(t)) return 'Falta de mudas';
    return texto.trim().slice(0, 40);
  }
  const contarMotivos = textos => {
    const m = new Map();
    textos.forEach(t => { const k = motivo(t); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, c) => c[1] - a[1]);
  };

  function renderDiario() {
    const escopo = escopoEquipes();
    const linhas = (estado.dados.diario || []).filter(l => num(l.ANO) === estado.ano && num(l.RF) === estado.rf && (!escopo || escopo.includes(l.EQUIPE)));
    const porDia = new Map();
    linhas.forEach(l => {
      const d = dataBR(l.DIA); if (!d) return;
      const k = +d;
      const a = porDia.get(k) || { d, total: 0, meta: 0, prod: 0, neg: 0, obs: [] };
      a.total += num(l.TOTAL); a.prod += num(l.PRODUCAO); a.neg += num(l.NEGOCIACOES);
      a.meta += num(estado.comOR ? l['META DIARIA OUTRAS RECEITAS'] : l['META DIARIA']);
      if (obsValida(l.OBS)) a.obs.push(`${l.EQUIPE}: ${l.OBS.trim()}`);
      porDia.set(k, a);
    });
    const dias = [...porDia.values()].filter(x => x.total !== 0).sort((a, c) => a.d - c.d); // oculta dias com total R$ 0
    $('#fat-diario-vazio').hidden = dias.length > 0;
    const soma = dias.reduce((s, x) => s + x.total, 0);
    const media = dias.length ? soma / dias.length : 0;
    $('#fat-diario-resumo').innerHTML = dias.length ? `
      <span><small>Acumulado no período</small><strong>${brl(soma)}</strong></span>
      <span><small>Média por dia</small><strong>${brl(media)}</strong></span>
      <span><small>Melhor dia</small><strong>${(() => { const m = dias.reduce((a, c) => c.total > a.total ? c : a); return `${dia(m.d)} · ${brlCurto(m.total)}`; })()}</strong></span>
      <span><small>Dias acima da meta</small><strong>${dias.filter(x => x.meta && x.total >= x.meta).length} de ${dias.length}</strong></span>` : '';
    desenharGrafico('diario', $('#fat-grafico-diario'), {
      type: 'line',
      data: {
        labels: dias.map(x => dia(x.d)),
        datasets: [
          {
            label: 'Total do dia', data: dias.map(x => x.total), borderColor: '#3dffa8', borderWidth: 3, tension: .35, fill: true,
            backgroundColor: gradiente('rgba(61,255,168,.35)', 'rgba(61,255,168,0)'),
            pointBackgroundColor: dias.map(x => x.meta && x.total >= x.meta ? '#3dffa8' : '#ff6b7a'), pointBorderColor: '#040d0c', pointBorderWidth: 2, pointRadius: 5, pointHoverRadius: 8,
            brilho: 'rgba(61,255,168,.8)',
            rotulo: v => brlCurto(v), rotuloCor: '#eafff5'
          },
          { label: estado.comOR ? 'Meta diária (com Outras Receitas)' : 'Meta diária', data: dias.map(x => x.meta), borderColor: '#c8f560', borderDash: [6, 6], borderWidth: 2, pointRadius: 0, tension: .2, fill: false }
        ]
      },
      options: {
        maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => brlCurto(v) }, grid: { color: 'rgba(255,255,255,.06)' } } },
        plugins: {
          legend: { labels: { usePointStyle: true, boxWidth: 8 } },
          tooltip: { callbacks: {
            title: it => dias[it[0].dataIndex].d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }),
            label: it => ` ${it.dataset.label}: ${brl(it.raw)}`,
            afterBody: it => { const x = dias[it[0].dataIndex]; return [` Produção: ${brl(x.prod)}`, ` Negociações: ${brl(x.neg)}`, ...x.obs.slice(0, 3).map(o => ` 📝 ${o}`)]; }
          } }
        }
      }
    });

    renderDiaEquipes(linhas, dias);

    // Análise: tendência recente, dias abaixo da meta e o que mais travou
    if (!dias.length) return analise('#fat-analise-diario', []);
    const metaMedia = dias.reduce((s, x) => s + x.meta, 0) / dias.length;
    const abaixo = dias.filter(x => x.meta && x.total < x.meta);
    const recentes = dias.slice(-3);
    const mediaRecente = recentes.reduce((s, x) => s + x.total, 0) / recentes.length;
    const anteriores = dias.slice(0, -3);
    const mediaAnterior = anteriores.length ? anteriores.reduce((s, x) => s + x.total, 0) / anteriores.length : null;
    const pior = dias.reduce((a, c) => c.total < a.total ? c : a);
    const motivos = contarMotivos(dias.flatMap(x => x.obs.map(o => o.split(': ').slice(1).join(': '))));
    const perdido = abaixo.reduce((s, x) => s + (x.meta - x.total), 0);
    analise('#fat-analise-diario', [
      metaMedia ? `Média diária de ${b(brl(media))}, ou ${b(pct(media / metaMedia))} da meta diária (${brl(metaMedia)}). ${abaixo.length ? `Em ${b(abaixo.length + ' de ' + dias.length + ' dias')} ficou abaixo da meta, deixando ${b(brl(perdido))} na mesa.` : b('Todos os dias acima da meta.')}` : null,
      mediaAnterior != null ? `Últimos 3 dias: média de ${b(brl(mediaRecente))}, ${mediaRecente >= mediaAnterior ? `${b('alta de ' + pct(mediaRecente / mediaAnterior - 1))}` : `${b('queda de ' + pct(1 - mediaRecente / mediaAnterior))}`} em relação aos dias anteriores${mediaRecente < mediaAnterior ? ': investigue o que mudou nas frentes de trabalho.' : '.'}` : null,
      `Pior dia: ${b(dia(pior.d))} com ${b(brl(pior.total))}${pior.obs.length ? ` (registros: ${escapar(pior.obs.slice(0, 2).join('; '))})` : ''}.`,
      motivos.length ? `Motivos mais registrados nas observações: ${motivos.slice(0, 3).map(([m, n]) => `${b(escapar(m))} (${n}x)`).join(', ')}. ${b('Atacar o principal motivo')} é o caminho mais rápido para recuperar produção.` : null
    ]);
  }

  /* ---------- Dia a dia: tabela por equipe (faturamento, meta, total, delta e observações) ---------- */
  const fd = { dia: null, ordem: { k: 'delta', dir: -1 }, assinatura: '' };
  function renderDiaEquipes(linhas, dias) {
    const painel = $('#fd-painel');
    painel.hidden = !dias.length;
    if (!dias.length) return;
    // dias disponíveis (os mesmos do gráfico); abre no último dia lançado
    const chaves = dias.map(x => +x.d);
    const assinatura = `${estado.ano}|${estado.rf}|${chaves.join(',')}`;
    if (assinatura !== fd.assinatura) { fd.assinatura = assinatura; fd.dia = chaves.at(-1); }
    if (fd.dia !== 'todos' && !chaves.includes(fd.dia)) fd.dia = chaves.at(-1);
    const rfTxt = `RF${String(estado.rf).padStart(2, '0')}`;
    $('#fd-dia').innerHTML = `<option value="todos"${fd.dia === 'todos' ? ' selected' : ''}>Período todo (${rfTxt})</option>` +
      [...dias].reverse().map(x => `<option value="${+x.d}"${+x.d === fd.dia ? ' selected' : ''}>${x.d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}</option>`).join('');

    // agrega por equipe
    const doDia = l => { const d = dataBR(l.DIA); return d && (fd.dia === 'todos' || +d === fd.dia); };
    const porEquipe = new Map();
    linhas.filter(doDia).forEach(l => {
      const e = porEquipe.get(l.EQUIPE) || { equipe: l.EQUIPE, supervisor: supervisorDe(l.EQUIPE, l), prod: 0, neg: 0, total: 0, meta: 0, obs: [] };
      e.prod += num(l.PRODUCAO); e.neg += num(l.NEGOCIACOES); e.total += num(l.TOTAL);
      e.meta += num(estado.comOR ? l['META DIARIA OUTRAS RECEITAS'] : l['META DIARIA']);
      if (obsValida(l.OBS)) e.obs.push({ d: dataBR(l.DIA), texto: l.OBS.trim() });
      porEquipe.set(l.EQUIPE, e);
    });
    // diferenças de centavos (arredondamento das negociações) contam como na meta
    const naMeta = d => d > -1;
    const lista = [...porEquipe.values()].filter(e => e.total || e.meta || e.obs.length)
      .map(e => ({ ...e, delta: Math.abs(e.total - e.meta) < 1 ? 0 : e.total - e.meta, ating: e.meta ? e.total / e.meta : null }));
    const { k, dir } = fd.ordem;
    const val = e => (k === 'equipe' ? e.equipe : e[k] ?? -Infinity);
    lista.sort((a, c) => (typeof val(a) === 'string' ? val(a).localeCompare(val(c), 'pt-BR') : val(a) - val(c)) * dir || a.equipe.localeCompare(c.equipe, 'pt-BR'));

    const comMeta = lista.filter(e => e.meta);
    const melhor = comMeta.length ? comMeta.reduce((a, c) => (c.delta > a.delta ? c : a)) : null;
    const pior = comMeta.length ? comMeta.reduce((a, c) => (c.delta < a.delta ? c : a)) : null;
    const tot = lista.reduce((t, e) => ({ prod: t.prod + e.prod, neg: t.neg + e.neg, total: t.total + e.total, meta: t.meta + e.meta }), { prod: 0, neg: 0, total: 0, meta: 0 });
    tot.delta = tot.total - tot.meta;
    const positivas = comMeta.filter(e => naMeta(e.delta)).length;

    $('#fd-quando').textContent = fd.dia === 'todos' ? `no ${rfTxt}/${estado.ano}` : `em ${new Date(fd.dia).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}`;
    $('#fd-sub').textContent = `Total = produção + negociações. Delta = total − meta diária${estado.comOR ? ' (com Outras Receitas)' : ''}${fd.dia === 'todos' ? ', somados no período' : ''}. Clique nos títulos para ordenar.`;
    $('#fd-placar').innerHTML = `
      <span class="fd-pl pos"><i data-lucide="trending-up"></i><b>${positivas}</b> ${positivas === 1 ? 'equipe' : 'equipes'} na meta ou acima</span>
      <span class="fd-pl neg"><i data-lucide="trending-down"></i><b>${comMeta.length - positivas}</b> abaixo da meta</span>
      <span class="fd-pl ${tot.delta >= 0 ? 'pos' : 'neg'}"><i data-lucide="${tot.delta >= 0 ? 'circle-check' : 'circle-alert'}"></i>Saldo do grupo: <b>${tot.delta >= 0 ? '+' : ''}${brl(tot.delta)}</b></span>`;

    const seta = c => (fd.ordem.k === c ? (fd.ordem.dir > 0 ? '▲' : '▼') : '');
    const th = (c, t) => `<th><button type="button" data-ord="${c}" class="${fd.ordem.k === c ? 'ativo' : ''}">${t} <em>${seta(c)}</em></button></th>`;
    const linhaHTML = (e, i) => {
      const status = !e.meta ? 'neutro' : naMeta(e.delta) ? 'pos' : 'neg';
      const eMelhor = e === melhor && e.delta > 0, ePior = e === pior && e.delta < 0;
      const marca = eMelhor ? '<span class="fd-marca topo" title="Maior saldo positivo">🏆</span>' : ePior ? '<span class="fd-marca alerta" title="Maior saldo negativo">⚠️</span>' : '';
      const p = pessoaDoSup(e.supervisor);
      const obs = e.obs.slice(-3).reverse().map(o => `<li title="${escapar(o.texto)}">${fd.dia === 'todos' && o.d ? `<em>${dia(o.d)}</em> ` : ''}${escapar(o.texto)}</li>`).join('');
      const largura = e.ating == null ? 0 : Math.min(e.ating, 1.5) / 1.5 * 100;
      return `<tr class="fd-linha fd-${status}${eMelhor ? ' melhor' : ''}${ePior ? ' pior' : ''}" style="--i:${i};--sc:${corSup(e.supervisor)}">
        <th scope="row" class="col-equipe" data-rotulo="Equipe"><span class="equipe-chip">${escapar(e.equipe)}</span>${marca}${e.supervisor ? `<span class="equipe-sup">${p ? `<img data-foto-pessoa="${p.id}" alt="">` : ''}${escapar(e.supervisor)}</span>` : ''}</th>
        <td data-rotulo="Produção">${brl(e.prod)}</td>
        <td data-rotulo="Negociações">${e.neg ? brl(e.neg) : '<span class="fd-mudo">—</span>'}</td>
        <td data-rotulo="Total"><b>${brl(e.total)}</b></td>
        <td data-rotulo="Meta">${e.meta ? brl(e.meta) : '<span class="fd-mudo">sem meta</span>'}</td>
        <td data-rotulo="Delta" class="fd-delta-cel"><span class="fd-delta fd-${status}"><span class="fd-seta">${status === 'pos' ? '▲' : status === 'neg' ? '▼' : '•'}</span> ${e.meta ? `${e.delta >= 0 ? '+' : ''}${brl(e.delta)}` : '—'}</span>${e.ating != null ? `<span class="fd-barra" title="${pct(e.ating)} da meta"><i style="width:${largura}%;background:${corAderencia(e.ating)}"></i><span class="fd-barra-meta"></span></span><small>${pct(e.ating)} da meta</small>` : ''}</td>
        <td data-rotulo="Observações" class="fd-obs">${obs ? `<ul>${obs}</ul>${e.obs.length > 3 ? `<small>+${e.obs.length - 3} observações</small>` : ''}` : '<span class="fd-mudo">—</span>'}</td>
      </tr>`;
    };
    $('#fd-tabela').innerHTML = lista.length ? `<table class="tabela fd-tabela">
      <thead><tr>${th('equipe', 'Equipe')}${th('prod', 'Produção')}${th('neg', 'Negociações')}${th('total', 'Total')}${th('meta', 'Meta')}${th('delta', 'Delta')}<th><button type="button" disabled>Observações</button></th></tr></thead>
      <tbody>${lista.map(linhaHTML).join('')}</tbody>
      <tfoot><tr class="${naMeta(tot.delta) ? 'fd-pos' : 'fd-neg'}"><th scope="row">Total</th><td>${brl(tot.prod)}</td><td>${brl(tot.neg)}</td><td><b>${brl(tot.total)}</b></td><td>${brl(tot.meta)}</td>
        <td><span class="fd-delta ${naMeta(tot.delta) ? 'fd-pos' : 'fd-neg'}"><span class="fd-seta">${naMeta(tot.delta) ? '▲' : '▼'}</span> ${tot.delta >= 0 ? '+' : ''}${brl(tot.delta)}</span>${tot.meta ? `<small>${pct(tot.total / tot.meta)} da meta</small>` : ''}</td><td></td></tr></tfoot>
    </table>` : '<p class="fd-mudo fd-vazio">Nenhum lançamento por equipe neste dia.</p>';
    aplicarFotos(false);
    window.lucide?.createIcons();
  }
  $('#fd-dia').addEventListener('change', e => { fd.dia = e.target.value === 'todos' ? 'todos' : +e.target.value; renderizar(['diario']); });
  $('#fd-tabela').addEventListener('click', e => {
    const b = e.target.closest('[data-ord]'); if (!b) return;
    const k = b.dataset.ord;
    fd.ordem = { k, dir: fd.ordem.k === k ? -fd.ordem.dir : (k === 'equipe' ? 1 : -1) };
    renderizar(['diario']);
  });

  // Imagem da tabela inteira para compartilhar (largura fixa de print, sem animações nem controles)
  $('#fd-imagem').addEventListener('click', async () => {
    const botao = $('#fd-imagem');
    if (!window.SMA_PDF) { alertaBreve('O gerador de imagem ainda está carregando. Tente de novo em instantes.'); return; }
    botao.disabled = true; botao.classList.add('girando');
    const palco = document.createElement('div');
    palco.className = 'fd-palco-print';
    const copia = $('#fd-painel').cloneNode(true);
    copia.removeAttribute('id'); copia.hidden = false;
    copia.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    copia.querySelector('.fd-acoes')?.remove();
    const sub = copia.querySelector('.fd-sub');
    if (sub) sub.textContent = `SMA Silvicultura · Unidade São Miguel · ${responsavelAtual()} · gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
    palco.appendChild(copia);
    document.body.appendChild(palco);
    try {
      await Promise.all([...palco.querySelectorAll('img')].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
      const canvas = await window.SMA_PDF.capturar(copia, { fundo: '#ffffff' });
      const blob = await canvasParaBlob(canvas);
      const quando = fd.dia === 'todos' ? `RF${String(estado.rf).padStart(2, '0')}_${estado.ano}` : new Date(fd.dia).toLocaleDateString('pt-BR').replace(/\//g, '-');
      mostrarPrevia(blob, `Faturamento_por_equipe_${quando}.png`, '');
      $('#fat-previa-titulo').innerHTML = '<i data-lucide="image"></i> Tabela pronta para compartilhar'; icones();
    } catch (erro) {
      console.error('Faturamento: imagem da tabela', erro);
      alertaBreve(`Não consegui gerar a imagem: ${erro.message}`);
    } finally {
      palco.remove();
      botao.disabled = false; botao.classList.remove('girando');
    }
  });
  function responsavelAtual() {
    const p = typeof pessoaAtual === 'function' ? pessoaAtual() : null;
    return p ? `Visão de ${p.nome}` : 'Todas as equipes';
  }

  const CORES_FROTA = ['#3dffa8', '#c8f560', '#38bdf8', '#f472b6', '#fbbf24', '#a78bfa', '#fb923c', '#2dd4bf', '#f87171', '#94a3b8', '#4ade80', '#e879f9'];
  const obsValida = o => o && !/^(-|#n\/a|n\/a|#ref!)$/i.test(o.trim());

  function renderFrota() {
    const secao = $('#fat-frota');
    const escopo = escopoEquipes();
    const linhas = (estado.dados.frota || []).filter(l => num(l.ANO) === estado.ano && num(l.RF) === estado.rf && (!escopo || escopo.includes(l.EQUIPE)) && l.FROTA);
    // Sem trator/frota na seleção → a seção não aparece
    secao.hidden = !linhas.length;
    if (!linhas.length) { graficos.frota?.destroy(); return; }

    const datas = [...new Set(linhas.map(l => +dataBR(l.DIA)).filter(Boolean))].sort((a, c) => a - c);
    const frotas = new Map();
    linhas.forEach(l => {
      const k = l.FROTA;
      const f = frotas.get(k) || { id: k, equipe: l.EQUIPE, pontos: new Map(), obs: [] };
      const d = +dataBR(l.DIA);
      f.pontos.set(d, { prod: num(l.PRODUCAO), meta: num(l['META DIARIA']), delta: num(l.DELTA), obs: obsValida(l.OBS) ? l.OBS.trim() : '' });
      if (obsValida(l.OBS)) f.obs.push({ d, texto: l.OBS.trim() });
      frotas.set(k, f);
    });
    const lista = [...frotas.values()].map(f => {
      const pts = [...f.pontos.values()];
      const vals = pts.map(p => p.prod);
      const metaTotal = pts.reduce((s, p) => s + p.meta, 0);
      return { ...f, variacao: Math.max(...vals) - Math.min(...vals), total: vals.reduce((a, c) => a + c, 0), metaTotal, dias: pts.length, diasZerados: vals.filter(v => v === 0).length };
    }).sort((a, c) => c.variacao - a.variacao);
    const destaques = new Set(lista.slice(0, 3).map(f => f.id)); // maiores variações de produção
    if (!estado.frotasSel || ![...estado.frotasSel].some(id => frotas.has(id))) {
      estado.frotasSel = new Set(lista.slice(0, Math.min(6, lista.length)).map(f => f.id));
    }
    const cor = f => CORES_FROTA[lista.indexOf(f) % CORES_FROTA.length];

    $('#fat-frota-chips').innerHTML = `
      <button type="button" class="chip-filtro mini" data-frota-acao="todas">Todas</button>
      <button type="button" class="chip-filtro mini" data-frota-acao="destaques">Só destaques</button>` +
      lista.map(f => `<button type="button" class="chip-filtro mini frota ${estado.frotasSel.has(f.id) ? 'ativo' : ''} ${destaques.has(f.id) ? 'destaque' : ''}" data-frota="${escapar(f.id)}" style="--c:${cor(f)}" aria-pressed="${estado.frotasSel.has(f.id)}">
        <i class="bolinha"></i>Frota ${escapar(f.id)} <small>${escapar(f.equipe)}</small>${destaques.has(f.id) ? '<span class="badge-variacao">Maior variação</span>' : ''}</button>`).join('');

    const alertas = lista.flatMap(f => f.obs.map(o => ({ ...o, frota: f.id, equipe: f.equipe }))).sort((a, c) => c.d - a.d).slice(0, 14);
    $('#fat-frota-alertas').innerHTML = alertas.length ? alertas.map(a => `
      <li><span class="alerta-data">${dia(new Date(a.d))}</span><div><strong>Frota ${escapar(a.frota)} <small>· ${escapar(a.equipe)}</small></strong><p>${escapar(a.texto)}</p></div></li>`).join('')
      : '<li class="vazio">Nenhuma observação registrada no período. 🌱</li>';

    const selecionadas = lista.filter(f => estado.frotasSel.has(f.id));
    const poucas = selecionadas.length <= 4;
    desenharGrafico('frota', $('#fat-grafico-frota'), {
      type: 'line',
      data: {
        labels: datas.map(d => dia(new Date(d))),
        datasets: selecionadas.map(f => {
          const dest = destaques.has(f.id);
          const ultimo = datas.reduce((u, d, i) => f.pontos.has(d) ? i : u, -1);
          return {
            label: `Frota ${f.id} (${f.equipe})${dest ? ' ★' : ''}`,
            data: datas.map(d => f.pontos.get(d)?.prod ?? null),
            borderColor: cor(f), backgroundColor: cor(f),
            borderWidth: dest ? 4 : 1.8, tension: .3, spanGaps: true,
            pointRadius: dest ? 3.5 : 2, pointHoverRadius: 7,
            brilho: dest ? cor(f) : null, forcaBrilho: 16,
            // Rótulos: todos os pontos das frotas em destaque (ou de todas, quando poucas); nas demais, só o último ponto
            rotulo: (v, i) => v == null ? null : (dest || poucas || i === ultimo ? brlCurto(v) : null), rotuloCor: cor(f), rotuloTamanho: 10,
            _frota: f, order: dest ? 0 : 1
          };
        })
      },
      options: {
        maintainAspectRatio: false, interaction: { mode: 'nearest', intersect: false },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: v => brlCurto(v) }, grid: { color: 'rgba(255,255,255,.06)' } } },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: it => `Dia ${it[0].label}`,
            label: it => ` ${it.dataset.label}: ${brl(it.raw)}`,
            afterLabel: it => {
              const p = it.dataset._frota.pontos.get(datas[it.dataIndex]);
              const extra = [];
              if (p?.meta) extra.push(` Meta diária: ${brl(p.meta)} · Delta: ${brl(p.delta)}`);
              if (p?.obs) extra.push(` 📝 ${p.obs}`);
              return extra;
            }
          } }
        }
      }
    });

    // Análise: frotas paradas/abaixo da meta, motivos recorrentes e quem puxa o resultado
    const ultimoDia = datas[datas.length - 1];
    const noUltimo = lista.filter(f => f.pontos.has(ultimoDia));
    const abaixoUltimo = noUltimo.filter(f => { const p = f.pontos.get(ultimoDia); return p.meta && p.prod < p.meta; });
    const paradas = noUltimo.filter(f => f.pontos.get(ultimoDia).prod === 0);
    const motivos = contarMotivos(lista.flatMap(f => f.obs.map(o => o.texto)));
    const eficiencia = lista.filter(f => f.metaTotal > 0).map(f => ({ f, ef: f.total / f.metaTotal })).sort((a, c) => a.ef - c.ef);
    const zeradas = [...lista].sort((a, c) => c.diasZerados - a.diasZerados).filter(f => f.diasZerados > 0);
    analise('#fat-analise-frota', [
      `No último dia (${b(dia(new Date(ultimoDia)))}), ${b(abaixoUltimo.length + ' de ' + noUltimo.length)} frotas ficaram abaixo da meta diária${paradas.length ? ` e ${b(paradas.length)} não produziram (${paradas.slice(0, 4).map(f => f.id).join(', ')})` : ''}.`,
      motivos.length ? `Principal motivo de perda registrado: ${b(escapar(motivos[0][0]))} (${motivos[0][1]}x)${motivos[1] ? `, seguido de ${escapar(motivos[1][0])} (${motivos[1][1]}x)` : ''}. ${/Manutenção/.test(motivos[0][0]) ? b('Reforce a manutenção preventiva') + ' das frotas mais citadas.' : b('Trate esse motivo primeiro') + ' para reduzir as perdas.'}` : null,
      eficiencia.length ? `Menor rendimento frente à meta: ${eficiencia.slice(0, 3).map(x => `${b('Frota ' + x.f.id)} (${pct(x.ef)})`).join(', ')}. Melhor: ${b('Frota ' + eficiencia[eficiencia.length - 1].f.id)} (${pct(eficiencia[eficiencia.length - 1].ef)}).` : null,
      zeradas.length ? `Dias sem produção: ${zeradas.slice(0, 3).map(f => `${b('Frota ' + f.id)} (${f.diasZerados} de ${f.dias})`).join(', ')}. Avalie realocar ou consertar essas máquinas.` : null
    ]);
  }
  $('#fat-frota-chips').addEventListener('click', e => {
    const bt = e.target.closest('[data-frota], [data-frota-acao]');
    if (!bt) return;
    const todos = $$('[data-frota]', $('#fat-frota-chips')).map(x => x.dataset.frota);
    if (bt.dataset.frotaAcao === 'todas') estado.frotasSel = new Set(todos);
    else if (bt.dataset.frotaAcao === 'destaques') estado.frotasSel = new Set($$('[data-frota].destaque', $('#fat-frota-chips')).map(x => x.dataset.frota));
    else {
      const id = bt.dataset.frota;
      estado.frotasSel.has(id) ? estado.frotasSel.delete(id) : estado.frotasSel.add(id);
      if (!estado.frotasSel.size) estado.frotasSel.add(id);
    }
    renderFrota();
    icones();
  });

  /* ---------- Fotos dos responsáveis (sorteio ao abrir + troca a cada 1 minuto) ---------- */
  const fotos = {}, fotoAtual = {};
  async function carregarFotos() {
    await Promise.all(F.pessoas.map(async p => {
      let lista = F.fotos[p.id] || [];
      if (/^https?:$/.test(location.protocol)) {
        try { const r = await fetch(`api/fotos/${p.id}`); if (r.ok) { const j = await r.json(); if (j.fotos?.length) lista = j.fotos; } } catch { /* usa a lista fixa */ }
      }
      fotos[p.id] = lista;
      fotoAtual[p.id] = lista[Math.floor(Math.random() * lista.length)] || '';
    }));
  }
  function sortearFotos() {
    F.pessoas.forEach(p => {
      const l = fotos[p.id] || [];
      if (l.length > 1) { let n; do n = l[Math.floor(Math.random() * l.length)]; while (n === fotoAtual[p.id]); fotoAtual[p.id] = n; }
    });
    aplicarFotos(true);
  }
  function aplicarFotos(comFade) {
    $$('img[data-foto-pessoa]').forEach(img => {
      const src = fotoAtual[img.dataset.fotoPessoa];
      if (!src || img.getAttribute('src') === src) return;
      if (comFade && !reduzMovimento) {
        img.classList.add('trocando');
        setTimeout(() => { img.src = src; img.onload = () => img.classList.remove('trocando'); }, 450);
      } else img.src = src;
    });
  }

  /* ---------- Cabeçalho: pessoa, período, outras receitas, valores a negociar ---------- */
  function renderControles() {
    $$('[data-pessoa]').forEach(bt => {
      const ativo = bt.dataset.pessoa === estado.pessoa;
      bt.classList.toggle('ativo', ativo); bt.setAttribute('aria-pressed', String(ativo));
    });
    $('#fat-periodo-rotulo').textContent = `${estado.ano} · RF${String(estado.rf).padStart(2, '0')}`;
    $$('[data-or]').forEach(bt => { const ativo = (bt.dataset.or === 'com') === estado.comOR; bt.classList.toggle('ativo', ativo); bt.setAttribute('aria-pressed', String(ativo)); });
    $('#fat-or').classList.toggle('sem', !estado.comOR);
    $$('[data-neg]').forEach(bt => { const ativo = (bt.dataset.neg === 'sim') === estado.somarNegociar; bt.classList.toggle('ativo', ativo); bt.setAttribute('aria-pressed', String(ativo)); });
    $('#fat-neg').classList.toggle('sem', !estado.somarNegociar);

    const anos = new Set([hoje.getFullYear(), estado.ano]);
    ['anderson', 'diario'].forEach(k => (estado.dados[k] || []).forEach(l => { const a = num(l.ANO); if (a > 2000) anos.add(a); }));
    $('#fat-anos').innerHTML = [...anos].sort((a, c) => c - a).map(a => `<button type="button" class="${a === estado.ano ? 'ativo' : ''}" data-ano="${a}">${a}</button>`).join('');
    $('#fat-rfs').innerHTML = Array.from({ length: 12 }, (_, i) => i + 1).map(r => {
      const tem = (estado.dados.anderson || []).some(l => num(l.ANO) === estado.ano && num(l.RF) === r);
      return `<button type="button" class="${r === estado.rf ? 'ativo' : ''} ${tem ? 'com-dados' : ''}" data-rf="${r}" title="${tem ? 'Com dados' : 'Sem dados'}">RF${String(r).padStart(2, '0')}</button>`;
    }).join('');

    const p = pessoaAtual();
    raiz.classList.toggle('bloqueado', !p);
    $('#fat-aviso').hidden = !!p;
    $('#fat-destaque').hidden = !p;
    if (p) {
      $('#fat-destaque-nome').textContent = p.nome;
      $('#fat-destaque-cargo').textContent = p.supervisor ? `${p.cargo} · ${equipesDoSupervisor(p.supervisor).length} equipes` : `${p.cargo} · visão geral de todas as equipes`;
      $('#fat-destaque-foto').dataset.fotoPessoa = p.id;
    }
    $('#fat-sec-ranking-sub').textContent = p?.supervisor ? `Desempenho de ${p.nome} e das suas equipes.` : 'Aderência de cada supervisor: soma do TOTAL ÷ soma da META ACUMULADA das suas equipes.';
    aplicarFotos();
  }

  $('#fat-pessoas').addEventListener('click', e => {
    const bt = e.target.closest('[data-pessoa]');
    if (!bt) return;
    estado.pessoa = bt.dataset.pessoa;
    estado.supervisorOp = null; estado.equipeOp = null; estado.frotasSel = null;
    gravarSessao('fat:pessoa', estado.pessoa);
    renderizar();
  });

  // Popover do período (Ano e RF)
  const popover = $('#fat-periodo-pop'), botaoPeriodo = $('#fat-periodo');
  const abrirPeriodo = abrir => { popover.hidden = !abrir; botaoPeriodo.setAttribute('aria-expanded', String(abrir)); };
  botaoPeriodo.addEventListener('click', () => abrirPeriodo(popover.hidden));
  document.addEventListener('click', e => { if (!popover.hidden && !e.target.closest('#fat-periodo-pop, #fat-periodo')) abrirPeriodo(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !popover.hidden) { abrirPeriodo(false); botaoPeriodo.focus(); } });
  popover.addEventListener('click', e => {
    const a = e.target.closest('[data-ano]'), r = e.target.closest('[data-rf]'), hojeBtn = e.target.closest('[data-hoje]');
    if (a) estado.ano = +a.dataset.ano;
    else if (r) { estado.rf = +r.dataset.rf; abrirPeriodo(false); }
    else if (hojeBtn) { Object.assign(estado, window.SMA_PLANILHAS.periodo.atual()); abrirPeriodo(false); }
    else return;
    estado.equipeOp = null; estado.frotasSel = null;
    renderizar();
  });

  $('#fat-or').addEventListener('click', e => {
    const bt = e.target.closest('[data-or]');
    if (!bt) return;
    estado.comOR = bt.dataset.or === 'com';
    renderizar();
  });

  $('#fat-neg').addEventListener('click', e => {
    const bt = e.target.closest('[data-neg]');
    if (!bt) return;
    estado.somarNegociar = bt.dataset.neg === 'sim';
    gravarSessao('fat:somarNegociar', estado.somarNegociar);
    renderizar();
  });

  /* ---------- Relatório gerencial (PDF) e resumo em imagem (PNG) ---------- */
  const IMG_ESTRUTURA = [
    [/trator m/i, 'trator-medio-hd.png'], [/trator p/i, 'trator-pesado-hd.jpg'], [/pipa/i, 'caminhao-pipa-hd.png'],
    [/mu(n)?ck/i, 'caminhao-munck-hd.png'], [/suplementar/i, 'caminhao-suplementar-hd.jpg'], [/ex[eé]rcito/i, 'caminhao-exercito-hd.jpg'],
    [/comboio/i, 'caminhao-comboio-hd.jpg'], [/oficina/i, 'caminhao-oficina-hd.jpg'], [/prancha/i, 'caminhao-prancha-hd.png']
  ];
  const imagemEstrutura = tipo => { const m = IMG_ESTRUTURA.find(([re]) => re.test(tipo)); return m ? `${window.SMA_DADOS.PASTA_ESTRUTURA}${m[1]}` : null; };
  const rotuloEstrutura = tipo => (/colab/i.test(tipo) ? 'M.O (Serventes)' : tipo);
  const nomeCompleto = p => {
    const lista = []; (function v(n) { lista.push(n.nome); (n.filhos || []).forEach(v); })(window.SMA_DADOS.ORGANOGRAMA);
    return lista.find(n => n.split(' ')[0].toLowerCase() === p.nome.toLowerCase()) || p.nome;
  };
  const faixa = a => { const p = Math.floor(a * 100 + 1e-9); return p <= 80 ? 'Abaixo da meta' : p <= 95 ? 'Próximo da meta' : p <= 100 ? 'Na meta' : 'Acima da meta'; };

  // Reúne tudo o que o PDF e a imagem precisam, respeitando os filtros atuais
  function dadosRelatorio() {
    const p = pessoaAtual();
    if (!p) return null;
    const linhas = [...linhasAtuais()].sort((a, c) => c.aderencia - a.aderencia);
    const t = totais(linhas);
    const base = linhasDe('anderson');
    const sups = F.pessoas.filter(x => x.supervisor).map(x => {
      const ls = base.filter(l => l.supervisor === x.supervisor);
      return { pessoa: x, n: ls.length, linhas: ls, t: totais(ls), est: estruturaDoSupervisor(x.supervisor) };
    }).filter(g => g.n).sort((a, c) => c.t.aderencia - a.t.aderencia);
    // Estrutura consolidada do escopo (supervisor escolhido ou todos)
    const doEscopo = p.supervisor ? sups.filter(g => g.pessoa.id === p.id) : sups;
    const tipos = new Map();
    doEscopo.forEach(g => g.est?.tipos.forEach(([tp, q]) => tipos.set(tp, (tipos.get(tp) || 0) + q)));
    const ordem = tp => /colab/i.test(tp) ? 0 : /caminh/i.test(tp) ? 2 : /trator/i.test(tp) ? 1 : 3;
    const estrutura = [...tipos.entries()].sort((a, c) => ordem(a[0]) - ordem(c[0]) || a[0].localeCompare(c[0]));
    const pontos = id => { const el = $(`#fat-analise-${id}`); return el && !el.hidden && !el.closest('[hidden]') ? [...el.querySelectorAll('li')].map(li => li.innerHTML) : []; };
    return {
      p, nome: nomeCompleto(p), linhas, t, sups, estrutura,
      periodo: `RF${String(estado.rf).padStart(2, '0')}/${estado.ano}`,
      emissao: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      criterio: `${estado.comOR ? 'Com' : 'Sem'} Outras Receitas`,
      negociar: estado.somarNegociar,
      foto: fotoAtual[p.id] || '',
      analises: { kpi: pontos('kpi'), ader: pontos('ader'), ranking: pontos('ranking'), diario: pontos('diario'), frota: pontos('frota') },
      alertas: $('#fat-frota')?.hidden ? [] : $$('#fat-frota-alertas li:not(.vazio)').slice(0, 6).map(li => ({
        data: li.querySelector('.alerta-data')?.textContent || '', frota: li.querySelector('strong')?.textContent.replace(/\s+/g, ' ').trim() || '', texto: li.querySelector('p')?.textContent || ''
      }))
    };
  }

  // Gráfico de colunas empilhadas em HTML (nítido no PDF e na imagem): parte sólida = realizado, clara = a negociar
  function colunasHTML(itens, { coroa = true } = {}) {
    if (!itens.length) return '<p class="rg-vazio">Sem dados no período.</p>';
    const maxPct = Math.max(100, ...itens.map(i => i.final * 100));
    const passo = maxPct > 140 ? Math.ceil(maxPct / 4 / 10) * 10 : 35;
    const max = Math.max(passo * 4, Math.ceil(maxPct / passo) * passo);
    const lider = itens.reduce((a, c) => (c.final > a.final ? c : a), itens[0]);
    const ticks = [0, 1, 2, 3, 4].map(i => Math.round(max / 4 * i));
    return `
      <div class="rg-graf">
        <div class="rg-eixo">${ticks.slice().reverse().map(v => `<span>${v}%</span>`).join('')}</div>
        <div class="rg-area">
          <div class="rg-plano">${ticks.map(v => `<i class="rg-grade" style="bottom:${v / max * 100}%"></i>`).join('')}<i class="rg-meta" style="bottom:${100 / max * 100}%"></i></div>
          ${itens.map(i => {
            const hFinal = Math.min(i.final * 100, max) / max * 100, hBase = Math.min(i.base * 100, max) / max * 100;
            return `
            <div class="rg-col">
              <div class="rg-pilha" style="height:${hFinal}%">
                <span class="rg-topo">${coroa && i === lider ? '<em>👑</em>' : ''}${Math.round(i.final * 100)}%</span>
                <div class="rg-neg" style="height:${hFinal ? (hFinal - hBase) / hFinal * 100 : 0}%;background:${corAderencia(i.final, .38)}"></div>
                <div class="rg-base" style="height:${hFinal ? hBase / hFinal * 100 : 0}%;background:${corAderencia(i.final)};color:${textoSobre(i.final)}">${hBase > 7 ? `<b>${Math.round(i.base * 100)}%</b>` : ''}</div>
              </div>
              <span class="rg-rot">${escapar(i.rotulo)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  /* ---- Imagem: "Resumo" no formato do modelo ---- */
  function montarResumoImagem() {
    const d = dadosRelatorio();
    if (!d) return false;
    const { t } = d;
    const equipes = d.linhas.filter(l => l.metaAcum > 0).map(l => ({ rotulo: `Eq ${l.equipe}`, base: l.aderBase, final: l.aderencia }));
    const sups = d.sups.map(g => ({ rotulo: g.pessoa.nome, base: g.t.aderBase, final: g.t.aderencia }));
    const lider = d.linhas[0], supLider = d.sups[0];
    const medalhas = ['🥇', '🥈', '🥉'];
    const comNeg = d.negociar ? 'Com negociações' : 'Sem negociações';
    const nEquipes = new Set(d.linhas.map(l => l.equipe)).size;

    $('#fat-resumo-img').innerHTML = `
      <div class="ri">
        <header class="ri-topo">
          ${d.foto ? `<img class="ri-foto" src="${d.foto}" alt="">` : ''}
          <div class="ri-titulo">
            <h1>Resumo — ${d.p.supervisor ? 'Supervisão' : 'Coordenação'} ${escapar(d.nome)}</h1>
            <p>${d.criterio} • ${nEquipes} equipes • ${d.periodo} • ${d.emissao}</p>
          </div>
          <div class="ri-ader" style="background:${corAderencia(t.aderencia)};color:${textoSobre(t.aderencia)}">
            <small>◎ Aderência</small><strong>${pct(t.aderencia)}</strong>${d.negociar ? `<em>Realizado: ${pct(t.aderBase)}</em>` : ''}
          </div>
        </header>

        <div class="ri-linha2">
          <section class="ri-card">
            <div class="ri-card-topo"><h2>🏆 Ranking das Equipes</h2>${lider ? `<span class="ri-lider">👑 Eq ${escapar(lider.equipe)}</span>` : ''}
              <span class="ri-legenda"><i style="background:#16a34a"></i>Realizado <i style="background:#9fe0b4"></i>A negociar</span></div>
            ${colunasHTML(equipes)}
          </section>
          <section class="ri-card">
            <div class="ri-card-topo"><h2>👑 Aderência — Supervisão</h2>${supLider ? `<span class="ri-lider">👑 ${supLider.pessoa.nome}</span>` : ''}</div>
            <div class="ri-sup">
              ${colunasHTML(sups)}
              <div class="ri-top3">
                <span class="ri-top3-tit">Top 3 — aderência ${d.negociar ? 'com negociações' : ''}</span>
                ${d.sups.slice(0, 3).map((g, i) => `
                  <div class="ri-pos" style="border-color:${corAderencia(g.t.aderencia)};background:${corAderencia(g.t.aderencia, .1)}">
                    <span class="ri-med">${medalhas[i]}</span>
                    <span class="ri-pos-nome"><b>${i + 1}° ${g.pessoa.nome}</b><small>${comNeg}</small></span>
                    <strong style="color:${corTextoClaro(g.t.aderencia)}">${pct(g.t.aderencia)}</strong>
                  </div>`).join('')}
              </div>
            </div>
          </section>
        </div>

        <section class="ri-card">
          <div class="ri-card-topo"><h2>🔧 Estrutura Consolidada</h2></div>
          <div class="ri-est">
            ${d.estrutura.map(([tp, q]) => { const img = imagemEstrutura(tp); return `
              <div class="ri-est-item">${img ? `<img src="${img}" alt="">` : `<span class="ri-est-ico">${/colab/i.test(tp) ? '👥' : /drone|t50|t100/i.test(tp) ? '🛸' : '📦'}</span>`}
                <div><small>${escapar(rotuloEstrutura(tp))}</small><b>${fmtNum.format(q)}</b></div></div>`; }).join('')}
            <div class="ri-est-item ri-est-total"><span class="ri-est-ico">👥</span><div><small>Total equipes</small><b>${nEquipes}</b></div></div>
          </div>
        </section>

        <div class="ri-kpis">
          <div class="ri-kpi"><small>Tempo (D.U / D.P)</small><b>${fmtNum.format(t.du)} / ${fmtNum.format(t.dp)}</b><em>Dias úteis / percorridos</em></div>
          <div class="ri-kpi ri-ok"><small>Total realizado</small><b>${brl(t.total)}</b><em>${d.negociar ? `Realizado: ${brl(t.totalBase)} + ${brl(t.aNegociar)} a negociar` : `Produzido ${brl(t.produzido)} + negociação ${brl(t.negociacao)}`}</em></div>
          <div class="ri-kpi"><small>Meta mensal</small><b>${brl(t.metaMensal)}</b></div>
          <div class="ri-kpi"><small>Meta acumulada</small><b>${brl(t.metaAcum)}</b></div>
          <div class="ri-kpi ${t.dif < 0 ? 'ri-ruim' : 'ri-ok'}"><small>Diferença</small><b style="color:${t.dif < 0 ? '#dc2626' : '#15803d'}">${brl(t.dif)}</b>${d.negociar && t.aNegociar ? `<em>inclui ${brl(t.aNegociar)} a negociar</em>` : ''}</div>
          <div class="ri-kpi"><small>Meta diária</small><b>${brl(t.metaDiaria)}</b></div>
        </div>

        <div class="ri-faixa" style="background:${corAderencia(t.aderencia)};color:${textoSobre(t.aderencia)}">
          <span>📅 Aderência consolidada — ${d.criterio.toLowerCase()}</span><strong>${pct(t.aderencia)}</strong>
        </div>
      </div>`;
    return true;
  }
  // Versão da cor da aderência escura o suficiente para texto em fundo branco
  function corTextoClaro(a) {
    const [h, s, l] = hslAderencia(a);
    const [r, g, b] = hslParaRgb([h, s, Math.min(l, 42)]);
    return `rgb(${r}, ${g}, ${b})`;
  }

  /* ---- PDF: relatório gerencial (2 páginas A4) ---- */
  function montarRelatorioPDF() {
    const d = dadosRelatorio();
    if (!d) return false;
    const { t } = d;
    const restantes = Math.max(0, t.du - t.dp);
    const ritmo = t.dp ? t.total / t.dp : 0;
    const necessario = restantes ? Math.max(0, t.metaMensal - t.total) / restantes : 0;
    const projecao = t.total + ritmo * restantes;
    const progMeta = t.metaMensal ? Math.min(1, t.total / t.metaMensal) : 0;
    const progProj = t.metaMensal ? Math.min(1, projecao / t.metaMensal) : 0;
    const progAcum = t.metaMensal ? Math.min(1, t.metaAcum / t.metaMensal) : 0;
    const cor = corAderencia(t.aderencia), corTxt = textoSobre(t.aderencia);
    const abaixo = d.linhas.filter(l => l.aderencia < 1).length;
    const kpi = (rot, val, sub = '', cls = '') => `<div class="rp-kpi ${cls}"><span>${rot}</span><strong>${val}</strong>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const barra = (l, rot) => `
      <div class="rp-barra">
        <span class="rp-barra-rot">${rot}</span>
        <div class="rp-barra-trilho">
          <i class="rp-barra-neg" style="width:${Math.min(l.aderencia, 1.5) / 1.5 * 100}%;background:${corAderencia(l.aderencia, .35)}"></i>
          <i class="rp-barra-base" style="width:${Math.min(l.aderBase, 1.5) / 1.5 * 100}%;background:${corAderencia(l.aderencia)}"></i>
          <i class="rp-barra-meta" style="left:${1 / 1.5 * 100}%"></i>
        </div>
        <span class="rp-barra-val" style="color:${corTextoClaro(l.aderencia)}">${pct(l.aderencia)}</span>
      </div>`;
    const recomendacoes = [
      ['Meta do mês', d.analises.kpi], ['Equipes', d.analises.ader], ['Supervisão', d.analises.ranking],
      ['Operação diária', d.analises.diario], ['Frota', d.analises.frota]
    ].filter(([, l]) => l.length);

    $('#fat-relatorio').innerHTML = `
      <section class="rp-pagina">
        <header class="rp-cab">
          <div><span class="rp-marca">SMA · SILVICULTURA</span><h1>Relatório Gerencial de Faturamento</h1><p>Unidade São Miguel · Operação de silvicultura</p></div>
          <div class="rp-cab-dir"><span>Período</span><strong>${d.periodo}</strong><small>Emitido em ${d.emissao}</small></div>
        </header>

        <div class="rp-ident">
          ${d.foto ? `<img src="${d.foto}" alt="">` : ''}
          <div><span>Responsável</span><strong>${escapar(d.nome)}</strong><small>${escapar(d.p.cargo)}${d.p.supervisor ? '' : ' · visão de todas as equipes'}</small></div>
          <div><span>Escopo</span><strong>${d.linhas.length} equipes</strong><small>${abaixo} abaixo de 100%</small></div>
          <div><span>Critérios</span><strong>${d.criterio}</strong><small>Valores a negociar ${d.negociar ? 'somados ao total' : 'fora do total'}</small></div>
        </div>

        <section class="rp-exec">
          <div class="rp-exec-ader" style="background:${cor};color:${corTxt}">
            <span>Aderência</span><strong>${pct(t.aderencia)}</strong><em>${faixa(t.aderencia)}</em>
            ${d.negociar && t.aNegociar ? `<small>Realizado sem negociar: ${pct(t.aderBase)}</small>` : ''}
          </div>
          <div class="rp-exec-txt">
            <h2>Resumo executivo</h2>
            <p>${d.analises.kpi[0] || `Total de ${brl(t.total)} frente à meta acumulada de ${brl(t.metaAcum)}.`}</p>
            <div class="rp-exec-nums">
              <div><span>Total ${d.negociar ? '+ a negociar' : 'realizado'}</span><b>${brl(t.total)}</b></div>
              <div><span>Meta acumulada</span><b>${brl(t.metaAcum)}</b></div>
              <div><span>Diferença</span><b class="${t.dif >= 0 ? 'pos' : 'neg'}">${brl(t.dif)}</b></div>
            </div>
          </div>
        </section>

        <h3 class="rp-tit">Indicadores do período</h3>
        <div class="rp-kpis">
          ${kpi('Meta mensal', brl(t.metaMensal))}
          ${kpi('Meta diária', brl(t.metaDiaria))}
          ${kpi('D.U / D.P', `${fmtNum.format(t.du)} / ${fmtNum.format(t.dp)}`, `${restantes} dias úteis restantes`)}
          ${kpi('Produzido', brl(t.produzido))}
          ${kpi('Negociação', brl(t.negociacao))}
          ${kpi('Valores a negociar', brl(t.aNegociar), d.negociar ? 'somados ao total' : 'fora do total', 'rp-kpi-neg')}
        </div>

        <h3 class="rp-tit">Avanço da meta mensal</h3>
        <div class="rp-prog">
          <div class="rp-prog-trilho">
            <i class="rp-prog-proj" style="width:${progProj * 100}%"></i>
            <i class="rp-prog-real" style="width:${progMeta * 100}%;background:${cor}"></i>
            <i class="rp-prog-acum" style="left:${progAcum * 100}%"><span>Meta acumulada</span></i>
          </div>
          <div class="rp-prog-leg">
            <span><i style="background:${cor}"></i>Realizado ${pct(t.metaMensal ? t.total / t.metaMensal : 0)} da meta mensal</span>
            <span><i class="proj"></i>Projeção no ritmo atual: ${brl(projecao)} (${pct(t.metaMensal ? projecao / t.metaMensal : 0)})</span>
            <span>Ritmo atual <b>${brl(ritmo)}/dia</b> · necessário <b>${brl(necessario)}/dia</b></span>
          </div>
        </div>

        <h3 class="rp-tit">Aderência por equipe <small>barra sólida = realizado · clara = a negociar · linha = meta 100%</small></h3>
        <div class="rp-barras">${d.linhas.filter(l => l.metaAcum > 0).map(l => barra(l, `<b>${escapar(l.equipe)}</b><small>${escapar(l.supervisor || '')}</small>`)).join('')}</div>
      </section>

      <section class="rp-pagina rp-pag2">
        <header class="rp-cab rp-cab-min"><span class="rp-marca">SMA · SILVICULTURA</span><span>Relatório Gerencial de Faturamento · ${d.periodo} · ${escapar(d.nome)}</span></header>

        <h3 class="rp-tit">Desempenho por equipe</h3>
        <table class="rp-tab">
          <thead><tr><th>Equipe</th><th>Supervisor</th><th>Meta mensal</th><th>Meta acumulada</th><th>Total</th><th>Diferença</th><th>Aderência</th></tr></thead>
          <tbody>${d.linhas.map(l => `<tr><td><b>${escapar(l.equipe)}</b></td><td>${escapar(l.supervisor || '—')}</td><td>${brl(l.metaMensal)}</td><td>${brl(l.metaAcum)}</td><td>${brl(l.total)}</td><td class="${l.dif >= 0 ? 'pos' : 'neg'}">${brl(l.dif)}</td><td><span class="rp-selo" style="background:${corAderencia(l.aderencia)};color:${textoSobre(l.aderencia)}">${pct(l.aderencia)}</span></td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="2">Total</td><td>${brl(t.metaMensal)}</td><td>${brl(t.metaAcum)}</td><td>${brl(t.total)}</td><td class="${t.dif >= 0 ? 'pos' : 'neg'}">${brl(t.dif)}</td><td><span class="rp-selo" style="background:${cor};color:${corTxt}">${pct(t.aderencia)}</span></td></tr></tfoot>
        </table>

        <h3 class="rp-tit">${d.p.supervisor ? 'Supervisores — posição no ranking' : 'Ranking de supervisores'}</h3>
        <div class="rp-sups">
          ${d.sups.map((g, i) => `
            <div class="rp-sup ${d.p.supervisor && g.pessoa.id !== d.p.id ? 'rp-sup-apagado' : ''}" style="border-top-color:${corAderencia(g.t.aderencia)}">
              <div class="rp-sup-topo"><span class="rp-sup-pos">${['🥇', '🥈', '🥉'][i] || i + 1 + 'º'}</span>${fotoAtual[g.pessoa.id] ? `<img src="${fotoAtual[g.pessoa.id]}" alt="">` : ''}<div><b>${g.pessoa.nome}</b><small>${g.n} equipes</small></div></div>
              <strong style="color:${corTextoClaro(g.t.aderencia)}">${pct(g.t.aderencia)}</strong>
              <dl><dt>Total</dt><dd>${brl(g.t.total)}</dd><dt>Meta acum.</dt><dd>${brl(g.t.metaAcum)}</dd><dt>Diferença</dt><dd class="${g.t.dif >= 0 ? 'pos' : 'neg'}">${brl(g.t.dif)}</dd></dl>
              ${g.est ? `<p class="rp-sup-est">👥 ${fmtNum.format(g.est.colaboradores)} colab. · 🚜 ${fmtNum.format(g.est.tratores)} tratores · 🚚 ${fmtNum.format(g.est.caminhoes)} caminhões${g.est.outros ? ` · ${fmtNum.format(g.est.outros)} outros` : ''}</p>` : ''}
            </div>`).join('')}
        </div>

        ${d.estrutura.length ? `<h3 class="rp-tit">Estrutura ${d.p.supervisor ? 'da supervisão' : 'consolidada'}</h3>
        <div class="rp-est">${d.estrutura.map(([tp, q]) => `<span><b>${fmtNum.format(q)}</b>${escapar(rotuloEstrutura(tp))}</span>`).join('')}</div>` : ''}

        <h3 class="rp-tit">Pontos de atenção e recomendações</h3>
        <div class="rp-recs">
          ${recomendacoes.map(([tit, itens]) => `
            <div class="rp-rec"><span class="rp-rec-tit">${tit}</span><ul>${itens.slice(0, 3).map(i => `<li>${i}</li>`).join('')}</ul></div>`).join('')}
        </div>

        ${d.alertas.length ? `<h3 class="rp-tit">Alertas da frota</h3>
        <table class="rp-tab rp-tab-alertas"><thead><tr><th>Data</th><th>Frota</th><th>Observação</th></tr></thead>
          <tbody>${d.alertas.map(a => `<tr><td>${escapar(a.data)}</td><td><b>${escapar(a.frota)}</b></td><td>${escapar(a.texto)}</td></tr>`).join('')}</tbody></table>` : ''}

        <footer class="rp-rodape"><span>Fonte: planilhas de faturamento (Google Sheets) · Painel SMA Silvicultura</span><span>Emitido em ${d.emissao}</span></footer>
      </section>`;
    return true;
  }

  const nomeArquivo = prefixo => `${prefixo}_${pessoaAtual()?.nome || ''}_RF${String(estado.rf).padStart(2, '0')}_${estado.ano}`;

  // PDF: abre a impressão do navegador (escolha "Salvar como PDF")
  $('#fat-rel-pdf').addEventListener('click', async () => {
    if (!montarRelatorioPDF()) return;
    const rel = $('#fat-relatorio');
    await Promise.all([...rel.querySelectorAll('img')].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
    const tituloOriginal = document.title;
    document.title = nomeArquivo('Relatorio_Gerencial_Faturamento'); // vira o nome sugerido do PDF
    window.addEventListener('afterprint', () => { document.title = tituloOriginal; }, { once: true });
    setTimeout(() => window.print(), 150);
  });

  // Imagem: resumo no formato do modelo (PNG), com prévia na tela para baixar ou copiar
  function carregarScript(src) {
    return new Promise((ok, falha) => {
      if ([...document.scripts].some(s => s.src === src && s.dataset.ok)) return ok();
      const s = document.createElement('script'); s.src = src;
      s.onload = () => { s.dataset.ok = '1'; ok(); }; s.onerror = () => { s.remove(); falha(new Error('não carregou ' + src)); };
      document.head.appendChild(s);
    });
  }
  async function carregarHtml2canvas() {
    if (window.html2canvas) return;
    const fontes = [
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
    ];
    for (const src of fontes) { try { await carregarScript(src); if (window.html2canvas) return; } catch { /* tenta a próxima */ } }
    throw new Error('Não foi possível carregar o gerador de imagem (verifique a internet).');
  }
  const canvasParaBlob = canvas => new Promise((ok, falha) => {
    try { canvas.toBlob(b => (b ? ok(b) : falha(new Error('imagem vazia'))), 'image/png'); } catch (e) { falha(e); }
  });

  async function capturarResumo(semFotos) {
    const alvo = $('#fat-resumo-img');
    alvo.classList.add('capturando');
    try {
      await Promise.all([...alvo.querySelectorAll('img')].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
      const canvas = await window.html2canvas(alvo.firstElementChild, {
        backgroundColor: '#ffffff', scale: 2, useCORS: true, logging: false,
        // Sem servidor (arquivo aberto direto), o Chrome bloqueia exportar imagens locais: troca as fotos por ícones
        onclone: doc => { if (semFotos) doc.querySelectorAll('#fat-resumo-img img').forEach(img => { const s = doc.createElement('span'); s.className = img.className.includes('ri-foto') ? 'ri-foto ri-foto-vazia' : 'ri-est-ico'; s.textContent = img.className.includes('ri-foto') ? '👤' : '🚜'; img.replaceWith(s); }); }
      });
      return await canvasParaBlob(canvas);
    } finally {
      alvo.classList.remove('capturando');
    }
  }

  let urlPrevia = null;
  function mostrarPrevia(blob, nome, aviso) {
    if (urlPrevia) URL.revokeObjectURL(urlPrevia);
    urlPrevia = URL.createObjectURL(blob);
    const modal = $('#fat-previa');
    $('#fat-previa-img').src = urlPrevia;
    $('#fat-previa-aviso').hidden = !aviso;
    $('#fat-previa-aviso').textContent = aviso || '';
    $('#fat-previa-baixar').onclick = () => {
      const a = document.createElement('a');
      a.href = urlPrevia; a.download = nome; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    };
    const copiar = $('#fat-previa-copiar');
    copiar.hidden = !(navigator.clipboard && window.ClipboardItem && window.isSecureContext);
    copiar.onclick = async () => {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); copiar.querySelector('span').textContent = 'Copiada! Cole no WhatsApp'; }
      catch { copiar.querySelector('span').textContent = 'Não foi possível copiar'; }
      setTimeout(() => { copiar.querySelector('span').textContent = 'Copiar imagem'; }, 3000);
    };
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('#fat-previa-baixar').focus();
    icones();
  }
  function fecharPrevia() { $('#fat-previa').hidden = true; document.body.style.overflow = ''; }
  $('#fat-previa').addEventListener('click', e => { if (e.target.id === 'fat-previa' || e.target.closest('[data-fechar-previa]')) fecharPrevia(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#fat-previa').hidden) fecharPrevia(); });

  $('#fat-rel-img').addEventListener('click', async () => {
    if (!montarResumoImagem()) { alertaBreve('Selecione um responsável antes de gerar o resumo.'); return; }
    const botao = $('#fat-rel-img');
    botao.disabled = true; botao.classList.add('girando');
    const nome = nomeArquivo('Resumo_Faturamento') + '.png';
    try {
      await carregarHtml2canvas();
      let blob, aviso = '';
      try { blob = await capturarResumo(false); }
      catch (erro) {
        console.warn('Faturamento: exportação bloqueada com as fotos, gerando sem elas.', erro);
        blob = await capturarResumo(true);
        aviso = 'As fotos não puderam entrar na imagem porque o painel foi aberto direto do arquivo. Para sair com as fotos, abra pelo servidor (npm start → http://localhost:3000/faturamento.html).';
      }
      mostrarPrevia(blob, nome, aviso);
    } catch (erro) {
      console.error('Faturamento: não foi possível gerar a imagem', erro);
      alertaBreve(`Não consegui gerar a imagem: ${erro.message}`);
    } finally {
      botao.disabled = false; botao.classList.remove('girando');
    }
  });
  function alertaBreve(texto) {
    const s = $('#fat-status'); const antes = s.textContent;
    s.textContent = texto; setTimeout(() => { s.textContent = antes; }, 7000);
  }

  /* ---------- Orquestração ---------- */
  const SECOES = {
    controles: renderControles, kpis: renderKPIs, tabela: renderTabela, aderencia: renderGraficoAderencia,
    ranking: renderRanking, op: renderFiltroOperacional, diario: renderDiario, frota: renderFrota
  };
  function renderizar(quais = Object.keys(SECOES)) {
    if (estado.carregando) return;
    raiz.classList.remove('animar'); void raiz.offsetWidth; raiz.classList.add('animar'); // microanimação ao trocar filtros
    for (const q of quais) {
      try { SECOES[q](); } catch (erro) { console.error(`Faturamento: erro ao montar "${q}"`, erro); }
    }
    renderErros();
    icones();
  }

  function renderErros() {
    const nomes = { anderson: 'Faturamento – Anderson', carina: 'Faturamento – Carina', juliano: 'Faturamento – Juliano', joyce: 'Faturamento – Joyce', diario: 'Faturamento diário', frota: 'Produção por frota', estrutura: 'Estrutura (equipes × supervisores)' };
    const falhas = Object.keys(estado.erros);
    const aviso = $('#fat-erros');
    aviso.hidden = !falhas.length;
    aviso.innerHTML = falhas.length ? `<i data-lucide="triangle-alert"></i><div><strong>Não consegui carregar ${falhas.length === 1 ? 'uma aba' : 'algumas abas'} da planilha.</strong><p>${falhas.map(f => nomes[f]).join(', ')}. Verifique a internet ou se a planilha continua pública (Compartilhar › Qualquer pessoa com o link) e toque em "Atualizar dados".</p></div>` : '';
  }

  async function carregarTudo(fresco = false) {
    const botao = $('#fat-atualizar');
    botao.classList.add('girando'); botao.disabled = true;
    $('#fat-status').textContent = 'Atualizando dados…';
    estado.usandoCache = null;
    // Mesma leitura usada pelo Folhito (js/planilhas.js): os dados ficam compartilhados
    const r = await obterDados({ fresco });
    Object.keys(F.abas).concat('estrutura').forEach(k => {
      if (r.dados[k]) { estado.dados[k] = r.dados[k]; delete estado.erros[k]; }
      else if (r.erros[k]) estado.erros[k] = r.erros[k];
    });
    estado.usandoCache = r.usandoCache;
    estado.carregando = false;
    estado.atualizadoEm = new Date();
    raiz.classList.remove('carregando');
    $('#fat-status').textContent = estado.usandoCache
      ? `Sem conexão com a planilha · mostrando dados salvos de ${new Date(estado.usandoCache).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
      : `Atualizado às ${estado.atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    botao.classList.remove('girando'); botao.disabled = false;
    renderizar();
  }
  $('#fat-atualizar').addEventListener('click', () => carregarTudo(true));

  (async function iniciar() {
    const salvo = lerSessao('fat:pessoa', null);
    if (F.pessoas.some(p => p.id === salvo)) estado.pessoa = salvo;
    renderControlesBasicos();
    await carregarFotos();
    aplicarFotos();
    await carregarTudo();
    setInterval(() => carregarTudo(true), F.atualizarACadaMin * 60_000); // recarrega a cada 5 minutos
    setInterval(sortearFotos, 60_000);                                     // troca as fotos a cada 1 minuto
  })();

  // Antes dos dados chegarem: botões e aviso já aparecem
  function renderControlesBasicos() {
    $('#fat-pessoas').innerHTML = F.pessoas.map(p => `
      <button type="button" class="pessoa-btn" data-pessoa="${p.id}" aria-pressed="false">
        <span class="pessoa-foto"><img data-foto-pessoa="${p.id}" alt=""></span>
        <span><strong>${p.nome}</strong><small>${p.supervisor ? 'Supervisão' : 'Coordenação'}</small></span>
      </button>`).join('');
    $('#fat-aviso-pessoas').innerHTML = F.pessoas.map(p => `<button type="button" class="chip-filtro" data-pessoa-aviso="${p.id}"><img data-foto-pessoa="${p.id}" alt="">${p.nome}</button>`).join('');
    $('#fat-aviso-pessoas').addEventListener('click', e => { const bt = e.target.closest('[data-pessoa-aviso]'); if (bt) $(`[data-pessoa="${bt.dataset.pessoaAviso}"]`).click(); });
    renderControles();
  }
})();