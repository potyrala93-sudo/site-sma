/* ==========================================================================
   SMA · Silvicultura — Qualidade · Relatório técnico de qualidade (com IA)
   1) Registro de campo: cabeçalho (título, data, fazenda, UP, subtítulo, responsável) e pontos com
      título, fotos e observação.  2) A IA (rota /api/experimento/relatorio, a mesma do Experimento)
      complementa com texto técnico; sem IA, o relatório é montado com o que foi escrito.
   3) O documento é editável (contenteditable), pode ter blocos apagados, é salvo neste navegador
      (IndexedDB, com as fotos) e impresso em A4.
   ========================================================================== */

(() => {
  const raiz = document.getElementById('aba-relatorio');
  if (!raiz) return;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const comServidor = /^https?:$/.test(location.protocol);
  const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dataBR = iso => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : iso || '');
  const novoId = () => `rt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  /* ---------- Armazenamento: IndexedDB (cabe as fotos; localStorage não) ---------- */
  const BANCO = 'sma-relatorios', LOJA = 'relatorios';
  const abrirBanco = () => new Promise((ok, falha) => {
    const r = indexedDB.open(BANCO, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA, { keyPath: 'id' });
    r.onsuccess = () => ok(r.result); r.onerror = () => falha(r.error);
  });
  async function banco(modo, fn) {
    const db = await abrirBanco();
    return new Promise((ok, falha) => { const tx = db.transaction(LOJA, modo), loja = tx.objectStore(LOJA); const req = fn(loja); tx.oncomplete = () => ok(req?.result); tx.onerror = () => falha(tx.error); });
  }
  const listar = () => banco('readonly', l => l.getAll());
  const gravar = rel => banco('readwrite', l => l.put(rel));
  const apagar = id => banco('readwrite', l => l.delete(id));

  /* ---------- Estado ---------- */
  const vazio = () => ({ id: novoId(), criado: Date.now(), atualizado: null, cab: { titulo: '', data: hojeISO(), fazenda: '', up: '', subtitulo: '', responsavel: '' }, pontos: [{ id: novoId(), titulo: '', observacao: '', fotos: [] }], ia: null, doc: '' });
  let rel = vazio(), alterado = false;
  const status = t => { $('#rt-status').textContent = t; };

  /* ---------- Fotos: reduz no navegador (documento até 1600 px; IA até 768 px) ---------- */
  const lerImagem = arq => new Promise((ok, falha) => { const u = URL.createObjectURL(arq), img = new Image(); img.onload = () => { URL.revokeObjectURL(u); ok(img); }; img.onerror = () => { URL.revokeObjectURL(u); falha(new Error(`não abri ${arq.name}`)); }; img.src = u; });
  function reduzir(fonte, max, q) {
    const s = Math.min(1, max / Math.max(fonte.naturalWidth || fonte.width, fonte.naturalHeight || fonte.height));
    const c = document.createElement('canvas'); c.width = Math.round((fonte.naturalWidth || fonte.width) * s); c.height = Math.round((fonte.naturalHeight || fonte.height) * s);
    c.getContext('2d').drawImage(fonte, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', q);
  }
  const paraIA = dataUrl => new Promise(ok => { const img = new Image(); img.onload = () => ok(reduzir(img, 768, .62)); img.onerror = () => ok(null); img.src = dataUrl; });

  /* ======================================================================
     ETAPA 1: REGISTRO DE CAMPO
     ====================================================================== */
  function preencherCab() { const f = $('#rt-cab'); Object.entries(rel.cab).forEach(([k, v]) => { if (f[k]) f[k].value = v || ''; }); }
  $('#rt-cab').addEventListener('input', e => { if (e.target.name) { rel.cab[e.target.name] = e.target.value; alterado = true; } });

  function renderPontos() {
    $('#rt-pontos').innerHTML = rel.pontos.map((p, i) => `<article class="rt-ponto glass" data-p="${p.id}">
      <header><span class="rt-ponto-n">${i + 1}</span><input class="rt-ponto-tit" data-campo="titulo" value="${esc(p.titulo)}" placeholder="O que foi encontrado (ex.: falha de plantio na linha)" aria-label="Título do ponto ${i + 1}">
        <button type="button" class="rt-icone" data-acao="tirar" title="Remover este ponto" aria-label="Remover o ponto ${i + 1}" ${rel.pontos.length < 2 ? 'disabled' : ''}><i data-lucide="trash-2"></i></button></header>
      <div class="rt-fotos">${p.fotos.map((f, k) => `<figure><img src="${f}" alt="Foto ${k + 1} do ponto ${i + 1}"><button type="button" class="rt-icone" data-acao="tirar-foto" data-k="${k}" aria-label="Tirar a foto ${k + 1}"><i data-lucide="x"></i></button></figure>`).join('')}
        <label class="rt-add-foto"><input type="file" accept="image/*" multiple data-acao="fotos"><i data-lucide="image-plus"></i><span>${p.fotos.length ? 'Mais fotos' : 'Anexar fotos'}</span></label></div>
      <textarea data-campo="observacao" rows="3" placeholder="Observação: o que você viu, onde, quanto (ex.: ~15 falhas em 50 m na linha 12; mudas com coleto exposto)" aria-label="Observação do ponto ${i + 1}">${esc(p.observacao)}</textarea>
    </article>`).join('');
    icones();
  }
  const pontoDe = el => rel.pontos.find(p => p.id === el.closest('[data-p]')?.dataset.p);
  $('#rt-pontos').addEventListener('input', e => { const c = e.target.dataset.campo; if (!c) return; const p = pontoDe(e.target); if (p) { p[c] = e.target.value; alterado = true; } });
  $('#rt-pontos').addEventListener('click', e => {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const p = pontoDe(b); if (!p) return;
    if (b.dataset.acao === 'tirar' && rel.pontos.length > 1 && confirm('Remover este ponto e as fotos dele?')) { rel.pontos = rel.pontos.filter(x => x !== p); alterado = true; renderPontos(); }
    if (b.dataset.acao === 'tirar-foto') { p.fotos.splice(+b.dataset.k, 1); alterado = true; renderPontos(); }
  });
  $('#rt-pontos').addEventListener('change', async e => {
    if (e.target.dataset.acao !== 'fotos') return;
    const p = pontoDe(e.target), arqs = [...e.target.files]; if (!p || !arqs.length) return;
    status(`Preparando ${arqs.length} foto(s)…`);
    for (const a of arqs) { try { p.fotos.push(reduzir(await lerImagem(a), 1600, .82)); } catch (erro) { status(erro.message); } }
    alterado = true; status(''); renderPontos();
  });
  $('#rt-add-ponto').addEventListener('click', () => {
    rel.pontos.push({ id: novoId(), titulo: '', observacao: '', fotos: [] }); alterado = true; renderPontos();
    $('#rt-pontos .rt-ponto:last-child .rt-ponto-tit')?.focus();
  });

  /* ======================================================================
     IA: complementa o texto técnico (só com o que foi escrito e o que as fotos mostram)
     ====================================================================== */
  let iaDisponivel = null;
  async function temIA() {
    if (iaDisponivel != null) return iaDisponivel;
    if (!comServidor) return (iaDisponivel = false);
    try { const r = await fetch('api/experimento/status', { cache: 'no-store' }); iaDisponivel = r.ok && !!(await r.json()).ia; } catch { iaDisponivel = false; }
    return iaDisponivel;
  }
  function semIA() {
    const c = rel.cab;
    return {
      introducao: `Este relatório registra a vistoria de qualidade realizada em ${dataBR(c.data) || '___'}${c.fazenda ? ` na fazenda ${c.fazenda}` : ''}${c.up ? `, UP ${c.up}` : ''}${c.subtitulo ? ` (${c.subtitulo})` : ''}, com o objetivo de verificar a conformidade da operação e apontar as correções necessárias.`,
      metodologia: 'Vistoria de campo com percurso na área, registro fotográfico e anotação das constatações por ponto.',
      pontos: rel.pontos.map(p => ({ titulo: p.titulo || 'Ponto observado', descricao: p.observacao || '', causas: '', recomendacoes: '', criticidade: '', legendas: p.fotos.map(() => '') })),
      conclusao: 'Os pontos acima devem ser tratados conforme as recomendações, com nova verificação após a correção.',
      recomendacoes_gerais: []
    };
  }
  $('#rt-gerar').addEventListener('click', async () => {
    if (!rel.cab.titulo.trim() || !rel.cab.data) { status('Preencha pelo menos o título e a data.'); $('#rt-cab [name="titulo"]').focus(); return; }
    if (!rel.pontos.some(p => p.titulo.trim() || p.observacao.trim() || p.fotos.length)) { status('Registre pelo menos um ponto.'); return; }
    if (rel.doc && !confirm('Gerar de novo substitui o texto do relatório (inclusive suas edições). Continuar?')) return;
    const bt = $('#rt-gerar'), rot = $('span', bt); bt.disabled = true; bt.classList.add('girando');
    let ia = null, aviso = '';
    try {
      if (await temIA()) {
        rot.textContent = 'Preparando as fotos…';
        let total = 0;
        const pontos = [];
        for (const p of rel.pontos) {
          const fotos = [];
          for (const f of p.fotos) { if (total >= 16) break; const x = await paraIA(f); if (x) { fotos.push(x); total++; } }
          pontos.push({ titulo: p.titulo, observacao: p.observacao, fotos });
        }
        rot.textContent = 'A IA está escrevendo…';
        const r = await fetch('api/experimento/relatorio', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido: 'relatorio', cabecalho: rel.cab, pontos }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.relatorio?.pontos) ia = j.relatorio; else aviso = j.erro || `erro ${r.status}`;
        if (rel.pontos.reduce((s, p) => s + p.fotos.length, 0) > 16) aviso = 'A IA analisou as primeiras 16 fotos; as demais entram no relatório normalmente.';
      } else aviso = 'IA indisponível: o relatório foi montado com o que você escreveu (complete as causas e recomendações).';
    } catch (erro) { aviso = `IA indisponível (${erro.message}): o relatório foi montado com o que você escreveu.`; }
    rel.ia = ia || semIA(); rel.origem = ia ? 'ia' : 'regras';
    rel.doc = montarDoc(); alterado = true;
    bt.disabled = false; bt.classList.remove('girando'); rot.textContent = 'Gerar relatório com IA';
    irPara('doc'); status(aviso || 'Relatório gerado. Revise, edite e salve.');
    await salvar(true);
  });

  /* ======================================================================
     ETAPA 2: DOCUMENTO EDITÁVEL
     ====================================================================== */
  const bloco = (cls, html) => `<section class="rt-bloco ${cls}"><button type="button" class="rt-apagar" contenteditable="false" title="Apagar este bloco" aria-label="Apagar este bloco">×</button>${html}</section>`;
  const ed = (tag, txt, cls = '') => `<${tag} class="${cls}" contenteditable="true">${esc(txt || '')}</${tag}>`;
  const CRIT = { alta: '#dc2626', media: '#d97706', 'média': '#d97706', baixa: '#16a34a' };
  function montarDoc() {
    const c = rel.cab, a = rel.ia;
    const linhaCab = (rot, v) => (v ? `<div><dt>${rot}</dt><dd contenteditable="true">${esc(v)}</dd></div>` : '');
    return `<header class="rt-d-cab">
        <div class="rt-d-marca"><img src="assets/img/folhito/folhito-rosto.png" alt="" onerror="this.remove()"><div><b>SMA Silvicultura</b><small>Unidade São Miguel · Qualidade</small></div></div>
        <h1 contenteditable="true">${esc(c.titulo)}</h1>${c.subtitulo ? `<p class="rt-d-sub" contenteditable="true">${esc(c.subtitulo)}</p>` : ''}
        <dl class="rt-d-dados">${linhaCab('Data', dataBR(c.data))}${linhaCab('Fazenda', c.fazenda)}${linhaCab('UP', c.up)}${linhaCab('Responsável técnico', c.responsavel)}</dl>
      </header>
      ${bloco('', `<h2>1. Introdução</h2>${ed('p', a.introducao)}`)}
      ${bloco('', `<h2>2. Metodologia</h2>${ed('p', a.metodologia)}`)}
      <h2 class="rt-d-secao">3. Constatações</h2>
      ${rel.pontos.map((p, i) => { const x = a.pontos?.[i] || {}, cor = CRIT[String(x.criticidade || '').toLowerCase()];
        return bloco('rt-d-ponto', `<h3><span class="rt-d-n">3.${i + 1}</span>${ed('span', x.titulo || p.titulo || `Ponto ${i + 1}`)}${x.criticidade ? `<span class="rt-d-crit" style="--c:${cor || '#64748b'}" contenteditable="true">Criticidade: ${esc(x.criticidade)}</span>` : ''}</h3>
          ${p.fotos.length ? `<div class="rt-d-fotos ${p.fotos.length === 1 ? 'uma' : ''}">${p.fotos.map((f, k) => `<figure><img src="${f}" alt=""><figcaption contenteditable="true">Foto ${i + 1}.${k + 1}${x.legendas?.[k] ? ` – ${esc(x.legendas[k])}` : ''}</figcaption></figure>`).join('')}</div>` : ''}
          ${p.observacao ? `<p class="rt-d-obs"><b>Observação de campo:</b> <span contenteditable="true">${esc(p.observacao)}</span></p>` : ''}
          <dl class="rt-d-itens">
            <div><dt>Constatação</dt><dd contenteditable="true">${esc(x.descricao || '')}</dd></div>
            <div><dt>Possíveis causas</dt><dd contenteditable="true">${esc(x.causas || '')}</dd></div>
            <div><dt>Recomendações</dt><dd contenteditable="true">${esc(x.recomendacoes || '')}</dd></div>
          </dl>`); }).join('')}
      ${bloco('', `<h2>4. Conclusão</h2>${ed('p', a.conclusao)}`)}
      ${a.recomendacoes_gerais?.length ? bloco('', `<h2>5. Recomendações gerais</h2><ul contenteditable="true">${a.recomendacoes_gerais.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`) : ''}
      <footer class="rt-d-rodape"><div class="rt-d-ass"><span></span><b contenteditable="true">${esc(c.responsavel || 'Responsável técnico')}</b><small>Responsável técnico</small></div>
        <p>${rel.origem === 'ia' ? 'Texto técnico complementado por IA a partir dos registros de campo e revisado pelo responsável.' : 'Relatório montado a partir dos registros de campo.'} Emitido em ${new Date().toLocaleDateString('pt-BR')}.</p></footer>`;
  }
  function mostrarDoc() { $('#rt-doc').innerHTML = rel.doc || '<p class="rt-vazio">Ainda não há relatório: registre os pontos e clique em "Gerar relatório com IA".</p>'; }
  $('#rt-doc').addEventListener('input', () => { rel.doc = $('#rt-doc').innerHTML; alterado = true; });
  $('#rt-doc').addEventListener('click', e => {
    const b = e.target.closest('.rt-apagar'); if (!b) return;
    b.closest('.rt-bloco').remove(); rel.doc = $('#rt-doc').innerHTML; alterado = true;
  });

  /* ---------- Etapas ---------- */
  function irPara(etapa) {
    $('#rt-campo').hidden = etapa !== 'campo'; $('#rt-doc-wrap').hidden = etapa !== 'doc';
    $$('.rt-passos [data-etapa]').forEach(b => b.setAttribute('aria-current', b.dataset.etapa === etapa ? 'step' : 'false'));
    if (etapa === 'doc') mostrarDoc();
    icones();
  }
  $('.rt-passos').addEventListener('click', e => { const b = e.target.closest('[data-etapa]'); if (b) irPara(b.dataset.etapa); });

  /* ---------- Salvar, abrir, novo, excluir, imprimir ---------- */
  async function renderSalvos() {
    let l = []; try { l = (await listar()).sort((a, b) => (b.atualizado || b.criado) - (a.atualizado || a.criado)); } catch { /* sem IndexedDB */ }
    $('#rt-salvos').innerHTML = `<option value="">${l.length ? `Relatórios salvos (${l.length})` : 'Nenhum relatório salvo'}</option>${l.map(r => `<option value="${r.id}" ${r.id === rel.id ? 'selected' : ''}>${esc(r.cab.titulo || 'Sem título')} · ${esc(r.cab.up || r.cab.fazenda || '')} · ${dataBR(r.cab.data)}</option>`).join('')}`;
  }
  async function salvar(silencioso = false) {
    if (!rel.cab.titulo.trim()) { if (!silencioso) status('Dê um título antes de salvar.'); return; }
    rel.atualizado = Date.now();
    try { await gravar(JSON.parse(JSON.stringify(rel))); alterado = false; if (!silencioso) status(`Salvo às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} neste navegador.`); renderSalvos(); }
    catch (erro) { status(`Não consegui salvar (${erro.message}).`); }
  }
  $('#rt-salvar').addEventListener('click', () => salvar());
  const podeSair = () => !alterado || confirm('Há alterações não salvas neste relatório. Descartar?');
  $('#rt-novo').addEventListener('click', () => { if (!podeSair()) return; rel = vazio(); alterado = false; preencherCab(); renderPontos(); irPara('campo'); renderSalvos(); status('Novo relatório.'); });
  $('#rt-salvos').addEventListener('change', async e => {
    const id = e.target.value; if (!id) return;
    if (!podeSair()) { e.target.value = rel.id; return; }
    const r = (await listar()).find(x => x.id === id); if (!r) return;
    rel = r; alterado = false; preencherCab(); renderPontos(); irPara(rel.doc ? 'doc' : 'campo'); status('Relatório aberto.');
  });
  $('#rt-excluir').addEventListener('click', async () => {
    if (!confirm(`Excluir o relatório "${rel.cab.titulo || 'sem título'}" deste navegador?`)) return;
    try { await apagar(rel.id); } catch { /* ainda não salvo */ }
    rel = vazio(); alterado = false; preencherCab(); renderPontos(); irPara('campo'); renderSalvos(); status('Relatório excluído.');
  });
  $('#rt-imprimir').addEventListener('click', () => {
    if (!rel.doc) { status('Gere o relatório antes de imprimir.'); return; }
    irPara('doc');
    document.body.classList.add('imprimindo-rt');
    const fim = () => { document.body.classList.remove('imprimindo-rt'); window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    setTimeout(() => window.print(), 60);
  });
  window.addEventListener('beforeunload', e => { if (alterado && rel.doc) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- Início ---------- */
  preencherCab(); renderPontos(); irPara('campo'); renderSalvos();
})();
