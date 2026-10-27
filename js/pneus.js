/* ==========================================================================
   SMA · Silvicultura — Estoque de Pneus
   Lê o saldo e as movimentações do App de Pneus (Supabase, sem login; o mesmo
   banco do App de Compras). Cada linha é uma medida de pneu de um tipo de
   veículo (Caminhão/Trator) e posição (Dianteiro/Traseiro).
   ========================================================================== */

(() => {
  const raiz = document.getElementById('pne');
  if (!raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmt = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  const dataBR = d => { if (!d) return '—'; const [a, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${a}`; };
  const hojeISO = () => new Date().toLocaleDateString('sv-SE');

  const VEICULOS = ['Caminhão', 'Trator'];
  const POSICOES = { Dianteiro: 'Dianteiro', Traseiro: 'Traseiro (tração)' };
  const nomePosicao = p => POSICOES[p] || p;
  const descricao = m => `${m.veiculo} · ${nomePosicao(m.posicao)}`;

  // desenho de um pneu (caminhão: mais estreito; trator: garras largas)
  const desenho = (veiculo, cls = '') => `<span class="e-foto p-des ${cls}" aria-hidden="true"><svg viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="21" fill="#1c2b28" stroke="${veiculo === 'Trator' ? '#c8f560' : '#3dffa8'}" stroke-width="2"/>
    ${Array.from({ length: veiculo === 'Trator' ? 10 : 16 }, (_, i) => { const a = i * Math.PI * 2 / (veiculo === 'Trator' ? 10 : 16); return `<line x1="${24 + Math.cos(a) * 16}" y1="${24 + Math.sin(a) * 16}" x2="${24 + Math.cos(a) * 20.5}" y2="${24 + Math.sin(a) * 20.5}" stroke="${veiculo === 'Trator' ? '#c8f560' : '#3dffa8'}" stroke-width="${veiculo === 'Trator' ? 3.2 : 1.6}" stroke-linecap="round"/>`; }).join('')}
    <circle cx="24" cy="24" r="10" fill="#0d1715" stroke="#9fb9b3" stroke-width="1.6"/><circle cx="24" cy="24" r="3.4" fill="#9fb9b3"/>
  </svg></span>`;

  /* ---------- Conexão ---------- */
  const CFG = window.PNEU_CONFIG?.SUPABASE_URL ? window.PNEU_CONFIG : window.APP_CONFIG || {};
  let sb = null;
  function cliente() {
    if (sb) return sb;
    if (!window.supabase?.createClient || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return null;
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    return sb;
  }

  const estado = { medidas: [], movs: [], busca: '', veiculo: '', soFalta: false, zerados: true, carregando: true };
  try { estado.zerados = localStorage.getItem('sma:pneus:zerados') !== '0'; estado.veiculo = localStorage.getItem('sma:pneus:veiculo') || ''; } catch (_) {}
  $('#p-zerados').checked = estado.zerados;

  async function carregar() {
    $('#p-status').textContent = 'Carregando…';
    raiz.classList.add('carregando');
    try {
      if (!cliente()) throw new Error('sem cliente');
      const [md, mv] = await Promise.all([
        sb.from('vw_pneu_estoque').select('*').eq('ativo', true),
        sb.from('pneu_movimentos').select('*').order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(1000)
      ]);
      if (md.error) throw md.error;
      estado.medidas = md.data.map(m => ({ ...m, saldo: Number(m.saldo) }))
        .sort((a, b) => VEICULOS.indexOf(a.veiculo) - VEICULOS.indexOf(b.veiculo) || String(a.posicao).localeCompare(String(b.posicao)) || a.medida.localeCompare(b.medida, 'pt-BR', { numeric: true }));
      estado.movs = mv.error ? [] : mv.data.map(x => ({ ...x, quantidade: Number(x.quantidade) }));
      $('#p-erros').hidden = true;
      $('#p-status').textContent = `${estado.medidas.length} medidas · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (ex) {
      console.warn('Pneus: falha ao ler', ex);
      const el = $('#p-erros'); el.hidden = false;
      el.innerHTML = '<i data-lucide="triangle-alert"></i><div><strong>Não consegui carregar os pneus</strong><p>Verifique a internet e se o arquivo pneus.sql já foi rodado no Supabase. Depois toque em "Atualizar dados".</p></div>';
      $('#p-status').textContent = 'Sem acesso aos pneus';
    }
    estado.carregando = false;
    raiz.classList.remove('carregando');
    renderizar();
  }

  /* ---------- Resumo ---------- */
  const medidaDe = id => estado.medidas.find(m => m.id === id);
  function resumo() {
    const tot = v => estado.medidas.filter(m => !v || m.veiculo === v).reduce((s, m) => s + m.saldo, 0);
    const limite = new Date(Date.now() - 30 * 864e5).toLocaleDateString('sv-SE');
    const ret30 = estado.movs.filter(x => x.tipo === 'retirada' && String(x.data) >= limite).reduce((s, x) => s + x.quantidade, 0);
    const falta = estado.medidas.filter(m => m.saldo <= 0).length;
    const cards = [
      ['circle-dot', 'Pneus em estoque', fmt(tot('')), `${estado.medidas.filter(m => m.saldo > 0).length} de ${estado.medidas.length} medidas com estoque`, '#3dffa8', ''],
      ['truck', 'Caminhão', fmt(tot('Caminhão')), 'pneus', '#3dffa8', 'Caminhão'],
      ['tractor', 'Trator', fmt(tot('Trator')), 'pneus', '#c8f560', 'Trator'],
      ['circle-alert', 'Medidas em falta', fmt(falta), falta ? 'sem nenhum pneu' : 'todas com estoque', falta ? '#ff4d5e' : '#3dffa8', 'falta'],
      ['arrow-up-from-line', 'Retirados em 30 dias', fmt(ret30), 'pneus que saíram', '#38bdf8', '']
    ];
    $('#p-kpis').innerHTML = cards.map(([ic, rot, val, aj, cor, filtro]) => `<article class="kpi glass p-kpi${filtro && (estado.veiculo === filtro || (filtro === 'falta' && estado.soFalta)) ? ' ativo' : ''}" style="--c:${cor}"${filtro ? ` data-filtro="${filtro}" role="button" tabindex="0"` : ''}>
        <span class="icon-box"><i data-lucide="${ic}"></i></span><span class="kpi-rot">${rot}</span><strong class="kpi-val">${val}</strong><small class="kpi-ajuda">${aj}</small></article>`).join('');
  }

  /* ---------- Tabela ---------- */
  function visiveis() {
    const q = semAcento(estado.busca).replace(/\s+/g, '');
    return estado.medidas.filter(m => (estado.zerados || m.saldo > 0) && (!estado.veiculo || m.veiculo === estado.veiculo) && (!estado.soFalta || m.saldo <= 0)
      && (!q || semAcento(m.medida + descricao(m)).replace(/\s+/g, '').includes(q)));
  }
  function renderizar() {
    if (estado.carregando) return;
    resumo();
    $$('#p-veiculos [data-v]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === estado.veiculo)));
    const lista = visiveis();
    const com = estado.medidas.filter(m => m.saldo > 0).length, zer = estado.medidas.length - com;
    $('#p-resumo').textContent = `${com} ${com === 1 ? 'medida' : 'medidas'} com estoque${zer ? ` · ${zer} zeradas ${estado.zerados ? 'na lista' : 'escondidas'}` : ''}.`;
    if (!lista.length) {
      $('#p-tabela').innerHTML = `<p class="tabela vazio">${estado.busca ? 'Nenhuma medida com esse nome.' : 'Nenhuma medida com estoque. Marque "Mostrar zeradas" para ver todas.'}</p>`;
    } else {
      $('#p-tabela').innerHTML = `<table class="tabela e-tab">
        <colgroup><col class="e-c-foto"><col><col class="e-c-qtd"><col class="e-c-ult"><col class="e-c-ver"></colgroup>
        <thead><tr>${['Pneu', 'Medida', 'Quantidade', 'Última movimentação', ''].map(t => `<th><button type="button" disabled>${t}</button></th>`).join('')}</tr></thead>
        <tbody>${lista.map(m => `<tr data-id="${m.id}" tabindex="0" role="button" aria-label="Ver movimentação do pneu ${escapar(m.medida)}">
          <td>${desenho(m.veiculo)}</td>
          <th scope="row">${escapar(m.medida)}<small class="a-sub">${escapar(descricao(m))}${m.saldo <= 0 ? ' · <span class="a-falta">em falta</span>' : ''}</small></th>
          <td class="num"><b class="e-qtd${m.saldo <= 0 ? ' zero' : ''}">${fmt(m.saldo)}</b></td>
          <td>${m.ultima_movimentacao ? dataBR(m.ultima_movimentacao) : '—'}</td>
          <td class="e-ver"><i data-lucide="chevron-right"></i></td></tr>`).join('')}</tbody></table>`;
    }
    ultimas();
    icones();
  }
  // últimas movimentações de todas as medidas
  function ultimas() {
    const l = estado.movs.filter(x => !estado.veiculo || medidaDe(x.medida_id)?.veiculo === estado.veiculo).slice(0, 15);
    $('#p-ultimas').innerHTML = l.length ? `<table class="tabela e-mov p-mov">
      <colgroup><col class="e-c-data"><col class="e-c-tipo"><col><col class="e-c-q"><col><col></colgroup>
      <thead><tr>${['Data', 'Tipo', 'Pneu', 'Quantidade', 'Destino', 'Quem pegou'].map(t => `<th><button type="button" disabled>${t}</button></th>`).join('')}</tr></thead>
      <tbody>${l.map(x => { const m = medidaDe(x.medida_id), r = x.tipo === 'retirada'; return `<tr>
        <td data-rotulo="Data">${dataBR(x.data)}</td>
        <td data-rotulo="Tipo"><span class="e-tipo ${r ? 'ret' : 'ent'}">${r ? 'Retirada' : 'Entrada'}</span></td>
        <td data-rotulo="Pneu"><b>${escapar(m?.medida || '—')}</b><small class="a-sub">${m ? escapar(descricao(m)) : ''}</small></td>
        <td class="num" data-rotulo="Quantidade"><b class="${r ? 'neg' : 'pos'}">${r ? '−' : '+'}${fmt(x.quantidade)}</b></td>
        <td data-rotulo="Destino">${escapar(x.destino || '—')}</td>
        <td data-rotulo="Quem pegou">${r ? escapar(x.retirado_por || '—') : '—'}</td></tr>`; }).join('')}</tbody></table>`
      : '<p class="tabela vazio">Nenhuma movimentação ainda. As entradas e retiradas feitas no App de Pneus aparecem aqui.</p>';
  }

  $('#p-tabela').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) abrir(+tr.dataset.id); });
  $('#p-tabela').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-id]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(+tr.dataset.id); } });
  $('#p-busca').addEventListener('input', e => { estado.busca = e.target.value; renderizar(); });
  $('#p-zerados').addEventListener('change', e => { estado.zerados = e.target.checked; try { localStorage.setItem('sma:pneus:zerados', estado.zerados ? '1' : '0'); } catch (_) {} renderizar(); });
  const escolherVeiculo = v => { estado.veiculo = v; estado.soFalta = false; try { localStorage.setItem('sma:pneus:veiculo', v); } catch (_) {} renderizar(); };
  $('#p-veiculos').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) escolherVeiculo(estado.veiculo === b.dataset.v ? '' : b.dataset.v); });
  const filtrarCard = c => {
    if (c.dataset.filtro === 'falta') { estado.soFalta = !estado.soFalta; estado.veiculo = ''; if (estado.soFalta) { estado.zerados = true; $('#p-zerados').checked = true; } renderizar(); }
    else escolherVeiculo(estado.veiculo === c.dataset.filtro ? '' : c.dataset.filtro);
  };
  $('#p-kpis').addEventListener('click', e => { const c = e.target.closest('[data-filtro]'); if (c) filtrarCard(c); });
  $('#p-kpis').addEventListener('keydown', e => { const c = e.target.closest('[data-filtro]'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); filtrarCard(c); } });
  $('#e-atualizar')?.addEventListener('click', carregar);

  /* ---------- Movimentação da medida ---------- */
  const dlg = $('#p-dlg');
  $('#p-fechar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  function abrir(id) {
    const m = medidaDe(id); if (!m) return;
    const l = estado.movs.filter(x => x.medida_id === id);
    const ent = l.filter(x => x.tipo !== 'retirada').reduce((s, x) => s + x.quantidade, 0), ret = l.filter(x => x.tipo === 'retirada').reduce((s, x) => s + x.quantidade, 0);
    $('#p-dlg-prod').innerHTML = `${desenho(m.veiculo, 'grande')}<div><span class="eyebrow">${escapar(descricao(m))}</span><h2 class="fat-sec-titulo" id="p-dlg-tit">${escapar(m.medida)}</h2></div>`;
    $('#p-dlg-kpis').innerHTML = `<div class="e-k"><span>Em estoque</span><b>${fmt(m.saldo)}</b></div><div class="e-k ent"><span>Entradas</span><b>+${fmt(ent)}</b></div><div class="e-k ret"><span>Retiradas</span><b>−${fmt(ret)}</b></div>`;
    $('#p-dlg-lista').innerHTML = l.length ? `<table class="tabela e-mov p-mov">
      <colgroup><col class="e-c-data"><col class="e-c-tipo"><col class="e-c-q"><col><col></colgroup>
      <thead><tr>${['Data', 'Tipo', 'Quantidade', 'Destino', 'Quem pegou'].map(t => `<th><button type="button" disabled>${t}</button></th>`).join('')}</tr></thead>
      <tbody>${l.map(x => { const r = x.tipo === 'retirada'; return `<tr><td data-rotulo="Data">${dataBR(x.data)}</td>
        <td data-rotulo="Tipo"><span class="e-tipo ${r ? 'ret' : 'ent'}">${r ? 'Retirada' : 'Entrada'}</span></td>
        <td class="num" data-rotulo="Quantidade"><b class="${r ? 'neg' : 'pos'}">${r ? '−' : '+'}${fmt(x.quantidade)}</b></td>
        <td data-rotulo="Destino">${escapar(x.destino || '—')}</td><td data-rotulo="Quem pegou">${r ? escapar(x.retirado_por || '—') : '—'}</td></tr>`; }).join('')}</tbody></table>`
      : '<p class="tabela vazio">Nenhuma movimentação ainda.</p>';
    dlg.showModal(); icones();
  }

  /* ---------- CSV ---------- */
  $('#p-csv').addEventListener('click', () => {
    const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Veículo', 'Posição', 'Medida', 'Quantidade', 'Última movimentação']];
    visiveis().forEach(m => linhas.push([m.veiculo, nomePosicao(m.posicao), m.medida, m.saldo, dataBR(m.ultima_movimentacao)]));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `Pneus_${hojeISO()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  /* ---------- Folhito: o que está na tela ---------- */
  (window.SMA_CONTEXTO ||= {}).pneus = () => {
    if (raiz.hidden || !estado.medidas.length) return '';
    return `Estoque de Pneus (App de Pneus): ${estado.medidas.map(m => `${m.medida} ${descricao(m)}: ${m.saldo}`).join('; ')}.
Últimas movimentações: ${estado.movs.slice(0, 10).map(x => `${dataBR(x.data)} ${x.tipo} ${x.quantidade} ${medidaDe(x.medida_id)?.medida || ''}${x.destino ? ` para ${x.destino}` : ''}`).join('; ') || 'nenhuma'}.`;
  };

  // atualiza ao voltar para a aba (no máximo a cada 2 minutos)
  let ultima = Date.now();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultima > 120000) { ultima = Date.now(); carregar(); } });

  icones();
  carregar();
})();
