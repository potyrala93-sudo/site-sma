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
  function prepararChart() {
    const C = window.Chart; if (!C) return false;
    C.defaults.color = '#9fb9b3'; C.defaults.font.family = 'Manrope, sans-serif'; C.defaults.font.weight = 600;
    C.defaults.borderColor = 'rgba(255,255,255,.06)';
    C.defaults.plugins.tooltip.backgroundColor = 'rgba(4,18,17,.95)'; C.defaults.plugins.tooltip.borderColor = 'rgba(61,255,168,.4)'; C.defaults.plugins.tooltip.borderWidth = 1;
    C.defaults.plugins.tooltip.padding = 12; C.defaults.plugins.tooltip.cornerRadius = 12;
    C.defaults.animation.duration = reduzMovimento ? 0 : 800;
    return true;
  }
  function desenhar(id, config) {
    graficos[id]?.destroy();
    if (!prepararChart()) return;
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
  function tabelaAberto(lista) {
    const abertos = lista.filter(aberto).sort((a, b) => String(a.data_necessidade).localeCompare(String(b.data_necessidade)));
    $('#c-aberto-sub').textContent = abertos.length ? `${abertos.length} ${abertos.length === 1 ? 'pedido ainda não foi recebido' : 'pedidos ainda não foram recebidos'}, do mais urgente para o menos urgente.` : '';
    if (!abertos.length) { $('#c-aberto').innerHTML = '<p class="tabela vazio c-ok"><i data-lucide="circle-check"></i> Nenhum pedido em aberto no período.</p>'; return; }
    const parado = p => { const ult = (estado.eventos[p.id] || []).at(-1); return ult ? Math.floor(diasEntre(ult.criado_em, new Date())) : null; };
    const prazo = p => { const n = diasAte(p.data_necessidade); return n < 0 ? `<span class="c-prazo atraso">${-n} d de atraso</span>` : n === 0 ? '<span class="c-prazo hoje">é hoje</span>' : n <= 3 ? `<span class="c-prazo perto">faltam ${n} d</span>` : `<span class="c-prazo">faltam ${n} d</span>`; };
    $('#c-aberto').innerHTML = `<table class="tabela c-tab">
      <colgroup><col class="c-c-num"><col class="c-c-prod"><col><col class="c-c-eq"><col><col class="c-c-sit"><col class="c-c-par"></colgroup>
      <thead><tr>${['Nº', 'Produto', 'Solicitante', 'Equipe', 'Necessidade', 'Situação', 'Parado há'].map(h => `<th><button type="button" disabled>${h}</button></th>`).join('')}</tr></thead>
      <tbody>${abertos.map(p => { const s = SIT[situacaoDe(p)]; const d = parado(p); return `<tr style="--sc-linha:${TIPOS[p.tipo_pedido] || 'transparent'}">
        <th scope="row">${escapar(p.numero)}</th>
        <td title="${escapar((p.itens || []).map(i => `${i.quantidade} ${i.unidade} ${i.produto}`).join('; '))}"><b>${escapar(nomeItens(p.itens))}</b><small class="c-sub">${escapar(p.tipo_pedido)} · ${escapar(p.departamento)}</small></td>
        <td>${escapar(nome(p.solicitante_id))}</td>
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
