/* ==========================================================================
   SMA · Silvicultura — RH · Catálogo de Colaboradores
   Cartas colecionáveis + "aparelho" retrô (visual original) sobre a planilha de colaboradores.
   Foto: coluna FOTO → fotos da pasta assets/img/colaboradores (nome ou CHAPA; alternam a cada minuto)
   → avatar estilo anime (masculino/feminino pelo primeiro nome) gerado a partir da CHAPA.
   ========================================================================== */

(() => {
  const P = window.SMA_PLANILHAS, CFG = window.SMA_DADOS?.RH;
  const raiz = document.getElementById('rh');
  if (!P || !CFG || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const comServidor = /^https?:$/.test(location.protocol);
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const inteiro = v => (v || 0).toLocaleString('pt-BR');
  const MESES = ['JANEIRO', 'FEVEREIRO', 'MARCO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const ordemMes = m => MESES.indexOf(semAcento(m).toUpperCase().trim());
  const ler = (k, padrao) => { try { const v = localStorage.getItem(k); return v == null ? padrao : v; } catch { return padrao; } };
  const gravar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* opcional */ } };

  /* ======================================================================
     CÁLCULOS: tempo de casa, nível, cor da modalidade
     ====================================================================== */
  const hoje = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); return d; })();
  function tempoCasa(adm) {
    if (!adm || adm > hoje) return { anos: 0, a: 0, m: 0, d: 0 };
    let a = hoje.getFullYear() - adm.getFullYear(), m = hoje.getMonth() - adm.getMonth(), d = hoje.getDate() - adm.getDate();
    if (d < 0) { m--; d += new Date(hoje.getFullYear(), hoje.getMonth(), 0).getDate(); }
    if (m < 0) { a--; m += 12; }
    return { anos: (hoje - adm) / (365.2425 * 864e5), a, m, d };
  }
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const tempoLongo = t => { const p = [t.a && plural(t.a, 'ano', 'anos'), t.m && plural(t.m, 'mês', 'meses'), plural(t.d, 'dia', 'dias')].filter(Boolean); return p.length > 1 ? `${p.slice(0, -1).join(', ')} e ${p.at(-1)}` : p[0]; };
  const tempoCurto = t => (t.a ? `${t.a} a ${t.m} m` : t.m ? `${t.m} m ${t.d} d` : `${t.d} d`);
  const nivelDe = anos => CFG.niveis.find(n => anos < n.ate) || CFG.niveis.at(-1);
  const PALETA = ['#2dd4bf', '#f472b6', '#facc15', '#60a5fa', '#e879f9', '#a3e635', '#f87171'];
  const coresModalidade = new Map(Object.entries(CFG.modalidades));
  function corModalidade(m) {
    const k = semAcento(m).toUpperCase();
    if (!coresModalidade.has(k)) coresModalidade.set(k, PALETA[coresModalidade.size % PALETA.length]);
    return coresModalidade.get(k);
  }

  /* ======================================================================
     LEITURA
     ====================================================================== */
  const limparNome = t => String(t || '').replace(/\s+/g, ' ').trim();
  function preparar(linhas) {
    return linhas.filter(l => limparNome(l.COLABORADOR)).map((l, i) => {
      const adm = P.dataBR(l.ADMISSAO), t = tempoCasa(adm);
      const chapa = limparNome(l.CHAPA);
      return {
        chave: chapa || `sem-chapa-${semAcento(l.COLABORADOR).replace(/\W+/g, '-')}-${i}`,
        chapa, nome: limparNome(l.COLABORADOR), situacao: limparNome(l.SITUACAO).toUpperCase() || '—', funcao: limparNome(l.FUNCAO) || '—',
        equipe: limparNome(l.EQUIPE) || '—', codEquipe: limparNome(l['COD. EQUIPE']) || '—', modalidade: limparNome(l['MODALIDADE EQP.']).toUpperCase() || '—',
        subcontrato: limparNome(l.SUBCONTRATO) || '—', cdc: limparNome(l['COD CDC']), mes: limparNome(l.MES).toUpperCase() || '—',
        sexo: sexoDe(l.COLABORADOR, l.SEXO || l.GENERO),
        adm, tempo: t, nivel: nivelDe(t.anos), fotoPlanilha: /^https?:\/\//i.test(l.FOTO || '') ? l.FOTO.trim() : ''
      };
    });
  }

  /* ======================================================================
     FOTOS E AVATARES
     ====================================================================== */
  // Fotos da pasta assets/img/colaboradores: o arquivo pode ter o NOME do colaborador ou a CHAPA.
  // Várias fotos da mesma pessoa: "NOME.jpg", "NOME.png", "NOME (2).jpg", "NOME-2.jpg"… alternam a cada 30 segundos.
  // Lista dos arquivos: API do servidor; sem ela (página aberta direto do arquivo), o manifesto
  // assets/img/colaboradores/fotos.js que o servidor mantém atualizado.
  const TROCA_MS = 30_000;
  const fotos = { pasta: new Map(), local: {}, assinatura: '', ilustrados: { M: [], F: [] } };
  const avatares = new Map();
  const chaveNome = t => semAcento(t).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const chaveArquivo = t => chaveNome(String(t).replace(/\s*(\(\d+\)|[-_ ]\d{1,2})\s*$/, ''));
  const manifesto = () => new Promise(ok => {
    const s = document.createElement('script');
    s.src = `assets/img/colaboradores/fotos.js?t=${Date.now()}`;
    s.onload = () => { s.remove(); ok(window.SMA_FOTOS_COLAB || []); };
    s.onerror = () => { s.remove(); ok([]); };
    document.head.appendChild(s);
  });
  async function carregarFotos() {
    let arquivos = null, ilustrados = null;
    if (comServidor) {
      try { const r = await fetch('api/colab-fotos', { cache: 'no-store' }); if (r.ok) ({ arquivos, avatares: ilustrados } = await r.json()); } catch { /* sem a API */ }
    }
    if (!arquivos) { arquivos = await manifesto(); ilustrados = window.SMA_AVATARES_COLAB; }
    ilustrados = { M: ilustrados?.M || [], F: ilustrados?.F || [] };
    const pasta = new Map();
    arquivos.forEach(a => { const k = chaveArquivo(a.nome); if (!pasta.has(k)) pasta.set(k, []); pasta.get(k).push(a.url); });
    const assinatura = [...arquivos.map(a => a.url), ...ilustrados.M, ...ilustrados.F].join('|');
    const mudou = assinatura !== fotos.assinatura;
    if (mudou) avatares.clear();
    fotos.pasta = pasta; fotos.assinatura = assinatura; fotos.ilustrados = ilustrados;
    try { fotos.local = JSON.parse(localStorage.getItem('rh:fotos') || '{}'); } catch { fotos.local = {}; }
    return mudou;
  }
  // Correlação arquivo → colaborador, tolerante a grafia: "Jeferson" = "Jefferson", "Luiz" = "Luis", "Kelly" = "Keli".
  const LIGACOES = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E']);
  const fonetica = w => w.replace(/^H/, '').replace(/PH/g, 'F').replace(/TH/g, 'T').replace(/Y/g, 'I').replace(/W/g, 'V').replace(/K/g, 'C').replace(/Z$/, 'S').replace(/([A-Z])\1+/g, '$1');
  const palavrasDe = t => chaveNome(t).split(' ').filter(w => w && !LIGACOES.has(w)).map(fonetica);
  // Liga cada arquivo a um colaborador: chapa (no nome do arquivo) ou nome completo; senão, nome parcial
  // ("Lauro", "Joyce Santos") quando só UMA pessoa combina (primeiro nome + demais palavras na ordem).
  fotos.porPessoa = new Map(); fotos.semDono = [];
  function ligarFotos(pessoas) {
    fotos.porPessoa = new Map(); fotos.semDono = [];
    const base = pessoas.map(c => ({ c, p: palavrasDe(c.nome) }));
    const contem = (nome, arq) => { if (!arq.length || nome[0] !== arq[0]) return false; let i = 1; for (const w of nome.slice(1)) if (w === arq[i]) i++; return i === arq.length; };
    const pessoa = c => c.chapa || c.nome;
    fotos.pasta.forEach((urls, k) => {
      const numeros = k.match(/\d{5,}/g) || [];
      let donos = pessoas.filter(c => c.chapa && numeros.includes(c.chapa));
      const arq = palavrasDe(k.replace(/\d+/g, ' '));
      if (!donos.length) donos = base.filter(x => x.p.join(' ') === arq.join(' ')).map(x => x.c);
      if (!donos.length) donos = base.filter(x => contem(x.p, arq)).map(x => x.c);
      // ainda empatado: fica com quem tem o primeiro nome escrito igualzinho
      if (new Set(donos.map(pessoa)).size > 1) {
        const exato = donos.filter(c => chaveNome(c.nome).split(' ')[0] === k.split(' ')[0]);
        if (new Set(exato.map(pessoa)).size === 1) donos = exato;
      }
      if (new Set(donos.map(pessoa)).size !== 1) { fotos.semDono.push({ arquivo: k, pessoas: [...new Set(donos.map(c => c.nome))] }); return; }
      donos.forEach(c => fotos.porPessoa.set(c.chave, [...(fotos.porPessoa.get(c.chave) || []), ...urls]));
    });
    // Avatares ilustrados em rodízio: quem não tem foto, em ordem alfabética, recebe Avatar_1, Avatar_2… e recomeça
    avatares.clear();
    ['M', 'F'].forEach(sx => {
      const lista = fotos.ilustrados?.[sx] || [];
      if (!lista.length) return;
      const ordem = new Map();   // mesma pessoa em meses diferentes → mesmo avatar
      pessoas.filter(c => (c.sexo === 'F' ? 'F' : 'M') === sx && !fotosDe(c).length)
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .forEach(c => { const k = c.chapa || c.nome; if (!ordem.has(k)) ordem.set(k, ordem.size); avatares.set(c.chave, lista[ordem.get(k) % lista.length]); });
    });
    if (fotos.semDono.length) console.info('RH: fotos sem colaborador definido (renomeie com o nome completo ou a chapa):', fotos.semDono);
    renderAviso();
  }
  function renderAviso() {
    const el = $('#h-fotos-aviso'); if (!el) return;
    el.hidden = !fotos.semDono.length;
    el.innerHTML = fotos.semDono.length ? `<i data-lucide="image-off"></i><span><b>${fotos.semDono.length} foto(s) da pasta sem dono definido:</b> ${fotos.semDono.map(s => `"${escapar(s.arquivo.toLowerCase())}"${s.pessoas.length > 1 ? ` (combina com ${s.pessoas.length} pessoas)` : ' (nenhum nome combina)'}`).join(', ')}. Renomeie o arquivo com o nome completo ou a chapa.</span>` : '';
    icones();
  }
  function fotosDe(c) {
    const l = [c.fotoPlanilha, ...(fotos.porPessoa.get(c.chave) || []), c.chapa && fotos.local[c.chapa]];
    return [...new Set(l.filter(Boolean))];
  }
  let giro = 0;   // avança a cada 30 segundos
  const fotoDe = c => { const l = fotosDe(c); return l.length ? l[giro % l.length] : ''; };

  /* ---------- Sexo pelo primeiro nome (coluna SEXO, se existir, tem prioridade) ---------- */
  const FEMININOS = new Set('RAQUEL ISABEL ISABELLY ISABELY RUTE RUTH ESTER ESTHER MIRIAM INGRID JOYCE LAIS THAIS TAIS IRIS LIS BEATRIZ MARLI MARLY KELI KELLY KELY GISELI GISELE GISELLE NICOLE ALICE CLARICE BERENICE DAIANE DAYANE ARIANE ELAINE ELIANE KAUANE ROSEMARY ROSENEIDE ROSE CRISTIANE JOSIANE LUCIANE VIVIANE SIMONE IVONE CLEONICE IRENE ODETE IVETE MARGARETE JANETE ELIZABETE ELISABETE SUELI SUELY NELI ARACELI DEISE DENISE LUIZE MADALENA CARMEM CARMEN JENIFFER JENNIFER JENIFER EVELYN EVELIN MARILENE ROSILENE ROSANGELE ADRIELE GABRIELE RAQUELI MIRIAN MARLENE DIRCE EUNICE'.split(' '));
  const MASCULINOS = new Set('LUCA JOSHUA NIKOLA ANDREA ELIAS ISAIAS JONAS JOSIAS MATIAS TOBIAS ZACARIAS JEREMIAS NOEL ABEL MICHEL MANOEL DANIEL GABRIEL RAFAEL ISRAEL EZEQUIEL JOEL LEVI'.split(' '));
  function sexoDe(nome, coluna) {
    const s = semAcento(coluna).toUpperCase().trim();
    if (/^F/.test(s)) return 'F';
    if (/^M/.test(s)) return 'M';
    const p = semAcento(String(nome).split(' ')[0]).toUpperCase();
    if (MASCULINOS.has(p)) return 'M';
    if (FEMININOS.has(p) || /A$/.test(p)) return 'F';
    if (/(IANE|AINE|ELLE|IELE|ELLY|ILLY|ICE|ETE|ENE|EIDE)$/.test(p)) return 'F';
    return 'M';
  }

  /* ---------- Avatar (sem foto) ----------
     1º ilustrações anime da pasta assets/img/avatares/masculino|feminino (escolhida pela CHAPA, sempre a mesma);
     2º sem ilustrações na pasta: desenho simples gerado no navegador (js/rh-avatar.js). */
  function avatarDe(c) {
    if (avatares.has(c.chave)) return avatares.get(c.chave);
    const lista = fotos.ilustrados?.[c.sexo === 'F' ? 'F' : 'M'] || [];
    let uri;
    if (lista.length) { let h = 7; for (const ch of c.chave) h = (h * 31 + ch.charCodeAt(0)) >>> 0; uri = lista[h % lista.length]; }
    else uri = window.SMA_AVATAR_ANIME({ semente: c.chave, sexo: c.sexo, fundo: corModalidade(c.modalidade) });
    avatares.set(c.chave, uri);
    return uri;
  }
  async function imagemDe(c) { return fotoDe(c) || avatarDe(c); }

  // Foto inteira na moldura (sem cortar): a própria foto, desfocada, preenche as sobras
  document.addEventListener('load', e => {
    const img = e.target, moldura = img.tagName === 'IMG' && img.closest('.h-janela, .h-foto-grande');
    if (!moldura) return;
    const ilustrado = /\/avatar(es\/|[\s_%-]*(masc|fem))/i.test(img.src);
    const foto = !img.src.startsWith('data:') && !ilustrado;
    moldura.classList.toggle('com-foto', foto);
    moldura.classList.toggle('com-avatar', ilustrado);
    moldura.style.setProperty('--fundo', foto ? `url("${img.src}")` : 'none');
  }, true);

  // A cada 30 s: confere se entraram/saíram fotos na pasta e alterna quem tem mais de uma
  function trocarImagem(img, src) {
    if (img.getAttribute('src') === src) return;
    img.style.opacity = '0';
    setTimeout(() => { img.onload = img.onerror = () => { img.style.opacity = ''; }; img.src = src; }, 250);
  }
  setInterval(async () => {
    if (estado.carregando) return;
    giro++;
    if (await carregarFotos()) { ligarFotos(estado.todos); renderizar(['kpis']); }
    $$('img[data-chave]').forEach(img => {
      const c = estado.porChave?.get(img.dataset.chave);
      if (c && (img.hasAttribute('src') || fotosDe(c).length)) trocarImagem(img, fotoDe(c) || avatarDe(c));
    });
    const c = estado.modo === 'carrossel' && estado.lista?.[estado.indice], g = $('#h-foto-grande img');
    if (c && g) { trocarImagem(g, fotoDe(c) || avatarDe(c)); $('#h-foto-grande .h-avatar-tag')?.toggleAttribute('hidden', !!fotoDe(c)); }
  }, TROCA_MS);

  /* ======================================================================
     ESTADO E FILTROS
     ====================================================================== */
  const estado = {
    todos: [], filtros: { codEquipe: '', funcao: '', situacao: 'ATIVO', mes: '' },
    busca: '', ordem: ler('rh:ordem', 'nome'), modo: ler('rh:modo', 'cards'), indice: 0, som: ler('rh:som', '0') === '1', carregando: true
  };
  const ROTULOS_FILTRO = { codEquipe: 'Todos', funcao: 'Todas', situacao: 'Todas' };
  const doMes = () => estado.todos.filter(c => !estado.filtros.mes || c.mes === estado.filtros.mes);
  function lista() {
    const f = estado.filtros, termo = semAcento(estado.busca).toUpperCase().trim();
    const l = doMes().filter(c => Object.entries(f).every(([k, v]) => !v || k === 'mes' || c[k] === v) && (!termo || semAcento(`${c.nome} ${c.chapa}`).toUpperCase().includes(termo)));
    const ord = {
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      'tempo-desc': (a, b) => b.tempo.anos - a.tempo.anos,
      'tempo-asc': (a, b) => a.tempo.anos - b.tempo.anos,
      admissao: (a, b) => (a.adm || 0) - (b.adm || 0),
      chapa: (a, b) => a.chapa.localeCompare(b.chapa, 'pt-BR', { numeric: true })
    }[estado.ordem] || (() => 0);
    return l.sort((a, b) => ord(a, b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  function renderFiltros() {
    const base = doMes();
    $$('[data-filtro]').forEach(sel => {
      const k = sel.dataset.filtro;
      const valores = [...new Set(base.map(c => c[k]))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      sel.innerHTML = `<option value="">${ROTULOS_FILTRO[k]}</option>` + valores.map(v => `<option ${v === estado.filtros[k] ? 'selected' : ''}>${escapar(v)}</option>`).join('');
      sel.closest('.p-filtro').classList.toggle('preenchido', !!estado.filtros[k]);
    });
    // Função: lista com busca
    funcoes = [...new Set(base.map(c => c.funcao))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const f = estado.filtros.funcao, bt = $('.p-multi-btn', comboFuncao);
    $('b', bt).textContent = f || 'Todas';
    bt.classList.toggle('preenchido', !!f);
    renderListaFuncao();
    $('#h-ordem').value = estado.ordem;
    $$('#h-modo [data-modo]').forEach(b => { const at = b.dataset.modo === estado.modo; b.classList.toggle('ativo', at); b.setAttribute('aria-pressed', String(at)); });
    $('#h-modo').classList.toggle('sem', estado.modo === 'carrossel');
  }
  $$('[data-filtro]').forEach(sel => sel.addEventListener('change', () => { estado.filtros[sel.dataset.filtro] = sel.value; estado.indice = 0; renderizar(); }));

  /* ---------- Filtro de função: lista + busca ---------- */
  const comboFuncao = $('#h-funcao'), popFuncao = $('.p-multi-pop', comboFuncao), buscaFuncao = $('input', popFuncao);
  let funcoes = [];
  function renderListaFuncao() {
    const termo = semAcento(buscaFuncao.value).toUpperCase().trim();
    const vis = funcoes.filter(v => !termo || semAcento(v).toUpperCase().includes(termo));
    const op = (v, rot) => `<button type="button" role="option" class="p-multi-op" data-valor="${escapar(v)}" aria-selected="${v === estado.filtros.funcao}"><span>${escapar(rot)}</span></button>`;
    $('.p-multi-lista', popFuncao).innerHTML = (termo ? '' : op('', 'Todas')) + (vis.map(v => op(v, v)).join('') || '<p class="vazio">Nenhuma função encontrada.</p>');
  }
  function abrirFuncao(abrir) {
    popFuncao.hidden = !abrir;
    $('.p-multi-btn', comboFuncao).setAttribute('aria-expanded', String(abrir));
    if (abrir) { buscaFuncao.value = ''; renderListaFuncao(); buscaFuncao.focus(); }
  }
  function escolherFuncao(v) { estado.filtros.funcao = v; estado.indice = 0; abrirFuncao(false); renderizar(); }
  $('.p-multi-btn', comboFuncao).addEventListener('click', () => abrirFuncao(popFuncao.hidden));
  buscaFuncao.addEventListener('input', renderListaFuncao);
  buscaFuncao.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const p = $('.p-multi-op', popFuncao); if (p) escolherFuncao(p.dataset.valor); }
    else if (e.key === 'Escape') { abrirFuncao(false); $('.p-multi-btn', comboFuncao).focus(); }
  });
  popFuncao.addEventListener('click', e => { const p = e.target.closest('.p-multi-op'); if (p) escolherFuncao(p.dataset.valor); });
  document.addEventListener('click', e => { if (!popFuncao.hidden && !comboFuncao.contains(e.target)) abrirFuncao(false); });
  let espera;
  $('#h-busca').addEventListener('input', e => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = e.target.value; estado.indice = 0; renderizar(); }, 160); });
  $('#h-ordem').addEventListener('change', e => { estado.ordem = e.target.value; gravar('rh:ordem', estado.ordem); estado.indice = 0; renderizar(); });
  $('#h-modo').addEventListener('click', e => { const b = e.target.closest('[data-modo]'); if (b) trocarModo(b.dataset.modo); });
  $('#h-limpar').addEventListener('click', () => {
    const mes = estado.filtros.mes;
    estado.filtros = { codEquipe: '', funcao: '', situacao: 'ATIVO', mes };
    estado.busca = ''; $('#h-busca').value = ''; estado.indice = 0; renderizar();
  });
  function trocarModo(modo, indice = null) {
    estado.modo = modo; gravar('rh:modo', modo);
    if (indice != null) estado.indice = indice;
    renderizar();
    if (modo === 'carrossel') $('#h-aparelho').focus({ preventScroll: true });
  }

  /* ======================================================================
     KPIs E CONTADOR
     ====================================================================== */
  function renderKPIs(l) {
    const base = doMes();
    $('[data-h="total"]').textContent = inteiro(l.length);
    $('[data-h="ativos"]').textContent = inteiro(l.filter(c => c.situacao === 'ATIVO').length);
    const max = Math.max(1, ...CFG.niveis.map(n => l.filter(c => c.nivel === n).length));
    $('#h-niveis').innerHTML = CFG.niveis.map(n => { const q = l.filter(c => c.nivel === n).length; return `<div class="h-nivel" style="--c:${n.cor}" title="${n.nome}: ${q}"><span><i data-lucide="${n.icone}"></i>${n.nome}</span><span class="h-nivel-barra"><i style="width:${q / max * 100}%"></i></span><b>${q}</b></div>`; }).join('');
    const comFoto = base.filter(c => fotoDe(c)).length;
    $('#h-catalogados').textContent = `${inteiro(l.length)} de ${inteiro(base.length)}`;
    $('#h-catalogados-sub').textContent = `colaboradores catalogados · ${inteiro(comFoto)} com foto, ${inteiro(base.length - comFoto)} com avatar`;
  }

  /* ======================================================================
     MODO CARDS
     ====================================================================== */
  const escala = c => Math.min(1, c.tempo.anos / CFG.escalaAnos);
  function cartaHTML(c, i) {
    const cor = corModalidade(c.modalidade);
    return `<button type="button" class="h-carta" data-i="${i}" style="--c:${cor};--n:${c.nivel.cor}" aria-label="${escapar(c.nome)}, ${escapar(c.funcao)}. Abrir no carrossel">
      <span class="h-carta-brilho" aria-hidden="true"></span>
      <header><span class="h-num">Nº ${escapar(c.chapa || '—')}</span><span class="h-selo-nivel" title="Nível: ${c.nivel.nome}"><i data-lucide="${c.nivel.icone}"></i>${c.nivel.nome}</span></header>
      <div class="h-janela"><img data-chave="${escapar(c.chave)}" alt="" loading="lazy" decoding="async"></div>
      <strong class="h-nome">${escapar(c.nome)}</strong>
      <span class="h-funcao">${escapar(c.funcao)}</span>
      <div class="h-tipos"><span class="h-tipo" style="--c:${cor}">${escapar(c.modalidade)}</span><span class="h-tipo cod">${escapar(c.codEquipe)}</span></div>
      <footer><span class="h-tempo"><i data-lucide="hourglass"></i>${tempoCurto(c.tempo)}</span><span class="h-barra-tempo" title="Escala até ${CFG.escalaAnos} anos"><i style="width:${escala(c) * 100}%"></i></span></footer>
    </button>`;
  }
  let observador;
  function renderCards(l) {
    const el = $('#h-cartas');
    el.innerHTML = l.map(cartaHTML).join('') || '<p class="vazio">Nenhum colaborador com esses filtros.</p>';
    // fotos/avatares só quando a carta aparece na tela
    observador?.disconnect();
    observador = new IntersectionObserver(ents => ents.forEach(async e => {
      if (!e.isIntersecting) return;
      observador.unobserve(e.target);
      const c = estado.porChave.get(e.target.dataset.chave); if (!c) return;
      e.target.src = await imagemDe(c);
    }), { rootMargin: '300px' });
    // as primeiras cartas carregam na hora; as demais quando chegarem perto da tela
    $$('img[data-chave]', el).forEach(async (img, i) => {
      if (i < 24) { const c = estado.porChave.get(img.dataset.chave); if (c) img.src = await imagemDe(c); }
      else observador.observe(img);
    });
  }
  // Clique: abre a pessoa no carrossel
  $('#h-cartas').addEventListener('click', e => { const c = e.target.closest('.h-carta'); if (c) { trocarModo('carrossel', +c.dataset.i); window.scrollTo({ top: $('.h-palco').getBoundingClientRect().top + scrollY - 90, behavior: reduzMovimento ? 'auto' : 'smooth' }); } });
  // Leve efeito 3D ao passar o mouse
  if (!reduzMovimento) {
    $('#h-cartas').addEventListener('pointermove', e => {
      const c = e.target.closest('.h-carta'); if (!c || e.pointerType !== 'mouse') return;
      const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      c.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`); c.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
      c.style.setProperty('--mx', `${(x + .5) * 100}%`); c.style.setProperty('--my', `${(y + .5) * 100}%`);
    });
    $('#h-cartas').addEventListener('pointerout', e => { const c = e.target.closest('.h-carta'); if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); } });
  }

  /* ======================================================================
     MODO CARROSSEL (aparelho retrô)
     ====================================================================== */
  let audio;
  function bip(freq = 880) {
    if (!estado.som) return;
    try {
      audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square'; o.frequency.value = freq; g.gain.value = .04;
      o.connect(g); g.connect(audio.destination); o.start();
      g.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + .09); o.stop(audio.currentTime + .1);
    } catch { /* sem áudio */ }
  }
  function rankingEquipe(c) {
    const eq = doMes().filter(x => x.equipe === c.equipe).sort((a, b) => b.tempo.anos - a.tempo.anos);
    return { pos: eq.indexOf(c) + 1, n: eq.length };
  }
  async function renderCarrossel(l, animar = true) {
    if (!l.length) { $('#h-ficha').innerHTML = '<p class="h-px">NENHUM REGISTRO</p>'; $('#h-foto-grande').innerHTML = ''; $('#h-miniaturas').innerHTML = ''; $('#h-posicao').textContent = '0 / 0'; return; }
    estado.indice = Math.max(0, Math.min(estado.indice, l.length - 1));
    const c = l[estado.indice], cor = corModalidade(c.modalidade), rk = rankingEquipe(c);
    const ap = $('#h-aparelho');
    ap.style.setProperty('--c', cor); ap.style.setProperty('--n', c.nivel.cor);
    if (animar && !reduzMovimento) { ap.classList.remove('trocando'); void ap.offsetWidth; ap.classList.add('trocando'); }
    $('#h-posicao').textContent = `${estado.indice + 1} / ${l.length}`;
    const campo = (rot, val, cls = '') => `<div class="h-campo ${cls}"><dt>${rot}</dt><dd>${val}</dd></div>`;
    $('#h-ficha').innerHTML = `
      <div class="h-ficha-topo"><span class="h-px">Nº ${escapar(c.chapa || '—')}</span><span class="h-selo-nivel" style="--n:${c.nivel.cor}"><i data-lucide="${c.nivel.icone}"></i>${c.nivel.nome}</span></div>
      <h2 class="h-ficha-nome">${escapar(c.nome)}</h2>
      <dl class="h-campos">
        ${campo('SITUAÇÃO', `<span class="h-sit ${c.situacao === 'ATIVO' ? 'ok' : ''}">${escapar(c.situacao)}</span>`)}
        ${campo('FUNÇÃO', escapar(c.funcao))}
        ${campo('EQUIPE', escapar(c.equipe))}
        ${campo('CÓD. EQUIPE', escapar(c.codEquipe))}
        ${campo('MODALIDADE', `<span class="h-tipo" style="--c:${cor}">${escapar(c.modalidade)}</span>`)}
        ${campo('SUBCONTRATO', escapar(c.subcontrato))}
        ${campo('ADMISSÃO', c.adm ? c.adm.toLocaleDateString('pt-BR') : '—')}
        ${campo('TEMPO DE CASA', escapar(tempoLongo(c.tempo)), 'largo')}
      </dl>
      <div class="h-atributos">
        <div class="h-atr"><span class="h-px">TEMPO</span><span class="h-atr-barra"><i style="width:${escala(c) * 100}%"></i></span><b>${c.tempo.anos.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}a</b></div>
        <div class="h-atr"><span class="h-px">RANK EQP</span><span class="h-atr-barra rank"><i style="width:${rk.n ? (1 - (rk.pos - 1) / rk.n) * 100 : 0}%"></i></span><b>${rk.pos}º/${rk.n}</b></div>
      </div>
      <p class="h-bio">Faz parte da equipe de ${escapar(c.equipe)} há ${escapar(tempoLongo(c.tempo))}, na modalidade ${escapar(c.modalidade.toLowerCase())}.</p>`;
    const src = await imagemDe(c);
    if (l[estado.indice] === c) $('#h-foto-grande').innerHTML = `<img src="${src}" alt="Foto de ${escapar(c.nome)}">${fotoDe(c) ? '' : '<span class="h-avatar-tag">avatar</span>'}`;
    renderMiniaturas(l);
    icones();
  }
  function renderMiniaturas(l) {
    const el = $('#h-miniaturas');
    if (el.dataset.lista !== estado.assinatura) {
      el.dataset.lista = estado.assinatura;
      el.innerHTML = l.map((c, i) => `<button type="button" role="option" class="h-mini" data-i="${i}" style="--c:${corModalidade(c.modalidade)}" title="${escapar(c.nome)}"><img data-chave="${escapar(c.chave)}" alt=""><span>${escapar(c.nome.split(' ')[0])}</span></button>`).join('');
      const obs = new IntersectionObserver(ents => ents.forEach(async e => { if (!e.isIntersecting) return; obs.unobserve(e.target); const c = estado.porChave.get(e.target.dataset.chave); if (c) e.target.src = await imagemDe(c); }), { root: el, rootMargin: '200px' });
      $$('img[data-chave]', el).forEach(img => obs.observe(img));
    }
    $$('.h-mini', el).forEach(b => b.setAttribute('aria-selected', String(+b.dataset.i === estado.indice)));
    const atual = $(`.h-mini[data-i="${estado.indice}"]`, el);
    atual?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduzMovimento ? 'auto' : 'smooth' });
  }
  function navegar(passo) {
    const l = estado.lista || [];
    if (!l.length) return;
    estado.indice = (estado.indice + passo + l.length) % l.length;
    bip(passo > 0 ? 880 : 660);
    renderCarrossel(l);
  }
  $('.h-dpad').addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) navegar(+b.dataset.nav); });
  $('#h-miniaturas').addEventListener('click', e => { const b = e.target.closest('.h-mini'); if (b) { estado.indice = +b.dataset.i; bip(990); renderCarrossel(estado.lista); } });
  document.addEventListener('keydown', e => {
    if (estado.modo !== 'carrossel' || /input|select|textarea/i.test(document.activeElement?.tagName || '')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); navegar(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navegar(-1); }
  });
  // Deslizar no celular
  let toque = null;
  $('#h-aparelho').addEventListener('touchstart', e => { toque = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $('#h-aparelho').addEventListener('touchend', e => {
    if (!toque) return;
    const dx = e.changedTouches[0].clientX - toque.x, dy = e.changedTouches[0].clientY - toque.y; toque = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) navegar(dx < 0 ? 1 : -1);
  });
  $('#h-som').addEventListener('click', () => {
    estado.som = !estado.som; gravar('rh:som', estado.som ? '1' : '0');
    $('#h-som').setAttribute('aria-pressed', String(estado.som));
    $('#h-som').innerHTML = `<i data-lucide="${estado.som ? 'volume-2' : 'volume-x'}"></i>`; icones(); bip(1200);
  });

  /* ---------- Foto: enviar / trocar (recorte quadrado + compressão) ---------- */
  $('#h-trocar-foto').addEventListener('click', () => $('#h-arquivo').click());
  $('#h-arquivo').addEventListener('change', async e => {
    const arq = e.target.files?.[0]; e.target.value = '';
    const c = estado.lista?.[estado.indice];
    if (!arq || !c) return;
    if (!c.chapa) { alert('Este colaborador não tem CHAPA na planilha; a foto é salva pelo número da chapa.'); return; }
    const bt = $('#h-trocar-foto'); bt.disabled = true; $('span', bt).textContent = 'Enviando…';
    try {
      const img = await new Promise((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => falha(new Error('arquivo de imagem inválido')); i.src = URL.createObjectURL(arq); });
      const lado = Math.min(img.naturalWidth, img.naturalHeight), alvo = Math.min(480, lado);
      const cv = document.createElement('canvas'); cv.width = cv.height = alvo;
      cv.getContext('2d').drawImage(img, (img.naturalWidth - lado) / 2, (img.naturalHeight - lado) / 2, lado, lado, 0, 0, alvo, alvo);
      URL.revokeObjectURL(img.src);
      const dado = cv.toDataURL('image/jpeg', .85);
      let url = null;
      if (comServidor) {
        try {
          const r = await fetch(`api/colab-fotos/${encodeURIComponent(c.chapa)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ imagem: dado }) });
          const j = await r.json().catch(() => ({}));
          if (r.ok) url = j.url; else throw new Error(j.erro || `erro ${r.status}`);
        } catch (erro) { console.warn('RH: servidor não salvou a foto, guardando neste navegador', erro); }
      }
      if (url) { await carregarFotos(); ligarFotos(estado.todos); giro = Math.max(0, fotosDe(c).findIndex(u => u.startsWith(url.split('?')[0]))); }
      else { fotos.local[c.chapa] = dado; gravar('rh:fotos', JSON.stringify(fotos.local)); }
      $('span', bt).textContent = 'Foto salva ✓';
      renderizar(['kpis', 'conteudo']);
    } catch (erro) { alert(`Não consegui usar essa imagem (${erro.message}).`); }
    finally { setTimeout(() => { bt.disabled = false; $('span', bt).textContent = 'Adicionar/trocar foto'; }, 1500); }
  });

  /* ======================================================================
     EXPORTAR E IMPRIMIR
     ====================================================================== */
  const colunasExp = ['Chapa', 'Colaborador', 'Situação', 'Função', 'Equipe', 'Cód. equipe', 'Modalidade', 'Subcontrato', 'Admissão', 'Tempo de casa', 'Anos de casa', 'Nível', 'Mês'];
  const linhaExp = c => [c.chapa, c.nome, c.situacao, c.funcao, c.equipe, c.codEquipe, c.modalidade, c.subcontrato, c.adm ? c.adm.toLocaleDateString('pt-BR') : '', tempoLongo(c.tempo), c.tempo.anos.toFixed(2).replace('.', ','), c.nivel.nome, c.mes];
  function baixar(conteudo, tipo, nome) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + conteudo], { type: tipo })); a.download = nome;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $('#h-csv').addEventListener('click', () => {
    const cel = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    baixar([colunasExp.map(cel).join(';'), ...(estado.lista || []).map(c => linhaExp(c).map(cel).join(';'))].join('\r\n'), 'text/csv;charset=utf-8', 'Catalogo_colaboradores.csv');
  });
  $('#h-xls').addEventListener('click', () => {
    baixar(`<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${colunasExp.map(h => `<th style="background:#1f6f54;color:#fff">${h}</th>`).join('')}</tr>${(estado.lista || []).map(c => `<tr>${linhaExp(c).map(v => `<td>${escapar(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`, 'application/vnd.ms-excel;charset=utf-8', 'Catalogo_colaboradores.xls');
  });
  $('#h-pdf').addEventListener('click', async () => {
    if (!window.SMA_PDF) return;
    const l = estado.lista || [], bt = $('#h-pdf'), rot = $('span', bt), orig = rot.textContent;
    if (!l.length) return;
    bt.disabled = true;
    try {
      rot.textContent = 'Preparando…';
      // o gerador de PDF não desenha SVG: os avatares viram PNG antes
      const paraPNG = uri => (!uri.startsWith('data:image/svg') ? Promise.resolve(uri) : new Promise(ok => {
        const im = new Image();
        im.onload = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 280; cv.getContext('2d').drawImage(im, 0, 0, 280, 280); ok(cv.toDataURL('image/png')); };
        im.onerror = () => ok(uri);
        im.src = uri;
      }));
      const imgs = await Promise.all(l.map(async c => paraPNG(await imagemDe(c))));
      const carta = (c, i) => { const cor = corModalidade(c.modalidade); return `<div class="h-pdf-carta" style="--c:${cor};--n:${c.nivel.cor}">
        <div class="h-pdf-topo"><span>Nº ${escapar(c.chapa || '—')}</span><span class="h-pdf-nivel">${c.nivel.nome}</span></div>
        <div class="h-pdf-janela"><img src="${imgs[i]}" alt=""></div>
        <strong>${escapar(c.nome)}</strong><small>${escapar(c.funcao)}</small>
        <div class="h-pdf-tipos"><span style="--c:${cor}">${escapar(c.modalidade)}</span><span class="cod">${escapar(c.codEquipe)}</span></div>
        <div class="h-pdf-tempo"><b>${tempoCurto(c.tempo)}</b><span><i style="width:${escala(c) * 100}%"></i></span></div></div>`; };
      const pags = [];
      for (let i = 0; i < l.length; i += 9) pags.push(`<div class="p-pdf-mini"><b>Catálogo de Colaboradores</b><span>SMA Silvicultura · ${new Date().toLocaleDateString('pt-BR')} · ${i + 1}–${Math.min(i + 9, l.length)} de ${l.length}</span></div><div class="h-pdf-grade">${l.slice(i, i + 9).map((c, j) => carta(c, i + j)).join('')}</div>`);
      await window.SMA_PDF.gerar(pags, 'Cartas_colaboradores.pdf', { retrato: true, progresso: (i, n) => { rot.textContent = `Página ${i}/${n}…`; } });
      rot.textContent = 'PDF baixado ✓';
    } catch (erro) { console.error('RH: PDF', erro); alert(`Não consegui gerar o PDF (${erro.message}).`); rot.textContent = orig; }
    finally { bt.disabled = false; setTimeout(() => { rot.textContent = orig; }, 2500); }
  });

  /* ---------- Orquestração ---------- */
  function renderizar(quais = ['filtros', 'kpis', 'conteudo']) {
    if (estado.carregando) return;
    const l = lista();
    estado.lista = l;
    estado.assinatura = `${estado.ordem}|${l.map(c => c.chave).join('|')}`;
    if (quais.includes('filtros')) renderFiltros();
    if (quais.includes('kpis')) renderKPIs(l);
    if (quais.includes('conteudo')) {
      const carr = estado.modo === 'carrossel';
      $('#h-cartas').hidden = carr; $('#h-carrossel').hidden = !carr;
      if (carr) { $('#h-miniaturas').dataset.lista = ''; renderCarrossel(l, false); } else renderCards(l);
    }
    icones();
  }
  async function carregar(fresco = false) {
    const bt = $('#h-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#h-status').textContent = 'Carregando colaboradores…';
    raiz.classList.add('carregando');
    try {
      const [linhas] = await Promise.all([P.lerPlanilha(CFG.planilha, CFG.aba, { fresco, coluna: 'CHAPA', cabecalho: true }), carregarFotos()]);
      const todos = preparar(linhas);
      // Mês mais recente por padrão; sem duplicar colaboradores (chave = CHAPA)
      const meses = [...new Set(todos.map(c => c.mes))].sort((a, b) => ordemMes(b) - ordemMes(a));
      if (!estado.filtros.mes || !meses.includes(estado.filtros.mes)) estado.filtros.mes = meses[0] || '';
      const vistos = new Set();
      estado.todos = todos.filter(c => { const k = `${c.mes}|${c.chave}`; if (vistos.has(k)) return false; vistos.add(k); return true; });
      estado.porChave = new Map(estado.todos.map(c => [c.chave, c]));
      ligarFotos(estado.todos);
      $('#h-erros').hidden = true;
      $('#h-status').textContent = `${inteiro(estado.todos.length)} colaboradores · mês ${estado.filtros.mes.toLowerCase()} · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (erro) {
      console.warn('RH: falha ao ler a planilha', erro);
      const el = $('#h-erros'); el.hidden = false;
      el.innerHTML = '<i data-lucide="triangle-alert"></i><div><strong>Não consegui ler a planilha de colaboradores</strong><p>Verifique a internet e se ela está compartilhada como "Qualquer pessoa com o link – Leitor", depois toque em "Atualizar".</p></div>';
      $('#h-status').textContent = 'Sem acesso à planilha';
    }
    estado.carregando = false;
    raiz.classList.remove('carregando');
    bt.classList.remove('girando'); bt.disabled = false;
    $('#h-som').setAttribute('aria-pressed', String(estado.som)); $('#h-som').innerHTML = `<i data-lucide="${estado.som ? 'volume-2' : 'volume-x'}"></i>`;
    renderizar();
  }
  $('#h-atualizar').addEventListener('click', () => carregar(true));
  document.body.style.setProperty('--ader-cor', '#3dffa8');
  icones();
  carregar();
})();
