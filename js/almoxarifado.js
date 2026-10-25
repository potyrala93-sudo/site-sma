/* ==========================================================================
   SMA · Silvicultura — Estoque do Almoxarifado
   Lê o saldo e as movimentações do App Almoxarifado (Supabase, sem login).
   Cada produto aparece uma vez (ex.: "Bota florestal"); os tamanhos/tipos
   ficam dentro dele, no quadro de movimentação.
   ========================================================================== */

(() => {
  const raiz = document.getElementById('alm');
  if (!raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmt = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const dataBR = d => { if (!d) return '—'; const [a, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${a}`; };
  const DES = window.ALMOX_DESENHOS;

  /* ---------- Imagem: a foto ou o desenho da categoria ---------- */
  function imagem(g, cls = '') {
    const des = `<span class="e-foto a-des ${cls}" aria-hidden="true">${DES ? DES.svg(g.icone, g.categoria) : ''}</span>`;
    return g.foto_url ? `<img class="e-foto ${cls}" src="${escapar(g.foto_url)}" alt="" loading="lazy" onerror="this.outerHTML=this.dataset.d" data-d="${escapar(des)}">` : des;
  }

  /* ---------- Organização: produto > tamanhos/tipos ---------- */
  const LETRAS = { PP: 0, P: 1, M: 2, G: 3, GG: 4, XG: 5, EXG: 6 };
  function rank(v) {
    if (!v) return [0, 0, ''];
    const l = v.trim().toUpperCase(), n = v.match(/(\d+)/);
    if (l in LETRAS) return [1, LETRAS[l], ''];
    if (/^N°/i.test(v) && n) return [2, +n[1], ''];
    return [3, 0, semAcento(v)];
  }
  const ordemVar = (a, b) => { const x = rank(a.variacao), y = rank(b.variacao); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); };
  const tamanhos = g => g.itens.some(i => /^(N°\s*\d|(PP|P|M|G|GG|XG|EXG)$)/i.test((i.variacao || '').trim())) ? ['tamanho', 'tamanhos'] : ['tipo', 'tipos'];

  function agrupar(linhas) {
    const m = new Map();
    for (const it of linhas) {
      const nome = it.grupo || it.nome, k = nome.toLowerCase();
      if (!m.has(k)) m.set(k, { grupo: nome, categoria: it.categoria || 'Outros', icone: it.icone || 'caixa', foto_url: null, itens: [] });
      const g = m.get(k); g.itens.push(it); if (!g.foto_url && it.foto_url) g.foto_url = it.foto_url;
    }
    return [...m.values()].map(g => {
      g.itens.sort(ordemVar);
      g.total = g.itens.reduce((s, i) => s + i.saldo, 0);
      g.falta = g.itens.filter(i => i.saldo <= 0).length;
      g.ultima = g.itens.map(i => i.ultima_movimentacao).filter(Boolean).sort().pop() || null;
      g.busca = semAcento([g.grupo, g.categoria, ...g.itens.map(i => i.variacao || '')].join(' '));
      return g;
    }).sort((a, b) => a.grupo.localeCompare(b.grupo, 'pt-BR'));
  }

  /* ---------- Conexão ---------- */
  const CFG = window.APP_CONFIG || {};
  let sb = null;
  function cliente() {
    if (sb) return sb;
    if (!window.supabase?.createClient || !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) return null;
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    return sb;
  }

  const estado = { grupos: [], busca: '', zerados: false, carregando: true };
  try { estado.zerados = localStorage.getItem('sma:almox:zerados') === '1'; } catch (_) {}
  $('#a-zerados').checked = estado.zerados;

  async function carregar() {
    $('#a-status').textContent = 'Carregando…';
    raiz.classList.add('carregando');
    try {
      if (!cliente()) throw new Error('sem cliente');
      const { data, error } = await sb.from('vw_almox_estoque').select('*').eq('ativo', true);
      if (error) throw error;
      estado.grupos = agrupar(data.map(p => ({ ...p, saldo: Number(p.saldo) })));
      $('#a-erros').hidden = true;
      $('#a-status').textContent = `${estado.grupos.length} produtos · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (ex) {
      console.warn('Almoxarifado: falha ao ler', ex);
      const el = $('#a-erros'); el.hidden = false;
      el.innerHTML = '<i data-lucide="triangle-alert"></i><div><strong>Não consegui carregar o almoxarifado</strong><p>Verifique a internet e se o arquivo almoxarifado.sql já foi rodado no Supabase. Depois toque em "Atualizar dados".</p></div>';
      $('#a-status').textContent = 'Sem acesso ao almoxarifado';
    }
    estado.carregando = false;
    raiz.classList.remove('carregando');
    renderizar();
  }

  /* ---------- Tabela ---------- */
  function visiveis() {
    const q = semAcento(estado.busca).trim();
    return estado.grupos.filter(g => (estado.zerados || g.total > 0) && (!q || q.split(/\s+/).every(t => g.busca.includes(t))));
  }
  function renderizar() {
    if (estado.carregando) return;
    const lista = visiveis();
    const com = estado.grupos.filter(g => g.total > 0).length, zer = estado.grupos.length - com;
    $('#a-resumo').textContent = `${com} ${com === 1 ? 'produto' : 'produtos'} com estoque${zer ? ` · ${zer} zerados ${estado.zerados ? 'na lista' : 'escondidos'}` : ''}.`;
    if (!lista.length) {
      $('#a-tabela').innerHTML = `<p class="tabela vazio">${estado.busca ? 'Nenhum produto com esse nome.' : 'Nenhum produto com estoque.'}</p>`;
      icones(); return;
    }
    $('#a-tabela').innerHTML = `<table class="tabela e-tab">
      <colgroup><col class="e-c-foto"><col><col class="e-c-qtd"><col class="e-c-ult"><col class="e-c-ver"></colgroup>
      <thead><tr>${['Foto', 'Produto', 'Quantidade', 'Última movimentação', ''].map(t => `<th><button type="button" disabled>${t}</button></th>`).join('')}</tr></thead>
      <tbody>${lista.map(g => {
        const [, varios] = tamanhos(g);
        const sub = [g.categoria, g.itens.length > 1 ? `${g.itens.length} ${varios}` : '', g.itens.length > 1 && g.falta ? `<span class="a-falta">${g.falta} em falta</span>` : ''].filter(Boolean).join(' · ');
        return `<tr data-g="${escapar(g.grupo)}" tabindex="0" role="button" aria-label="Ver movimentação de ${escapar(g.grupo)}">
        <td>${imagem(g)}</td>
        <th scope="row">${escapar(g.grupo)}<small class="a-sub">${sub}</small></th>
        <td class="num"><b class="e-qtd${g.total <= 0 ? ' zero' : ''}">${fmt(g.total)}</b></td>
        <td>${g.ultima ? dataBR(g.ultima) : '—'}</td>
        <td class="e-ver"><i data-lucide="chevron-right"></i></td></tr>`;
      }).join('')}</tbody></table>`;
    icones();
  }
  const grupoDe = nome => estado.grupos.find(g => g.grupo === nome);
  $('#a-tabela').addEventListener('click', e => { const tr = e.target.closest('tr[data-g]'); if (tr) abrir(tr.dataset.g); });
  $('#a-tabela').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-g]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(tr.dataset.g); } });
  $('#a-busca').addEventListener('input', e => { estado.busca = e.target.value; renderizar(); });
  $('#a-zerados').addEventListener('change', e => { estado.zerados = e.target.checked; try { localStorage.setItem('sma:almox:zerados', estado.zerados ? '1' : '0'); } catch (_) {} renderizar(); });
  $('#e-atualizar')?.addEventListener('click', carregar);

  /* ---------- Movimentação do produto ---------- */
  const dlg = $('#a-dlg');
  $('#a-fechar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  let movs = [], filtroTam = null, grupoAberto = null;

  async function abrir(nome) {
    const g = grupoDe(nome); if (!g) return;
    grupoAberto = g; filtroTam = null; movs = [];
    const [, varios] = tamanhos(g);
    $('#a-dlg-prod').innerHTML = `${imagem(g, 'grande')}<div><span class="eyebrow">${escapar(g.categoria)}</span><h2 class="fat-sec-titulo" id="a-dlg-tit">${escapar(g.grupo)}</h2></div>`;
    $('#a-dlg-kpis').innerHTML = '';
    $('#a-dlg-tams').innerHTML = g.itens.length > 1 ? `<span class="a-tams-tit">${varios[0].toUpperCase() + varios.slice(1)} · toque para filtrar</span>
      <div class="a-tams">${g.itens.map(i => `<button type="button" class="a-tam${i.saldo <= 0 ? ' zero' : ''}" data-id="${i.id}" aria-pressed="false"><span>${escapar(i.variacao || 'Único')}</span><b>${fmt(i.saldo)}</b></button>`).join('')}</div>` : '';
    $('#a-dlg-tams').hidden = g.itens.length < 2;
    $('#a-dlg-lista').innerHTML = '<div class="esqueleto tabela-esq"></div>';
    dlg.showModal(); icones();
    try {
      const { data, error } = await sb.from('almox_movimentos').select('*').in('item_id', g.itens.map(i => i.id))
        .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(500);
      if (error) throw error;
      if (grupoAberto !== g) return;
      movs = data; desenharMovs();
    } catch (ex) {
      $('#a-dlg-lista').innerHTML = '<p class="tabela vazio">Não consegui carregar a movimentação. Verifique a internet.</p>';
    }
    icones();
  }
  $('#a-dlg-tams').addEventListener('click', e => {
    const b = e.target.closest('.a-tam'); if (!b) return;
    filtroTam = filtroTam === +b.dataset.id ? null : +b.dataset.id;
    document.querySelectorAll('#a-dlg-tams .a-tam').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.id === filtroTam)));
    desenharMovs();
  });
  function desenharMovs() {
    const g = grupoAberto, multi = g.itens.length > 1;
    const nomeVar = id => { const i = g.itens.find(x => x.id === id); return i ? (i.variacao || 'Único') : '—'; };
    const lista = filtroTam ? movs.filter(m => m.item_id === filtroTam) : movs;
    const saldo = filtroTam ? (g.itens.find(i => i.id === filtroTam)?.saldo ?? 0) : g.total;
    const ent = lista.filter(m => m.tipo !== 'retirada').reduce((s, m) => s + Number(m.quantidade), 0);
    const ret = lista.filter(m => m.tipo === 'retirada').reduce((s, m) => s + Number(m.quantidade), 0);
    $('#a-dlg-kpis').innerHTML = `
      <div class="e-k"><span>Em estoque${filtroTam ? ' · ' + escapar(nomeVar(filtroTam)) : ''}</span><b>${fmt(saldo)}</b></div>
      <div class="e-k ent"><span>Entradas</span><b>+${fmt(ent)}</b></div>
      <div class="e-k ret"><span>Retiradas</span><b>−${fmt(ret)}</b></div>`;
    const cols = ['Data', 'Tipo', ...(multi ? [tamanhos(g)[0][0].toUpperCase() + tamanhos(g)[0].slice(1)] : []), 'Quantidade', 'Observação'];
    $('#a-dlg-lista').innerHTML = lista.length ? `<table class="tabela e-mov${multi ? ' a-mov-tam' : ''}">
      <colgroup><col class="e-c-data"><col class="e-c-tipo">${multi ? '<col class="a-c-tam">' : ''}<col class="e-c-q"><col></colgroup>
      <thead><tr>${cols.map(t => `<th><button type="button" disabled>${t}</button></th>`).join('')}</tr></thead>
      <tbody>${lista.map(m => {
        const r = m.tipo === 'retirada';
        return `<tr><td data-rotulo="Data">${dataBR(m.data)}</td>
          <td data-rotulo="Tipo"><span class="e-tipo ${r ? 'ret' : 'ent'}">${r ? 'Retirada' : m.tipo === 'inicial' ? 'Saldo inicial' : 'Entrada'}</span></td>
          ${multi ? `<td data-rotulo="${cols[2]}"><b>${escapar(nomeVar(m.item_id))}</b></td>` : ''}
          <td class="num" data-rotulo="Quantidade"><b class="${r ? 'neg' : 'pos'}">${r ? '−' : '+'}${fmt(m.quantidade)}</b></td>
          <td data-rotulo="Observação">${m.tipo === 'inicial' ? 'Estoque inicial' : escapar(m.observacao || '—')}</td></tr>`;
      }).join('')}</tbody></table>` : '<p class="tabela vazio">Nenhuma movimentação ainda.</p>';
  }

  /* ---------- CSV (uma linha por tamanho/tipo) ---------- */
  $('#a-csv').addEventListener('click', () => {
    const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Categoria', 'Produto', 'Tamanho/tipo', 'Quantidade', 'Última movimentação']];
    visiveis().forEach(g => g.itens.forEach(i => linhas.push([g.categoria, g.grupo, i.variacao || '', String(i.saldo).replace('.', ','), dataBR(i.ultima_movimentacao)])));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `Almoxarifado_${new Date().toLocaleDateString('sv-SE')}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // atualiza ao voltar para a aba (no máximo a cada 2 minutos)
  let ultima = Date.now();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultima > 120000) { ultima = Date.now(); carregar(); } });

  icones();
  carregar();
})();
