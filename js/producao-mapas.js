/* ==========================================================================
   SMA · Silvicultura — Produção · Mapas micro das fazendas
   Lista os PDFs da pasta do Google Drive (via /api/mapas; sem servidor, a lista salva em js/mapas-lista.js),
   monta o nome de cada fazenda (js/mapas-nomes.js), junta os repetidos e abre o mapa no próprio painel.
   ========================================================================== */

(() => {
  const CFG = window.SMA_DADOS?.MAPAS, N = window.SMA_MAPAS_NOMES;
  const aba = document.getElementById('aba-mapas');
  if (!CFG || !N || !aba) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const comServidor = /^https?:$/.test(location.protocol);

  const estado = { fazendas: [], busca: '', tipo: 'Todos', aberta: null, mapa: null, iniciado: false, atualizado: null };
  const linkVer = id => `https://drive.google.com/file/d/${id}/view`;
  const linkPrevia = id => `https://drive.google.com/file/d/${id}/preview`;
  const linkBaixar = id => `https://drive.google.com/uc?export=download&id=${id}`;
  const miniatura = id => `https://drive.google.com/thumbnail?id=${id}&sz=w320`;

  /* ---------- Leitura ---------- */
  const listaLocal = () => new Promise(ok => {
    if (window.SMA_MAPAS_LISTA) return ok(window.SMA_MAPAS_LISTA);
    const s = document.createElement('script'); s.src = 'js/mapas-lista.js';
    s.onload = () => ok(window.SMA_MAPAS_LISTA || null); s.onerror = () => ok(null);
    document.head.appendChild(s);
  });
  async function carregar(fresco = false) {
    const bt = $('#m-atualizar'); bt.disabled = true; bt.classList.add('girando');
    $('#m-status').textContent = 'Lendo a pasta de mapas…';
    let dados = null, aviso = '';
    if (comServidor) {
      try { const r = await fetch(`api/mapas${fresco ? '?fresco=1' : ''}`, { cache: 'no-store' }); if (r.ok) dados = await r.json(); else aviso = (await r.json().catch(() => ({}))).erro || `erro ${r.status}`; }
      catch (e) { aviso = e.message; }
    }
    if (!dados) { dados = await listaLocal(); if (dados) aviso = aviso ? `${aviso} — mostrando a última lista salva.` : ''; }
    bt.disabled = false; bt.classList.remove('girando');
    if (!dados?.arquivos?.length) {
      const el = $('#m-erros'); el.hidden = false;
      el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>Não consegui ler a pasta de mapas</strong><p>${esc(aviso || 'Verifique a internet e se a pasta do Drive está compartilhada como "Qualquer pessoa com o link".')}</p></div>`;
      $('#m-status').textContent = 'Sem acesso à pasta de mapas'; icones();
      return;
    }
    $('#m-erros').hidden = !aviso;
    if (aviso) $('#m-erros').innerHTML = `<i data-lucide="info"></i><div><p>${esc(aviso)}</p></div>`;
    estado.fazendas = N.agrupar(dados.arquivos);
    estado.atualizado = dados.atualizado;
    $('#m-status').textContent = `${estado.fazendas.length} fazendas · ${dados.arquivos.length} mapas · Google Drive`;
    renderTipos(); renderLista();
    if (!estado.aberta) { const ultima = (() => { try { return localStorage.getItem('mapas:ultima'); } catch { return null; } })(); const f = estado.fazendas.find(x => x.chave === ultima); if (f) abrir(f.chave); }
    icones();
  }

  /* ---------- Filtros ---------- */
  const TIPOS = ['Todos', 'Silvicultura', 'Colheita', 'Corte', 'Outros'];
  const tipoDe = m => m.tipo || 'Outros';
  function renderTipos() {
    const cont = t => (t === 'Todos' ? estado.fazendas.length : estado.fazendas.filter(f => f.mapas.some(m => tipoDe(m) === t)).length);
    $('#m-tipos').innerHTML = TIPOS.filter(t => cont(t)).map(t => `<button type="button" data-tipo="${t}" class="${t === estado.tipo ? 'ativo' : ''}" aria-pressed="${t === estado.tipo}">${t} <b>${cont(t)}</b></button>`).join('');
  }
  $('#m-tipos').addEventListener('click', e => { const b = e.target.closest('[data-tipo]'); if (!b) return; estado.tipo = b.dataset.tipo; renderTipos(); renderLista(); });
  let espera;
  $('#m-busca').addEventListener('input', e => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = e.target.value; renderLista(); }, 150); });
  $('#m-atualizar').addEventListener('click', () => carregar(true));

  const visiveis = () => {
    const t = norm(estado.busca).trim();
    return estado.fazendas.filter(f => (estado.tipo === 'Todos' || f.mapas.some(m => tipoDe(m) === estado.tipo)) &&
      (!t || norm([f.nome, ...f.codigos, ...f.talhoes, ...f.mapas.map(m => m.arquivo)].join(' ')).includes(t)));
  };

  /* ---------- Lista ---------- */
  function renderLista() {
    const l = visiveis();
    $('#m-total').textContent = `${l.length} de ${estado.fazendas.length} fazendas`;
    $('#m-lista').innerHTML = l.map(f => `
      <button type="button" class="m-item${f.chave === estado.aberta ? ' ativo' : ''}" role="listitem" data-faz="${esc(f.chave)}" aria-current="${f.chave === estado.aberta}">
        <span class="m-thumb"><img src="${miniatura(f.mapas[0].id)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"><i data-lucide="file-text"></i></span>
        <span class="m-item-txt"><b>${esc(f.nome)}</b>
          <small>${[...f.codigos, ...f.talhoes].map(c => `<em>${esc(c)}</em>`).join('') || '<em class="m-sem">sem código</em>'}</small>
          <small class="m-qtd">${f.mapas.length} ${f.mapas.length === 1 ? 'mapa' : 'mapas'} · ${[...new Set(f.mapas.map(tipoDe))].join(', ')}</small></span>
      </button>`).join('') || '<p class="m-vazio">Nenhuma fazenda encontrada com essa busca.</p>';
    icones();
  }
  $('#m-lista').addEventListener('click', e => { const b = e.target.closest('[data-faz]'); if (b) abrir(b.dataset.faz, true); });

  /* ---------- Visor ---------- */
  function abrir(chave, rolar = false) {
    const f = estado.fazendas.find(x => x.chave === chave); if (!f) return;
    estado.aberta = chave;
    try { localStorage.setItem('mapas:ultima', chave); } catch { /* opcional */ }
    const mapa = f.mapas.find(m => m.id === estado.mapa) || f.mapas.find(m => estado.tipo === 'Todos' || tipoDe(m) === estado.tipo) || f.mapas[0];
    estado.mapa = mapa.id;
    $$('.m-item').forEach(b => { const at = b.dataset.faz === chave; b.classList.toggle('ativo', at); b.setAttribute('aria-current', String(at)); });
    $('#m-visor').innerHTML = `
      <header class="m-visor-topo">
        <div><span class="eyebrow">Mapa micro</span><h3>${esc(f.nome)}</h3>
          <p>${[...f.codigos.map(c => `Código ${esc(c)}`), ...f.talhoes.map(t => `Talhão ${esc(t)}`)].join(' · ') || 'Sem código no nome do arquivo'}</p></div>
        <div class="m-visor-acoes">
          <a class="fat-btn" href="${linkVer(mapa.id)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i><span>Abrir no Drive</span></a>
          <a class="fat-btn" href="${linkBaixar(mapa.id)}" target="_blank" rel="noopener noreferrer"><i data-lucide="download"></i><span>Baixar PDF</span></a>
          <button type="button" class="fat-btn" id="m-cheia"><i data-lucide="maximize-2"></i><span>Tela cheia</span></button>
        </div>
      </header>
      ${f.mapas.length > 1 ? `<div class="m-versoes" role="tablist" aria-label="Mapas desta fazenda">${f.mapas.map(m => `<button type="button" role="tab" data-mapa="${m.id}" aria-selected="${m.id === mapa.id}" title="${esc(m.arquivo)}">${esc(m.rotulo)}</button>`).join('')}</div>` : ''}
      <div class="m-quadro"><iframe src="${linkPrevia(mapa.id)}" title="Mapa micro — ${esc(f.nome)}" allow="fullscreen" loading="lazy"></iframe><span class="m-carregando">Abrindo o mapa…</span></div>
      <p class="m-arquivo"><i data-lucide="file-text"></i>${esc(mapa.arquivo)}</p>`;
    icones();
    if (rolar && window.matchMedia('(max-width: 980px)').matches) $('#m-visor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#m-visor').addEventListener('click', e => {
    const v = e.target.closest('[data-mapa]');
    if (v) { estado.mapa = v.dataset.mapa; abrir(estado.aberta); return; }
    if (e.target.closest('#m-cheia')) { const q = $('.m-quadro'); (q.requestFullscreen || q.webkitRequestFullscreen)?.call(q); }
  });

  /* ---------- Início: só quando a aba é aberta ---------- */
  function iniciar() { if (estado.iniciado) return; estado.iniciado = true; carregar(); }
  document.addEventListener('producao:aba', e => { if (e.detail === 'mapas') iniciar(); });
  if (!aba.hidden) iniciar();
})();
