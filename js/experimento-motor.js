/* ==========================================================================
   SMA · Silvicultura — Experimento: motor de análise
   1) Bases: lê as mesmas planilhas dos painéis e normaliza em registros com nomes de campo padronizados
   2) Catálogo: nome, campos, tipos, valores distintos e chaves de cruzamento (é o que vai para a IA)
   3) Especificação: valida o JSON (vindo da IA ou do intérprete local)
   4) Execução: filtros, período, agrupamento, agregações, cruzamento entre bases, calculadas, ordem, limite
   5) Intérprete local: entende pedidos comuns em português quando a IA do servidor não está ligada
   6) Análise local: texto analítico a partir apenas dos números calculados
   ========================================================================== */

(() => {
  const P = window.SMA_PLANILHAS, D = window.SMA_DADOS;
  if (!P || !D) return;
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const norm = t => semAcento(t).toLowerCase().replace(/\s+/g, ' ').trim();
  const limparNome = t => String(t || '').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  const valorOuNulo = v => { const t = String(v ?? '').trim(); return (!t || t === '-' || t.startsWith('#')) ? null : P.num(t); };

  /* ======================================================================
     1. BASES
     ====================================================================== */
  // Cada campo: tipo (texto | numero | data), unidade (ha, R$, %, nota, dias…) e descrição curta
  const BASES = {
    pgo: {
      nome: 'Apontamentos PGO (produção realizada)', descricao: 'Cada linha é um apontamento de campo: área feita por equipe, atividade, fazenda e UP, com valor em R$.',
      campos: {
        ANO: ['numero'], RF: ['numero'], PERIODO: ['texto', '', 'Ano · RF (período de apontamento)'], DATA: ['data'], MES: ['texto', '', 'aaaa-mm'],
        FAZENDA: ['texto'], UP: ['texto'], EQUIPE: ['texto'], SUPERVISOR: ['texto', '', 'supervisor da equipe (planilha de estrutura)'], TIPO_EQUIPE: ['texto'],
        ATIVIDADE: ['texto', '', 'atividade normalizada (sem acento, sem "(D)")'], GRUPO_ATIVIDADE: ['texto'],
        AREA: ['numero', 'ha', 'área apontada'], TARIFA: ['numero', 'R$/ha'], VALOR: ['numero', 'R$', 'valor do apontamento (área × tarifa)'], COLABORADORES: ['numero']
      }
    },
    faturamento: {
      nome: 'Faturamento por equipe (mensal)', descricao: 'Uma linha por equipe e RF: produzido, negociação, total, metas e aderência.',
      campos: {
        ANO: ['numero'], RF: ['numero'], PERIODO: ['texto'], EQUIPE: ['texto'], SUPERVISOR: ['texto'],
        PRODUZIDO: ['numero', 'R$'], NEGOCIACAO: ['numero', 'R$'], TOTAL: ['numero', 'R$', 'faturamento total'], META_MENSAL: ['numero', 'R$'], META_ACUMULADA: ['numero', 'R$'],
        ADERENCIA: ['numero', '%', 'total ÷ meta acumulada'], VALORES_A_NEGOCIAR: ['numero', 'R$'], DIAS_UTEIS: ['numero', 'dias'], DIAS_PRODUZIDOS: ['numero', 'dias']
      }
    },
    faturamento_diario: {
      nome: 'Faturamento diário por equipe', descricao: 'Uma linha por equipe e dia: produção, negociações, total e meta diária.',
      campos: {
        ANO: ['numero'], RF: ['numero'], PERIODO: ['texto'], DATA: ['data'], MES: ['texto'], EQUIPE: ['texto'], SUPERVISOR: ['texto'],
        PRODUCAO: ['numero', 'R$'], NEGOCIACOES: ['numero', 'R$'], TOTAL: ['numero', 'R$'], META_DIARIA: ['numero', 'R$'], DELTA: ['numero', 'R$', 'total − meta diária']
      }
    },
    frota: {
      nome: 'Produção diária por frota (máquina)', descricao: 'Uma linha por máquina e dia: produção em R$ e meta diária.',
      campos: { ANO: ['numero'], RF: ['numero'], PERIODO: ['texto'], DATA: ['data'], MES: ['texto'], EQUIPE: ['texto'], SUPERVISOR: ['texto'], FROTA: ['texto', '', 'número da máquina'], PRODUCAO: ['numero', 'R$'], META_DIARIA: ['numero', 'R$'], DELTA: ['numero', 'R$'] }
    },
    estrutura: {
      nome: 'Estrutura das equipes', descricao: 'Recursos de cada equipe por RF: colaboradores, tratores, caminhões…',
      campos: { RF: ['numero'], SUPERVISOR: ['texto'], EQUIPE: ['texto'], ESTRUTURA: ['texto', '', 'tipo de recurso'], QUANTIDADE: ['numero'] }
    },
    qualidade: {
      nome: 'Qualidade · avaliações de campo', descricao: 'Avaliações de 45/60/90/120 dias por UP: nota final e uniformidade.',
      campos: { ANO: ['numero'], DATA: ['data'], MES: ['texto'], FAZENDA: ['texto'], UP: ['texto'], MONITORAMENTO: ['texto'], AVALIADOR: ['texto'], NOTA_FINAL: ['numero', 'nota', '0 a 10'], NOTA_UNIFORMIDADE: ['numero', 'nota'], CV_ALTURA: ['numero', '%', 'variação de altura das mudas na UP'] }
    },
    base_ups: {
      nome: 'Base de UPs', descricao: 'Cadastro das UPs: área, idade, plantio, material genético e mês avaliatório.',
      campos: { FAZENDA: ['texto'], UP: ['texto'], AREA_UP: ['numero', 'ha', 'área da UP'], IDADE: ['numero', 'dias'], PLANTIO: ['data'], MATERIAL: ['texto'], MES_AVALIATORIO: ['texto'] }
    },
    programacao: {
      nome: 'Calendário / programação de atividades', descricao: 'Planejamento: área e tarifa por fazenda, UP e atividade.',
      campos: { RF: ['numero'], FAZENDA: ['texto'], UP: ['texto'], ATIVIDADE: ['texto'], GRUPO_ATIVIDADE: ['texto'], AREA: ['numero', 'ha'], TARIFA: ['numero', 'R$/ha'], VALOR: ['numero', 'R$', 'área × tarifa'] }
    },
    rh: {
      nome: 'RH · colaboradores', descricao: 'Uma linha por colaborador e mês de referência: chapa, função, equipe, modalidade, situação e tempo de casa.',
      campos: {
        MES_REFERENCIA: ['texto', '', 'mês da lista de colaboradores (ex.: ABRIL)'], CHAPA: ['texto'], COLABORADOR: ['texto', '', 'nome completo'],
        SITUACAO: ['texto', '', 'ATIVO, AFASTADO…'], FUNCAO: ['texto'], EQUIPE: ['texto', '', 'código da equipe (ex.: BA), igual às outras bases'],
        NOME_EQUIPE: ['texto', '', 'nome do líder/equipe'], MODALIDADE: ['texto', '', 'MANUAL, SEMI-MECANIZADA, MECANIZADO, APOIO'], SUBCONTRATO: ['texto'],
        ADMISSAO: ['data'], ANOS_DE_CASA: ['numero', 'anos', 'tempo de casa em anos']
      }
    },
    ssqv: {
      nome: 'Segurança · notas SSQV', descricao: 'Nota mensal de Segurança, Saúde e Qualidade de Vida (maior é melhor; meta em SEGURANCA.ssqv.META_NOTA). RF = número do mês.',
      campos: { ANO: ['numero'], RF: ['numero', '', 'número do mês (1 a 12)'], PERIODO: ['texto'], MES_NOME: ['texto', '', 'nome do mês'], NOTA: ['numero', 'nota', 'nota SSQV do mês'], META: ['numero', 'nota', 'meta mensal'], DIFERENCA_META: ['numero', 'nota', 'nota − meta'] }
    }
  };
  const CHAVES = ['FAZENDA', 'UP', 'EQUIPE', 'SUPERVISOR', 'ATIVIDADE', 'GRUPO_ATIVIDADE', 'DATA', 'MES', 'ANO', 'RF', 'PERIODO'];
  const rotuloPeriodo = (ano, rf) => `${ano} · RF${String(rf).padStart(2, '0')}`;
  const mesDe = d => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '');
  const comPeriodo = o => { if (o.ANO && o.RF) o.PERIODO = rotuloPeriodo(o.ANO, o.RF); if (o.DATA) o.MES = mesDe(o.DATA); return o; };

  const dados = {};   // id da base → registros
  const erros = {};
  let carregadoEm = null;

  // Planilha de onde vem cada base (a de apontamentos PGO é grande: só é baixada quando precisa)
  const GRUPO_DA_BASE = { faturamento: 'fat', faturamento_diario: 'fat', frota: 'fat', estrutura: 'fat', pgo: 'pgo', qualidade: 'qual', base_ups: 'ups', programacao: 'prog', rh: 'rh', ssqv: 'ssqv' };
  const PULAR = Symbol('pular');
  // apenas: lista de ids de base (sem ela, carrega todas). As demais bases ficam como estavam.
  async function carregarBases(fresco = false, apenas = null) {
    const R = D.PRODUCAO.realizada, Q = D.QUALIDADE, PR = D.PRODUCAO, RH = D.RH, SS = D.SEGURANCA?.ssqv;
    const alvo = apenas ? Object.keys(BASES).filter(k => apenas.includes(k)) : Object.keys(BASES);
    const grupos = new Set(alvo.map(k => GRUPO_DA_BASE[k]));
    if (grupos.has('pgo')) grupos.add('fat');   // o supervisor das equipes vem da estrutura
    const se = (g, f) => (grupos.has(g) ? f() : Promise.resolve(PULAR));
    const [fat, pgo, qual, ups, prog, rh, ssqv] = await Promise.allSettled([
      se('fat', () => P.obterDados({ fresco })),
      se('pgo', () => P.lerPlanilha(R.planilha, R.aba, { fresco, coluna: 'AREA APONTADA' })),
      se('qual', () => P.lerPlanilha(Q.planilha, Q.abas.avaliacoes, { fresco, coluna: 'UP', cabecalho: true })),
      se('ups', () => P.lerPlanilha(Q.planilha, Q.abas.ups, { fresco, coluna: 'UP', cabecalho: true })),
      se('prog', () => P.lerPlanilha(PR.planilha, PR.aba, { fresco, coluna: 'FAZENDA', cabecalho: true })),
      se('rh', () => (RH ? P.lerPlanilha(RH.planilha, RH.aba, { fresco, coluna: 'CHAPA', cabecalho: true }) : Promise.reject(new Error('sem RH')))),
      se('ssqv', () => (SS ? P.lerPlanilha(SS.planilha, SS.aba, { fresco, coluna: 'NOTA', cabecalho: true }) : Promise.reject(new Error('sem SSQV'))))
    ]);
    const pulou = r => r.status === 'fulfilled' && r.value === PULAR;
    const recarregadas = Object.keys(BASES).filter(k => grupos.has(GRUPO_DA_BASE[k]));
    recarregadas.forEach(k => { dados[k] = []; delete erros[k]; });
    // bases fora do pedido: mantém o que já havia
    [[fat, ['faturamento', 'faturamento_diario', 'frota', 'estrutura']], [pgo, ['pgo']], [qual, ['qualidade']], [ups, ['base_ups']], [prog, ['programacao']], [rh, ['rh']], [ssqv, ['ssqv']]]
      .forEach(([r, ks]) => { if (pulou(r)) ks.forEach(k => { dados[k] ||= []; }); });

    // Supervisor de cada equipe por RF (estrutura); sem o RF, o mais recente
    const est = fat.status === 'fulfilled' && !pulou(fat) ? (fat.value.dados.estrutura || []) : [];
    const supPorRF = new Map(), supAtual = new Map();
    est.forEach(e => { const rf = P.num(e.RF); supPorRF.set(`${e.EQUIPE}|${rf}`, e.SUPERVISOR); if (!supAtual.has(e.EQUIPE) || rf >= supAtual.get(e.EQUIPE)[1]) supAtual.set(e.EQUIPE, [e.SUPERVISOR, rf]); });
    const supervisor = (eq, rf, daLinha) => daLinha || supPorRF.get(`${eq}|${rf}`) || supAtual.get(eq)?.[0] || '';

    if (pulou(fat)) { /* fora do pedido */ } else if (fat.status === 'fulfilled') {
      const F = fat.value.dados;
      dados.faturamento = (F.anderson || []).filter(l => l.EQUIPE).map(l => comPeriodo({
        ANO: P.num(l.ANO), RF: P.num(l.RF), EQUIPE: l.EQUIPE, SUPERVISOR: supervisor(l.EQUIPE, P.num(l.RF), l.SUPERVISOR),
        PRODUZIDO: P.num(l.PRODUZIDO), NEGOCIACAO: P.num(l.NEGOCIACAO), TOTAL: P.num(l.TOTAL), META_MENSAL: P.num(l['META MENSAL']), META_ACUMULADA: P.num(l['META ACUMULADA']),
        ADERENCIA: P.num(l.ADERENCIA) * 100, VALORES_A_NEGOCIAR: P.num(l['VALORES A SEREM NEGOCIADOS']), DIAS_UTEIS: P.num(l['D.U']), DIAS_PRODUZIDOS: P.num(l['D.P'])
      }));
      dados.faturamento_diario = (F.diario || []).filter(l => l.EQUIPE && l.DIA).map(l => comPeriodo({
        ANO: P.num(l.ANO), RF: P.num(l.RF), DATA: P.dataBR(l.DIA), EQUIPE: l.EQUIPE, SUPERVISOR: supervisor(l.EQUIPE, P.num(l.RF)),
        PRODUCAO: P.num(l.PRODUCAO), NEGOCIACOES: P.num(l.NEGOCIACOES), TOTAL: P.num(l.TOTAL), META_DIARIA: P.num(l['META DIARIA']), DELTA: P.num(l.DELTA)
      }));
      dados.frota = (F.frota || []).filter(l => l.FROTA && l.DIA).map(l => comPeriodo({
        ANO: P.num(l.ANO), RF: P.num(l.RF), DATA: P.dataBR(l.DIA), EQUIPE: l.EQUIPE, SUPERVISOR: supervisor(l.EQUIPE, P.num(l.RF)), FROTA: String(l.FROTA),
        PRODUCAO: P.num(l.PRODUCAO), META_DIARIA: P.num(l['META DIARIA']), DELTA: P.num(l.DELTA)
      }));
      dados.estrutura = est.filter(e => e.EQUIPE).map(e => ({ RF: P.num(e.RF), SUPERVISOR: e.SUPERVISOR, EQUIPE: e.EQUIPE, ESTRUTURA: e.ESTRUTURA, QUANTIDADE: P.num(e.TOTAL) }));
    } else ['faturamento', 'faturamento_diario', 'frota', 'estrutura'].forEach(k => { erros[k] = fat.reason; });

    if (pulou(pgo)) { /* fora do pedido */ } else if (pgo.status === 'fulfilled') {
      dados.pgo = pgo.value.filter(l => (l.ATIVIDADE || '').trim() && (l.DATA || '').trim()).map(l => {
        const ativ = P.atividades.normalizar(l.ATIVIDADE), area = P.num(l['AREA APONTADA']), tarifa = P.num(l.TARIFA);
        const ano = P.num(l.ANO), rf = P.num(l.RF), equipe = (l.EQUIPE || '').trim();
        return comPeriodo({
          ANO: ano, RF: rf, DATA: P.dataBR(l.DATA), FAZENDA: limparNome(l.FAZENDA), UP: (l.UP || '').trim(), EQUIPE: equipe, SUPERVISOR: supervisor(equipe, rf),
          TIPO_EQUIPE: (l['TIPO DE EQUIPE'] || '').trim(), ATIVIDADE: ativ, GRUPO_ATIVIDADE: P.atividades.grupo(ativ).nome,
          AREA: area, TARIFA: tarifa, VALOR: P.num(l.TOTAL) || area * tarifa, COLABORADORES: P.num(l.COLABORADORES)
        });
      });
    } else erros.pgo = pgo.reason;

    if (pulou(qual)) { /* fora do pedido */ } else if (qual.status === 'fulfilled') {
      dados.qualidade = qual.value.filter(l => l.UP && !/^teste$/i.test((l.USUARIO || '').trim())).map(l => {
        const d = P.dataBR(l.DATA);
        return comPeriodo({ ANO: d ? d.getFullYear() : null, DATA: d, FAZENDA: limparNome(l.FAZENDA), UP: l.UP.trim(), MONITORAMENTO: (l.MONITORAMENTO || '').trim(), AVALIADOR: (l.USUARIO || '').trim(),
          NOTA_FINAL: valorOuNulo(l['NOTA FINAL']), NOTA_UNIFORMIDADE: valorOuNulo(l['NOTA DE UNIF.']), CV_ALTURA: valorOuNulo(l['UP_CV H']) });
      });
    } else erros.qualidade = qual.reason;

    if (pulou(ups)) { /* fora do pedido */ } else if (ups.status === 'fulfilled') {
      dados.base_ups = ups.value.filter(l => l.UP).map(l => ({ FAZENDA: limparNome(l.FAZENDA), UP: l.UP.trim(), AREA_UP: P.num(l.AREA), IDADE: P.num(l.IDADE), PLANTIO: P.dataBR(l.PLANTIO), MATERIAL: (l.MATERIAL || '').trim(), MES_AVALIATORIO: (l['MES AVALIATORIO'] || '').trim() }));
    } else erros.base_ups = ups.reason;

    if (pulou(prog)) { /* fora do pedido */ } else if (prog.status === 'fulfilled') {
      dados.programacao = prog.value.filter(l => l.FAZENDA && l.UP).map(l => {
        const ativ = P.atividades.normalizar(l.ATIVIDADE || ''), area = P.num(l.AREA), tarifa = P.num(l.TARIFA);
        return { RF: P.num(l.RF), FAZENDA: limparNome(l.FAZENDA), UP: l.UP.trim(), ATIVIDADE: ativ, GRUPO_ATIVIDADE: P.atividades.grupo(ativ).nome, AREA: area, TARIFA: tarifa, VALOR: area * tarifa };
      });
    } else erros.programacao = prog.reason;

    if (pulou(rh)) { /* fora do pedido */ } else if (rh.status === 'fulfilled') {
      const hoje = new Date();
      dados.rh = rh.value.filter(l => (l.COLABORADOR || '').trim()).map(l => {
        const cod = limparNome(l['COD. EQUIPE']), adm = P.dataBR(l.ADMISSAO);
        return {
          MES_REFERENCIA: limparNome(l.MES).toUpperCase(), CHAPA: (l.CHAPA || '').trim(), COLABORADOR: limparNome(l.COLABORADOR),
          SITUACAO: limparNome(l.SITUACAO).toUpperCase(), FUNCAO: limparNome(l.FUNCAO), EQUIPE: (cod.split(/\s*-\s*/).slice(1).join(' - ') || cod).trim(),
          NOME_EQUIPE: limparNome(l.EQUIPE), MODALIDADE: limparNome(l['MODALIDADE EQP.']).toUpperCase(), SUBCONTRATO: limparNome(l.SUBCONTRATO),
          ADMISSAO: adm, ANOS_DE_CASA: adm ? Math.round((hoje - adm) / (365.2425 * 864e5) * 10) / 10 : null
        };
      });
    } else erros.rh = rh.reason;

    if (pulou(ssqv)) { /* fora do pedido */ } else if (ssqv.status === 'fulfilled') {
      const NOMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const mesNum = v => { const x = norm(v); if (/^\d{1,2}$/.test(x)) return +x; const i = NOMES.findIndex(n => x.length >= 3 && norm(n).startsWith(x.slice(0, 3))); return i >= 0 ? i + 1 : null; };
      dados.ssqv = ssqv.value.map(l => ({ ANO: P.num(l.ANO), RF: mesNum(l.MES), txt: String(l.NOTA ?? '').trim() })).filter(l => l.ANO && l.RF && l.txt && l.txt !== '-')
        .map(l => { const nota = P.num(l.txt), meta = SS.META_NOTA; return comPeriodo({ ANO: l.ANO, RF: l.RF, MES_NOME: NOMES[l.RF - 1], NOTA: nota, META: meta, DIFERENCA_META: nota - meta }); });
    } else erros.ssqv = ssqv.reason;

    // Nomes de fazenda iguais com/sem acento viram uma grafia só (a acentuada)
    const grafias = new Map();
    Object.values(dados).forEach(l => l.forEach(r => { if (r.FAZENDA) { const k = norm(r.FAZENDA), g = grafias.get(k) || grafias.set(k, new Map()).get(k); g.set(r.FAZENDA, (g.get(r.FAZENDA) || 0) + 1); } }));
    const acentos = t => (t.normalize('NFD').match(/[̀-ͯ]/g) || []).length;
    const melhor = new Map([...grafias].map(([k, g]) => [k, [...g].sort((a, b) => acentos(b[0]) - acentos(a[0]) || b[1] - a[1])[0][0]]));
    Object.values(dados).forEach(l => l.forEach(r => { if (r.FAZENDA) r.FAZENDA = melhor.get(norm(r.FAZENDA)) || r.FAZENDA; }));

    carregadoEm = new Date();
    return { dados, erros };
  }

  /* ======================================================================
     2. CATÁLOGO
     ====================================================================== */
  function catalogo() {
    return Object.entries(BASES).map(([id, b]) => {
      const linhas = dados[id] || [];
      return {
        id, nome: b.nome, descricao: b.descricao, linhas: linhas.length,
        campos: Object.entries(b.campos).map(([nome, [tipo, unidade, desc]]) => {
          const c = { nome, tipo };
          if (unidade) c.unidade = unidade;
          if (desc) c.descricao = desc;
          if (tipo === 'texto') {
            const cont = new Map(); linhas.forEach(r => { const v = r[nome]; if (v) cont.set(v, (cont.get(v) || 0) + 1); });
            c.distintos = cont.size;
            c.valores = [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(x => x[0]);
          } else if (tipo === 'numero') {
            const vs = linhas.map(r => r[nome]).filter(v => v != null && Number.isFinite(v));
            if (vs.length) { c.min = Math.min(...vs); c.max = Math.max(...vs); }
          } else if (tipo === 'data') {
            const vs = linhas.map(r => r[nome]).filter(Boolean).map(d => d.getTime());
            if (vs.length) { c.de = new Date(Math.min(...vs)).toLocaleDateString('pt-BR'); c.ate = new Date(Math.max(...vs)).toLocaleDateString('pt-BR'); }
          }
          return c;
        }),
        chaves: CHAVES.filter(k => k in b.campos)
      };
    });
  }
  // Versão enxuta para a IA (sem valores longos demais)
  const catalogoParaIA = () => catalogo().map(b => ({ ...b, campos: b.campos.map(c => (c.valores ? { ...c, valores: c.valores.slice(0, c.nome === 'ATIVIDADE' ? 50 : 30) } : c)) }));
  const campoDe = (base, campo) => BASES[base]?.campos[campo];

  /* ======================================================================
     3. ESPECIFICAÇÃO: VALIDAÇÃO
     ====================================================================== */
  const TIPOS = ['barra', 'barra_horizontal', 'linha', 'area', 'pizza', 'rosca', 'dispersao', 'combinado', 'mapa_calor', 'treemap', 'funil', 'gauge', 'kpi', 'tabela', 'ranking'];
  const AGREGACOES = ['soma', 'media', 'contagem', 'contagem_distinta', 'dias_distintos', 'min', 'max'];
  const OPERADORES = ['=', '!=', '>', '<', '>=', '<=', 'entre', 'contem', 'em', 'nao_em'];

  function validar(e) {
    const prob = [];
    if (!e || typeof e !== 'object') return { ok: false, problemas: ['A especificação veio vazia.'] };
    const esp = JSON.parse(JSON.stringify(e));
    esp.tipo = TIPOS.includes(esp.tipo) ? esp.tipo : 'barra';
    esp.agrupar_por = (esp.agrupar_por || []).filter(Boolean).map(String);
    esp.metricas = (esp.metricas || []).map((m, i) => ({ id: m.id || `m${i + 1}`, ...m }));
    esp.calculadas = esp.calculadas || [];
    esp.filtros = esp.filtros || [];
    if (!esp.metricas.length) prob.push('Nenhuma métrica foi definida (o que medir? área, faturamento, nota…).');
    esp.metricas.forEach(m => {
      if (!BASES[m.fonte]) { prob.push(`A base "${m.fonte}" não existe.`); return; }
      if (!AGREGACOES.includes(m.agregacao)) prob.push(`Agregação "${m.agregacao}" não suportada.`);
      if (!['contagem', 'dias_distintos'].includes(m.agregacao)) {
        const c = campoDe(m.fonte, m.campo);
        if (!c) prob.push(`O campo "${m.campo}" não existe em ${BASES[m.fonte].nome}.`);
        else if (['soma', 'media', 'min', 'max'].includes(m.agregacao) && c[0] !== 'numero') prob.push(`"${m.campo}" é ${c[0]} e não pode ser somado/medido.`);
      }
      if (m.agregacao === 'dias_distintos' && !campoDe(m.fonte, 'DATA')) prob.push(`${BASES[m.fonte].nome} não tem datas para contar dias.`);
      esp.agrupar_por.forEach(g => { if (BASES[m.fonte] && !campoDe(m.fonte, g)) prob.push(`Não dá para agrupar ${BASES[m.fonte].nome} por "${g}" (campo inexistente nessa base).`); });
    });
    const ids = new Set(esp.metricas.map(m => m.id));
    esp.calculadas.forEach(c => {
      c.id = c.id || c.nome;
      try { variaveis(c.formula).forEach(v => { if (!ids.has(v)) prob.push(`A fórmula "${c.formula}" usa "${v}", que não é uma métrica.`); }); }
      catch (erro) { prob.push(`Fórmula inválida: ${c.formula} (${erro.message})`); }
      ids.add(c.id);
    });
    const fontes = [...new Set(esp.metricas.map(m => m.fonte))];
    esp.fontes = fontes;
    esp.filtros.forEach(f => {
      if (!OPERADORES.includes(f.operador)) prob.push(`Operador "${f.operador}" não suportado.`);
      if (!fontes.some(b => campoDe(b, f.campo))) prob.push(`O filtro usa "${f.campo}", que não existe nas bases usadas.`);
    });
    if (esp.ordenar && !ids.has(esp.ordenar.campo) && !esp.agrupar_por.includes(esp.ordenar.campo)) esp.ordenar = null;
    esp.eixos = esp.eixos || {};
    esp.eixos.x = esp.agrupar_por.includes(esp.eixos.x) ? esp.eixos.x : esp.agrupar_por[0];
    esp.eixos.serie = esp.agrupar_por.includes(esp.eixos.serie) && esp.eixos.serie !== esp.eixos.x ? esp.eixos.serie : (esp.agrupar_por.find(g => g !== esp.eixos.x) || null);
    esp.eixos.y = (esp.eixos.y || []).filter(y => ids.has(y));
    if (!esp.eixos.y.length) esp.eixos.y = [...(esp.calculadas.length ? esp.calculadas.map(c => c.id) : esp.metricas.map(m => m.id))];
    if (['mapa_calor'].includes(esp.tipo) && esp.agrupar_por.length < 2) esp.tipo = 'barra';
    if (esp.tipo === 'dispersao' && esp.eixos.y.length < 2) esp.tipo = 'barra';
    esp.limite = Math.max(1, Math.min(500, +esp.limite || (['ranking', 'funil'].includes(esp.tipo) ? 10 : 200)));
    return { ok: !prob.length, problemas: [...new Set(prob)], especificacao: esp };
  }

  // Fórmulas simples: + − × ÷ e parênteses sobre ids de métricas (sem eval)
  function tokens(f) {
    const t = []; const re = /\s*(\d+(?:[.,]\d+)?|[A-Za-z_][\w]*|[-+*/()])\s*/y; let m;
    const s = String(f || '');
    while (re.lastIndex < s.length && (m = re.exec(s))) t.push(m[1]);
    if (re.lastIndex < s.length) throw new Error('caractere inválido');
    return t;
  }
  const variaveis = f => tokens(f).filter(x => /^[A-Za-z_]/.test(x));
  function calcularFormula(f, vals) {
    const t = tokens(f); let i = 0;
    const prim = () => {
      const x = t[i++];
      if (x === '(') { const v = expr(); i++; return v; }
      if (x === '-') return -prim();
      if (/^\d/.test(x)) return parseFloat(x.replace(',', '.'));
      return vals[x] ?? null;
    };
    const termo = () => { let v = prim(); while (t[i] === '*' || t[i] === '/') { const op = t[i++], d = prim(); v = v == null || d == null ? null : op === '*' ? v * d : (d === 0 ? null : v / d); } return v; };
    const expr = () => { let v = termo(); while (t[i] === '+' || t[i] === '-') { const op = t[i++], d = termo(); v = v == null || d == null ? null : op === '+' ? v + d : v - d; } return v; };
    return expr();
  }

  /* ======================================================================
     4. EXECUÇÃO
     ====================================================================== */
  // Lista de períodos (ano, rf) existentes até o período atual, em ordem
  function periodosExistentes() {
    const atual = P.periodo.atual(), set = new Map();
    ['pgo', 'faturamento', 'faturamento_diario'].forEach(b => (dados[b] || []).forEach(r => { if (r.ANO && r.RF) set.set(r.ANO * 100 + r.RF, [r.ANO, r.RF]); }));
    return [...set.entries()].filter(([k]) => k <= atual.ano * 100 + atual.rf).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }
  function filtroValor(f, v) {
    const alvo = f.valor;
    const comp = x => (typeof x === 'number' ? x : norm(x));
    const a = v instanceof Date ? v.getTime() : v;
    switch (f.operador) {
      case '=': return comp(a) === comp(alvo);
      case '!=': return comp(a) !== comp(alvo);
      case '>': return a > +alvo; case '<': return a < +alvo; case '>=': return a >= +alvo; case '<=': return a <= +alvo;
      case 'entre': return Array.isArray(alvo) && a >= +alvo[0] && a <= +alvo[1];
      case 'contem': return norm(v).includes(norm(alvo));
      case 'em': return (Array.isArray(alvo) ? alvo : [alvo]).some(x => comp(x) === comp(a));
      case 'nao_em': return !(Array.isArray(alvo) ? alvo : [alvo]).some(x => comp(x) === comp(a));
      default: return true;
    }
  }
  /**
   * global: { ano, rf (null = todos), fazendas: [], equipes: [] }
   * Retorna { colunas, dims, linhas: [{ chave: {dim: valor}, v: {id: número} }], notas: [] }
   */
  function executar(esp, global = {}) {
    const notas = [];
    let periodoSet = null;
    if (esp.periodo?.tipo === 'ultimos_rfs') {
      const lista = periodosExistentes().slice(-Math.max(1, +esp.periodo.n || 3));
      periodoSet = new Set(lista.map(([a, r]) => a * 100 + r));
      notas.push(`Período: ${lista.map(([a, r]) => rotuloPeriodo(a, r)).join(', ')} (pedido no texto; o filtro de RF do topo não se aplica).`);
    } else if (esp.periodo?.tipo === 'rf' && esp.periodo.ano && esp.periodo.rf) {
      periodoSet = new Set([esp.periodo.ano * 100 + esp.periodo.rf]);
      notas.push(`Período: ${rotuloPeriodo(esp.periodo.ano, esp.periodo.rf)} (pedido no texto).`);
    } else if (esp.periodo?.tipo === 'ano' && esp.periodo.ano) {
      periodoSet = { ano: +esp.periodo.ano };
      notas.push(`Período: ano ${esp.periodo.ano} inteiro (pedido no texto).`);
    }
    const linhasDe = base => (dados[base] || []).filter(r => {
      const temAno = 'ANO' in BASES[base].campos, temRF = 'RF' in BASES[base].campos;
      if (periodoSet instanceof Set) { if (temAno && temRF && !periodoSet.has(r.ANO * 100 + r.RF)) return false; }
      else if (periodoSet?.ano) { if (temAno && r.ANO !== periodoSet.ano) return false; }
      else {
        if (global.ano && temAno && r.ANO !== global.ano) return false;
        if (global.rf && temRF && r.RF !== global.rf) return false;
      }
      if (global.fazendas?.length && 'FAZENDA' in BASES[base].campos && !global.fazendas.includes(r.FAZENDA)) return false;
      if (global.equipes?.length && 'EQUIPE' in BASES[base].campos && !global.equipes.includes(r.EQUIPE)) return false;
      return esp.filtros.every(f => !(f.campo in BASES[base].campos) || filtroValor(f, r[f.campo]));
    });
    if (esp.fontes.some(b => !(('RF' in BASES[b].campos)))) {
      const sem = esp.fontes.filter(b => !('RF' in BASES[b].campos)).map(b => BASES[b].nome);
      if (sem.length && (global.rf || periodoSet)) notas.push(`${sem.join(', ')} não tem RF: o filtro de período não se aplica a ela.`);
    }

    const dims = esp.agrupar_por;
    const chaveTxt = r => dims.map(d => { const v = r[d]; return v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '—'); }).join('¦');
    const grupos = new Map();   // chave → { chave: {}, valores }
    esp.fontes.forEach(base => {
      const ms = esp.metricas.filter(m => m.fonte === base);
      const linhas = linhasDe(base);
      if (!linhas.length) notas.push(`${BASES[base].nome}: nenhum registro no filtro.`);
      const porChave = new Map();
      linhas.forEach(r => { const k = chaveTxt(r); (porChave.get(k) || porChave.set(k, []).get(k)).push(r); });
      porChave.forEach((rs, k) => {
        const g = grupos.get(k) || grupos.set(k, { chave: Object.fromEntries(dims.map(d => [d, rs[0][d]])), v: {} }).get(k);
        ms.forEach(m => { g.v[m.id] = agregar(rs, m); });
      });
    });
    let linhas = [...grupos.values()];
    linhas.forEach(l => esp.calculadas.forEach(c => { l.v[c.id] = calcularFormula(c.formula, l.v); }));
    // ordem
    const ord = esp.ordenar || (dims.some(d => ['DATA', 'MES', 'PERIODO', 'RF', 'ANO'].includes(d)) ? { campo: dims.find(d => ['DATA', 'MES', 'PERIODO', 'RF', 'ANO'].includes(d)), direcao: 'asc' } : { campo: esp.eixos.y[0], direcao: 'desc' });
    const val = (l, c) => (c in l.v ? l.v[c] : l.chave[c]);
    const ordKey = (l, c) => { const v = val(l, c); if (c === 'PERIODO' && typeof v === 'string') { const m = v.match(/(\d{4}) · RF(\d+)/); return m ? +m[1] * 100 + +m[2] : v; } return v instanceof Date ? v.getTime() : v; };
    linhas.sort((a, b) => {
      const x = ordKey(a, ord.campo), y = ordKey(b, ord.campo);
      if (x == null) return 1; if (y == null) return -1;
      const r = typeof x === 'string' ? x.localeCompare(y, 'pt-BR', { numeric: true }) : x - y;
      return ord.direcao === 'asc' ? r : -r;
    });
    // limite: com série, limita as categorias do eixo X pelo total
    if (esp.eixos.serie && dims.length > 1) {
      const tot = new Map();
      linhas.forEach(l => { const k = l.chave[esp.eixos.x]; tot.set(k, (tot.get(k) || 0) + (Number(l.v[esp.eixos.y[0]]) || 0)); });
      if (tot.size > esp.limite) {
        const manter = new Set([...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, esp.limite).map(x => x[0]));
        linhas = linhas.filter(l => manter.has(l.chave[esp.eixos.x]));
        notas.push(`Mostrando as ${esp.limite} maiores categorias de ${esp.eixos.x}.`);
      }
    } else if (linhas.length > esp.limite) { linhas = linhas.slice(0, esp.limite); }

    const colunas = [
      ...esp.metricas.map(m => ({ id: m.id, rotulo: m.rotulo || `${m.agregacao} de ${m.campo || 'registros'}`, formato: m.formato || formatoDe(m) })),
      ...esp.calculadas.map(c => ({ id: c.id, rotulo: c.rotulo || c.nome || c.id, formato: c.formato || 'num' }))
    ];
    return { dims, colunas, linhas, notas, total: linhas.length };
  }
  function agregar(rs, m) {
    const vals = () => rs.map(r => r[m.campo]).filter(v => v != null && Number.isFinite(v));
    switch (m.agregacao) {
      case 'soma': return vals().reduce((s, v) => s + v, 0);
      case 'media': { const v = vals(); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; }
      case 'min': { const v = vals(); return v.length ? Math.min(...v) : null; }
      case 'max': { const v = vals(); return v.length ? Math.max(...v) : null; }
      case 'contagem': return rs.length;
      case 'contagem_distinta': return new Set(rs.map(r => { const v = r[m.campo]; return v instanceof Date ? v.getTime() : v; }).filter(v => v != null && v !== '')).size;
      case 'dias_distintos': return new Set(rs.map(r => r.DATA?.getTime()).filter(Boolean)).size;
      default: return null;
    }
  }
  function formatoDe(m) {
    if (['contagem', 'contagem_distinta'].includes(m.agregacao)) return 'int';
    if (m.agregacao === 'dias_distintos') return 'dias';
    const u = campoDe(m.fonte, m.campo)?.[1];
    return u === 'ha' ? 'ha' : u === 'R$' ? 'brl' : u === '%' ? 'pct' : u === 'nota' ? 'nota' : u === 'dias' ? 'dias' : 'num';
  }
  const FORMATOS = {
    ha: v => `${n2(v)} ha`, brl: v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), pct: v => `${n1(v)}%`,
    nota: v => n2(v), dias: v => `${Math.round(v ?? 0).toLocaleString('pt-BR')} dias`, int: v => Math.round(v ?? 0).toLocaleString('pt-BR'),
    num: v => n2(v), ha_dia: v => `${n2(v)} ha/dia`
  };
  function n2(v) { return v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function n1(v) { return v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  const formatar = (v, f) => (v == null || (typeof v === 'number' && !Number.isFinite(v)) ? '—' : (FORMATOS[f] || FORMATOS.num)(v));
  const formatarChave = v => (v instanceof Date ? v.toLocaleDateString('pt-BR') : String(v ?? '—'));

  /* ======================================================================
     5. INTÉRPRETE LOCAL (sem IA)
     ====================================================================== */
  const DIMENSOES = [
    [/\b(por|cada|entre)\s+(as\s+|os\s+)?equipes?\b|\bequipes\b/, 'EQUIPE'],
    [/\bpor\s+(o\s+|os\s+)?supervisor(es|a|as)?\b|\bsupervisor(es|as)\b/, 'SUPERVISOR'],
    [/\b(por|cada)\s+(as\s+)?fazendas?\b|\bfazendas\b/, 'FAZENDA'],
    [/\b(por|cada)\s+(as\s+)?ups?\b|\b(as|das)\s+ups\b/, 'UP'],
    [/\bpor\s+grupos?\b|\bgrupos?\s+de\s+atividade/, 'GRUPO_ATIVIDADE'],
    [/\b(por|cada)\s+(as\s+)?atividades?\b|\batividades\b/, 'ATIVIDADE'],
    [/\b(melhor|pior|maior|menor) mes\b|\bqual (foi )?o mes\b|\bpor\s+(o\s+|os\s+)?(rf|rfs|periodos?|mes|meses)\b|\b(rfs|ao longo|evolucao|tendencia|mensal|mes a mes|cada mes)\b/, 'PERIODO'],
    [/\bpor\s+dia\b|\bdiari[oa]\b|\bdia a dia\b/, 'DATA'],
    [/\bpor\s+(a\s+)?frotas?\b|\bmaquinas?\b|\bfrotas?\b/, 'FROTA'],
    [/\bpor\s+avaliador(es)?\b|\bavaliador(es)?\b/, 'AVALIADOR'],
    [/\bpor\s+monitoramentos?\b|\bmonitoramentos?\b/, 'MONITORAMENTO'],
    [/\bpor\s+material\b|\bmaterial genetico\b/, 'MATERIAL'],
    [/\bpor\s+estrutura\b|\brecursos?\b/, 'ESTRUTURA'],
    [/\b(por|cada)\s+(a\s+)?func(ao|oes)\b|\bfuncoes\b|\bcargos\b/, 'FUNCAO'],
    [/\b(por|cada)\s+(a\s+)?modalidades?\b|\bmodalidades\b/, 'MODALIDADE'],
    [/\bpor\s+(a\s+)?situac(ao|oes)\b/, 'SITUACAO'],
    [/\bquais (sao )?os colaboradores|\bquem (sao|e|trabalha)|\blist(a|e|ar) (os |de )?(colaboradores|nomes|pessoas)|\bnomes? d/, 'COLABORADOR']
  ];
  const TIPO_PALAVRAS = [
    [/\brosca|donut/, 'rosca'], [/\bpizza|torta\b/, 'pizza'], [/\bmapa de calor|heatmap|calor\b/, 'mapa_calor'], [/\btreemap|mapa de arvore/, 'treemap'],
    [/\bfunil\b/, 'funil'], [/\bgauge|velocimetro|medidor|ponteiro/, 'gauge'], [/\bdispersao|correlacao|scatter/, 'dispersao'], [/\blinhas?\b|\btendencia|evolucao/, 'linha'],
    [/\barea empilhada|grafico de area/, 'area'], [/\bcombinado|barras? e linhas?/, 'combinado'], [/\branking|top\s*\d+|melhores|piores/, 'ranking'],
    [/\btabela\b/, 'tabela'], [/\bkpi|indicador|cartao|card|total geral/, 'kpi'], [/\bbarras? horizonta/, 'barra_horizontal'], [/\bbarras?\b|colunas?\b/, 'barra']
  ];
  function metricaDoTexto(t, dims) {
    // devolve { fonte, metricas[], calculadas[], formatos } conforme as palavras do pedido
    const porFat = dims.every(d => ['EQUIPE', 'SUPERVISOR', 'PERIODO', 'RF', 'ANO'].includes(d));
    const porDia = dims.includes('DATA');
    const ms = [], calc = [];
    const add = (fonte, campo, agregacao, rotulo, formato) => { const id = `m${ms.length + 1}`; ms.push({ id, fonte, campo, agregacao, rotulo, ...(formato ? { formato } : {}) }); return id; };
    const filtrosExtra = [];
    // Segurança: notas SSQV
    if (/ssqv|seguranca|nota de seguranca/.test(t) && !/acidente|incidente|\bepi\b/.test(t)) {
      if (/meta|diferenca/.test(t) && !/media|nota/.test(t)) add('ssqv', 'DIFERENCA_META', 'media', 'Diferença para a meta', 'nota');
      else add('ssqv', 'NOTA', 'media', 'Nota SSQV', 'nota');
      return { ms, calc, filtrosExtra };
    }
    // RH: pessoas, funções, modalidades, tempo de casa (lista de colaboradores do mês mais recente)
    const rh = /colaborador|funcionari|pessoas|empregad|trabalhador|\bfunc(ao|oes)\b|cargo|modalidade|tempo (medio )?de casa|admiti|admissao|\bativos?\b|afastad|desligad|servente|tratorista|motorista|encarregad|operador|\brh\b/.test(t)
      && !/faturamento|faturou|area|hectare|produc|rendimento|nota|qualidade|trator(es)? da|caminh/.test(t);
    if (rh || dims.some(d => ['FUNCAO', 'MODALIDADE', 'SITUACAO', 'COLABORADOR'].includes(d))) {
      if (/tempo (medio )?de casa|antig|veteran|anos de casa/.test(t)) add('rh', 'ANOS_DE_CASA', 'media', 'Tempo médio de casa (anos)', 'nota');
      else add('rh', 'CHAPA', 'contagem_distinta', 'Colaboradores', 'int');
      if (!/afastad|desligad|demitid|inativ|todas as situac|por situac/.test(t)) filtrosExtra.push({ campo: 'SITUACAO', operador: '=', valor: 'ATIVO' });
      return { ms, calc, filtrosExtra };
    }
    if (/rendimento|ha\/dia|produtividade|por dia trabalhado/.test(t)) {
      const a = add('pgo', 'AREA', 'soma', 'Área realizada'), d = add('pgo', 'DATA', 'dias_distintos', 'Dias trabalhados');
      calc.push({ id: 'rend', rotulo: 'Rendimento (ha/dia)', formula: `${a} / ${d}`, formato: 'ha_dia' });
      filtrosExtra.push({ campo: 'AREA', operador: '>', valor: 0 });   // apoio/horas máquina (área 0) não entram no rendimento
    }
    const areaUP = /area da up|area das ups|area cadastrada|area total da up/.test(t);
    if (/aderencia/.test(t)) add('faturamento', 'ADERENCIA', 'media', 'Aderência média');
    if (/\bmeta/.test(t) && !/aderencia/.test(t)) add(porDia ? 'faturamento_diario' : 'faturamento', porDia ? 'META_DIARIA' : 'META_ACUMULADA', 'soma', porDia ? 'Meta diária' : 'Meta acumulada');
    if (/faturamento|faturou|fatura|receita|valor|r\$|dinheiro|produzido/.test(t)) {
      if (porDia && dims.every(d => ['DATA', 'EQUIPE', 'SUPERVISOR', 'MES'].includes(d))) add('faturamento_diario', 'TOTAL', 'soma', 'Faturamento diário');
      else if (porFat) add('faturamento', 'TOTAL', 'soma', 'Faturamento total');
      else add('pgo', 'VALOR', 'soma', 'Valor apontado (R$)');
    }
    if (areaUP) add('base_ups', 'AREA_UP', 'soma', 'Área da UP (cadastro)');
    if (/\bnotas?\b|qualidade|avaliac/.test(t)) add('qualidade', 'NOTA_FINAL', 'media', 'Nota final média');
    if (/uniformidade/.test(t)) add('qualidade', 'NOTA_UNIFORMIDADE', 'media', 'Uniformidade média');
    if (/colaboradores|pessoas|estrutura|tratores?|caminh/.test(t) && !ms.length) add('estrutura', 'QUANTIDADE', 'soma', 'Quantidade');
    if (/dias trabalhados|quantos dias/.test(t) && !calc.length) add('pgo', 'DATA', 'dias_distintos', 'Dias trabalhados');
    if (/apontamentos|quantidade de registros|quantas vezes|quantidade de lancamentos/.test(t)) add('pgo', null, 'contagem', 'Apontamentos');
    if (/\barea\b|hectares?|\bha\b|produc(ao|oes) realizada|realizad/.test(t) && !ms.some(m => m.campo === 'AREA' || m.campo === 'AREA_UP')) {
      if (/planejad|programad|calendario/.test(t)) add('programacao', 'AREA', 'soma', 'Área programada');
      else add('pgo', 'AREA', 'soma', 'Área realizada');
    }
    if (!ms.length) add('pgo', 'AREA', 'soma', 'Área realizada');
    return { ms, calc, filtrosExtra };
  }
  function filtrosDoTexto(t, original) {
    const filtros = [];
    const cat = catalogo();
    const valores = campo => [...new Set(cat.flatMap(b => b.campos.filter(c => c.nome === campo).flatMap(c => c.valores || [])))];
    const equipes = [...new Set((original.toUpperCase().match(/\bB[A-Z]\b/g) || []))].filter(e => valores('EQUIPE').includes(e));
    if (equipes.length) filtros.push({ campo: 'EQUIPE', operador: 'em', valor: equipes });
    ['FAZENDA', 'SUPERVISOR', 'GRUPO_ATIVIDADE', 'MONITORAMENTO', 'AVALIADOR', 'FUNCAO', 'MODALIDADE', 'NOME_EQUIPE'].forEach(campo => {
      const achados = valores(campo).filter(v => { const n = norm(v).replace(/\(.*\)/, '').trim(); return n.length > 2 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t); });
      if (achados.length) filtros.push({ campo, operador: 'em', valor: achados });
    });
    const ups = (original.toUpperCase().match(/\bS\d[A-Z0-9]{3,5}\b/g) || []).filter(u => valores('UP').includes(u));
    if (ups.length) filtros.push({ campo: 'UP', operador: 'em', valor: ups });
    return filtros;
  }
  function interpretar(pedido, base = null) {
    const t = norm(pedido);
    if (t.length < 3) return { ok: false, problemas: ['Escreva o que você quer analisar.'] };
    let dims = [];
    // "rendimento por dia" é métrica, não agrupamento por dia
    const tDims = t.replace(/(rendimento|ha|hectares?|produtividade)\s+(medio\s+)?por\s+dia(\s+trabalhado)?/g, 'rendimento');
    for (const [re, d] of DIMENSOES) if (re.test(tDims) && !dims.includes(d)) dims.push(d);
    // "x" / "versus" entre duas métricas: cruzamento
    const { ms, calc, filtrosExtra } = metricaDoTexto(t, dims);
    // remove dimensões que não existem nas bases das métricas
    const fontes = [...new Set(ms.map(m => m.fonte))];
    dims = dims.filter(d => fontes.every(f => campoDe(f, d))).slice(0, 2);
    if (base && !dims.length) dims = base.agrupar_por || [];
    let tipo = null;
    for (const [re, tp] of TIPO_PALAVRAS) if (re.test(t)) { tipo = tp; break; }
    const nMet = (calc.length ? calc.length : ms.length);
    if (!tipo) tipo = base?.tipo || (!dims.length ? 'kpi' : dims[0] === 'DATA' || dims[0] === 'PERIODO' ? 'linha' : dims.length === 2 ? 'barra' : (/\s(x|vs|versus)\s/.test(` ${t} `) && nMet >= 2 ? 'dispersao' : 'barra_horizontal'));
    const top = t.match(/\b(top|primeir[oa]s|maiores|menores|piores|melhores)\s+(\d+)/) || t.match(/\b(\d+)\s+(maiores|menores|melhores|piores)/);
    const menor = /\bmenor|menores|piores|pior|crescente|mais baix/.test(t);
    const ultimos = t.match(/\bultim[oa]s?\s+(\d+)\s+(rfs?|meses|periodos)/) || t.match(/\b(\d+)\s+ultim[oa]s\s+(rfs?|meses|periodos)/);
    const rfUnico = t.match(/\brf\s*0?(\d{1,2})(?:\s*\/\s*(\d{4}))?/);
    const ano = t.match(/\b(20\d{2})\b/);
    const yId = calc[0]?.id || ms[0].id;
    const esp = {
      titulo: tituloDe(pedido), tipo,
      agrupar_por: dims, metricas: ms, calculadas: calc,
      filtros: [...filtrosDoTexto(t, pedido), ...filtrosExtra],
      ordenar: dims.some(d => ['DATA', 'PERIODO'].includes(d)) && !top ? null : { campo: yId, direcao: menor ? 'asc' : 'desc' },
      limite: top ? +(top[2] || top[1]) : (tipo === 'ranking' ? 10 : undefined),
      eixos: { x: dims[0], y: calc.length ? calc.map(c => c.id) : ms.map(m => m.id), serie: dims[1] }
    };
    if (ultimos) esp.periodo = { tipo: 'ultimos_rfs', n: +(ultimos[1].match(/\d/) ? ultimos[1] : ultimos[2]) || 3 };
    else if (rfUnico) esp.periodo = { tipo: 'rf', ano: +(rfUnico[2] || P.periodo.atual().ano), rf: +rfUnico[1] };
    else if (ano && /\bano\b|\bem 20\d{2}/.test(t)) esp.periodo = { tipo: 'ano', ano: +ano[1] };
    if (esp.periodo?.tipo === 'ultimos_rfs' && dims.length < 2 && !dims.includes('PERIODO') && /compar/.test(t)) {
      esp.agrupar_por = dims.length ? [dims[0], 'PERIODO'] : ['PERIODO'];
      esp.eixos = { ...esp.eixos, x: esp.agrupar_por[0], serie: esp.agrupar_por[1] };
      if (!/linha|pizza|rosca|tabela/.test(t)) esp.tipo = 'barra';
    }
    return validar(esp);
  }
  const tituloDe = p => { const t = String(p).trim().replace(/[.?!]+$/, ''); return t.charAt(0).toUpperCase() + t.slice(1, 90); };

  // Ajuste em linguagem natural sobre uma especificação existente (sem IA)
  function ajustarLocal(pedido, atual) {
    const t = norm(pedido), esp = JSON.parse(JSON.stringify(atual));
    for (const [re, tp] of TIPO_PALAVRAS) if (re.test(t) && /troqu|mude|mudar|em |como |vira|para /.test(t)) { esp.tipo = tp; break; }
    const novos = filtrosDoTexto(t, pedido);
    if (novos.length) { const campos = new Set(novos.map(f => f.campo)); esp.filtros = [...(esp.filtros || []).filter(f => !campos.has(f.campo)), ...novos]; }
    if (/sem filtro|tire o filtro|remova o filtro|todas as equipes|todas as fazendas/.test(t)) esp.filtros = [];
    const top = t.match(/\b(top|primeir[oa]s|maiores|menores|so os|apenas os)\s+(\d+)/);
    if (top) esp.limite = +top[2];
    if (/\bmenor|crescente|piores/.test(t)) esp.ordenar = { campo: esp.eixos?.y?.[0], direcao: 'asc' };
    if (/\bmaior|decrescente|melhores/.test(t)) esp.ordenar = { campo: esp.eixos?.y?.[0], direcao: 'desc' };
    const ultimos = t.match(/\bultim[oa]s?\s+(\d+)\s+rfs?/);
    if (ultimos) esp.periodo = { tipo: 'ultimos_rfs', n: +ultimos[1] };
    for (const [re, d] of DIMENSOES) if (re.test(t) && /\bpor\b|agrupe|separ|quebr/.test(t) && esp.metricas.every(m => campoDe(m.fonte, d))) {
      esp.agrupar_por = /tambem|e por|alem/.test(t) && esp.agrupar_por.length ? [esp.agrupar_por[0], d] : [d];
      esp.eixos = { ...esp.eixos, x: esp.agrupar_por[0], serie: esp.agrupar_por[1] };
      break;
    }
    return validar(esp);
  }

  /* ======================================================================
     6. ANÁLISE LOCAL (só com os números calculados)
     ====================================================================== */
  const nomeDim = d => ({ EQUIPE: 'equipe', FAZENDA: 'fazenda', UP: 'UP', ATIVIDADE: 'atividade', GRUPO_ATIVIDADE: 'grupo de atividade', PERIODO: 'RF', DATA: 'dia', MES: 'mês', SUPERVISOR: 'supervisor', FROTA: 'máquina', AVALIADOR: 'avaliador', MONITORAMENTO: 'monitoramento' }[d] || d.toLowerCase().replace(/_/g, ' '));
  function analisarLocal(esp, res) {
    const c0 = res.colunas.find(x => x.id === esp.eixos.y[0]) || res.colunas[0];
    // Duas dimensões (ex.: equipe × RF): lê cada dimensão somando a outra
    if (res.dims.length === 2 && !['pct', 'nota', 'ha_dia'].includes(c0.formato)) {
      const TEMPO = ['DATA', 'PERIODO', 'MES', 'RF', 'ANO'];
      const [principal, outra] = TEMPO.includes(res.dims[0]) ? [res.dims[1], res.dims[0]] : [res.dims[0], res.dims[1]];
      const somaPor = d => { const m = new Map(); res.linhas.forEach(l => { const k = formatarChave(l.chave[d]); m.set(k, (m.get(k) || 0) + (l.v[c0.id] || 0)); }); return m; };
      const porP = [...somaPor(principal)].sort((a, b) => b[1] - a[1]);
      const porO = [...somaPor(outra)];
      if (TEMPO.includes(outra)) porO.sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'pt-BR', { numeric: true }));
      const total = porP.reduce((s, x) => s + x[1], 0);
      const destaques = [`Maior ${nomeDim(principal)}:${porP[0][0]} com ${formatar(porP[0][1], c0.formato)} (${n1(porP[0][1] / (total || 1) * 100)}% do total).`];
      if (porP.length > 1) destaques.push(`Menor: ${porP[porP.length - 1][0]} com ${formatar(porP[porP.length - 1][1], c0.formato)}.`);
      if (TEMPO.includes(outra) && porO.length > 1 && porO[0][1]) {
        const v = porO[porO.length - 1][1] / porO[0][1] - 1;
        destaques.push(`Entre ${porO[0][0]} e ${porO[porO.length - 1][0]}: ${v >= 0 ? 'alta' : 'queda'} de ${n1(Math.abs(v) * 100)}% no total (${formatar(porO[0][1], c0.formato)} → ${formatar(porO[porO.length - 1][1], c0.formato)}).`);
      }
      const atencao = [];
      if (TEMPO.includes(outra) && porO.length > 1) {
        const [pri, ult] = [porO[0][0], porO[porO.length - 1][0]];
        const quedas = [...new Set(res.linhas.map(l => formatarChave(l.chave[principal])))].map(k => {
          const v = p => res.linhas.find(l => formatarChave(l.chave[principal]) === k && formatarChave(l.chave[outra]) === p)?.v[c0.id] || 0;
          return [k, v(pri), v(ult)];
        }).filter(([, a, b]) => a > 0 && b < a * 0.7).sort((a, b) => (a[2] / a[1]) - (b[2] / b[1]));
        const atual = P.periodo.atual(), emAndamento = outra === 'PERIODO' && ult === rotuloPeriodo(atual.ano, atual.rf);
        if (quedas.length) atencao.push(`Queda de mais de 30% entre ${pri} e ${ult}: ${quedas.slice(0, 4).map(([k, a, b]) => `${k} (${formatar(a, c0.formato)} → ${formatar(b, c0.formato)})`).join(', ')}.${emAndamento ? ` Atenção: ${ult} é o RF atual e ainda está em andamento.` : ''}`);
      }
      return {
        resumo: `${c0.rotulo}: total de ${formatar(total, c0.formato)} somando ${porP.length} ${nomeDim(principal)}(s) em ${porO.length} ${nomeDim(outra)}(s). ${porP[0][0]} lidera.`,
        destaques, atencao, sugestao: `${c0.rotulo} por atividade só de ${porP[0][0]}`, origem: 'local'
      };
    }
    const c = c0;
    const nomeLinha = l => res.dims.map(d => formatarChave(l.chave[d])).join(' · ') || 'Total';
    const vals = res.linhas.map(l => ({ l, v: l.v[c.id] })).filter(x => x.v != null && Number.isFinite(x.v));
    if (!vals.length) return { resumo: 'Não há números no filtro atual para analisar. Amplie o período ou remova filtros.', destaques: [], atencao: [], sugestao: null };
    const ord = [...vals].sort((a, b) => b.v - a.v);
    const soma = vals.reduce((s, x) => s + x.v, 0), media = soma / vals.length;
    const somavel = !['pct', 'nota'].includes(c.formato) && !esp.calculadas.some(x => x.id === c.id);
    const tempo = res.dims[0] && ['DATA', 'PERIODO', 'MES'].includes(res.dims[0]);
    const destaques = [], atencao = [];
    let resumo = `${c.rotulo}: ${somavel ? `total de ${formatar(soma, c.formato)} em ` : `média de ${formatar(media, c.formato)} entre `}${vals.length} ${res.dims.length ? 'grupos' : 'resultado'}.`;
    if (vals.length > 1) {
      resumo += ` O maior é ${nomeLinha(ord[0].l)} (${formatar(ord[0].v, c.formato)})${somavel && soma ? `, ${n1(ord[0].v / soma * 100)}% do total` : ''}.`;
      destaques.push(`Maior: ${nomeLinha(ord[0].l)} com ${formatar(ord[0].v, c.formato)}.`);
      destaques.push(`Menor: ${nomeLinha(ord[ord.length - 1].l)} com ${formatar(ord[ord.length - 1].v, c.formato)}.`);
      if (ord[ord.length - 1].v > 0) destaques.push(`O maior é ${n1(ord[0].v / ord[ord.length - 1].v)}× o menor.`);
      if (somavel && ord.length >= 5) { const top3 = ord.slice(0, 3).reduce((s, x) => s + x.v, 0); destaques.push(`Os 3 maiores concentram ${n1(top3 / soma * 100)}% do total.`); }
      const abaixo = vals.filter(x => x.v < media * 0.7);
      if (abaixo.length && abaixo.length < vals.length) atencao.push(`${abaixo.length} item(ns) abaixo de 70% da média (${formatar(media, c.formato)}): ${abaixo.slice(0, 4).map(x => nomeLinha(x.l)).join(', ')}.`);
    }
    if (tempo && vals.length > 1 && !res.dims[1]) {
      const prim = vals[0], ult = vals[vals.length - 1];
      if (prim.v) destaques.push(`Do primeiro (${nomeLinha(prim.l)}) para o último (${nomeLinha(ult.l)}) período: ${ult.v >= prim.v ? 'alta' : 'queda'} de ${n1(Math.abs(ult.v / prim.v - 1) * 100)}%.`);
    }
    res.notas.forEach(n => { if (/nenhum registro/.test(n)) atencao.push(n); });
    const dimSug = { EQUIPE: 'FAZENDA', FAZENDA: 'ATIVIDADE', ATIVIDADE: 'EQUIPE', GRUPO_ATIVIDADE: 'ATIVIDADE', PERIODO: 'EQUIPE', SUPERVISOR: 'EQUIPE' }[res.dims[0]];
    const sugestao = dimSug ? `${c.rotulo} por ${dimSug.toLowerCase().replace('_', ' de ')}${ord[0] && res.dims[0] !== 'PERIODO' ? ` só de ${formatarChave(ord[0].l.chave[res.dims[0]])}` : ''}` : `Compare ${c.rotulo.toLowerCase()} nos últimos 3 RFs`;
    return { resumo, destaques, atencao, sugestao, origem: 'local' };
  }

  window.SMA_EXPERIMENTO = {
    BASES, GRUPO_DA_BASE, TIPOS, AGREGACOES, carregarBases, catalogo, catalogoParaIA, validar, executar, interpretar, ajustarLocal, analisarLocal,
    formatar, formatarChave, periodosExistentes, dados, erros, carregadoEm: () => carregadoEm
  };
})();
