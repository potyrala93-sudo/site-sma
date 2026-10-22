/* ==========================================================================
   SMA · Silvicultura — Qualidade · Análise de Qualidade de Entrega – N1
   Confere se cada atividade REALIZADA no RF tem a UP registrada na base de qualidade correspondente.
   Os arquivos Excel são lidos só no navegador (SheetJS); nada vai para o servidor.
   Camadas: 1) leitura dos arquivos  2) normalização e classificação  3) comparação
            4) tela (resumo, abas por tipo, por equipe)  5) marcações salvas  6) impressão e Excel
   ========================================================================== */

(() => {
  const raiz = document.getElementById('aba-n1');
  if (!raiz) return;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Texto padronizado: maiúsculas, sem acentos, hífens iguais e espaços simples
  const norm = t => semAcento(t).toUpperCase().replace(/[‐-―−]/g, '-').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim();
  // UP: sem espaços e sem o prefixo "UP"; código só com números perde os zeros à esquerda ("UP 0123" = "123")
  const normUP = t => { let s = norm(t).replace(/^UP\s*[-:]?\s*/, '').replace(/\s+/g, ''); if (/^\d+$/.test(s)) s = String(+s); return s; };
  const pct = v => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

  /* ======================================================================
     TIPOS E LISTA DE ATIVIDADES (nomes oficiais)
     ====================================================================== */
  const ATIV = {
    mudaPlantio: ['REPLANTIO MANUAL TEC', 'REPLANTIO 2.000 PL/HA', 'REPLANTIO POR GEADA', 'PLANTIO MANUAL', 'PLANTIO MANUAL - PILHA', 'PLANTIO MANUAL 2.000 PL/HA'],
    preparoMec: ['ADUBACAO DE PLANTIO MECANIZADA', 'ADUBACAO DE PLANTIO MECANIZADA II', 'SUBSOLAGEM SEM ADUBACAO MECANIZADA 60CM', 'SUBSOLAGEM COM ADUBACAO MECANIZADA 45CM', 'SUBSOLAGEM COM ADUB MECAN 45CM - PILHA'],
    preparoManual: ['ADUBACAO DE PLANTIO MANUAL', 'ADUBACAO DE PLANTIO MANUAL II', 'ADUBACAO DE PLANTIO MANUAL III', 'COVEAMENTO MANUAL'],
    herbicida: ['APLIC HERBICIDA MECAN NA ENTRELINHA I', 'APLICACAO HERBICIDA MECANICA TOTAL', 'APLIC HERB MECAN POS EMERG AREA TOTAL', 'APLIC HERB MEC POS + PRE EMERG AREA TOTA', 'APLIC HERB MECAN PRE EMERGENTE REMONT', 'APLIC HERB MECAN PRE EMERG AREA TOTAL'],
    formiga: ['COMBATE A FORMIGAS - MANUTENCAO', 'COMBATE A FORMIGAS - MANUTENCAO III', 'COMBATE A FORMIGAS - MANUTENCAO IV', 'COMBATE A FORMIGAS', 'COMBATE A FORMIGAS I RUA', 'COMBATE A FORMIGAS II', 'COMBATE A FORMIGAS III', 'COMBATE A FORMIGAS - MECANIZADO I', 'COMBATE A FORMIGAS - MECANIZADO II', 'COMBATE A FORMIGAS - MECANIZADO III', 'REPASSE DE FORMIGAS', 'REPASSE DE FORMIGAS II'],
    brotos: ['SELECAO DE BROTOS MANUAL', 'SELECAO DE BROTOS SEMI MECANIZADO', 'SELECAO DE BROTOS SEMI MECANIZADO II']
  };
  // Bases de qualidade (arquivos) e tipos de verificação (abas). Muda e Plantio verificam as mesmas atividades, cada um na sua base.
  const BASES = {
    muda: { nome: 'Qualidade de Muda', chaves: ['MUDA'] },
    plantio: { nome: 'Plantio', chaves: ['PLANTIO'], exceto: ['PREPARO'] },
    conjugado: { nome: 'Preparo de Solo Conjugado', chaves: ['CONJUGADO'] },
    convencional: { nome: 'Preparo de Solo Convencional', chaves: ['CONVENCIONAL'] },
    manual: { nome: 'Preparo de Solo Manual', chaves: ['MANUAL'], exige: ['PREPARO'] },
    herbicida: { nome: 'Herbicida', chaves: ['HERBICIDA'] },
    formiga: { nome: 'Formiga', chaves: ['FORMIGA'] },
    brotos: { nome: 'Seleção de Brotos', chaves: ['BROTO'] }
  };
  const TIPOS = [
    { id: 'muda', nome: 'Qualidade de Muda', grupo: 'mudaPlantio', bases: ['muda'], cor: '#2dd4bf' },
    { id: 'plantio', nome: 'Plantio', grupo: 'mudaPlantio', bases: ['plantio'], cor: '#22c55e' },
    { id: 'preparoMec', nome: 'Preparo de Solo (Conjugado / Convencional)', curto: 'Preparo Conj./Conv.', grupo: 'preparoMec', bases: ['conjugado', 'convencional'], cor: '#fb923c' },
    { id: 'preparoManual', nome: 'Preparo de Solo Manual', curto: 'Preparo Manual', grupo: 'preparoManual', bases: ['manual'], cor: '#f59e0b' },
    { id: 'herbicida', nome: 'Herbicida', grupo: 'herbicida', bases: ['herbicida'], cor: '#c8f560' },
    { id: 'formiga', nome: 'Formiga', grupo: 'formiga', bases: ['formiga'], cor: '#f472b6' },
    { id: 'brotos', nome: 'Seleção de Brotos', grupo: 'brotos', bases: ['brotos'], cor: '#a78bfa' }
  ];
  // Grupo de Operação do RF que combina com cada grupo de atividades (para desempatar)
  const GRUPO_RF = { mudaPlantio: ['PLANTIO'], preparoMec: ['PREPARO', 'FERTILIZ'], preparoManual: ['PREPARO', 'FERTILIZ'], herbicida: ['MATO', 'HERBIC'], formiga: ['FORMIGA'], brotos: ['BROTA'] };

  /* ---------- Correspondência aproximada de nomes ---------- */
  const SINONIMOS = { ADUB: 'ADUBACAO', HERB: 'HERBICIDA', APLICACAO: 'APLIC', MECAN: 'MEC', MECANICA: 'MEC', MECANICO: 'MEC', MECANIZADA: 'MEC', MECANIZADO: 'MEC', EMERGENTE: 'EMERG', TOTA: 'TOTAL', REMONTA: 'REMONT', FORMIGA: 'FORMIGAS', BROTO: 'BROTOS', MANUTENCAO: 'MANUT', MANUT: 'MANUT', SELECAO: 'SELECAO' };
  const VAZIAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'A', 'E', 'NA', 'NO', 'EM', 'POR', '-', '+']);
  const ROMANOS = new Set(['I', 'II', 'III', 'IV', 'V', 'VI']);
  const tokens = t => norm(t).replace(/(\d)\.(\d{3})/g, '$1$2').replace(/[^A-Z0-9+ ]/g, ' ').split(/\s+/).filter(x => x && !VAZIAS.has(x)).map(x => SINONIMOS[x] || x);
  const LISTA = Object.entries(ATIV).flatMap(([grupo, nomes]) => nomes.map(nome => ({ grupo, nome, tok: tokens(nome) })));
  function classificar(desc, grupoRF) {
    const t = tokens(desc), chave = t.join(' '), g = norm(grupoRF);
    const exato = LISTA.find(x => x.tok.join(' ') === chave);
    if (exato) return { grupo: exato.grupo, nome: exato.nome, exato: true };
    const conjunto = new Set(t);
    let melhor = null;
    LISTA.forEach(x => {
      const c = new Set(x.tok);
      if ((conjunto.has('MANUAL') && c.has('MEC')) || (conjunto.has('MEC') && c.has('MANUAL') && !c.has('SEMI'))) return;   // manual × mecanizada nunca combinam
      const inter = [...conjunto].filter(k => c.has(k)).length, uniao = new Set([...conjunto, ...c]).size;
      let n = Math.max(inter / uniao, inter === conjunto.size ? 0.9 : 0);   // RF contido no nome da lista ("REPLANTIO" ⊂ "REPLANTIO MANUAL TEC")
      const numRF = t.filter(k => ROMANOS.has(k)).join(), numL = x.tok.filter(k => ROMANOS.has(k)).join();
      if (numRF !== numL) n -= 0.1;
      const combina = (GRUPO_RF[x.grupo] || []).some(k => g.includes(k));
      n += combina ? 0.05 : g ? -0.15 : 0;
      if (!melhor || n > melhor.n) melhor = { n, x };
    });
    return melhor && melhor.n >= 0.6 ? { grupo: melhor.x.grupo, nome: melhor.x.nome, exato: false } : null;
  }

  /* ======================================================================
     1. LEITURA DOS ARQUIVOS (SheetJS sob demanda)
     ====================================================================== */
  let libXLSX = null;
  const xlsx = () => (libXLSX ||= window.XLSX ? Promise.resolve(window.XLSX) : new Promise((ok, falha) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => ok(window.XLSX); s.onerror = () => { libXLSX = null; falha(new Error('não consegui carregar o leitor de Excel (SheetJS)')); };
    document.head.appendChild(s);
  }));
  // Acha a linha de cabeçalho (até a 25ª) pela presença das colunas pedidas
  function acharCabecalho(linhas, exigidas) {
    for (let i = 0; i < Math.min(25, linhas.length); i++) {
      const cab = (linhas[i] || []).map(c => norm(c));
      const idx = {};
      // vale a ordem dos nomes da lista (ex.: "DATA FIM" antes de "DATA OPERAÇÃO")
      for (const [k, alias] of Object.entries(exigidas)) { for (const a of alias) { const j = cab.findIndex(c => (a instanceof RegExp ? a.test(c) : c === a)); if (j >= 0) { idx[k] = j; break; } } }
      if (Object.keys(exigidas).every(k => k in idx || exigidas[k].opcional)) return { i, idx, cab };
    }
    return null;
  }
  const COLS_RF = {
    up: [/^UP$/, /^COD\.? ?UP$/, /UNIDADE DE PRODUCAO/, /^CODIGO UP$/],
    desc: [/^DESCRICAO OPERACAO$/, /^DESCRICAO DA OPERACAO$/, /^DESCRICAO OPERACAO\b/, /^OPERACAO$/, /^ATIVIDADE$/],
    sit: [/^SITUACAO$/, /^SITUACAO\b/, /^STATUS$/],
    grupo: Object.assign([/^GRUPO OPERACAO$/, /^GRUPO DE OPERACAO$/, /^GRUPO$/], { opcional: true }),
    frente: Object.assign([/^FRENTE DE TRABALHO$/, /^FRENTE$/, /^EQUIPE$/], { opcional: true }),
    semana: Object.assign([/^SEMANA REALIZADA$/, /^SEMANA$/], { opcional: true }),
    data: Object.assign([/^DATA FIM$/, /^DATA REALIZACAO$/, /^DATA REALIZADA$/, /^DATA OPERACAO$/, /^DATA INICIO$/], { opcional: true }),
    fazenda: Object.assign([/^FAZENDA$/], { opcional: true })
  };
  const COLS_QUAL = { up: [/^UP$/, /^COD\.? ?UP$/, /UNIDADE DE PRODUCAO/, /^CODIGO UP$/], data: Object.assign([/^DATA$/, /^DATA AVALIACAO$/, /^DATA DA AVALIACAO$/], { opcional: true }) };
  const ehRF = cab => cab && 'up' in cab.idx && 'desc' in cab.idx && 'sit' in cab.idx;

  // Lê um arquivo e devolve { tipo: 'rf' | id da base | null, linhas, cab, aba }
  async function lerArquivo(arq) {
    const X = await xlsx(), buf = await arq.arrayBuffer();
    const nomes = X.read(buf, { type: 'array', bookSheets: true }).SheetNames;
    const nome = norm(arq.name.replace(/\.[^.]+$/, ''));
    // RF: procura a aba com UP + Descrição da Operação + Situação (as abas com nome de programação/RF primeiro)
    const ordem = [...nomes].sort((a, b) => (/PROGRAM|BASE|RF/.test(norm(b)) - /PROGRAM|BASE|RF/.test(norm(a))));
    for (const aba of ordem.slice(0, 8)) {
      const wb = X.read(buf, { type: 'array', sheets: [aba], cellDates: true, dense: true });
      const linhas = X.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: '' });
      const cabRF = acharCabecalho(linhas, COLS_RF);
      if (ehRF(cabRF)) return { tipo: 'rf', aba, linhas, cab: cabRF };
      const cabQ = acharCabecalho(linhas, COLS_QUAL);
      if (cabQ) {
        const id = Object.entries(BASES).find(([, b]) => [nome, norm(aba)].some(t => b.chaves.some(k => t.includes(k)) && !(b.exceto || []).some(k => t.includes(k)) && (b.exige || []).every(k => t.includes(k))))?.[0] || null;
        return { tipo: id, aba, linhas, cab: cabQ };
      }
    }
    return { tipo: null, aba: nomes[0], linhas: [], cab: null, erro: 'não achei uma aba com a coluna UP' };
  }

  /* ======================================================================
     2/3. ANÁLISE
     ====================================================================== */
  const arquivos = [];   // { arq, leitura, tipo (pode ser trocado pelo usuário) }
  const estado = { res: null, aba: 'muda', ver: 'pend', busca: '', semana: '', equipesSel: null };
  const naSemana = it => !estado.semana || it.semana === estado.semana;
  const semanaISO = d => { const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dia = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - dia); const ini = new Date(Date.UTC(x.getUTCFullYear(), 0, 1)); return Math.ceil(((x - ini) / 864e5 + 1) / 7); };
  const comoData = v => (v instanceof Date ? v : typeof v === 'number' && v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 864e5) + new Date().getTimezoneOffset() * 6e4) : (() => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(v || '')); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; })());

  function analisar() {
    const rf = arquivos.find(a => a.tipo === 'rf');
    if (!rf) throw new Error('envie a Base do RF (a planilha com UP, Descrição da Operação e Situação)');
    const { linhas, cab } = rf.leitura, ix = cab.idx;
    const colunasUsadas = Object.entries(ix).map(([k, j]) => `${({ up: 'UP', desc: 'Descrição da Operação', sit: 'Situação', grupo: 'Grupo de Operação', frente: 'Frente de Trabalho', semana: 'Semana Realizada', data: 'Data (semana calculada)', fazenda: 'Fazenda' })[k]}: "${String(linhas[cab.i][j]).replace(/\s+/g, ' ').trim()}"`);
    // Bases de qualidade: avaliações de cada UP (datas distintas; sem coluna de data, cada linha conta uma)
    const bases = {};
    arquivos.filter(a => a.tipo && a.tipo !== 'rf' && a.leitura?.cab).forEach(a => {
      const { linhas: L, cab: c } = a.leitura, b = bases[a.tipo] || (bases[a.tipo] = { ups: new Map(), arquivos: [] });
      b.arquivos.push(a.arq.name);
      L.slice(c.i + 1).forEach((l, k) => {
        const up = normUP(l[c.idx.up]); if (!up || up === 'TOTAL' || /^FILTROS/.test(up)) return;
        const d = 'data' in c.idx ? comoData(l[c.idx.data]) : null;
        (b.ups.get(up) || b.ups.set(up, new Set()).get(up)).add(d ? d.toDateString() : `${a.arq.name}#${k}`);
      });
    });
    // Linhas REALIZADAS do RF
    let totalRF = 0;
    const vistos = new Set(), linhasRF = [], naoClass = [], corresp = new Map();
    linhas.slice(cab.i + 1).forEach((l, k) => {
      if (norm(l[ix.sit]) !== 'REALIZADO') return;
      const up = normUP(l[ix.up]), desc = norm(l[ix.desc]); if (!up || !desc) return;
      totalRF++;
      const data = 'data' in ix ? comoData(l[ix.data]) : null;
      const semana = ('semana' in ix && String(l[ix.semana]).trim()) || (data ? `Semana ${semanaISO(data)}` : '—');
      const chave = `${up}|${desc}|${semana}`;
      if (vistos.has(chave)) return; vistos.add(chave);
      const grupoRF = 'grupo' in ix ? l[ix.grupo] : '';
      const linha = { up, upOriginal: String(l[ix.up]).trim(), desc, grupoRF: norm(grupoRF), frente: 'frente' in ix ? norm(l[ix.frente]) : '', semana, fazenda: 'fazenda' in ix ? String(l[ix.fazenda]).replace(/\s+/g, ' ').trim() : '', linhaPlanilha: cab.i + 2 + k };
      const c = classificar(desc, grupoRF);
      if (!c) { naoClass.push(linha); return; }
      if (!c.exato) corresp.set(desc, { rf: desc, lista: c.nome, grupo: c.grupo });
      linhasRF.push({ ...linha, grupo: c.grupo, nomeLista: c.nome });
    });
    const semanas = [...new Set(linhasRF.map(l => l.semana).concat(naoClass.map(l => l.semana)))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const faltam = Object.keys(BASES).filter(b => !bases[b]);
    return {
      quando: new Date(), rfNome: rf.arq.name, rfAba: rf.leitura.aba, colunasUsadas, semanas, linhasRF, naoClass, corresp: [...corresp.values()],
      totalRF, unicas: linhasRF.length + naoClass.length, faltam,
      bases: Object.fromEntries(Object.entries(bases).map(([k, b]) => [k, { qtd: b.ups.size, aval: Object.fromEntries([...b.ups].map(([up, s]) => [up, s.size])), arquivos: b.arquivos }]))
    };
  }

  /* ======================================================================
     3b. COMPARAÇÃO (refeita quando as exceções por equipe mudam)
     Uma UP com a mesma atividade (ou atividades do mesmo tipo) feita mais de uma vez no RF precisa de
     uma avaliação para cada realização: conta as datas distintas da UP na base de qualidade.
     ====================================================================== */
  const CHAVE_ISEN = 'n1:isencoes';   // [{ equipe, atividade ('*' = todas) }]
  let isencoes = [];
  try { isencoes = JSON.parse(localStorage.getItem(CHAVE_ISEN) || '[]') || []; } catch { isencoes = []; }
  const salvarIsencoes = () => { try { localStorage.setItem(CHAVE_ISEN, JSON.stringify(isencoes)); } catch { /* opcional */ } };
  const isento = it => { const e = equipeDe(it); return !!e && isencoes.some(x => x.equipe === e && (x.atividade === '*' || x.atividade === it.desc)); };
  const ordemSemana = s => +(String(s).match(/\d+/)?.[0] || 99);
  function montarItens() {
    const R = estado.res; if (!R) return;
    const itens = [];
    TIPOS.forEach(t => {
      const enviadas = t.bases.filter(b => R.bases[b]);
      const porUP = new Map();
      R.linhasRF.filter(l => l.grupo === t.grupo).forEach(l => {
        const it = { ...l, tipo: t.id, chave: `${t.id}|${l.up}|${l.desc}|${l.semana}`, onde: '', necessarias: null, avaliacoes: null };
        if (isento(it)) { it.status = 'isento'; it.onde = 'equipe dispensada de N1'; itens.push(it); return; }
        if (!enviadas.length) { it.status = 'semBase'; itens.push(it); return; }
        (porUP.get(it.up) || porUP.set(it.up, []).get(it.up)).push(it);
      });
      porUP.forEach((l, up) => {
        const aval = enviadas.reduce((s, b) => s + (R.bases[b].aval[up] || 0), 0);
        const onde = enviadas.filter(b => R.bases[b].aval[up]).map(b => BASES[b].nome.replace('Preparo de Solo ', '')).join(' e ');
        l.sort((a, b) => ordemSemana(a.semana) - ordemSemana(b.semana) || a.linhaPlanilha - b.linhaPlanilha);
        l.forEach((it, i) => {
          it.necessarias = l.length; it.avaliacoes = aval;
          if (i < aval) { it.status = 'ok'; it.onde = `${onde}${l.length > 1 ? ` · avaliação ${i + 1} de ${l.length}` : ''}`; }
          else {
            it.status = 'pend';
            it.onde = aval ? `${l.length} realizações e só ${aval} avaliação${aval > 1 ? 'ões' : ''}` : enviadas.length < t.bases.length ? `${t.bases.filter(b => !R.bases[b]).map(b => BASES[b].nome).join(', ')} não enviada` : '';
          }
          itens.push(it);
        });
      });
    });
    R.itens = itens;
  }
  // Aderência por semana, por atividade e por equipe (sem as linhas dispensadas e sem base)
  function aderencias() {
    const R = estado.res, agrupar = chave => {
      const m = new Map();
      R.itens.filter(naSemana).forEach(it => { const k = chave(it) || '—'; const x = m.get(k) || m.set(k, { nome: k, ok: 0, pend: 0, outros: 0 }).get(k); if (it.status === 'ok') x.ok++; else if (it.status === 'pend') x.pend++; else x.outros++; });
      return [...m.values()].map(x => ({ ...x, ader: x.ok + x.pend ? x.ok / (x.ok + x.pend) : null }));
    };
    return {
      'Por semana': agrupar(it => it.semana).sort((a, b) => ordemSemana(a.nome) - ordemSemana(b.nome)),
      'Por atividade': agrupar(it => it.desc).sort((a, b) => (a.ader ?? 2) - (b.ader ?? 2) || b.pend - a.pend),
      'Por equipe': agrupar(it => equipeDe(it) || 'Sem equipe').sort((a, b) => (a.ader ?? 2) - (b.ader ?? 2) || b.pend - a.pend),
      'Por base de qualidade': agrupar(it => tipoDe(it.tipo).nome).sort((a, b) => TIPOS.findIndex(t => t.nome === a.nome) - TIPOS.findIndex(t => t.nome === b.nome))
    };
  }
  // Aderência: uma tabela embaixo da outra (semana, atividade, equipe e base de qualidade), seguindo o filtro de semana
  function htmlAderencia() {
    const grupos = aderencias(), geral = Object.values(grupos)[3].reduce((s, x) => ({ ok: s.ok + x.ok, pend: s.pend + x.pend, outros: s.outros + x.outros }), { ok: 0, pend: 0, outros: 0 });
    const aderGeral = geral.ok + geral.pend ? geral.ok / (geral.ok + geral.pend) : null;
    const barra = a => (a == null ? '<span class="n1-mudo">—</span>' : `<div class="n1-ader-barra ${a >= .9 ? 'boa' : a >= .7 ? 'media' : 'baixa'}" style="--p:${(a * 100).toFixed(1)}%"><i></i><b>${pct(a)}</b></div>`);
    const icone = { 'Por semana': 'calendar-range', 'Por atividade': 'list-checks', 'Por equipe': 'users', 'Por base de qualidade': 'database' };
    return `<div class="n1-ader-topo">
        <div class="n1-ader-geral"><span>Aderência geral${estado.semana ? ` · ${esc(estado.semana)}` : ''}</span><strong>${aderGeral == null ? '—' : pct(aderGeral)}</strong><small><b class="ok">${geral.ok} encontradas</b> · <b class="pend">${geral.pend} pendentes</b>${geral.outros ? ` · ${geral.outros} sem N1 / sem base` : ''}</small></div>
        <p class="n1-nota">Aderência = encontradas ÷ (encontradas + pendentes). Linhas sem N1 (equipe dispensada) e de bases não enviadas não entram na conta. Use o filtro de semana acima para ver uma semana só.</p></div>
      ${Object.entries(grupos).map(([nome, l]) => `<section class="n1-ader"><h3><i data-lucide="${icone[nome]}"></i>${nome}</h3>
        <table class="n1-tab n1-tab-ader"><thead><tr><th>${nome.replace('Por ', '').replace(/^./, c => c.toUpperCase())}</th><th class="num">Realizadas</th><th class="num">Encontradas</th><th class="num">Pendentes</th><th class="num">Sem N1 / sem base</th><th class="n1-c-barra">Aderência</th></tr></thead><tbody>
        ${l.length ? l.map(x => `<tr><td><b>${esc(x.nome)}</b></td><td class="num">${x.ok + x.pend + x.outros}</td><td class="num ok">${x.ok}</td><td class="num pend">${x.pend}</td><td class="num n1-mudo">${x.outros || '—'}</td><td>${barra(x.ader)}</td></tr>`).join('') : '<tr><td colspan="6" class="n1-mudo">Nada nesta semana.</td></tr>'}</tbody></table></section>`).join('')}`;
  }
  // Equipes sem N1: retirar atividades por equipe (ex.: a BV não faz N1)
  function renderIsencoes() {
    const R = estado.res, el = $('#n1-isen'); if (!R || !el) return;
    const equipes = [...new Set(R.linhasRF.map(l => l.frente).filter(Boolean))].sort();
    const eqSel = el.dataset.eq && equipes.includes(el.dataset.eq) ? el.dataset.eq : equipes[0] || '';
    const ativs = [...new Set(R.linhasRF.filter(l => l.frente === eqSel).map(l => l.desc))].sort();
    el.innerHTML = `<div class="n1-isen-topo"><span class="n1-isen-rot"><i data-lucide="user-x"></i>Equipes sem N1</span>
        <div class="n1-isen-lista">${isencoes.length ? isencoes.map((x, i) => `<span class="n1-isen-chip">${esc(x.equipe)} · ${x.atividade === '*' ? 'todas as atividades' : esc(x.atividade)}<button type="button" data-isen-tirar="${i}" aria-label="Voltar a exigir N1"><i data-lucide="x"></i></button></span>`).join('') : '<small>Nenhuma: todas as equipes precisam de N1.</small>'}</div></div>
      <div class="n1-isen-form"><label><span>Equipe</span><select id="n1-isen-eq">${equipes.map(e => `<option ${e === eqSel ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>
        <label><span>Atividade</span><select id="n1-isen-at"><option value="*">Todas as atividades</option>${ativs.map(a => `<option>${esc(a)}</option>`).join('')}</select></label>
        <button type="button" class="fat-btn" id="n1-isen-add"><i data-lucide="minus-circle"></i><span>Retirar do N1</span></button></div>`;
    el.dataset.eq = eqSel;
    icones();
  }
  $('#n1-isen').addEventListener('change', e => { if (e.target.id === 'n1-isen-eq') { $('#n1-isen').dataset.eq = e.target.value; renderIsencoes(); } });
  $('#n1-isen').addEventListener('click', e => {
    const tirar = e.target.closest('[data-isen-tirar]');
    if (tirar) isencoes.splice(+tirar.dataset.isenTirar, 1);
    else if (e.target.closest('#n1-isen-add')) {
      const equipe = $('#n1-isen-eq').value, atividade = $('#n1-isen-at').value;
      if (!equipe || isencoes.some(x => x.equipe === equipe && (x.atividade === atividade || x.atividade === '*'))) return;
      if (atividade === '*') isencoes = isencoes.filter(x => x.equipe !== equipe);
      isencoes.push({ equipe, atividade });
    } else return;
    salvarIsencoes(); montarItens(); render();
  });

  /* ======================================================================
     5. MARCAÇÕES (checks e equipe digitada) — salvas no navegador por RF
     ====================================================================== */
  const MARCAS = [{ k: 'adiantada', nome: 'Adiantada', curto: 'Adiant.', rotulo: 'Adiantada' }, { k: 'negociacao', nome: 'Negociações', curto: 'Negoc.', rotulo: 'Negociação' }, { k: 'rfAnterior', nome: 'Pendências RF anterior', curto: 'Pend. RF ant.', rotulo: 'RF anterior' }];
  const chaveMarcas = () => `n1:marcas:${norm(estado.res?.rfNome || '')}`;
  let marcas = {};
  const lerMarcas = () => { try { marcas = JSON.parse(localStorage.getItem(chaveMarcas()) || '{}') || {}; } catch { marcas = {}; } };
  const salvarMarcas = () => { try { localStorage.setItem(chaveMarcas(), JSON.stringify(marcas)); } catch { /* sem espaço */ } };
  const marcaDe = it => marcas[it.chave] || {};
  const equipeDe = it => it.frente || marcaDe(it).equipe || '';
  const classificacao = it => { const m = marcaDe(it), l = MARCAS.filter(x => m[x.k]).map(x => x.nome); return l.length ? l.join(' + ') : 'Normal'; };

  /* ======================================================================
     4. TELA
     ====================================================================== */
  const STATUS = { ok: { nome: 'OK – Encontrada', curto: 'OK', cor: '#22c55e' }, pend: { nome: 'PENDENTE – Não encontrada', curto: 'Pendente', cor: '#ef4444' }, semBase: { nome: 'Base não enviada', curto: 'Sem base', cor: '#94a3b8' }, isento: { nome: 'Sem N1 (equipe dispensada)', curto: 'Sem N1', cor: '#64748b' } };
  const tipoDe = id => TIPOS.find(t => t.id === id);

  function renderArquivos() {
    const opcoes = [['rf', 'Base do RF'], ...Object.entries(BASES).map(([k, b]) => [k, b.nome]), ['', 'Ignorar este arquivo']];
    $('#n1-lista-arq').innerHTML = arquivos.map((a, i) => `<div class="n1-arq ${a.tipo ? '' : 'sem-tipo'}">
      <i data-lucide="${a.lendo ? 'loader' : a.tipo === 'rf' ? 'file-spreadsheet' : a.tipo ? 'file-check-2' : 'file-question'}"></i>
      <span class="n1-arq-nome"><b>${esc(a.arq.name)}</b><small>${a.lendo ? 'lendo…' : a.leitura?.erro ? esc(a.leitura.erro) : `aba "${esc(a.leitura?.aba || '')}" · ${Math.max(0, (a.leitura?.linhas.length || 0) - (a.leitura?.cab?.i ?? 0) - 1)} linhas`}</small></span>
      <select data-i="${i}" aria-label="O que é este arquivo" ${a.lendo ? 'disabled' : ''}>${opcoes.map(([v, n]) => `<option value="${v}" ${a.tipo === v || (!a.tipo && !v) ? 'selected' : ''} ${v === 'rf' && !ehRF(a.leitura?.cab) ? 'disabled' : ''}>${n}</option>`).join('')}</select>
      <button type="button" class="n1-arq-tirar" data-tirar="${i}" aria-label="Tirar ${esc(a.arq.name)}"><i data-lucide="x"></i></button></div>`).join('');
    const temRF = arquivos.some(a => a.tipo === 'rf');
    $('#n1-analisar').disabled = !temRF || arquivos.some(a => a.lendo);
    $('#n1-limpar-arq').hidden = !arquivos.length;
    const tem = new Set(arquivos.map(a => a.tipo));
    $('#n1-envio-status').textContent = !arquivos.length ? '' : !temRF ? 'Falta a Base do RF.' : `Bases recebidas: ${Object.keys(BASES).filter(b => tem.has(b)).length} de 8${Object.keys(BASES).some(b => !tem.has(b)) ? ` · não enviadas: ${Object.entries(BASES).filter(([b]) => !tem.has(b)).map(([, b]) => b.nome).join(', ')}` : ''}`;
    icones();
  }
  async function receber(lista) {
    for (const arq of lista) {
      if (arquivos.some(a => a.arq.name === arq.name && a.arq.size === arq.size)) continue;
      const a = { arq, lendo: true, tipo: null }; arquivos.push(a); renderArquivos();
      try { a.leitura = await lerArquivo(arq); a.tipo = a.leitura.tipo; }
      catch (e) { a.leitura = { erro: `não consegui ler (${e.message})`, linhas: [] }; }
      a.lendo = false; renderArquivos();
    }
  }
  $('#n1-arquivos').addEventListener('change', e => { receber([...e.target.files]); e.target.value = ''; });
  const solta = $('#n1-solta');
  ['dragenter', 'dragover'].forEach(ev => solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.add('sobre'); }));
  ['dragleave', 'drop'].forEach(ev => solta.addEventListener(ev, e => { e.preventDefault(); solta.classList.remove('sobre'); }));
  solta.addEventListener('drop', e => receber([...e.dataTransfer.files]));
  $('#n1-lista-arq').addEventListener('change', e => { const s = e.target.closest('select[data-i]'); if (s) { arquivos[+s.dataset.i].tipo = s.value || null; renderArquivos(); } });
  $('#n1-lista-arq').addEventListener('click', e => { const b = e.target.closest('[data-tirar]'); if (b) { arquivos.splice(+b.dataset.tirar, 1); renderArquivos(); } });
  $('#n1-limpar-arq').addEventListener('click', () => { arquivos.length = 0; renderArquivos(); });
  $('#n1-analisar').addEventListener('click', () => {
    const el = $('#n1-erros');
    try {
      estado.res = analisar(); lerMarcas(); estado.equipesSel = null; montarItens();
      try { localStorage.setItem('n1:ultima', JSON.stringify(estado.res)); } catch { /* grande demais: segue sem guardar */ }
      el.hidden = true; render();
      $('#n1-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (erro) {
      el.hidden = false; el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>Não consegui fazer a análise</strong><p>${esc(erro.message)}</p></div>`; icones();
    }
  });

  function resumoTipo(t) {
    const l = estado.res.itens.filter(i => i.tipo === t.id && naSemana(i)), ok = l.filter(i => i.status === 'ok').length, pend = l.filter(i => i.status === 'pend').length, isento = l.filter(i => i.status === 'isento').length;
    return { total: l.length, ok, pend, isento, semBase: l.length && l.every(i => i.status === 'semBase' || i.status === 'isento') && l.some(i => i.status === 'semBase'), ader: ok + pend ? ok / (ok + pend) : null };
  }
  function render() {
    const R = estado.res; if (!R) return;
    $('#n1-resultado').hidden = false;
    // Cabeçalho
    $('#n1-cab').innerHTML = `<div class="n1-cab-topo"><div><span class="eyebrow">Relatório</span><h2 class="fat-sec-titulo">Análise de Qualidade de <span class="serif">Entrega – N1</span></h2></div>
        <dl class="n1-cab-dados"><div><dt>Data da análise</dt><dd>${R.quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</dd></div><div><dt>Semanas</dt><dd>${esc(R.semanas.join(', ') || '—')}</dd></div><div><dt>Base do RF</dt><dd>${esc(R.rfNome)} · aba "${esc(R.rfAba)}"</dd></div></dl></div>
      <details class="n1-det"><summary>Colunas usadas e observações</summary>
        <p><b>Colunas do RF:</b> ${R.colunasUsadas.map(esc).join(' · ')}</p>
        <p><b>Bases de qualidade:</b> ${Object.entries(BASES).map(([k, b]) => R.bases[k] ? `${b.nome} (${R.bases[k].qtd} UPs)` : `<span class="n1-falta">${b.nome}: base não enviada</span>`).join(' · ')}</p>
        <ul><li>Só linhas com Situação = REALIZADO; duplicadas (mesma UP + atividade + semana) contam uma vez.</li><li>Qualidade de Muda e Plantio verificam as mesmas atividades, cada uma na sua base.</li><li>Preparo de Solo mecanizado: a UP precisa estar em pelo menos uma das bases (Conjugado ou Convencional); a coluna "Base" diz em qual.</li><li>As bases de qualidade são comparadas pela UP (a coluna de aplicação do Herbicida não identifica a atividade do RF).</li>${R.faltam.length ? `<li>Bases não enviadas aparecem como "Base não enviada" e não contam como pendência.</li>` : ''}</ul></details>`;
    // Cartões
    $('#n1-cards').innerHTML = TIPOS.map(t => {
      const r = resumoTipo(t);
      return `<button type="button" class="n1-card glass ${estado.aba === t.id ? 'ativo' : ''} ${r.semBase ? 'sem-base' : ''}" data-aba="${t.id}" style="--c:${t.cor}">
        <span class="n1-card-tit">${esc(t.curto || t.nome)}</span>
        ${r.semBase ? '<strong class="n1-card-sb">Base não enviada</strong>' : `<strong>${r.ader == null ? '—' : pct(r.ader)}</strong><span class="n1-barra-ader"><i style="width:${(r.ader || 0) * 100}%"></i></span>`}
        <small>${r.total} realizadas · <b class="ok">${r.ok} OK</b> · <b class="pend">${r.pend} pend.</b>${r.isento ? ` · ${r.isento} sem N1` : ''}</small></button>`;
    }).join('');
    $('#n1-semana').innerHTML = `<option value="">Todas as semanas</option>${R.semanas.map(s => `<option ${s === estado.semana ? 'selected' : ''}>${esc(s)}</option>`).join('')}`;
    $('#n1-envio').classList.add('compacto'); $('#n1-trocar').hidden = false;
    renderAbas(); renderPainel();
    const somaOk = TIPOS.every(t => { const r = resumoTipo(t); return r.ok + r.pend + r.isento + estado.res.itens.filter(i => i.tipo === t.id && i.status === 'semBase').length === r.total; });
    $('#n1-conferencia').innerHTML = `<i data-lucide="${somaOk ? 'check-circle-2' : 'alert-circle'}"></i>Conferência: ${R.totalRF} linhas REALIZADAS no RF (${R.unicas} sem duplicidade) = ${R.unicas - R.naoClass.length} classificadas + ${R.naoClass.length} não classificadas · ${R.itens.length} verificações (Muda e Plantio contam duas vezes) · encontradas + pendentes + sem base + sem N1 ${somaOk ? 'batem' : 'NÃO batem'} com o total de cada tipo.`;
    renderIsencoes();
    icones();
  }
  function renderAbas() {
    const R = estado.res;
    const abas = [...TIPOS.map(t => [t.id, t.curto || t.nome, resumoTipo(t).pend]), ['aderencia', 'Aderência', null], ['equipe', 'Por equipe', null], ['naoClass', 'Não classificadas', R.naoClass.length], ['corresp', 'Correspondências de nomes', R.corresp.length]];
    $('#n1-abas').innerHTML = abas.map(([id, nome, n]) => `<button type="button" role="tab" data-aba="${id}" aria-selected="${estado.aba === id}" class="${estado.aba === id ? 'ativo' : ''}">${esc(nome)}${n ? ` <b>${n}</b>` : ''}</button>`).join('');
    $('#n1-barra').classList.toggle('sem-filtro', ['naoClass', 'corresp'].includes(estado.aba));
    $('#n1-barra').classList.toggle('so-semana', estado.aba === 'aderencia');
  }
  const passa = it => naSemana(it) && (estado.ver === 'todas' || it.status === 'pend') && (!estado.busca || it.up.includes(normUP(estado.busca)));
  function celulaChecks(it) {
    const m = marcaDe(it);
    return MARCAS.map(x => `<td class="n1-chk" data-rotulo="${x.nome}"><label><input type="checkbox" data-marca="${x.k}" data-chave="${esc(it.chave)}" ${m[x.k] ? 'checked' : ''} aria-label="${x.nome} – UP ${esc(it.up)}"><span class="n1-imp">${m[x.k] ? '☑' : '☐'}</span></label></td>`).join('');
  }
  function celulaEquipe(it) {
    if (it.frente) return `<span class="n1-eq" title="Frente de trabalho do RF">${esc(it.frente)}</span>`;
    const v = marcaDe(it).equipe || '';
    return `<input type="text" class="n1-eq-in" list="n1-equipes-sug" data-equipe="${esc(it.chave)}" value="${esc(v)}" placeholder="digite a equipe" aria-label="Equipe da UP ${esc(it.up)}"><span class="n1-imp">${esc(v || '—')}</span>`;
  }
  // Classificação: "Normal" discreto ou as marcações como etiquetas pequenas
  const classeHtml = it => { const m = marcaDe(it), l = MARCAS.filter(x => m[x.k]); return l.length ? l.map(x => `<span class="n1-cl ${x.k}">${x.rotulo}</span>`).join('') : '<span class="n1-cl normal">Normal</span>'; };
  const selo = it => `<span class="n1-selo ${it.status}" style="--c:${STATUS[it.status].cor}" title="${STATUS[it.status].nome}">${STATUS[it.status].curto}</span>${it.onde ? `<small class="n1-onde">${it.status === 'ok' ? 'em ' : ''}${esc(it.onde)}</small>` : ''}`;
  function linhaItem(it, comTipo) {
    return `<tr class="n1-l-${it.status}">
      ${comTipo ? `<td data-rotulo="Tipo">${esc(tipoDe(it.tipo).curto || tipoDe(it.tipo).nome)}</td>` : ''}
      <td data-rotulo="UP"><span class="q-up">${esc(it.up)}</span>${it.fazenda ? `<small class="n1-faz">${esc(it.fazenda)}</small>` : ''}</td>
      <td data-rotulo="Atividade">${esc(it.desc)}</td><td data-rotulo="Frente de Trabalho">${esc(it.frente || '—')}</td><td data-rotulo="Semana Realizada">${esc(it.semana)}</td>
      <td data-rotulo="Status">${selo(it)}</td>${celulaChecks(it)}
      <td data-rotulo="Classificação" class="n1-classe" data-classe="${esc(it.chave)}">${classeHtml(it)}</td>
      <td data-rotulo="Equipe">${celulaEquipe(it)}</td></tr>`;
  }
  const cabItens = comTipo => `<thead><tr>${comTipo ? '<th class="n1-c-tipo">Tipo</th>' : ''}<th class="n1-c-up">UP</th><th class="n1-c-ativ">Atividade</th><th class="n1-c-fr">Frente</th><th class="n1-c-sem">Semana</th><th class="n1-c-st">Status</th>${MARCAS.map(x => `<th class="n1-chk" title="${x.nome}">${x.curto}</th>`).join('')}<th class="n1-c-cl">Classificação</th><th class="n1-c-eq">Equipe</th></tr></thead>`;
  function renderPainel() {
    const R = estado.res, el = $('#n1-painel');
    $$('.n1-seg [data-ver]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ver === estado.ver)));
    if (estado.aba === 'naoClass') {
      el.innerHTML = R.naoClass.length ? `<p class="n1-nota">Atividades REALIZADAS no RF que não se encaixam em nenhum tipo. Não entram na aderência; revise se alguma deveria ser verificada.</p>
        <table class="q-tab n1-tab"><thead><tr><th>UP</th><th>Atividade (RF)</th><th>Grupo de Operação</th><th>Frente</th><th>Semana</th><th>Linha no RF</th></tr></thead><tbody>${R.naoClass.map(l => `<tr><td data-rotulo="UP"><span class="q-up">${esc(l.up)}</span></td><td data-rotulo="Atividade">${esc(l.desc)}</td><td data-rotulo="Grupo">${esc(l.grupoRF || '—')}</td><td data-rotulo="Frente">${esc(l.frente || '—')}</td><td data-rotulo="Semana">${esc(l.semana)}</td><td data-rotulo="Linha">${l.linhaPlanilha}</td></tr>`).join('')}</tbody></table>` : '<p class="n1-vazio">Todas as atividades realizadas foram classificadas.</p>';
      return;
    }
    if (estado.aba === 'corresp') {
      el.innerHTML = R.corresp.length ? `<p class="n1-nota">Nomes do RF diferentes dos nomes da lista, enquadrados por aproximação. Confira se o enquadramento está certo.</p>
        <table class="q-tab n1-tab"><thead><tr><th>Nome no RF</th><th>Nome da lista</th><th>Tipo</th></tr></thead><tbody>${R.corresp.map(c => `<tr><td data-rotulo="Nome no RF">${esc(c.rf)}</td><td data-rotulo="Nome da lista">${esc(c.lista)}</td><td data-rotulo="Tipo">${TIPOS.filter(t => t.grupo === c.grupo).map(t => esc(t.nome)).join(' e ')}</td></tr>`).join('')}</tbody></table>` : '<p class="n1-vazio">Todos os nomes do RF bateram exatamente com a lista.</p>';
      return;
    }
    if (estado.aba === 'equipe') return renderPorEquipe();
    if (estado.aba === 'aderencia') { el.innerHTML = htmlAderencia(); return; }
    const t = tipoDe(estado.aba), todos = R.itens.filter(i => i.tipo === t.id && naSemana(i)), l = todos.filter(passa);
    el.innerHTML = `<h3 class="n1-tit-tipo" style="--c:${t.cor}">${esc(t.nome)} <small>${l.length} de ${todos.length} linha(s)</small></h3>` + (l.length
      ? `<table class="q-tab n1-tab">${cabItens(false)}<tbody>${l.map(it => linhaItem(it, false)).join('')}</tbody></table>`
      : `<p class="n1-vazio">${todos.length ? (estado.ver === 'pend' ? 'Nenhuma pendência neste tipo. 🎉' : 'Nenhuma UP com essa busca.') : 'Nenhuma atividade deste tipo foi realizada no RF.'}</p>`);
  }
  function equipesTodas() { return [...new Set(estado.res.itens.map(equipeDe).map(e => e || 'Sem equipe'))].sort((a, b) => a.localeCompare(b, 'pt-BR')); }
  function renderPorEquipe() {
    const todas = equipesTodas();
    if (!estado.equipesSel) estado.equipesSel = new Set(todas);
    const sel = estado.equipesSel;
    const itens = estado.res.itens.filter(passa);
    const porEq = new Map(); itens.forEach(it => { const e = equipeDe(it) || 'Sem equipe'; if (sel.has(e)) (porEq.get(e) || porEq.set(e, []).get(e)).push(it); });
    const pendDe = e => estado.res.itens.filter(i => naSemana(i) && (equipeDe(i) || 'Sem equipe') === e && i.status === 'pend').length;
    $('#n1-painel').innerHTML = `<div class="n1-eq-sel"><span class="n1-eq-sel-rot">Equipes</span>${todas.map(e => `<label class="n1-eq-op ${sel.has(e) ? 'ativo' : ''}"><input type="checkbox" data-eq="${esc(e)}" ${sel.has(e) ? 'checked' : ''}>${esc(e)} <b>${pendDe(e)}</b></label>`).join('')}
        <button type="button" class="n1-link" data-eq-todas>Selecionar todas</button><button type="button" class="n1-link" data-eq-limpar>Limpar</button></div>
      ${porEq.size ? [...porEq.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([e, l]) => `<section class="n1-grupo-eq"><h3><i data-lucide="users"></i>${esc(e)} <small>${l.length} linha(s) · <b class="pend">${l.filter(i => i.status === 'pend').length} pendente(s)</b></small></h3>
        <table class="q-tab n1-tab">${cabItens(true)}<tbody>${l.sort((a, b) => a.tipo.localeCompare(b.tipo) || a.up.localeCompare(b.up)).map(it => linhaItem(it, true)).join('')}</tbody></table></section>`).join('') : '<p class="n1-vazio">Nenhuma linha para as equipes selecionadas com esse filtro.</p>'}`;
    icones();
  }
  function atualizarSugestoes() { $('#n1-equipes-sug').innerHTML = equipesTodas().filter(e => e !== 'Sem equipe').map(e => `<option value="${esc(e)}">`).join(''); }

  // Eventos da tela
  const trocarAba = id => { estado.aba = id; renderAbas(); renderPainel(); $$('#n1-cards .n1-card').forEach(c => c.classList.toggle('ativo', c.dataset.aba === id)); icones(); };
  $('#n1-cards').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) trocarAba(b.dataset.aba); });
  $('#n1-abas').addEventListener('click', e => { const b = e.target.closest('[data-aba]'); if (b) trocarAba(b.dataset.aba); });
  $('#n1-semana').addEventListener('change', e => { estado.semana = e.target.value; render(); });
  $('#n1-trocar').addEventListener('click', () => { $('#n1-envio').classList.toggle('compacto'); });
  $('.n1-seg').addEventListener('click', e => { const b = e.target.closest('[data-ver]'); if (b) { estado.ver = b.dataset.ver; renderPainel(); icones(); } });
  let espera; $('#n1-busca').addEventListener('input', e => { clearTimeout(espera); espera = setTimeout(() => { estado.busca = e.target.value; renderPainel(); icones(); }, 150); });
  $('#n1-painel').addEventListener('change', e => {
    const c = e.target.closest('[data-marca]');
    if (c) {
      const m = marcas[c.dataset.chave] || (marcas[c.dataset.chave] = {}); m[c.dataset.marca] = c.checked; salvarMarcas();
      c.nextElementSibling.textContent = c.checked ? '☑' : '☐';
      const it = estado.res.itens.find(i => i.chave === c.dataset.chave), cel = $(`[data-classe="${CSS.escape(c.dataset.chave)}"]`, $('#n1-painel'));
      if (cel && it) cel.innerHTML = classeHtml(it);
      return;
    }
    const q = e.target.closest('[data-eq]');
    if (q) { q.checked ? estado.equipesSel.add(q.dataset.eq) : estado.equipesSel.delete(q.dataset.eq); renderPorEquipe(); }
  });
  $('#n1-painel').addEventListener('input', e => {
    const i = e.target.closest('[data-equipe]'); if (!i) return;
    const m = marcas[i.dataset.equipe] || (marcas[i.dataset.equipe] = {}); m.equipe = norm(i.value); salvarMarcas();
    i.nextElementSibling.textContent = i.value || '—';
  });
  $('#n1-painel').addEventListener('focusout', e => { if (e.target.closest('[data-equipe]')) { atualizarSugestoes(); if (estado.equipesSel) equipesTodas().forEach(x => estado.equipesSel.add(x)); if (isencoes.length) { montarItens(); render(); } } });
  $('#n1-painel').addEventListener('click', e => {
    if (e.target.closest('[data-eq-todas]')) { estado.equipesSel = new Set(equipesTodas()); renderPorEquipe(); }
    if (e.target.closest('[data-eq-limpar]')) { estado.equipesSel = new Set(); renderPorEquipe(); }
  });

  /* ======================================================================
     6. IMPRESSÃO (só a aba atual ou as equipes escolhidas) E EXCEL
     ====================================================================== */
  $('#n1-imprimir').addEventListener('click', () => {
    const R = estado.res; if (!R) return;
    const t = tipoDe(estado.aba), area = $('#n1-impressao');
    const titulo = t ? t.nome : estado.aba === 'equipe' ? 'Por equipe' : estado.aba === 'naoClass' ? 'Atividades não classificadas' : 'Correspondências de nomes';
    const equipes = estado.aba === 'equipe' ? [...(estado.equipesSel || [])].join(', ') : '';
    area.innerHTML = `<header class="n1-imp-cab"><h1>Análise de Qualidade de Entrega – N1 · ${esc(titulo)}</h1><p>Análise de ${R.quando.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · impresso em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · RF: ${esc(R.rfNome)} · Semanas: ${esc(R.semanas.join(', '))}${equipes ? ` · Equipes: ${esc(equipes)}` : ''} · ${estado.ver === 'pend' ? 'só pendentes' : 'todas as linhas'}</p></header>${$('#n1-painel').innerHTML}`;
    $$('.n1-eq-sel', area).forEach(x => x.remove());
    $$('input', area).forEach(x => x.remove());
    document.body.classList.add('imprimindo-n1');
    const fim = () => { document.body.classList.remove('imprimindo-n1'); area.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    setTimeout(() => window.print(), 50);
  });
  // PDF gerado direto (A4 paisagem): a aba atual em páginas de até 16 linhas, cabeçalho em todas
  $('#n1-pdf').addEventListener('click', async () => {
    const R = estado.res; if (!R || !window.SMA_PDF) return;
    const bt = $('#n1-pdf'), rot = $('span', bt), original = rot.textContent;
    bt.disabled = true; rot.textContent = 'Preparando…';
    try {
      const t = tipoDe(estado.aba);
      const titulo = t ? t.nome : ({ equipe: 'Por equipe', aderencia: 'Aderência', naoClass: 'Atividades não classificadas', corresp: 'Correspondências de nomes' })[estado.aba];
      const cab = `<header class="n1-pdf-cab"><div><h1>Análise de Qualidade de Entrega – N1</h1><p>${esc(titulo)} · RF: ${esc(R.rfNome)} · Semanas: ${esc(R.semanas.join(', '))}${estado.aba === 'equipe' ? ` · Equipes: ${esc([...(estado.equipesSel || [])].join(', '))}` : ''} · ${['aderencia', 'naoClass', 'corresp'].includes(estado.aba) ? '' : estado.ver === 'pend' ? 'só pendentes · ' : 'todas as linhas · '}gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></div></header>`;
      const marca = (it, k) => (marcaDe(it)[k] ? '☑' : '☐');
      const linhaPDF = (it, comTipo) => `<tr class="st-${it.status}">${comTipo ? `<td>${esc(tipoDe(it.tipo).curto || tipoDe(it.tipo).nome)}</td>` : ''}<td><b>${esc(it.up)}</b></td><td>${esc(it.desc)}</td><td>${esc(it.frente || '—')}</td><td>${esc(it.semana)}</td><td><b>${STATUS[it.status].curto}</b>${it.onde ? `<br><small>${esc(it.onde)}</small>` : ''}</td>${MARCAS.map(x => `<td class="c">${marca(it, x.k)}</td>`).join('')}<td>${esc(classificacao(it))}</td><td>${esc(equipeDe(it) || '—')}</td></tr>`;
      const cabTab = comTipo => `<thead><tr>${comTipo ? '<th style="width:9%">Tipo</th>' : ''}<th style="width:8%">UP</th><th>Atividade</th><th style="width:6%">Frente</th><th style="width:8%">Semana</th><th style="width:15%">Status</th>${MARCAS.map(x => `<th class="c" style="width:6%">${x.curto}</th>`).join('')}<th style="width:11%">Classificação</th><th style="width:7%">Equipe</th></tr></thead>`;
      const pags = [];
      const fatiar = (linhas, comTipo, sub = '') => { for (let i = 0; i < Math.max(1, linhas.length); i += 16) pags.push(`${cab}${sub}<table class="n1-pdf-tab">${cabTab(comTipo)}<tbody>${linhas.slice(i, i + 16).join('') || '<tr><td colspan="12">Nenhuma linha com esse filtro.</td></tr>'}</tbody></table>`); };
      if (t) fatiar(R.itens.filter(i => i.tipo === t.id).filter(passa).map(it => linhaPDF(it, false)), false);
      else if (estado.aba === 'equipe') {
        const sel = estado.equipesSel || new Set(equipesTodas());
        [...sel].sort().forEach(e => { const l = R.itens.filter(passa).filter(it => (equipeDe(it) || 'Sem equipe') === e); if (l.length) fatiar(l.map(it => linhaPDF(it, true)), true, `<h2 class="n1-pdf-sub">Equipe ${esc(e)} · ${l.filter(i => i.status === 'pend').length} pendente(s)</h2>`); });
        if (!pags.length) fatiar([], true);
      } else pags.push(`${cab}<div class="n1-pdf-livre">${$('#n1-painel').innerHTML}</div>`);
      await window.SMA_PDF.gerar(pags, `Entrega_N1_${(titulo || '').replace(/[^\p{L}\p{N}]+/gu, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`, { progresso: (i, n) => { rot.textContent = `Gerando ${i}/${n}…`; } });
      rot.textContent = 'PDF baixado ✓';
    } catch (e) { console.error('N1: PDF', e); rot.textContent = 'Não consegui gerar o PDF'; }
    finally { bt.disabled = false; setTimeout(() => { rot.textContent = original; }, 2500); }
  });

  $('#n1-excel').addEventListener('click', async () => {
    const R = estado.res; if (!R) return;
    const bt = $('#n1-excel'); bt.disabled = true;
    try {
      const X = await xlsx();
      const linhas = R.itens.map(it => ({ Tipo: tipoDe(it.tipo).nome, UP: it.up, Fazenda: it.fazenda, Atividade: it.desc, 'Nome na lista': it.nomeLista, 'Frente de Trabalho': it.frente, 'Semana Realizada': it.semana, Status: STATUS[it.status].nome, 'Encontrada em / obs.': it.onde, 'Realizações da UP no tipo': it.necessarias ?? '', 'Avaliações na base': it.avaliacoes ?? '', ...Object.fromEntries(MARCAS.map(x => [x.nome, marcaDe(it)[x.k] ? 'Sim' : 'Não'])), Classificação: classificacao(it), Equipe: equipeDe(it) }));
      const resumo = TIPOS.map(t => { const r = resumoTipo(t); return { Tipo: t.nome, 'Realizadas no RF': r.total, Encontradas: r.ok, Pendentes: r.pend, 'Aderência': r.semBase ? 'Base não enviada' : r.ader == null ? '—' : +(r.ader * 100).toFixed(1) }; });
      const wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(resumo), 'Resumo');
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(linhas), 'Verificações');
      Object.entries(aderencias()).forEach(([nome, l]) => X.utils.book_append_sheet(wb, X.utils.json_to_sheet(l.map(x => ({ [nome.replace('Por ', '')]: x.nome, Realizadas: x.ok + x.pend + x.outros, Encontradas: x.ok, Pendentes: x.pend, 'Sem N1 / sem base': x.outros, 'Aderência (%)': x.ader == null ? '—' : +(x.ader * 100).toFixed(1) }))), `Aderência ${nome.replace('Por ', '').slice(0, 18)}`));
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(R.naoClass.map(l => ({ UP: l.up, Atividade: l.desc, 'Grupo de Operação': l.grupoRF, Frente: l.frente, Semana: l.semana, 'Linha no RF': l.linhaPlanilha }))), 'Não classificadas');
      X.utils.book_append_sheet(wb, X.utils.json_to_sheet(R.corresp.map(c => ({ 'Nome no RF': c.rf, 'Nome da lista': c.lista, Tipo: TIPOS.filter(t => t.grupo === c.grupo).map(t => t.nome).join(' e ') }))), 'Correspondências');
      X.writeFile(wb, `Entrega_N1_${R.quando.toISOString().slice(0, 10)}.xlsx`);
    } catch (e) { alert(`Não consegui gerar o Excel: ${e.message}`); }
    bt.disabled = false;
  });

  /* ---------- Início: reabre a última análise feita neste navegador ---------- */
  try {
    const u = JSON.parse(localStorage.getItem('n1:ultima') || 'null');
    if (u?.linhasRF) { u.quando = new Date(u.quando); estado.res = u; lerMarcas(); montarItens(); render(); atualizarSugestoes(); }
  } catch { /* sem análise anterior */ }
  renderArquivos();
  document.addEventListener('qual:aba', e => { if (e.detail === 'n1') { icones(); if (estado.res) atualizarSugestoes(); } });
})();
