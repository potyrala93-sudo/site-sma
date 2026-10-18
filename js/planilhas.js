/* ==========================================================================
   SMA · Silvicultura — Leitura das planilhas do Google (compartilhada)
   Usada pelo painel de Faturamento e pelo Folhito. Os dados são baixados uma vez
   e reaproveitados por alguns minutos por quem pedir primeiro.
   ========================================================================== */

(() => {
  const F = window.SMA_DADOS?.FATURAMENTO;
  if (!F) return;
  let usandoCache = null;
  // CSV (RFC 4180): aspas, vírgulas e quebras de linha dentro de células
  function lerCSV(texto) {
    const linhas = []; let linha = [], celula = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"') { if (texto[i + 1] === '"') { celula += '"'; i++; } else aspas = false; }
        else celula += c;
      } else if (c === '"') aspas = true;
      else if (c === ',') { linha.push(celula); celula = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(celula); linhas.push(linha); linha = []; celula = '';
      } else celula += c;
    }
    if (celula || linha.length) { linha.push(celula); linhas.push(linha); }
    return linhas;
  }

  // Nome de coluna padronizado: maiúsculas, sem acentos e com espaços simples
  const chaveColuna = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

  // Transforma as linhas em objetos, encontrando o cabeçalho pelo nome (nunca pela posição)
  function paraObjetos(linhas, colunaObrigatoria = 'EQUIPE') {
    const iCab = linhas.findIndex(l => l.some(c => chaveColuna(c) === colunaObrigatoria));
    if (iCab < 0) throw new Error(`Cabeçalho com a coluna ${colunaObrigatoria} não encontrado`);
    const cab = linhas[iCab].map(chaveColuna);
    return linhas.slice(iCab + 1)
      .filter(l => l.some(c => String(c).trim()))
      .map(l => {
        // Colunas com o mesmo nome: vale a primeira (ex.: a aba de Qualidade tem duas colunas "UP")
        const o = {};
        cab.forEach((k, i) => { if (k && !(k in o)) o[k] = String(l[i] ?? '').trim(); });
        return o;
      });
  }

  // Caminho 3 (funciona até abrindo o arquivo direto, sem servidor): API de consultas do Google via JSONP.
  // O navegador não bloqueia, porque a resposta chega como um <script>.
  // cabecalho = true: a 1ª linha é o cabeçalho; um número N: o cabeçalho termina na linha N. Sem isso, o Google apaga o título das colunas de número/data
  // (ex.: "Idade", "Plantio", "Área" chegavam vazios na aba Base de UPs).
  function lerViaJSONP(planilha, gid, cabecalho = false) {
    return new Promise((resolve, reject) => {
      const nome = '__fatPlanilha_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const limpar = () => { clearTimeout(tempo); delete window[nome]; script.remove(); };
      const tempo = setTimeout(() => { limpar(); reject(new Error('tempo esgotado')); }, 25000);
      window[nome] = resp => {
        limpar();
        if (resp.status === 'error') return reject(new Error(resp.errors?.[0]?.detailed_message || 'erro na consulta'));
        const t = resp.table;
        const valor = c => (c == null ? '' : c.f != null ? c.f : c.v == null ? '' : String(c.v));
        // Com cabeçalho em várias linhas o Google junta o texto delas ("6.977,65 HÁ TOTAL"): fica só o nome da coluna
        const rotulo = l => String(l || '').replace(/^(\s*-?[\d.,]+%?\s+)+/, '').trim();
        resolve([t.cols.map(c => rotulo(c.label)), ...t.rows.map(r => (r.c || []).map(valor))]);
      };
      script.onerror = () => { limpar(); reject(new Error('o navegador bloqueou o acesso ao Google')); };
      script.src = `https://docs.google.com/spreadsheets/d/${planilha}/gviz/tq?tqx=out:json;responseHandler:${nome}&gid=${gid}${cabecalho === false || cabecalho == null ? '' : `&headers=${cabecalho === true ? 1 : +cabecalho}`}&_=${Date.now()}`;
      document.head.appendChild(script);
    });
  }

  // Lê uma aba tentando, em ordem: servidor do site → CSV direto do Google → JSONP.
  // A última leitura boa fica salva no navegador para quando tudo falhar (sem internet, por exemplo).
  async function lerAba(planilha, gid, fresco, coluna = 'EQUIPE', cabecalho = false) {
    const tentativas = [];
    if (/^https?:$/.test(location.protocol)) tentativas.push(async () => lerCSV(await baixarTexto(`api/planilha?id=${planilha}&gid=${gid}${fresco ? '&fresco=1' : ''}`)));
    tentativas.push(async () => lerCSV(await baixarTexto(`https://docs.google.com/spreadsheets/d/${planilha}/export?format=csv&gid=${gid}`)));
    tentativas.push(() => lerViaJSONP(planilha, gid, cabecalho));
    const chaveCache = `fat:cache:${planilha}:${gid}`;
    let ultimoErro;
    for (const tentar of tentativas) {
      try {
        const linhas = await tentar();
        if (coluna && !linhas.some(l => l.some(c => chaveColuna(c) === coluna))) throw new Error(`aba sem a coluna ${coluna}`);
        if (!coluna && !linhas.length) throw new Error('aba vazia');
        try { localStorage.setItem(chaveCache, JSON.stringify({ quando: Date.now(), linhas })); } catch { /* sem espaço: segue sem cache */ }
        return linhas;
      } catch (e) { ultimoErro = e; }
    }
    try {
      const salvo = JSON.parse(localStorage.getItem(chaveCache) || 'null');
      if (salvo?.linhas) { usandoCache = Math.min(usandoCache || Infinity, salvo.quando); return salvo.linhas; }
    } catch { /* sem cache */ }
    throw ultimoErro;
  }

  async function baixarTexto(url) {
    const r = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const texto = await r.text();
    if (/^\s*</.test(texto)) throw new Error('resposta não é CSV');
    return texto;
  }

  // "R$ 1.234,56" → 1234.56 · "85,3%" → 0.853 · vazio, "-" ou erro (#N/A, #REF!, #DIV/0!) → 0
  function num(valor) {
    if (valor == null) return 0;
    let t = String(valor).replace(/ /g, ' ').trim();
    if (!t || t === '-' || t.startsWith('#')) return 0;
    const pct = t.includes('%');
    const negativo = t.includes('-') || /^\(.*\)$/.test(t); // "-R$ 1.234,56", "R$ -1.234" ou "(1.234)"
    t = t.replace(/[R$%\s()+-]/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    if (!Number.isFinite(n)) return 0;
    return (negativo ? -n : n) / (pct ? 100 : 1);
  }
  const dataBR = t => { const m = String(t).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };

  // Uma função de carregamento por aba
  const carregarAba = async (gid, fresco) => paraObjetos(await lerAba(F.planilha, gid, fresco));
  const carregarFaturamento = (pessoa, fresco) => carregarAba(F.abas[pessoa], fresco);
  const carregarDiario = fresco => carregarAba(F.abas.diario, fresco);
  const carregarFrota = fresco => carregarAba(F.abas.frota, fresco);
  const carregarEstrutura = async fresco => paraObjetos(await lerAba(F.estrutura.planilha, F.estrutura.gid, fresco));

  // Todas as abas de uma vez. Pedidos repetidos dentro de 5 minutos reaproveitam o mesmo resultado.
  let ultimo = null;
  function obterDados({ fresco = false } = {}) {
    if (!fresco && ultimo && Date.now() - ultimo.quando < F.atualizarACadaMin * 60_000) return ultimo.promessa;
    usandoCache = null;
    const tarefas = {
      anderson: () => carregarFaturamento('anderson', fresco), carina: () => carregarFaturamento('carina', fresco),
      juliano: () => carregarFaturamento('juliano', fresco), joyce: () => carregarFaturamento('joyce', fresco),
      diario: () => carregarDiario(fresco), frota: () => carregarFrota(fresco), estrutura: () => carregarEstrutura(fresco)
    };
    const promessa = Promise.allSettled(Object.values(tarefas).map(f => f())).then(res => {
      const dados = {}, erros = {};
      Object.keys(tarefas).forEach((k, i) => {
        if (res[i].status === 'fulfilled') dados[k] = res[i].value;
        else { erros[k] = res[i].reason; console.warn(`Planilhas: falha ao carregar ${k}`, res[i].reason); }
      });
      return { dados, erros, usandoCache, quando: new Date() };
    });
    ultimo = { quando: Date.now(), promessa };
    promessa.then(r => { if (Object.keys(r.erros).length === 7) ultimo = null; }); // tudo falhou: tenta de novo no próximo pedido
    return promessa;
  }

  // Leitura genérica de qualquer aba permitida (usada pela Qualidade)
  const lerPlanilha = async (planilha, gid, { fresco = false, coluna = 'EQUIPE', cabecalho = false } = {}) => paraObjetos(await lerAba(planilha, gid, fresco, coluna, cabecalho), coluna);
  // Aba sem linha de cabeçalho: devolve as linhas cruas (as colunas são lidas pela posição)
  const lerLinhas = (planilha, gid, { fresco = false } = {}) => lerAba(planilha, gid, fresco, null, 0);
  const avisoCache = () => usandoCache;

  // Período de apontamento (regra única do Faturamento e da Produção Realizada):
  // vale o ANO e o RF escritos na própria linha da base, não o mês civil da data
  // (ex.: um apontamento de 26/09/2026 pode pertencer ao RF 10/2026).
  const periodo = {
    atual: () => { const h = new Date(); return { ano: h.getFullYear(), rf: h.getMonth() + 1 }; },   // outubro → RF10
    doPeriodo: (linha, ano, rf) => num(linha.ANO) === ano && num(linha.RF) === rf,
    rotulo: (ano, rf) => `${ano} · RF${String(rf).padStart(2, '0')}`
  };

  // Atividades: normalização ("Replantio(D)" e "REPLANTIO" → "REPLANTIO") e grupo pelas regras de dados.js
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const atividades = {
    normalizar: t => semAcento(t).toUpperCase().replace(/\s+/g, ' ').trim().replace(/\s*\(D\)$/, '').trim(),
    grupo(ativNormalizada) {
      const grupos = window.SMA_DADOS?.PRODUCAO?.realizada?.grupos || [];
      for (const g of grupos) {
        if (!g.contem.length) continue;
        if (g.excetoInicio?.some(x => ativNormalizada.startsWith(x))) continue;
        if (g.exceto?.some(x => ativNormalizada.includes(x))) continue;
        if (g.contem.some(x => ativNormalizada.includes(x))) return g;
      }
      return grupos.find(g => !g.contem.length) || { nome: 'Outros', cor: '#64748b', contem: [] };
    }
  };

  window.SMA_PLANILHAS = { obterDados, lerPlanilha, lerLinhas, avisoCache, lerCSV, num, dataBR, chaveColuna, periodo, atividades, carregarFaturamento, carregarDiario, carregarFrota, carregarEstrutura };
})();