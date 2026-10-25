/* ==========================================================================
   SMA · Silvicultura — Estoque de insumos
   Lê o saldo e as movimentações do App de Estoque (Supabase, sem login).
   Endereço e chave: do config.js do App de Compras (ver estoque.html).
   ========================================================================== */

(() => {
  const raiz = document.getElementById('est');
  if (!raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmt = n => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const dataBR = d => { if (!d) return '—'; const [a, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${a}`; };

  // imagem do produto: a foto, ou um quadro com as iniciais (mesma cor do app)
  const matiz = nome => { let x = 0; for (const c of nome) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
  const iniciais = nome => { const p = nome.split(/[\s-]+/).filter(Boolean); return (p.length > 1 && !/^\d/.test(p[1]) ? p[0][0] + p[1][0] : nome.slice(0, 2)).toUpperCase(); };
  function imagem(p, cls = '') {
    const ph = `<span class="e-ph ${cls}" style="--h:${matiz(p.nome)}" aria-hidden="true">${escapar(iniciais(p.nome))}</span>`;
    return p.foto_url ? `<img class="e-foto ${cls}" src="${escapar(p.foto_url)}" alt="" loading="lazy" onerror="this.outerHTML=this.dataset.ph" data-ph="${escapar(ph)}">` : ph;
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

  const estado = { produtos: [], busca: '', zerados: false, carregando: true };
  try { estado.zerados = localStorage.getItem('sma:estoque:zerados') === '1'; } catch (_) {}
  $('#e-zerados').checked = estado.zerados;

  async function carregar() {
    const bt = $('#e-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#e-status').textContent = 'Carregando estoque…';
    raiz.classList.add('carregando');
    try {
      if (!cliente()) throw new Error('sem cliente');
      const { data, error } = await sb.from('vw_estoque').select('*').eq('ativo', true).order('nome');
      if (error) throw error;
      estado.produtos = data.map(p => ({ ...p, saldo: Number(p.saldo) }));
      $('#e-erros').hidden = true;
      $('#e-status').textContent = `${estado.produtos.length} produtos · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (ex) {
      console.warn('Estoque: falha ao ler', ex);
      const el = $('#e-erros'); el.hidden = false;
      el.innerHTML = '<i data-lucide="triangle-alert"></i><div><strong>Não consegui carregar o estoque</strong><p>Verifique a internet e se o arquivo estoque.sql já foi rodado no Supabase. Depois toque em "Atualizar dados".</p></div>';
      $('#e-status').textContent = 'Sem acesso ao estoque';
    }
    estado.carregando = false;
    raiz.classList.remove('carregando');
    bt.classList.remove('girando'); bt.disabled = false;
    renderizar();
  }

  /* ---------- Tabela ---------- */
  function visiveis() {
    const q = semAcento(estado.busca).trim();
    return estado.produtos
      .filter(p => (estado.zerados || p.saldo > 0) && (!q || semAcento(p.nome).includes(q)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  function renderizar() {
    if (estado.carregando) return;
    const lista = visiveis();
    const com = estado.produtos.filter(p => p.saldo > 0).length, zer = estado.produtos.length - com;
    $('#e-resumo').textContent = `${com} ${com === 1 ? 'produto' : 'produtos'} com estoque${zer ? ` · ${zer} zerados ${estado.zerados ? 'na lista' : 'escondidos'}` : ''}.`;
    if (!lista.length) {
      $('#e-tabela').innerHTML = `<p class="tabela vazio">${estado.busca ? 'Nenhum produto com esse nome.' : 'Nenhum produto com estoque.'}</p>`;
      icones(); return;
    }
    $('#e-tabela').innerHTML = `<table class="tabela e-tab">
      <colgroup><col class="e-c-foto"><col><col class="e-c-qtd"><col class="e-c-ult"><col class="e-c-ver"></colgroup>
      <thead><tr>${['Foto', 'Produto', 'Quantidade', 'Última movimentação', ''].map(t => `<th><button type="button" disabled>${t}</button></th>`).join('')}</tr></thead>
      <tbody>${lista.map(p => `<tr data-id="${p.id}" tabindex="0" role="button" aria-label="Ver movimentação de ${escapar(p.nome)}">
        <td>${imagem(p)}</td>
        <th scope="row">${escapar(p.nome)}</th>
        <td class="num"><b class="e-qtd${p.saldo <= 0 ? ' zero' : ''}">${fmt(p.saldo)}</b></td>
        <td>${p.ultima_movimentacao ? dataBR(p.ultima_movimentacao) : '—'}</td>
        <td class="e-ver"><i data-lucide="chevron-right"></i></td></tr>`).join('')}</tbody></table>`;
    icones();
  }
  $('#e-tabela').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) abrir(+tr.dataset.id); });
  $('#e-tabela').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-id]'); if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(+tr.dataset.id); } });
  $('#e-busca').addEventListener('input', e => { estado.busca = e.target.value; renderizar(); });
  $('#e-zerados').addEventListener('change', e => { estado.zerados = e.target.checked; try { localStorage.setItem('sma:estoque:zerados', estado.zerados ? '1' : '0'); } catch (_) {} renderizar(); });
  $('#e-atualizar').addEventListener('click', carregar);

  /* ---------- Movimentação do produto ---------- */
  const dlg = $('#e-dlg');
  $('#e-fechar').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  async function abrir(id) {
    const p = estado.produtos.find(x => x.id === id); if (!p) return;
    $('#e-dlg-prod').innerHTML = `${imagem(p, 'grande')}<div><span class="eyebrow">Movimentação</span><h2 class="fat-sec-titulo" id="e-dlg-tit">${escapar(p.nome)}</h2></div>`;
    $('#e-dlg-kpis').innerHTML = '';
    $('#e-dlg-lista').innerHTML = '<div class="esqueleto tabela-esq"></div>';
    dlg.showModal(); icones();
    try {
      const { data, error } = await sb.from('insumo_movimentos').select('*').eq('insumo_id', id)
        .order('data', { ascending: false }).order('criado_em', { ascending: false }).limit(300);
      if (error) throw error;
      const ent = data.filter(m => m.tipo !== 'retirada').reduce((s, m) => s + Number(m.quantidade), 0);
      const ret = data.filter(m => m.tipo === 'retirada').reduce((s, m) => s + Number(m.quantidade), 0);
      $('#e-dlg-kpis').innerHTML = `
        <div class="e-k"><span>Em estoque</span><b>${fmt(p.saldo)}</b></div>
        <div class="e-k ent"><span>Entradas</span><b>+${fmt(ent)}</b></div>
        <div class="e-k ret"><span>Retiradas</span><b>−${fmt(ret)}</b></div>`;
      $('#e-dlg-lista').innerHTML = data.length ? `<table class="tabela e-mov">
        <colgroup><col class="e-c-data"><col class="e-c-tipo"><col class="e-c-q"><col></colgroup>
        <thead><tr>${['Data', 'Tipo', 'Quantidade', 'Responsável / equipe'].map(t => `<th><button type="button" disabled>${t}</button></th>`).join('')}</tr></thead>
        <tbody>${data.map(m => {
          const r = m.tipo === 'retirada';
          const quem = r ? `Equipe ${escapar(m.equipe)}` : m.tipo === 'inicial' ? 'Estoque inicial' : escapar(m.responsavel || '—');
          return `<tr><td>${dataBR(m.data)}</td>
            <td><span class="e-tipo ${r ? 'ret' : 'ent'}">${r ? 'Retirada' : m.tipo === 'inicial' ? 'Saldo inicial' : 'Entrada'}</span></td>
            <td class="num"><b class="${r ? 'neg' : 'pos'}">${r ? '−' : '+'}${fmt(m.quantidade)}</b></td>
            <td>${quem}${m.observacao ? `<small class="e-obs">${escapar(m.observacao)}</small>` : ''}</td></tr>`;
        }).join('')}</tbody></table>` : '<p class="tabela vazio">Nenhuma movimentação ainda.</p>';
    } catch (ex) {
      $('#e-dlg-lista').innerHTML = '<p class="tabela vazio">Não consegui carregar a movimentação. Verifique a internet.</p>';
    }
    icones();
  }

  /* ---------- CSV ---------- */
  $('#e-csv').addEventListener('click', () => {
    const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = [['Produto', 'Quantidade', 'Última movimentação'], ...visiveis().map(p => [p.nome, String(p.saldo).replace('.', ','), dataBR(p.ultima_movimentacao)])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + linhas.map(l => l.map(cel).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = `Estoque_${new Date().toLocaleDateString('sv-SE')}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  // atualiza ao voltar para a aba (no máximo a cada 2 minutos)
  let ultima = Date.now();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - ultima > 120000) { ultima = Date.now(); carregar(); } });

  icones();
  carregar();
})();
