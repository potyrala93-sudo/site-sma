/* ==========================================================================
   SMA · Silvicultura — Compras
   Fica na seção de Custos. Mostra todos os pedidos do App de Compras, sem login:
   quem lê o banco é o servidor (/api/compras, com a chave secreta guardada lá).
   O filtro de solicitante mostra os pedidos de uma pessoa.
   ========================================================================== */

(() => {
  const raiz = document.getElementById('cmp');
  if (!raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DIA = 864e5;
  const CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const fmtN = (v, casas = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }));
  const dataBR = d => { if (!d) return '—'; const [a, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${a}`; };
  const hojeISO = () => new Date().toLocaleDateString('sv-SE');
  const diasEntre = (a, b) => (new Date(b) - new Date(a)) / DIA;
  const diasAte = d => Math.round((new Date(String(d).slice(0, 10) + 'T00:00:00') - new Date(hojeISO() + 'T00:00:00')) / DIA);

  const TIPOS = { Planejado: '#3dffa8', Emergencial: '#ff4d5e', 'Regularização': '#ffc83d' };
  const EQUIPE_COR = { Mecanizado: '#3dffa8', Manual: '#38bdf8' };
  // ordem do caminho de um pedido
  const SITUACOES = [
    { id: 'coordenador', nome: 'Aguardando coordenador', cor: '#38bdf8' },
    { id: 'analista', nome: 'Aguardando analista de custo', cor: '#7dd3fc' },
    { id: 'Pendente', nome: 'Compras · Pendente', cor: '#c8f560' },
    { id: 'Em cotação', nome: 'Compras · Em cotação', cor: '#d9f99d' },
    { id: 'Em transporte', nome: 'Compras · Em transporte', cor: '#fde68a' },
    { id: 'Aguardando retirada', nome: 'Compras · Aguardando retirada', cor: '#ffc83d' },
    { id: 'Finalizado', nome: 'Compras · Finalizado (falta confirmar)', cor: '#fb923c' },
    { id: 'recebido', nome: 'Recebido', cor: '#3dffa8' },
    { id: 'negado', nome: 'Negado', cor: '#ff4d5e' },
  ];
  const situacaoDe = p => (p.etapa === 'compras' ? (p.status_compra || 'Pendente') : p.etapa);
  const SIT = Object.fromEntries(SITUACOES.map(s => [s.id, s]));
  const nomeItens = it => { if (!it?.length) return '—'; const n = it.length - 1; return it[0].produto + (n ? ` + ${n} ${n === 1 ? 'item' : 'itens'}` : ''); };

  /* ---------- Estado ---------- */
  const estado = { pedidos: [], eventos: {}, perfis: {}, periodo: '90', cdc: '', usuario: '', busca: '', carregando: true };
  try { estado.periodo = localStorage.getItem('sma:compras:periodo') || '90'; estado.usuario = localStorage.getItem('sma:compras:solicitante') || ''; } catch (_) {}

  function erro(titulo, texto) {
    const el = $('#c-erros'); el.hidden = false;
    el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>${escapar(titulo)}</strong><p>${escapar(texto)}</p></div>`;
    icones();
  }

  /* ---------- Leitura (servidor do site → App de Compras) ---------- */
  async function carregar(e) {
    const bt = $('#c-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#c-status').textContent = 'Carregando pedidos…';
    raiz.classList.add('carregando');
    try {
      const r = await fetch(`api/compras${e ? '?fresco=1' : ''}`, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(d.erro || `erro ${r.status}`), { configurar: d.configurar });
      estado.pedidos = d.pedidos || [];
      estado.perfis = Object.fromEntries((d.perfis || []).map(p => [p.id, p]));
      estado.eventos = {};
      (d.eventos || []).forEach(x => (estado.eventos[x.pedido_id] = estado.eventos[x.pedido_id] || []).push(x));
      $('#c-erros').hidden = true;
      $('#c-status').textContent = `${estado.pedidos.length} pedidos · atualizado às ${new Date(d.atualizado || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (ex) {
      console.warn('Compras: falha ao ler', ex);
      if (ex.configurar) erro('Falta configurar a chave do App de Compras', 'O servidor do site precisa da chave secreta do Supabase do App de Compras (variável COMPRAS_SUPABASE_KEY no .env e na Vercel). Depois disso os pedidos aparecem aqui, sem login.');
      else erro('Não consegui carregar os pedidos', 'Verifique a internet e toque em "Atualizar dados".');
      $('#c-status').textContent = 'Sem acesso aos pedidos';
    }
    estado.carregando = false;
    raiz.classList.remove('carregando');
    bt.classList.remove('girando'); bt.disabled = false;
    renderizar();
  }
  $('#c-atualizar').addEventListener('click', carregar);

  /* ---------- Filtros ---------- */
  function noPeriodo(p) {
    const d = String(p.data_pedido || p.criado_em).slice(0, 10);
    if (estado.periodo === 'tudo') return true;
    if (estado.periodo === 'ano') return d.slice(0, 4) === hojeISO().slice(0, 4);
    const limite = new Date(Date.now() - (+estado.periodo) * DIA).toLocaleDateString('sv-SE');
    return d >= limite;
  }
  const filtrados = () => estado.pedidos.filter(p => (!estado.cdc || p.cdc === estado.cdc) && (!estado.usuario || p.solicitante_id === estado.usuario) && noPeriodo(p));
  function renderFiltros() {
    $$('#c-periodo [data-p]').forEach(b => { const a = b.dataset.p === estado.periodo; b.classList.toggle('ativo', a); b.setAttribute('aria-pressed', String(a)); });
    const cdcs = [...new Set(estado.pedidos.map(p => p.cdc))].sort();
    $('#c-cdc-wrap').hidden = cdcs.length < 2;
    if (cdcs.length > 1) $('#c-cdc').innerHTML = `<option value="">Todos os CDCs</option>${cdcs.map(c => `<option ${c === estado.cdc ? 'selected' : ''}>${escapar(c)}</option>`).join('')}`;
    // solicitantes: quem fez pedido, com quantos pedidos no total
    const qtd = {}; estado.pedidos.forEach(p => { qtd[p.solicitante_id] = (qtd[p.solicitante_id] || 0) + 1; });
    const pessoas = Object.keys(qtd).map(id => ({ id, nome: estado.perfis[id]?.nome || 'Sem nome', cargo: estado.perfis[id]?.cargo || '' })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    if (estado.usuario && !qtd[estado.usuario]) estado.usuario = '';
    $('#c-usuario').innerHTML = `<option value="">Todos os solicitantes</option>${pessoas.map(x => `<option value="${escapar(x.id)}" ${x.id === estado.usuario ? 'selected' : ''}>${escapar(x.nome)}${x.cargo ? ` · ${escapar(x.cargo)}` : ''} (${qtd[x.id]})</option>`).join('')}`;
    $('#c-usuario-wrap').classList.toggle('ativo', Boolean(estado.usuario));
    const quem = estado.usuario ? estado.perfis[estado.usuario]?.nome : '';
    $('#c-pill').textContent = `Custos · ${quem || estado.cdc || (cdcs.length === 1 ? cdcs[0] : 'Unidade São Miguel')}`;
  }
  $('#c-periodo').addEventListener('click', e => {
    const b = e.target.closest('[data-p]'); if (!b) return;
    estado.periodo = b.dataset.p; try { localStorage.setItem('sma:compras:periodo', estado.periodo); } catch (_) {}
    renderizar();
  });
  $('#c-cdc').addEventListener('change', e => { estado.cdc = e.target.value; renderizar(); });
  $('#c-usuario').addEventListener('change', e => { estado.usuario = e.target.value; try { localStorage.setItem('sma:compras:solicitante', estado.usuario); } catch (_) {} renderizar(); });
  $('#c-busca').addEventListener('input', e => { estado.busca = e.target.value; tabelaProdutos(filtrados()); });

  /* ---------- KPIs ---------- */
  const aberto = p => !['recebido', 'negado'].includes(p.etapa);
  const atrasado = p => aberto(p) && diasAte(p.data_necessidade) < 0;
  const noPrazo = p => p.etapa === 'recebido' && p.recebido_em && new Date(p.recebido_em).toLocaleDateString('sv-SE') <= String(p.data_necessidade).slice(0, 10);
  function kpis(lista) {
    const set = (k, v) => { const el = $(`[data-k="${k}"]`); if (el) el.textContent = v; };
    const n = c => lista.filter(c).length;
    const total = lista.length, itens = lista.reduce((s, p) => s + (p.itens?.length || 0), 0);
    set('total', fmtN(total)); set('total-ajuda', `${fmtN(itens)} ${itens === 1 ? 'item' : 'itens'} · ${n(p => p.tipo_pedido === 'Emergencial')} emergenciais`);
    const co = n(p => p.etapa === 'coordenador'), an = n(p => p.etapa === 'analista');
    set('aprov', fmtN(co + an)); set('aprov-ajuda', `coordenador ${co} · analista ${an}`);
    const cp = n(p => p.etapa === 'compras'), ret = n(p => p.etapa === 'compras' && ['Aguardando retirada', 'Finalizado'].includes(p.status_compra));
    set('compra', fmtN(cp)); set('compra-ajuda', ret ? `${ret} prontos para retirar` : 'em cotação ou transporte');
    const rec = n(p => p.etapa === 'recebido'), np = n(noPrazo);
    set('receb', fmtN(rec)); set('receb-ajuda', rec ? `${fmtN(np / rec * 100)}% chegaram no prazo` : 'nenhum ainda no período');
    const at = n(atrasado);
    set('atraso', fmtN(at)); set('atraso-ajuda', at ? 'passaram da data da necessidade' : 'nenhum passou da data');
    $('.c-kpi-alerta').classList.toggle('c-zero', !at);
    const ng = n(p => p.etapa === 'negado'), ngc = n(p => p.etapa === 'negado' && p.negado_por === 'Coordenador');
    set('neg', fmtN(ng)); set('neg-ajuda', ng ? `coordenador ${ngc} · analista ${ng - ngc}` : 'nenhum no período');
  }

  /* ---------- Gráficos ---------- */
  const graficos = {};
  const corTexto = () => getComputedStyle(document.documentElement).getPropertyValue('--texto-forte').trim() || '#e6fff5';
  // Rótulos de dados: o valor de cada barra/ponto escrito no gráfico (dentro do pedaço nas barras empilhadas, com o total na ponta)
  const rotulos = {
    id: 'rotulos',
    afterDatasetsDraw(chart, _a, op) {
      if (op?.desligado) return;
      const { ctx } = chart, horiz = chart.options.indexAxis === 'y';
      const empilhado = Boolean(chart.options.scales?.x?.stacked || chart.options.scales?.y?.stacked);
      const cor = corTexto();
      ctx.save(); ctx.font = '800 11.5px Manrope, sans-serif'; ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di); if (meta.hidden || !chart.isDatasetVisible(di)) return;
        meta.data.forEach((el, i) => {
          const v = ds.data[i]; if (v == null || v === 0) return;
          const txt = (ds.rotulo || op?.formato || (x => fmtN(x)))(v, i);
          if (meta.type === 'line') { ctx.fillStyle = ds.borderColor; ctx.textAlign = 'center'; ctx.fillText(txt, el.x, el.y - 13); return; }
          if (empilhado) {
            const tam = horiz ? Math.abs(el.x - el.base) : Math.abs(el.base - el.y);
            if (tam < (horiz ? ctx.measureText(txt).width + 8 : 16)) return;   // não cabe dentro do pedaço: fica só o total
            ctx.fillStyle = '#04201a'; ctx.textAlign = 'center';
            ctx.fillText(txt, horiz ? (el.x + el.base) / 2 : el.x, horiz ? el.y : (el.y + el.base) / 2);
            return;
          }
          ctx.fillStyle = cor;
          if (horiz) { ctx.textAlign = 'left'; ctx.fillText(txt, el.x + 7, el.y); } else { ctx.textAlign = 'center'; ctx.fillText(txt, el.x, el.y - 11); }
        });
      });
      if (empilhado && op?.total !== false) {
        chart.data.labels.forEach((_l, i) => {
          let soma = 0, ponta = null;
          chart.data.datasets.forEach((ds, di) => {
            if (!chart.isDatasetVisible(di)) return;
            soma += Number(ds.data[i]) || 0;
            const el = chart.getDatasetMeta(di).data[i]; if (!el || !ds.data[i]) return;
            if (!ponta || (horiz ? el.x > ponta.x : el.y < ponta.y)) ponta = el;
          });
          if (!soma || !ponta) return;
          const txt = op?.totalTexto ? op.totalTexto(soma, i) : fmtN(soma);
          ctx.fillStyle = cor;
          if (horiz) { ctx.textAlign = 'left'; ctx.fillText(txt, ponta.x + 7, ponta.y); } else { ctx.textAlign = 'center'; ctx.fillText(txt, ponta.x, ponta.y - 11); }
        });
      }
      ctx.restore();
    }
  };
  function prepararChart() {
    const C = window.Chart; if (!C) return false;
    C.defaults.color = '#9fb9b3'; C.defaults.font.family = 'Manrope, sans-serif'; C.defaults.font.weight = 600;
    C.defaults.borderColor = 'rgba(255,255,255,.06)';
    C.defaults.plugins.tooltip.backgroundColor = 'rgba(4,18,17,.95)'; C.defaults.plugins.tooltip.borderColor = 'rgba(61,255,168,.4)'; C.defaults.plugins.tooltip.borderWidth = 1;
    C.defaults.plugins.tooltip.padding = 12; C.defaults.plugins.tooltip.cornerRadius = 12;
    C.defaults.animation.duration = reduzMovimento ? 0 : 800;
    if (!C.registry.plugins.get('rotulos')) C.register(rotulos);
    return true;
  }
  function desenhar(id, config) {
    graficos[id]?.destroy();
    if (!prepararChart()) return;
    // espaço para os rótulos não saírem do gráfico
    const horiz = config.options?.indexAxis === 'y';
    config.options.layout = { padding: { top: horiz ? 4 : 22, right: horiz ? (config.options.plugins?.rotulos?.folga || 64) : 10 } };
    graficos[id] = new window.Chart(document.getElementById(id), config);
  }
  const vazioGraf = (id, texto) => {
    graficos[id]?.destroy(); delete graficos[id];
    const c = document.getElementById(id); const box = c.parentElement;
    let v = $('.fat-vazio-graf', box); if (!v) { v = document.createElement('p'); v.className = 'fat-vazio-graf c-vazio'; box.appendChild(v); }
    v.textContent = texto; v.hidden = false; c.hidden = true;
  };
  const mostrarGraf = id => { const c = document.getElementById(id); c.hidden = false; const v = $('.c-vazio', c.parentElement); if (v) v.hidden = true; };
  const barraH = (labels, valores, cores, rotulo) => ({
    type: 'bar',
    data: { labels, datasets: [{ label: rotulo, data: valores, backgroundColor: cores.map(c => `${c}cc`), borderColor: cores, borderWidth: 1.5, borderRadius: 8, maxBarThickness: 30 }] },
    options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } }, y: { grid: { display: false } } } }
  });

  function graficoMes(lista) {
    if (!lista.length) return vazioGraf('g-mes', 'Nenhum pedido no período.');
    mostrarGraf('g-mes');
    const chaves = [...new Set(lista.map(p => String(p.data_pedido).slice(0, 7)))].sort();
    // preenche meses sem pedido entre o primeiro e o último
    const meses = []; let [a, m] = chaves[0].split('-').map(Number); const [af, mf] = chaves.at(-1).split('-').map(Number);
    while (a < af || (a === af && m <= mf)) { meses.push(`${a}-${String(m).padStart(2, '0')}`); m++; if (m > 12) { m = 1; a++; } }
    const rot = meses.map(k => `${CURTOS[+k.slice(5) - 1]}/${k.slice(2, 4)}`);
    desenhar('g-mes', {
      type: 'bar',
      data: { labels: rot, datasets: Object.entries(TIPOS).map(([t, cor]) => ({ label: t, data: meses.map(k => lista.filter(p => p.tipo_pedido === t && String(p.data_pedido).startsWith(k)).length), backgroundColor: `${cor}cc`, borderColor: cor, borderWidth: 1.5, borderRadius: 6, maxBarThickness: 46 })) },
      options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, padding: 16 } } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }
  function graficoEtapa(lista) {
    const linhas = SITUACOES.map(s => ({ s, n: lista.filter(p => situacaoDe(p) === s.id).length })).filter(x => x.n);
    if (!linhas.length) return vazioGraf('g-etapa', 'Nenhum pedido no período.');
    mostrarGraf('g-etapa');
    desenhar('g-etapa', barraH(linhas.map(x => x.s.nome), linhas.map(x => x.n), linhas.map(x => x.s.cor), 'Pedidos'));
  }
  function graficoEquipe(lista) {
    const cont = {};
    lista.forEach(p => { const k = p.equipe; cont[k] = cont[k] || { n: 0, tipo: p.equipe_tipo }; cont[k].n++; });
    const ord = Object.entries(cont).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
    if (!ord.length) return vazioGraf('g-equipe', 'Nenhum pedido no período.');
    mostrarGraf('g-equipe');
    desenhar('g-equipe', barraH(ord.map(([k]) => `Equipe ${k}`), ord.map(([, v]) => v.n), ord.map(([, v]) => EQUIPE_COR[v.tipo] || '#9fb9b3'), 'Pedidos'));
  }
  function graficoDep(lista) {
    const cont = {};
    lista.forEach(p => { cont[p.departamento] = (cont[p.departamento] || 0) + 1; });
    const ord = Object.entries(cont).sort((a, b) => b[1] - a[1]);
    if (!ord.length) return vazioGraf('g-dep', 'Nenhum pedido no período.');
    mostrarGraf('g-dep');
    const paleta = ['#c8f560', '#9be86a', '#3dffa8', '#2fd8a6', '#22b59a', '#1c9488', '#38bdf8', '#7dd3fc'];
    desenhar('g-dep', barraH(ord.map(([k]) => k), ord.map(([, v]) => v), ord.map((_, i) => paleta[i % paleta.length]), 'Pedidos'));
  }

  /* ---------- Tempo por etapa ---------- */
  function tempos(lista) {
    const ev = p => estado.eventos[p.id] || [];
    const quando = (p, tipos) => ev(p).find(e => tipos.includes(e.tipo))?.criado_em;
    const etapas = [
      { nome: 'Coordenador decidir', icone: 'user-check', de: p => p.criado_em, ate: p => quando(p, ['aprovado_coord', 'negado_coord']) },
      { nome: 'Analista decidir', icone: 'calculator', de: p => quando(p, ['aprovado_coord']), ate: p => quando(p, ['aprovado_analista', 'negado_analista']) },
      { nome: 'Compra até chegar', icone: 'truck', de: p => quando(p, ['aprovado_analista']), ate: p => quando(p, ['recebido']) },
      { nome: 'Pedido completo', icone: 'flag', de: p => p.criado_em, ate: p => quando(p, ['recebido']), total: true },
    ];
    $('#c-tempos').innerHTML = etapas.map(e => {
      const vals = lista.map(p => { const a = e.de(p), b = e.ate(p); return a && b ? Math.max(0, diasEntre(a, b)) : null; }).filter(v => v != null);
      const media = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      const txt = media == null ? '—' : media < 1 ? `${fmtN(media * 24)} h` : `${fmtN(media, 1)} dias`;
      return `<article class="kpi glass c-tempo${e.total ? ' c-tempo-total' : ''}">
        <span class="kpi-topo"><span class="icon-box"><i data-lucide="${e.icone}"></i></span><span class="kpi-rot">${e.nome}</span></span>
        <strong class="kpi-val">${txt}</strong><small class="kpi-ajuda">${vals.length ? `média de ${vals.length} ${vals.length === 1 ? 'pedido' : 'pedidos'}` : 'nenhum pedido passou desta etapa'}</small></article>`;
    }).join('');
  }

  /* ---------- Tabelas ---------- */
  const nome = id => estado.perfis[id]?.nome || '—';
  const iniciais = n => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
  const foto = (id, classe = 'c-foto') => { const p = estado.perfis[id]; return `<span class="${classe}" aria-hidden="true"><b>${escapar(iniciais(p?.nome))}</b>${p?.foto_url ? `<img src="${escapar(p.foto_url)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`; };
  function tabelaAberto(lista) {
    const abertos = lista.filter(aberto).sort((a, b) => String(a.data_necessidade).localeCompare(String(b.data_necessidade)));
    $('#c-aberto-sub').textContent = abertos.length ? `${abertos.length} ${abertos.length === 1 ? 'pedido ainda não foi recebido' : 'pedidos ainda não foram recebidos'}, do mais urgente para o menos urgente. Toque num pedido para ver o caminho dele.` : '';
    if (!abertos.length) { $('#c-aberto').innerHTML = '<p class="tabela vazio c-ok"><i data-lucide="circle-check"></i> Nenhum pedido em aberto no período.</p>'; return; }
    const parado = p => { const ult = (estado.eventos[p.id] || []).at(-1); return ult ? Math.floor(diasEntre(ult.criado_em, new Date())) : null; };
    const prazo = p => { const n = diasAte(p.data_necessidade); return n < 0 ? `<span class="c-prazo atraso">${-n} d de atraso</span>` : n === 0 ? '<span class="c-prazo hoje">é hoje</span>' : n <= 3 ? `<span class="c-prazo perto">faltam ${n} d</span>` : `<span class="c-prazo">faltam ${n} d</span>`; };
    $('#c-aberto').innerHTML = `<table class="tabela c-tab">
      <colgroup><col class="c-c-num"><col class="c-c-prod"><col><col class="c-c-eq"><col><col class="c-c-sit"><col class="c-c-par"></colgroup>
      <thead><tr>${['Nº', 'Produto', 'Solicitante', 'Equipe', 'Necessidade', 'Situação', 'Parado há'].map(h => `<th><button type="button" disabled>${h}</button></th>`).join('')}</tr></thead>
      <tbody>${abertos.map(p => { const s = SIT[situacaoDe(p)]; const d = parado(p); return `<tr class="c-clica" data-pedido="${escapar(p.id)}" tabindex="0" title="Ver o caminho do pedido" style="--sc-linha:${TIPOS[p.tipo_pedido] || 'transparent'}">
        <th scope="row">${escapar(p.numero)}</th>
        <td title="${escapar((p.itens || []).map(i => `${i.quantidade} ${i.unidade} ${i.produto}`).join('; '))}"><b>${escapar(nomeItens(p.itens))}</b><small class="c-sub">${escapar(p.tipo_pedido)} · ${escapar(p.departamento)}</small></td>
        <td><span class="c-pessoa">${foto(p.solicitante_id)}${escapar(nome(p.solicitante_id))}</span></td>
        <td>${escapar(p.equipe)}${p.frota ? `<small class="c-sub">Frota ${escapar(p.frota)}</small>` : ''}</td>
        <td>${dataBR(p.data_necessidade)}${prazo(p)}</td>
        <td><span class="c-sit" style="--c:${s?.cor || '#9fb9b3'}">${escapar(s?.nome || p.etapa)}</span></td>
        <td class="num">${d == null ? '—' : d === 0 ? 'hoje' : `${d} d`}</td></tr>`; }).join('')}</tbody></table>`;
  }
  function tabelaProdutos(lista) {
    const mapa = {};
    lista.forEach(p => (p.itens || []).forEach(i => {
      const k = semAcento(i.produto).trim(); if (!k) return;
      const m = (mapa[k] = mapa[k] || { produto: i.produto, pedidos: new Set(), qtd: {}, equipes: new Set(), ultimo: '' });
      m.pedidos.add(p.id); m.equipes.add(p.equipe);
      const u = i.unidade || 'un'; m.qtd[u] = (m.qtd[u] || 0) + Number(i.quantidade || 0);
      if (String(p.data_pedido) > m.ultimo) m.ultimo = String(p.data_pedido);
    }));
    const q = semAcento(estado.busca).trim();
    const linhas = Object.values(mapa).filter(m => !q || q.split(/\s+/).every(t => semAcento(m.produto).includes(t)))
      .sort((a, b) => b.pedidos.size - a.pedidos.size || a.produto.localeCompare(b.produto, 'pt-BR')).slice(0, 25);
    if (!linhas.length) { $('#c-produtos').innerHTML = `<p class="tabela vazio">${q ? 'Nenhum produto com esse nome no período.' : 'Nenhum produto no período.'}</p>`; return; }
    const max = linhas[0].pedidos.size;
    $('#c-produtos').innerHTML = `<table class="tabela c-tab">
      <colgroup><col class="c-c-prod2"><col class="c-c-n"><col><col><col class="c-c-ult"></colgroup>
      <thead><tr>${['Produto', 'Pedidos', 'Quantidade total', 'Equipes', 'Último pedido'].map(h => `<th><button type="button" disabled>${h}</button></th>`).join('')}</tr></thead>
      <tbody>${linhas.map(m => `<tr>
        <th scope="row">${escapar(m.produto)}</th>
        <td class="num"><b>${m.pedidos.size}</b><span class="mini-barra"><i style="width:${m.pedidos.size / max * 100}%"></i></span></td>
        <td>${Object.entries(m.qtd).map(([u, v]) => `${fmtN(v, Number.isInteger(v) ? 0 : 2)} ${escapar(u)}`).join(' · ')}</td>
        <td>${[...m.equipes].map(escapar).join(', ')}</td>
        <td>${dataBR(m.ultimo)}</td></tr>`).join('')}</tbody></table>`;
  }

  /* ---------- Solicitante filtrado: foto e resumo ---------- */
  const parado = p => { const ult = (estado.eventos[p.id] || []).at(-1); return ult ? Math.floor(diasEntre(ult.criado_em, new Date())) : null; };
  const pctTxt = (a, b) => (b ? `${fmtN(a / b * 100)}%` : '—');
  function perfilSolicitante(lista) {
    const sec = $('#c-perfil-sec'), p = estado.usuario && estado.perfis[estado.usuario];
    sec.hidden = !p; if (!p) return;
    const ab = lista.filter(aberto), rec = lista.filter(x => x.etapa === 'recebido'), emerg = lista.filter(x => x.tipo_pedido === 'Emergencial').length;
    const itens = [['Pedidos no período', fmtN(lista.length)], ['Em aberto', fmtN(ab.length)], ['Atrasados', fmtN(lista.filter(atrasado).length)], ['Emergenciais', pctTxt(emerg, lista.length)], ['Recebidos no prazo', pctTxt(rec.filter(noPrazo).length, rec.length)], ['Negados', fmtN(lista.filter(x => x.etapa === 'negado').length)]];
    $('#c-perfil').innerHTML = `${foto(p.id, 'c-foto c-foto-grande')}
      <div class="c-perfil-txt"><span class="eyebrow">Solicitante filtrado</span><h2>${escapar(p.nome)}</h2><p>${escapar(p.cargo || '—')}${p.cdc ? ` · ${escapar(p.cdc)}` : ''}</p></div>
      <div class="c-perfil-num">${itens.map(([r, v]) => `<div><strong>${v}</strong><small>${r}</small></div>`).join('')}</div>
      <button type="button" class="fat-btn" id="c-perfil-limpar"><i data-lucide="x"></i><span>Ver todos</span></button>`;
  }
  raiz.addEventListener('click', e => {
    if (e.target.closest('#c-perfil-limpar')) { estado.usuario = ''; try { localStorage.setItem('sma:compras:solicitante', ''); } catch (_) {} renderizar(); }
  });

  /* ---------- Gargalo agora: o que está parado há 3 dias ou mais ---------- */
  function gargalo(lista) {
    const ab = lista.filter(aberto), parados = ab.filter(p => (parado(p) ?? 0) >= 3);
    const emergAprov = ab.filter(p => p.tipo_pedido === 'Emergencial' && ['coordenador', 'analista'].includes(p.etapa));
    const el = $('#c-gargalo');
    if (!parados.length && !emergAprov.length) { el.innerHTML = `<div class="c-gargalo ok glass"><i data-lucide="circle-check"></i><div><strong>Sem gargalo agora</strong><p>Nenhum pedido em aberto está parado há 3 dias ou mais.</p></div></div>`; return; }
    const grupos = SITUACOES.map(s => { const l = parados.filter(p => situacaoDe(p) === s.id); return { s, l, max: Math.max(0, ...l.map(p => parado(p) || 0)) }; }).filter(g => g.l.length).sort((a, b) => b.l.length - a.l.length);
    el.innerHTML = `<div class="c-gargalo glass"><i data-lucide="siren"></i><div><strong>${parados.length ? `${parados.length} ${parados.length === 1 ? 'pedido parado' : 'pedidos parados'} há 3 dias ou mais` : 'Emergencial esperando aprovação'}</strong>
      <div class="c-gargalo-chips">${grupos.map(g => `<button type="button" class="c-chip" style="--c:${g.s.cor}" data-ir="c-aberto"><b>${g.l.length}</b> ${escapar(g.s.nome)} <small>· o mais antigo há ${g.max} d</small></button>`).join('')}
      ${emergAprov.length ? `<button type="button" class="c-chip" style="--c:#ff4d5e" data-ir="c-aberto"><b>${emergAprov.length}</b> emergencial(is) esperando aprovação</button>` : ''}</div></div></div>`;
  }
  raiz.addEventListener('click', e => { const b = e.target.closest('[data-ir]'); if (b) document.getElementById(b.dataset.ir)?.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' }); });

  /* ---------- Calendário de necessidades (4 semanas a partir desta) ---------- */
  function calendario(lista) {
    const ab = lista.filter(aberto);
    const hoje = new Date(hojeISO() + 'T00:00:00'), ini = new Date(hoje); ini.setDate(ini.getDate() - ((ini.getDay() + 6) % 7));   // segunda-feira
    const dias = Array.from({ length: 28 }, (_, i) => { const d = new Date(ini); d.setDate(d.getDate() + i); return d; });
    const fim = dias.at(-1).toLocaleDateString('sv-SE');
    const chip = p => `<button type="button" class="c-cal-ped" data-pedido="${escapar(p.id)}" style="--c:${TIPOS[p.tipo_pedido] || '#9fb9b3'}" title="${escapar(`Nº ${p.numero} · ${nomeItens(p.itens)} · Equipe ${p.equipe}`)}"><b>${escapar(p.numero)}</b> ${escapar((p.itens?.[0]?.produto || '').slice(0, 22))}</button>`;
    const atras = ab.filter(p => String(p.data_necessidade).slice(0, 10) < hojeISO()).sort((a, b) => String(a.data_necessidade).localeCompare(String(b.data_necessidade)));
    const depois = ab.filter(p => String(p.data_necessidade).slice(0, 10) > fim).length;
    $('#c-cal').innerHTML = `${atras.length ? `<div class="c-cal-atras"><span><i data-lucide="alarm-clock"></i>Atrasados (${atras.length})</span><div>${atras.map(chip).join('')}</div></div>` : ''}
      <div class="c-cal-scroll"><div class="c-cal">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => `<span class="c-cal-dia-sem">${d}</span>`).join('')}
      ${dias.map(d => { const iso = d.toLocaleDateString('sv-SE'), l = ab.filter(p => String(p.data_necessidade).slice(0, 10) === iso);
        return `<div class="c-cal-dia${iso === hojeISO() ? ' hoje' : ''}${iso < hojeISO() ? ' passou' : ''}${d.getDay() % 6 === 0 ? ' fds' : ''}"><span class="c-cal-num">${d.getDate()}${d.getDate() === 1 || iso === dias[0].toLocaleDateString('sv-SE') ? ` ${CURTOS[d.getMonth()]}` : ''}</span>${l.map(chip).join('')}</div>`; }).join('')}</div></div>
      ${depois ? `<p class="c-cal-mais">+ ${depois} ${depois === 1 ? 'pedido' : 'pedidos'} com necessidade depois de ${dataBR(fim)}.</p>` : ''}`;
  }

  /* ---------- Linha do tempo de um pedido ---------- */
  const ICONE_EV = { criado: 'file-plus', aprovado_coord: 'user-check', aprovado_analista: 'calculator', compras: 'truck', recebido: 'package-check', negado_coord: 'circle-x', negado_analista: 'circle-x' };
  function abrirPedido(id) {
    const p = estado.pedidos.find(x => x.id === id); if (!p) return;
    const s = SIT[situacaoDe(p)], ev = estado.eventos[p.id] || [];
    const quando = d => new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    $('#c-dlg').innerHTML = `<header class="c-dlg-cab"><div><span class="eyebrow">Pedido Nº ${escapar(p.numero)} · ${escapar(p.tipo_pedido)}</span><h2 id="c-dlg-titulo">${escapar(nomeItens(p.itens))}</h2></div>
        <button type="button" class="fat-btn" data-fechar aria-label="Fechar"><i data-lucide="x"></i></button></header>
      <div class="c-dlg-info">
        <span><small>Solicitante</small><span class="c-pessoa">${foto(p.solicitante_id)}${escapar(nome(p.solicitante_id))}</span></span>
        <span><small>Equipe</small>${escapar(p.equipe)}${p.frota ? ` · Frota ${escapar(p.frota)}` : ''}</span>
        <span><small>Departamento</small>${escapar(p.departamento)}</span>
        <span><small>Necessidade</small>${dataBR(p.data_necessidade)}</span>
        <span><small>Situação</small><span class="c-sit" style="--c:${s?.cor || '#9fb9b3'}">${escapar(s?.nome || p.etapa)}</span></span>
      </div>
      <ul class="c-dlg-itens">${(p.itens || []).map(i => `<li><b>${fmtN(Number(i.quantidade), Number.isInteger(Number(i.quantidade)) ? 0 : 2)} ${escapar(i.unidade)}</b> ${escapar(i.produto)}${i.descricao ? ` <small>· ${escapar(i.descricao)}</small>` : ''}</li>`).join('')}</ul>
      ${p.motivo ? `<p class="c-dlg-motivo"><small>Motivo</small>${escapar(p.motivo)}</p>` : ''}
      <ol class="c-linha">${ev.map((e, i) => `<li class="${/negado/.test(e.tipo) ? 'neg' : ''}"><span class="c-linha-ic"><i data-lucide="${ICONE_EV[e.tipo] || 'circle-dot'}"></i></span>
        <div><strong>${escapar(e.titulo || e.tipo)}</strong><small>${escapar(e.autor_nome || '—')}${e.autor_cargo ? ` · ${escapar(e.autor_cargo)}` : ''} · ${quando(e.criado_em)}${i ? ` · ${fmtN(diasEntre(ev[i - 1].criado_em, e.criado_em), 1)} d depois` : ''}</small>${e.detalhe ? `<p>${escapar(e.detalhe)}</p>` : ''}</div></li>`).join('') || '<li><div><strong>Sem histórico</strong></div></li>'}
        ${aberto(p) ? `<li class="espera"><span class="c-linha-ic"><i data-lucide="hourglass"></i></span><div><strong>Esperando: ${escapar(s?.nome || p.etapa)}</strong><small>parado há ${parado(p) ?? 0} d</small></div></li>` : ''}</ol>`;
    const dlg = $('#c-dialogo'); if (!dlg.open) dlg.showModal(); icones();
  }
  document.addEventListener('click', e => {
    const alvo = e.target.closest('[data-pedido]'); if (alvo) { abrirPedido(alvo.dataset.pedido); return; }
    if (e.target.closest('[data-fechar]') || e.target === $('#c-dialogo')) $('#c-dialogo').close();
  });
  raiz.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('tr[data-pedido]')) abrirPedido(e.target.dataset.pedido); });

  /* ---------- Qualidade do processo ---------- */
  const fmtDias = d => (d < 1 ? `${fmtN(d * 24)} h` : `${fmtN(d, 1)} d`);
  function graficoEmergenciais(lista) {
    const eqs = [...new Set(lista.map(p => p.equipe))].map(e => ({ e, l: lista.filter(p => p.equipe === e) })).sort((a, b) => b.l.length - a.l.length).slice(0, 12);
    if (!eqs.length) return vazioGraf('g-emerg', 'Nenhum pedido no período.');
    mostrarGraf('g-emerg');
    desenhar('g-emerg', { type: 'bar',
      data: { labels: eqs.map(x => `Equipe ${x.e}`), datasets: Object.entries(TIPOS).map(([t, cor]) => ({ label: t, data: eqs.map(x => x.l.filter(p => p.tipo_pedido === t).length), backgroundColor: `${cor}cc`, borderColor: cor, borderWidth: 1.5, borderRadius: 6, maxBarThickness: 28 })) },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, padding: 14 } }, rotulos: { folga: 120, totalTexto: (soma, i) => `${soma} · ${fmtN(eqs[i].l.filter(p => p.tipo_pedido === 'Emergencial').length / soma * 100)}% emerg.` } },
        scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } } });
  }
  function graficoPrazo(lista) {
    const rec = lista.filter(p => p.etapa === 'recebido' && p.recebido_em);
    if (!rec.length) return vazioGraf('g-prazo', 'Nenhum pedido recebido no período.');
    mostrarGraf('g-prazo');
    const mes = p => new Date(p.recebido_em).toLocaleDateString('sv-SE').slice(0, 7);
    const meses = [...new Set(rec.map(mes))].sort();
    const ok = meses.map(m => rec.filter(p => mes(p) === m && noPrazo(p)).length), at = meses.map((m, i) => rec.filter(p => mes(p) === m).length - ok[i]);
    desenhar('g-prazo', { type: 'bar',
      data: { labels: meses.map(k => `${CURTOS[+k.slice(5) - 1]}/${k.slice(2, 4)}`), datasets: [
        { label: 'No prazo', data: ok, backgroundColor: '#3dffa8cc', borderColor: '#3dffa8', borderWidth: 1.5, borderRadius: 6, maxBarThickness: 46 },
        { label: 'Atrasado', data: at, backgroundColor: '#ff4d5ecc', borderColor: '#ff4d5e', borderWidth: 1.5, borderRadius: 6, maxBarThickness: 46 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10, padding: 14 } }, rotulos: { totalTexto: (soma, i) => `${fmtN(ok[i] / soma * 100)}% no prazo` } },
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } } });
  }
  function graficoAprovadores(lista) {
    const t = {};
    const somar = (e, dias) => { if (!e?.autor_nome || dias == null) return; const x = (t[e.autor_nome] = t[e.autor_nome] || { cargo: e.autor_cargo, soma: 0, n: 0 }); x.soma += Math.max(0, dias); x.n++; };
    lista.forEach(p => {
      const ev = estado.eventos[p.id] || [], acha = tipos => ev.find(e => tipos.includes(e.tipo));
      const criado = acha(['criado'])?.criado_em || p.criado_em, coord = acha(['aprovado_coord', 'negado_coord']), apC = acha(['aprovado_coord']), an = acha(['aprovado_analista', 'negado_analista']);
      if (coord) somar(coord, diasEntre(criado, coord.criado_em));
      if (apC && an) somar(an, diasEntre(apC.criado_em, an.criado_em));
    });
    const l = Object.entries(t).map(([n, x]) => ({ n, cargo: x.cargo, media: x.soma / x.n, qtd: x.n })).sort((a, b) => b.media - a.media);
    if (!l.length) return vazioGraf('g-aprov', 'Nenhuma aprovação no período.');
    mostrarGraf('g-aprov');
    const cor = x => (/analista/i.test(x.cargo || '') ? '#ffc83d' : '#38bdf8');
    const cfg = barraH(l.map(x => `${x.n.split(' ')[0]} · ${x.cargo || ''}`), l.map(x => +x.media.toFixed(2)), l.map(cor), 'Dias');
    cfg.data.datasets[0].rotulo = (v, i) => `${fmtDias(v)} · ${l[i].qtd} ${l[i].qtd === 1 ? 'pedido' : 'pedidos'}`;
    cfg.options.plugins.rotulos = { folga: 120 };
    cfg.options.plugins.tooltip = { callbacks: { label: c => ` média ${fmtDias(c.raw)} em ${l[c.dataIndex].qtd} decisões` } };
    cfg.options.scales.x.ticks = { callback: v => `${v} d` };
    desenhar('g-aprov', cfg);
  }
  function graficoRecusas(lista) {
    const neg = lista.filter(p => p.etapa === 'negado');
    const eqs = [...new Set(neg.map(p => p.equipe))].sort();
    if (!neg.length) return vazioGraf('g-recusa', 'Nenhum pedido negado no período.');
    mostrarGraf('g-recusa');
    desenhar('g-recusa', { type: 'bar',
      data: { labels: eqs.map(e => `Equipe ${e}`), datasets: [['Coordenador', '#38bdf8'], ['Analista', '#ffc83d']].map(([q, cor]) => ({ label: q, data: eqs.map(e => neg.filter(p => p.equipe === e && (q === 'Coordenador' ? p.negado_por === 'Coordenador' : p.negado_por !== 'Coordenador')).length), backgroundColor: `${cor}cc`, borderColor: cor, borderWidth: 1.5, borderRadius: 6, maxBarThickness: 28 })) },
      options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, rotulos: { totalTexto: soma => `${soma} ${soma === 1 ? 'negado' : 'negados'}`, folga: 90 } },
        scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true, grid: { display: false } } } } });
  }
  function tabelaRecusas(lista) {
    const neg = lista.filter(p => p.etapa === 'negado').sort((a, b) => String(b.data_pedido).localeCompare(String(a.data_pedido)));
    $('#c-recusas-sub').textContent = neg.length ? `${neg.length} ${neg.length === 1 ? 'pedido negado' : 'pedidos negados'} no período (${pctTxt(neg.length, lista.length)} do total). Toque para ver o caminho.` : '';
    if (!neg.length) { $('#c-recusas').innerHTML = '<p class="tabela vazio c-ok"><i data-lucide="circle-check"></i> Nenhum pedido negado no período.</p>'; return; }
    $('#c-recusas').innerHTML = `<table class="tabela c-tab"><colgroup><col class="c-c-num"><col class="c-c-prod"><col class="c-c-eq"><col class="c-c-eq"><col></colgroup>
      <thead><tr>${['Nº', 'Produto', 'Equipe', 'Negado por', 'Justificativa'].map(h => `<th><button type="button" disabled>${h}</button></th>`).join('')}</tr></thead>
      <tbody>${neg.map(p => `<tr class="c-clica" data-pedido="${escapar(p.id)}" tabindex="0"><th scope="row">${escapar(p.numero)}</th><td><b>${escapar(nomeItens(p.itens))}</b><small class="c-sub">${escapar(nome(p.solicitante_id))} · ${dataBR(p.data_pedido)}</small></td><td>${escapar(p.equipe)}</td><td>${escapar(p.negado_por || '—')}</td><td>${escapar(p.justificativa_negativa || '—')}</td></tr>`).join('')}</tbody></table>`;
  }

  /* ---------- Frota e materiais ---------- */
  function graficoFrota(lista) {
    const cont = {};
    lista.filter(p => String(p.frota || '').trim()).forEach(p => { const k = String(p.frota).trim(); (cont[k] = cont[k] || { n: 0, itens: new Set() }).n++; (p.itens || []).forEach(i => cont[k].itens.add(i.produto)); });
    const ord = Object.entries(cont).sort((a, b) => b[1].n - a[1].n).slice(0, 12);
    if (!ord.length) return vazioGraf('g-frota', 'Nenhum pedido com frota no período.');
    mostrarGraf('g-frota');
    const cfg = barraH(ord.map(([k]) => `Frota ${k}`), ord.map(([, v]) => v.n), ord.map(() => '#c8f560'), 'Pedidos');
    cfg.options.plugins.tooltip = { callbacks: { afterLabel: c => [...ord[c.dataIndex][1].itens].slice(0, 6).join(', ') } };
    desenhar('g-frota', cfg);
  }
  function porProduto(lista) {
    const m = {};
    lista.forEach(p => (p.itens || []).forEach(i => {
      const k = semAcento(i.produto).trim(); if (!k) return;
      const x = (m[k] = m[k] || { produto: i.produto, pedidos: new Set(), meses: new Set(), equipes: {}, emerg: 0, qtd: {} });
      x.pedidos.add(p.id); x.meses.add(String(p.data_pedido).slice(0, 7)); if (p.tipo_pedido === 'Emergencial') x.emerg++;
      const u = i.unidade || 'un', q = Number(i.quantidade || 0);
      x.qtd[u] = (x.qtd[u] || 0) + q; ((x.equipes[p.equipe] = x.equipes[p.equipe] || {})[u] = (x.equipes[p.equipe][u] || 0) + q);
    }));
    return Object.values(m);
  }
  const qtdTxt = o => Object.entries(o || {}).map(([u, v]) => `${fmtN(v, Number.isInteger(v) ? 0 : 2)} ${escapar(u)}`).join(' · ');
  function tabelaRepetidos(lista) {
    const l = porProduto(lista).filter(x => x.pedidos.size >= 2).sort((a, b) => b.meses.size - a.meses.size || b.pedidos.size - a.pedidos.size).slice(0, 15);
    if (!l.length) { $('#c-repetidos').innerHTML = '<p class="tabela vazio">Nenhum produto foi pedido mais de uma vez no período.</p>'; return; }
    const sug = x => (x.meses.size >= 3 ? ['Estoque mínimo', '#3dffa8'] : x.emerg ? ['Planejar (já foi emergencial)', '#ff4d5e'] : x.pedidos.size >= 3 ? ['Compra mensal planejada', '#c8f560'] : ['Acompanhar', '#9fb9b3']);
    $('#c-repetidos').innerHTML = `<table class="tabela c-tab"><thead><tr>${['Produto', 'Pedidos', 'Meses', 'Sugestão'].map(h => `<th><button type="button" disabled>${h}</button></th>`).join('')}</tr></thead>
      <tbody>${l.map(x => { const [t, c] = sug(x); return `<tr><th scope="row">${escapar(x.produto)}<small class="c-sub">${qtdTxt(x.qtd)}</small></th><td class="num"><b>${x.pedidos.size}</b>${x.emerg ? `<small class="c-sub">${x.emerg} emerg.</small>` : ''}</td><td class="num">${x.meses.size}</td><td><span class="c-sit" style="--c:${c}">${t}</span></td></tr>`; }).join('')}</tbody></table>`;
  }
  function tabelaConsumo(lista) {
    const l = porProduto(lista).sort((a, b) => b.pedidos.size - a.pedidos.size).slice(0, 15);
    const eqs = [...new Set(lista.map(p => p.equipe))].sort();
    if (!l.length) { $('#c-consumo').innerHTML = '<p class="tabela vazio">Nenhum produto no período.</p>'; return; }
    $('#c-consumo').innerHTML = `<table class="tabela c-tab c-tab-consumo"><thead><tr><th><button type="button" disabled>Produto</button></th>${eqs.map(e => `<th class="num"><button type="button" disabled>${escapar(e)}</button></th>`).join('')}<th class="num"><button type="button" disabled>Total</button></th></tr></thead>
      <tbody>${l.map(x => `<tr><th scope="row">${escapar(x.produto)}</th>${eqs.map(e => `<td class="num">${x.equipes[e] ? qtdTxt(x.equipes[e]) : '<span class="c-mudo">—</span>'}</td>`).join('')}<td class="num"><b>${qtdTxt(x.qtd)}</b></td></tr>`).join('')}</tbody></table>`;
  }

  /* ---------- Folhito: resumo do que está na tela ---------- */
  (window.SMA_CONTEXTO ||= {}).compras = () => {
    if (estado.carregando || !estado.pedidos.length) return '';
    const l = filtrados(), ab = l.filter(aberto), at = l.filter(atrasado);
    const quem = estado.usuario ? estado.perfis[estado.usuario]?.nome : '';
    const sit = SITUACOES.map(s => [s.nome, l.filter(p => situacaoDe(p) === s.id).length]).filter(x => x[1]).map(x => `${x[0]}: ${x[1]}`).join('; ');
    return `Painel de Compras (seção Custos, App de Compras). Período: ${({ 30: 'últimos 30 dias', 90: 'últimos 90 dias', ano: 'este ano', tudo: 'tudo' })[estado.periodo]}${quem ? `; filtrado pelo solicitante ${quem}` : ''}${estado.cdc ? `; CDC ${estado.cdc}` : ''}.
Pedidos: ${l.length} (${l.filter(p => p.tipo_pedido === 'Emergencial').length} emergenciais). Em aberto: ${ab.length}. Atrasados: ${at.length}.
Situação: ${sit || 'nenhum'}.
Atrasados: ${at.slice(0, 10).map(p => `Nº ${p.numero} ${nomeItens(p.itens)} (equipe ${p.equipe}, necessidade ${dataBR(p.data_necessidade)}, ${SIT[situacaoDe(p)]?.nome})`).join('; ') || 'nenhum'}.
Parados há 3+ dias: ${ab.filter(p => (parado(p) ?? 0) >= 3).slice(0, 10).map(p => `Nº ${p.numero} em ${SIT[situacaoDe(p)]?.nome} há ${parado(p)} d`).join('; ') || 'nenhum'}.
Negados: ${l.filter(p => p.etapa === 'negado').slice(0, 6).map(p => `Nº ${p.numero} (${p.negado_por}): ${p.justificativa_negativa || 'sem justificativa'}`).join('; ') || 'nenhum'}.`;
  };

  /* ---------- Imagem e PDF do painel ---------- */
  const secoes = () => $$(':scope > section', raiz).filter(s => !s.hidden && s.offsetHeight > 0);
  const nomeArq = ext => `Compras${estado.usuario ? `_${(estado.perfis[estado.usuario]?.nome || '').split(' ')[0]}` : ''}_${hojeISO()}.${ext}`;
  async function exportar(bt, faz) {
    if (!window.SMA_PDF) return;
    const rot = $('span', bt), original = rot.textContent; bt.disabled = true; rot.textContent = 'Gerando…';
    Object.values(graficos).forEach(g => { g.options.animation = false; g.update('none'); });
    try { await faz(rot); rot.textContent = 'Pronto ✓'; }
    catch (e) { console.error('Compras: exportar', e); rot.textContent = 'Não consegui'; }
    finally { bt.disabled = false; setTimeout(() => { rot.textContent = original; }, 2500); }
  }
  const baixar = (href, nome) => { const a = document.createElement('a'); a.href = href; a.download = nome; document.body.appendChild(a); a.click(); a.remove(); };
  $('#c-imagem').addEventListener('click', e => exportar(e.currentTarget, async () => {
    const cv = await window.SMA_PDF.capturar(raiz);
    baixar(cv.toDataURL('image/png'), nomeArq('png'));
  }));
  $('#c-pdf').addEventListener('click', e => exportar(e.currentTarget, async rot => {
    // cada parte do painel vira uma foto; as fotos são encaixadas em páginas A4 deitadas
    const fotos = [];
    for (const [i, s] of secoes().entries()) { rot.textContent = `Lendo ${i + 1}/${secoes().length}…`; const cv = await window.SMA_PDF.capturar(s);
      // parte mais alta que uma página (tabela longa): corta em pedaços e continua na página seguinte
      const esc = 960 / cv.width, passo = Math.floor(650 / esc);
      for (let y = 0; y < cv.height; y += passo) {
        const pedaco = document.createElement('canvas'); pedaco.width = cv.width; pedaco.height = Math.min(passo, cv.height - y);
        pedaco.getContext('2d').drawImage(cv, 0, y, cv.width, pedaco.height, 0, 0, cv.width, pedaco.height);
        fotos.push({ src: pedaco.toDataURL('image/jpeg', .9), h: pedaco.height * esc });
      }
    }
    const quem = estado.usuario ? estado.perfis[estado.usuario]?.nome : '';
    const cab = `<header class="c-pdf-cab"><h1>Compras · App de Compras</h1><p>${quem ? `Solicitante: ${escapar(quem)} · ` : ''}Período: ${({ 30: 'últimos 30 dias', 90: 'últimos 90 dias', ano: 'este ano', tudo: 'tudo' })[estado.periodo]} · gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></header>`;
    const pags = []; let atual = [], alt = 0;
    fotos.forEach(f => { const h = Math.min(f.h, 650); if (atual.length && alt + h > 650) { pags.push(atual); atual = []; alt = 0; } atual.push({ ...f, h }); alt += h + 8; });
    if (atual.length) pags.push(atual);
    await window.SMA_PDF.gerar(pags.map(p => cab + p.map(f => `<img class="c-pdf-img" src="${f.src}" style="height:${f.h}px" alt="">`).join('')), nomeArq('pdf'), { progresso: (i, n) => { rot.textContent = `Página ${i}/${n}…`; } });
  }));

  /* ---------- Exportar ---------- */
  $('#c-csv').addEventListener('click', () => {
    const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cab = ['Nº', 'Data do pedido', 'Necessidade', 'CDC', 'Solicitante', 'Departamento', 'Equipe', 'Tipo da equipe', 'Frota', 'Tipo de pedido', 'Produto', 'Quantidade', 'Unidade', 'Descrição', 'Motivo', 'Situação', 'Justificativa da recusa', 'Recebido em'];
    const linhas = [];
    filtrados().forEach(p => (p.itens || []).forEach(i => linhas.push([p.numero, dataBR(p.data_pedido), dataBR(p.data_necessidade), p.cdc, nome(p.solicitante_id), p.departamento, p.equipe, p.equipe_tipo, p.frota, p.tipo_pedido,
      i.produto, String(i.quantidade).replace('.', ','), i.unidade, i.descricao, p.motivo, SIT[situacaoDe(p)]?.nome || p.etapa, p.justificativa_negativa, p.recebido_em ? new Date(p.recebido_em).toLocaleString('pt-BR') : ''])));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + [cab.map(cel).join(';'), ...linhas.map(l => l.map(cel).join(';'))].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `Compras_${hojeISO()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ---------- Orquestração ---------- */
  function renderizar() {
    if (estado.carregando) return;
    renderFiltros();
    const lista = filtrados();
    kpis(lista);
    graficoMes(lista); graficoEtapa(lista); graficoEquipe(lista); graficoDep(lista);
    tempos(lista);
    tabelaAberto(lista);
    tabelaProdutos(lista);
    perfilSolicitante(lista); gargalo(lista); calendario(lista);
    graficoEmergenciais(lista); graficoPrazo(lista); graficoAprovadores(lista); graficoRecusas(lista); tabelaRecusas(lista);
    graficoFrota(lista); tabelaRepetidos(lista); tabelaConsumo(lista);
    icones();
  }

  // atualiza sozinho quando a aba volta a ficar visível (no máximo a cada 2 minutos)
  let ultima = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - ultima > 120000) { ultima = Date.now(); carregar(); }
  });

  icones();
  carregar();
})();
