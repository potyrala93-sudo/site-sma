/* ==========================================================================
   Folhito — consultas aos dados do painel (planilhas de faturamento, frota e estrutura)
   Responde perguntas como "quanto a equipe BM faturou no dia 08/10?" com os valores exatos.
   Exporta window.FOLHITO_CONSULTAS = { pareceDados(texto), responder(texto) }
   ========================================================================== */

(() => {
  const P = window.SMA_PLANILHAS, D = window.SMA_DADOS;
  if (!P || !D?.FATURAMENTO) return;
  const { num, dataBR } = P;

  /* ---------- Utilidades ---------- */
  const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = v => fmtBRL.format(v || 0);
  const pct = v => `${((v || 0) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  const n0 = v => Math.round(v || 0).toLocaleString('pt-BR');
  const dd = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const ddCurto = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const semana = d => d.toLocaleDateString('pt-BR', { weekday: 'long' });
  const mesmoDia = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const NOME_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SUPERVISORES = D.FATURAMENTO.pessoas.filter(p => p.supervisor).map(p => p.supervisor);
  const obsValida = o => o && !/^(-|#n\/a|n\/a|#ref!)$/i.test(String(o).trim());
  const b = t => `**${t}**`;
  const LINK = [{ destino: 'faturamento.html' }];

  // Memória da conversa: permite "e no dia 09?" depois de perguntar sobre a BM
  const contexto = { equipe: null, supervisor: null, frota: null, data: null, rf: null, ano: null };

  /* ---------- Entender a pergunta ---------- */
  const PALAVRAS_DADOS = /fatur|produz|produc|negoci|total|aderenc|meta|diferen|\bdif\b|ganh|rend|frota|maquin|estrutura|colaborador|servente|trator|caminh|drone|\brf ?\d|parad|zerad|observ|motivo|ranking|lider|quanto/;

  function codigosEquipe(dados) {
    const s = new Set();
    ['anderson', 'diario', 'estrutura', 'frota'].forEach(k => (dados[k] || []).forEach(l => { if (/^[A-Z]{2,3}$/.test(l.EQUIPE || '')) s.add(l.EQUIPE); }));
    return s;
  }

  function interpretar(texto, dados) {
    const t = norm(texto);
    const q = { t, equipe: null, supervisor: null, geral: false, frota: null, data: null, dataRelativa: null, rf: null, ano: null };
    const equipes = codigosEquipe(dados);

    // Equipe: "equipe BM", "eq bm", "da BM" ou o código sozinho (só os que existem na planilha)
    const m1 = t.match(/\b(?:equipe|eq|time|turma)\.?\s*([a-z]{2,3})\b/);
    if (m1 && equipes.has(m1[1].toUpperCase())) q.equipe = m1[1].toUpperCase();
    else for (const tok of t.split(/[^a-z0-9]+/)) { if (tok.length >= 2 && tok.length <= 3 && equipes.has(tok.toUpperCase()) && !['de', 'da', 'do', 'e', 'em', 'no', 'na'].includes(tok)) { q.equipe = tok.toUpperCase(); break; } }

    // Supervisor ou visão geral
    q.supervisor = SUPERVISORES.find(s => t.includes(norm(s))) || null;
    if (/anderson|geral|todas as equipes|unidade|coordenac|total geral|todo mundo/.test(t)) q.geral = true;

    // Frota: "frota 392" ou número de 3-4 dígitos que existe na planilha de frota
    const mf = t.match(/\bfrota\s*(?:n[ºo°]?\s*)?(\d{2,5})\b/);
    const frotas = new Set((dados.frota || []).map(l => String(l.FROTA).trim()));
    if (mf && frotas.has(mf[1])) q.frota = mf[1];
    else if (/frota|maquin|trator/.test(t)) { const mm = t.match(/\b(\d{3,4})\b/g); const achada = mm?.find(x => frotas.has(x)); if (achada) q.frota = achada; }

    // Datas: 08/10, 8/10/2026, "dia 8", hoje, ontem, anteontem, último dia
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const md = t.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
    if (md) {
      let ano = md[3] ? +md[3] : (contexto.ano || hoje.getFullYear());
      if (ano < 100) ano += 2000;
      q.data = new Date(ano, +md[2] - 1, +md[1]);
    } else if (/\banteontem\b/.test(t)) { q.data = new Date(hoje); q.data.setDate(q.data.getDate() - 2); q.dataRelativa = 'anteontem'; }
    else if (/\bontem\b/.test(t)) { q.data = new Date(hoje); q.data.setDate(q.data.getDate() - 1); q.dataRelativa = 'ontem'; }
    else if (/\bhoje\b/.test(t)) { q.data = new Date(hoje); q.dataRelativa = 'hoje'; }
    else if (/ultimo dia|dia mais recente|ultimo lancamento/.test(t)) q.dataRelativa = 'ultimo';
    else {
      const dia = t.match(/\bdia\s+(\d{1,2})\b/);
      if (dia) {
        const mes = contexto.rf ? contexto.rf - 1 : hoje.getMonth();
        q.data = new Date(contexto.ano || hoje.getFullYear(), mes, +dia[1]);
      }
    }

    // Período: RF10, "em outubro", "mês passado", ano
    const mrf = t.match(/\brf\s?0?(\d{1,2})\b/);
    if (mrf) q.rf = +mrf[1];
    const mes = MESES.findIndex(m => new RegExp(`\\b${m}\\b`).test(t));
    if (mes >= 0 && !q.rf) q.rf = mes + 1;
    if (/mes passado|rf passado|mes anterior/.test(t)) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); q.rf = d.getMonth() + 1; q.ano = d.getFullYear(); }
    const ma = t.match(/\b(20\d{2})\b/);
    if (ma && !md) q.ano = +ma[1];

    // Intenção
    q.estrutura = /estrutura|colaborador|servente|\bm\.?o\b|mao de obra|quantos? (trator|caminh|drone|pessoa)|trator(es)? (tem|possui)|caminh(ao|oes) (tem|possui)|drone/.test(t) && !q.frota;
    q.observacao = /por ?que|motivo|observ|\bobs\b|aconteceu|o que houve|justific/.test(t);
    q.ranking = /melhor|pior|maior|menor|ranking|lider|top|mais (fatur|produz)|menos (fatur|produz)/.test(t);
    q.paradas = /parad|zerad|nao produz|sem produc|nao trabalh/.test(t);
    q.porDia = /por dia|diari|cada dia|dia a dia|todos os dias|dias/.test(t) && !q.data;
    q.aderencia = /aderenc|meta|diferen|\bdif\b|falta|atingi|bateu/.test(t);
    q.frotaTema = /frota|maquin/.test(t) || !!q.frota;
    return q;
  }

  function pareceDados(texto) {
    const t = norm(texto);
    if (/\bfrota\s*\d/.test(t)) return true;
    // Continuação da conversa: "e no dia 15?", "e ontem?", "e a BD?"
    const temContexto = contexto.equipe || contexto.supervisor || contexto.frota || contexto.data;
    if (temContexto && (/^e\b/.test(t) || t.split(' ').length <= 4) && /\bdia\s*\d|\d{1,2}\/\d{1,2}|ontem|hoje|anteontem|\b(equipe|eq)\s*[a-z]{2,3}\b|\b[a-z]{2}\b\??$|mes|rf/.test(t)) return true;
    if (/(melhor|pior|maior|menor) (dia|equipe|supervisor|frota)|(maior|menor) aderenc|mais faturou|menos faturou|(mais|menos) produziu/.test(t)) return true;
    const temEntidade = /\b(equipe|eq)\s*[a-z]{2,3}\b/.test(t) || SUPERVISORES.some(s => t.includes(norm(s)));
    if (temEntidade && /trator|caminh|colaborador|servente|drone|estrutura|m\.?o\b/.test(t)) return true;
    if (!PALAVRAS_DADOS.test(t) && !/\b\d{1,2}\/\d{1,2}\b|\bontem\b|\bdia \d/.test(t)) return false;
    // Perguntas sobre pessoas ("quem é a Joyce") ficam com o modo guia
    if (/quem e|quem lidera|o que e (a )?silvicultura|para que serve|dica|conselho/.test(t) && !/fatur|produz|aderenc/.test(t)) return false;
    return /fatur|produz|produc|negoci|aderenc|meta|diferen|\bdif\b|frota|estrutura|\brf ?\d|parad|zerad|observ|motivo|ranking|ganh|rend|valor/.test(t)
      || /\b(equipe|eq)\s*[a-z]{2,3}\b/.test(t) || /\b\d{1,2}\/\d{1,2}\b|\bontem\b|\bhoje\b/.test(t);
  }

  /* ---------- Acesso aos dados ---------- */
  const doPeriodo = (l, rf, ano) => num(l.ANO) === ano && num(l.RF) === rf;

  function periodoPadrao(dados, q) {
    const hoje = new Date();
    let rf = q.rf || (q.data ? q.data.getMonth() + 1 : null) || contexto.rf || hoje.getMonth() + 1;
    let ano = q.ano || (q.data ? q.data.getFullYear() : null) || contexto.ano || hoje.getFullYear();
    const temDados = (r, a) => (dados.anderson || []).some(l => doPeriodo(l, r, a)) || (dados.diario || []).some(l => doPeriodo(l, r, a));
    if (!temDados(rf, ano) && !q.rf && !q.data) {
      // sem dados no mês atual: usa o RF mais recente que tenha lançamentos
      const pares = (dados.anderson || []).map(l => [num(l.ANO), num(l.RF)]).filter(([a, r]) => a && r).sort((x, y) => y[0] - x[0] || y[1] - x[1]);
      if (pares.length) [ano, rf] = pares[0];
    }
    return { rf, ano };
  }

  function supervisorDaEquipe(dados, equipe, rf, ano) {
    const est = (dados.estrutura || []).find(e => e.EQUIPE === equipe && num(e.RF) === rf);
    if (est) return est.SUPERVISOR;
    const lin = (dados.anderson || []).find(l => l.EQUIPE === equipe && doPeriodo(l, rf, ano) && l.SUPERVISOR);
    if (lin) return lin.SUPERVISOR;
    return (dados.estrutura || []).find(e => e.EQUIPE === equipe)?.SUPERVISOR || null;
  }
  function equipesDoSupervisor(dados, sup, rf, ano) {
    const s = new Set();
    (dados.estrutura || []).filter(e => e.SUPERVISOR === sup && num(e.RF) === rf).forEach(e => s.add(e.EQUIPE));
    (dados.anderson || []).filter(l => doPeriodo(l, rf, ano)).forEach(l => { if (supervisorDaEquipe(dados, l.EQUIPE, rf, ano) === sup) s.add(l.EQUIPE); });
    if (!s.size) (dados.estrutura || []).filter(e => e.SUPERVISOR === sup).forEach(e => s.add(e.EQUIPE));
    return [...s].sort();
  }

  // Escopo: equipe > supervisor > geral (com memória da última pergunta)
  function escopo(dados, q, per, usarContexto) {
    if (q.equipe) return { tipo: 'equipe', nome: `equipe ${q.equipe}`, equipes: [q.equipe], equipe: q.equipe, sup: supervisorDaEquipe(dados, q.equipe, per.rf, per.ano) };
    if (q.supervisor) return { tipo: 'supervisor', nome: `supervisão ${q.supervisor}`, equipes: equipesDoSupervisor(dados, q.supervisor, per.rf, per.ano), sup: q.supervisor };
    if (q.geral) return { tipo: 'geral', nome: 'unidade (todas as equipes)', equipes: null };
    if (usarContexto && contexto.equipe) return { tipo: 'equipe', nome: `equipe ${contexto.equipe}`, equipes: [contexto.equipe], equipe: contexto.equipe, sup: supervisorDaEquipe(dados, contexto.equipe, per.rf, per.ano) };
    if (usarContexto && contexto.supervisor) return { tipo: 'supervisor', nome: `supervisão ${contexto.supervisor}`, equipes: equipesDoSupervisor(dados, contexto.supervisor, per.rf, per.ano), sup: contexto.supervisor };
    return { tipo: 'geral', nome: 'unidade (todas as equipes)', equipes: null };
  }
  const noEscopo = (esc, equipe) => !esc.equipes || esc.equipes.includes(equipe);

  // Linha mensal (aba geral) → números do mês (com Outras Receitas)
  function mensal(l) {
    const c = n => num(l[`${n} (OR)`] ?? l[n]);
    const total = num(l.TOTAL), metaAcum = c('META ACUMULADA');
    return {
      equipe: l.EQUIPE, du: num(l['D.U']), dp: num(l['D.P']), produzido: num(l.PRODUZIDO), negociacao: num(l.NEGOCIACAO), total,
      metaMensal: c('META MENSAL'), metaAcum, metaDiaria: c('META DIARIA'), aNegociar: num(l['VALORES A SEREM NEGOCIADOS']),
      aderencia: metaAcum ? total / metaAcum : 0, dif: total - metaAcum
    };
  }
  function somar(lista) {
    const s = k => lista.reduce((a, x) => a + (x[k] || 0), 0);
    const r = { du: Math.max(0, ...lista.map(x => x.du)), dp: Math.max(0, ...lista.map(x => x.dp)), produzido: s('produzido'), negociacao: s('negociacao'), total: s('total'), metaMensal: s('metaMensal'), metaAcum: s('metaAcum'), metaDiaria: s('metaDiaria'), aNegociar: s('aNegociar') };
    r.aderencia = r.metaAcum ? r.total / r.metaAcum : 0; r.dif = r.total - r.metaAcum;
    return r;
  }

  const linhasDiario = (dados, per, esc) => (dados.diario || []).filter(l => doPeriodo(l, per.rf, per.ano) && noEscopo(esc, l.EQUIPE)).map(l => ({
    d: dataBR(l.DIA), equipe: l.EQUIPE, prod: num(l.PRODUCAO), neg: num(l.NEGOCIACOES), total: num(l.TOTAL),
    meta: num(l['META DIARIA OUTRAS RECEITAS'] || l['META DIARIA']), obs: obsValida(l.OBS) ? String(l.OBS).trim() : ''
  })).filter(x => x.d);
  const linhasFrota = (dados, per, esc) => (dados.frota || []).filter(l => doPeriodo(l, per.rf, per.ano) && noEscopo(esc, l.EQUIPE) && l.FROTA).map(l => ({
    d: dataBR(l.DIA), frota: String(l.FROTA).trim(), equipe: l.EQUIPE, prod: num(l.PRODUCAO), meta: num(l['META DIARIA']), delta: num(l.DELTA), obs: obsValida(l.OBS) ? String(l.OBS).trim() : ''
  })).filter(x => x.d);

  const rotuloPer = per => `RF${String(per.rf).padStart(2, '0')}/${per.ano}`;
  const diasDisponiveis = linhas => [...new Set(linhas.map(x => +x.d))].sort((a, c) => a - c).map(x => new Date(x));

  /* ---------- Respostas ---------- */

  // Faturamento de um dia (equipe, supervisor ou geral)
  function respDia(dados, q, per, esc) {
    const todas = linhasDiario(dados, per, esc);
    let data = q.data, nota = '';
    if (q.dataRelativa === 'ultimo' || (!data && q.dataRelativa)) data = diasDisponiveis(todas).pop();
    if (q.dataRelativa && q.dataRelativa !== 'ultimo' && !todas.some(x => mesmoDia(x.d, data)) && todas.length) {
      const ultimo = diasDisponiveis(todas).pop();
      nota = `Não há lançamento ${q.dataRelativa} (${ddCurto(data)}). O último dia lançado foi ${b(dd(ultimo))}:\n\n`;
      data = ultimo;
    }
    const doDia = todas.filter(x => mesmoDia(x.d, data));
    if (!doDia.length) {
      const dias = diasDisponiveis(todas);
      return `Não encontrei lançamento de faturamento da ${b(esc.nome)} em ${b(dd(data))}${q.dataRelativa ? ` (${q.dataRelativa})` : ''}.` +
        (dias.length ? `\n\nDias com lançamento em ${rotuloPer(per)}: ${dias.map(ddCurto).join(', ')}.` : `\n\nNão há lançamentos diários em ${rotuloPer(per)}.`);
    }
    contexto.data = data;
    if (esc.tipo === 'equipe') {
      const x = doDia.reduce((a, c) => ({ ...c, prod: a.prod + c.prod, neg: a.neg + c.neg, total: a.total + c.total, meta: a.meta + c.meta, obs: [a.obs, c.obs].filter(Boolean).join('; ') }), { prod: 0, neg: 0, total: 0, meta: 0, obs: '' });
      const ating = x.meta ? x.total / x.meta : 0;
      return nota + `📅 ${b(dd(data))} (${semana(data)}) — ${b('Equipe ' + esc.equipe)}${esc.sup ? ` (${esc.sup})` : ''} faturou ${b(brl(x.total))}.\n\n` +
        `- Produção: ${brl(x.prod)}\n- Negociações: ${brl(x.neg)}\n- Meta diária (com Outras Receitas): ${brl(x.meta)}\n- Resultado: ${b(pct(ating) + ' da meta')} (${x.total - x.meta >= 0 ? '+' : ''}${brl(x.total - x.meta)})` +
        (x.obs ? `\n\n📝 Observação registrada: ${x.obs}` : '');
    }
    const porEquipe = new Map();
    doDia.forEach(x => { const a = porEquipe.get(x.equipe) || { total: 0, meta: 0, obs: '' }; a.total += x.total; a.meta += x.meta; if (x.obs) a.obs = x.obs; porEquipe.set(x.equipe, a); });
    const lista = [...porEquipe.entries()].sort((a, c) => c[1].total - a[1].total);
    const total = lista.reduce((s, [, v]) => s + v.total, 0), meta = lista.reduce((s, [, v]) => s + v.meta, 0);
    return nota + `📅 ${b(dd(data))} (${semana(data)}) — ${b(esc.nome)} faturou ${b(brl(total))}${meta ? ` (${pct(total / meta)} da meta diária de ${brl(meta)})` : ''}.\n\n` +
      lista.map(([eq, v]) => `- ${b(eq)}: ${brl(v.total)}${v.meta ? ` · ${pct(v.total / v.meta)} da meta` : ''}${v.obs ? ` · 📝 ${v.obs}` : ''}`).join('\n');
  }

  // Faturamento dia a dia no período
  function respPorDia(dados, per, esc) {
    const todas = linhasDiario(dados, per, esc);
    if (!todas.length) return `Não há lançamentos diários da ${b(esc.nome)} em ${rotuloPer(per)}.`;
    const porDia = new Map();
    todas.forEach(x => { const a = porDia.get(+x.d) || { d: x.d, total: 0, meta: 0 }; a.total += x.total; a.meta += x.meta; porDia.set(+x.d, a); });
    const dias = [...porDia.values()].sort((a, c) => a.d - c.d);
    const soma = dias.reduce((s, x) => s + x.total, 0);
    return `Faturamento dia a dia da ${b(esc.nome)} em ${b(rotuloPer(per))}:\n\n` +
      dias.map(x => `- ${ddCurto(x.d)}: ${b(brl(x.total))}${x.meta ? ` (${pct(x.total / x.meta)} da meta)` : ''}`).join('\n') +
      `\n\nAcumulado: ${b(brl(soma))} em ${dias.length} dias · média de ${brl(soma / dias.length)}/dia.`;
  }

  // Resultado do mês (aba geral)
  function respMes(dados, per, esc) {
    const linhas = (dados.anderson || []).filter(l => doPeriodo(l, per.rf, per.ano) && noEscopo(esc, l.EQUIPE)).map(mensal).filter(x => x.total || x.metaAcum);
    if (!linhas.length) return `Não encontrei faturamento da ${b(esc.nome)} em ${rotuloPer(per)}.`;
    const t = somar(linhas);
    let txt = `💰 ${b(esc.nome.charAt(0).toUpperCase() + esc.nome.slice(1))}${esc.tipo === 'equipe' && esc.sup ? ` (${esc.sup})` : ''} — ${b(rotuloPer(per))} (com Outras Receitas):\n\n` +
      `- Total faturado: ${b(brl(t.total))} (produzido ${brl(t.produzido)} + negociação ${brl(t.negociacao)})\n` +
      `- Meta acumulada: ${brl(t.metaAcum)} · Meta mensal: ${brl(t.metaMensal)}\n` +
      `- Aderência: ${b(pct(t.aderencia))} · Diferença: ${b((t.dif >= 0 ? '+' : '') + brl(t.dif))}\n` +
      `- D.U / D.P: ${t.du} / ${t.dp}` + (t.aNegociar ? `\n- Valores a negociar: ${brl(t.aNegociar)} (com eles, a aderência iria a ${pct(t.metaAcum ? (t.total + t.aNegociar) / t.metaAcum : 0)})` : '');
    if (esc.tipo !== 'equipe' && linhas.length > 1) {
      const ord = [...linhas].sort((a, c) => c.aderencia - a.aderencia);
      txt += `\n\nMelhor equipe: ${b(ord[0].equipe)} (${pct(ord[0].aderencia)}) · Pior: ${b(ord[ord.length - 1].equipe)} (${pct(ord[ord.length - 1].aderencia)}).`;
    }
    return txt;
  }

  // Rankings: equipes, supervisores, dias, frotas
  function respRanking(dados, q, per, esc) {
    const t = q.t;
    const menor = /pior|menor|menos/.test(t);
    if (/supervis/.test(t) && !q.supervisor) {
      const base = (dados.anderson || []).filter(l => doPeriodo(l, per.rf, per.ano)).map(mensal);
      const sups = SUPERVISORES.map(s => ({ s, ...somar(base.filter(x => supervisorDaEquipe(dados, x.equipe, per.rf, per.ano) === s)) })).filter(x => x.metaAcum).sort((a, c) => c.aderencia - a.aderencia);
      return `🏆 Ranking de supervisores em ${b(rotuloPer(per))} (aderência com Outras Receitas):\n\n` + sups.map((x, i) => `${i + 1}. ${b(x.s)}: ${pct(x.aderencia)} · total ${brl(x.total)}`).join('\n');
    }
    if (/\bdia\b|dias/.test(t)) {
      const todas = linhasDiario(dados, per, esc);
      const porDia = new Map();
      todas.forEach(x => porDia.set(+x.d, (porDia.get(+x.d) || 0) + x.total));
      const dias = [...porDia.entries()].filter(([, v]) => v).sort((a, c) => (menor ? a[1] - c[1] : c[1] - a[1]));
      if (!dias.length) return `Sem lançamentos diários da ${b(esc.nome)} em ${rotuloPer(per)}.`;
      return `${menor ? '📉 Pior' : '📈 Melhor'} dia da ${b(esc.nome)} em ${rotuloPer(per)}: ${b(dd(new Date(dias[0][0])))} com ${b(brl(dias[0][1]))}.` +
        (dias.length > 1 ? `\n\nTop 3: ${dias.slice(0, 3).map(([d, v]) => `${ddCurto(new Date(d))} (${brl(v)})`).join(' · ')}` : '');
    }
    if (q.frotaTema) {
      const fs = linhasFrota(dados, per, esc);
      const tot = new Map(); fs.forEach(x => tot.set(x.frota, { prod: (tot.get(x.frota)?.prod || 0) + x.prod, equipe: x.equipe }));
      const ord = [...tot.entries()].sort((a, c) => (menor ? a[1].prod - c[1].prod : c[1].prod - a[1].prod));
      if (!ord.length) return `Sem dados de frota para a ${b(esc.nome)} em ${rotuloPer(per)}.`;
      return `${menor ? '📉 Frotas que menos' : '🚜 Frotas que mais'} produziram (${esc.nome}, ${rotuloPer(per)}):\n\n` + ord.slice(0, 5).map(([f, v], i) => `${i + 1}. ${b('Frota ' + f)} (${v.equipe}): ${brl(v.prod)}`).join('\n');
    }
    const linhas = (dados.anderson || []).filter(l => doPeriodo(l, per.rf, per.ano) && noEscopo(esc, l.EQUIPE)).map(mensal).filter(x => x.metaAcum);
    if (!linhas.length) return `Sem dados de equipes em ${rotuloPer(per)}.`;
    const porFat = /fatur|produz|total|valor/.test(t) && !/aderenc/.test(t);
    const ord = [...linhas].sort((a, c) => (porFat ? c.total - a.total : c.aderencia - a.aderencia) * (menor ? -1 : 1));
    return `${menor ? '📉' : '🏆'} ${porFat ? (menor ? 'Equipes que menos faturaram' : 'Equipes que mais faturaram') : (menor ? 'Equipes com menor aderência' : 'Equipes com maior aderência')} — ${esc.nome}, ${rotuloPer(per)}:\n\n` +
      ord.slice(0, 5).map((x, i) => `${i + 1}. ${b(x.equipe)}: ${porFat ? brl(x.total) + ` (${pct(x.aderencia)})` : pct(x.aderencia) + ` (${brl(x.total)})`}`).join('\n');
  }

  // Frota específica (dia ou período)
  function respFrota(dados, q, per) {
    const todas = (dados.frota || []).filter(l => String(l.FROTA).trim() === q.frota).map(l => ({
      d: dataBR(l.DIA), rf: num(l.RF), ano: num(l.ANO), equipe: l.EQUIPE, prod: num(l.PRODUCAO), meta: num(l['META DIARIA']), delta: num(l.DELTA), obs: obsValida(l.OBS) ? String(l.OBS).trim() : ''
    })).filter(x => x.d);
    if (!todas.length) return `Não encontrei a ${b('Frota ' + q.frota)} na planilha de produção por frota.`;
    contexto.frota = q.frota;
    let data = q.data;
    if (q.dataRelativa === 'ultimo' || (!data && q.dataRelativa)) data = diasDisponiveis(todas).pop();
    if (data) {
      const x = todas.find(r => mesmoDia(r.d, data));
      if (!x) return `A ${b('Frota ' + q.frota)} não tem lançamento em ${b(dd(data))}. Últimos dias com registro: ${diasDisponiveis(todas).slice(-5).map(ddCurto).join(', ')}.`;
      return `🚜 ${b('Frota ' + q.frota)} (equipe ${x.equipe}) em ${b(dd(data))}: produziu ${b(brl(x.prod))}.\n\n- Meta diária: ${brl(x.meta)}\n- Delta: ${b((x.delta >= 0 ? '+' : '') + brl(x.delta))} (${x.meta ? pct(x.prod / x.meta) : '—'} da meta)` +
        (x.prod === 0 ? '\n\n⚠️ A máquina não produziu neste dia.' : '') + (x.obs ? `\n\n📝 Observação: ${x.obs}` : '');
    }
    const doPer = todas.filter(x => x.rf === per.rf && x.ano === per.ano);
    const usar = doPer.length ? doPer : todas.filter(x => x.rf === Math.max(...todas.filter(y => y.ano === Math.max(...todas.map(z => z.ano))).map(y => y.rf)));
    const perUsado = doPer.length ? per : { rf: usar[0].rf, ano: usar[0].ano };
    const soma = usar.reduce((s, x) => s + x.prod, 0), meta = usar.reduce((s, x) => s + x.meta, 0);
    const zerados = usar.filter(x => x.prod === 0);
    const obs = usar.filter(x => x.obs).sort((a, c) => c.d - a.d);
    const melhor = usar.reduce((a, c) => (c.prod > a.prod ? c : a), usar[0]);
    return `🚜 ${b('Frota ' + q.frota)} (equipe ${usar[0].equipe}) em ${b(rotuloPer(perUsado))}:\n\n` +
      `- Produção total: ${b(brl(soma))} em ${usar.length} dias (média ${brl(soma / usar.length)}/dia)\n` +
      `- Rendimento frente à meta: ${b(meta ? pct(soma / meta) : '—')}\n` +
      `- Melhor dia: ${ddCurto(melhor.d)} (${brl(melhor.prod)})\n` +
      `- Dias sem produção: ${zerados.length}${zerados.length ? ` (${zerados.slice(-4).map(x => ddCurto(x.d)).join(', ')})` : ''}` +
      (obs.length ? `\n\n📝 Última observação (${ddCurto(obs[0].d)}): ${obs[0].obs}` : '');
  }

  // Frotas paradas / sem produção
  function respParadas(dados, q, per, esc) {
    const fs = linhasFrota(dados, per, esc);
    if (!fs.length) return `Sem dados de frota para a ${b(esc.nome)} em ${rotuloPer(per)}.`;
    const data = q.data || diasDisponiveis(fs).pop();
    const doDia = fs.filter(x => mesmoDia(x.d, data));
    const paradas = doDia.filter(x => x.prod === 0);
    if (!doDia.length) return `Sem lançamento de frota em ${b(dd(data))}. Dias disponíveis: ${diasDisponiveis(fs).slice(-6).map(ddCurto).join(', ')}.`;
    return paradas.length
      ? `⚠️ Em ${b(dd(data))}, ${b(paradas.length + ' de ' + doDia.length)} frotas da ${esc.nome} não produziram:\n\n` + paradas.map(x => `- ${b('Frota ' + x.frota)} (${x.equipe})${x.obs ? ` — ${x.obs}` : ' — sem observação registrada'}`).join('\n')
      : `✅ Em ${b(dd(data))}, todas as ${doDia.length} frotas da ${esc.nome} produziram.`;
  }

  // Observações / motivos
  function respObservacoes(dados, q, per, esc) {
    const di = linhasDiario(dados, per, esc).filter(x => x.obs && (!q.data || mesmoDia(x.d, q.data))).map(x => ({ d: x.d, quem: `Equipe ${x.equipe}`, obs: x.obs }));
    const fr = linhasFrota(dados, per, esc).filter(x => x.obs && (!q.data || mesmoDia(x.d, q.data))).map(x => ({ d: x.d, quem: `Frota ${x.frota} (${x.equipe})`, obs: x.obs }));
    const todas = [...di, ...fr].sort((a, c) => c.d - a.d);
    if (!todas.length) return `Não há observações registradas para a ${b(esc.nome)}${q.data ? ` em ${dd(q.data)}` : ` em ${rotuloPer(per)}`}.`;
    return `📝 Observações registradas — ${esc.nome}${q.data ? `, ${dd(q.data)}` : `, ${rotuloPer(per)}`}:\n\n` + todas.slice(0, 8).map(x => `- ${ddCurto(x.d)} · ${b(x.quem)}: ${x.obs}`).join('\n');
  }

  // Estrutura (planilha de estrutura)
  function respEstrutura(dados, q, per, esc) {
    const est = dados.estrutura || [];
    if (!est.length) return 'Não consegui ler a planilha de estrutura agora.';
    const rfs = [...new Set(est.map(e => num(e.RF)))];
    const rf = rfs.includes(per.rf) ? per.rf : Math.max(...rfs);
    const linhas = est.filter(e => num(e.RF) === rf && noEscopo(esc, e.EQUIPE) && (esc.tipo !== 'supervisor' || e.SUPERVISOR === esc.sup));
    if (!linhas.length) return `Não encontrei estrutura cadastrada para a ${b(esc.nome)}.`;
    const porTipo = new Map();
    linhas.forEach(e => porTipo.set(e.ESTRUTURA.trim(), (porTipo.get(e.ESTRUTURA.trim()) || 0) + num(e.TOTAL)));
    const rot = tp => (/colab/i.test(tp) ? 'Colaboradores (M.O)' : tp);
    // Pergunta sobre um tipo específico ("quantos tratores")
    const alvo = /trator/.test(q.t) ? /trator/i : /caminh/.test(q.t) ? /caminh/i : /colaborador|servente|pessoa|m\.?o\b|mao de obra/.test(q.t) ? /colab/i : /drone/.test(q.t) ? /drone/i : null;
    if (alvo) {
      const itens = [...porTipo.entries()].filter(([tp]) => alvo.test(tp));
      const total = itens.reduce((s, [, v]) => s + v, 0);
      const nomeTipo = /trator/.test(q.t) ? 'tratores' : /caminh/.test(q.t) ? 'caminhões' : /drone/.test(q.t) ? 'drones' : 'colaboradores';
      return itens.length
        ? `A ${b(esc.nome)} tem ${b(n0(total) + ' ' + nomeTipo)}: ${itens.map(([tp, v]) => `${n0(v)} ${rot(tp)}`).join(', ')} (planilha de estrutura, RF${String(rf).padStart(2, '0')}).`
        : `A ${b(esc.nome)} não tem ${nomeTipo} cadastrados na planilha de estrutura (RF${String(rf).padStart(2, '0')}).`;
    }
    let txt = `🧰 Estrutura da ${b(esc.nome)} (RF${String(rf).padStart(2, '0')}):\n\n` + [...porTipo.entries()].map(([tp, v]) => `- ${rot(tp)}: ${b(n0(v))}`).join('\n');
    if (esc.tipo !== 'equipe') {
      const porEquipe = new Map();
      linhas.forEach(e => { const a = porEquipe.get(e.EQUIPE) || []; a.push(`${n0(num(e.TOTAL))} ${rot(e.ESTRUTURA.trim())}`); porEquipe.set(e.EQUIPE, a); });
      txt += `\n\nPor equipe:\n` + [...porEquipe.entries()].sort().map(([eq, it]) => `- ${b(eq)}: ${it.join(', ')}`).join('\n');
    }
    return txt;
  }

  /* ---------- Entrada principal ---------- */
  async function responder(texto) {
    if (!pareceDados(texto)) return null;
    let r;
    try { r = await P.obterDados(); } catch { return { texto: 'Não consegui acessar as planilhas agora. Verifique a internet e tente de novo. 🌱', links: [] }; }
    const dados = r.dados;
    if (!dados.anderson && !dados.diario) return { texto: 'Não consegui ler as planilhas do painel agora. Tente de novo em instantes. 🌱', links: [] };

    const q = interpretar(texto, dados);
    const per = periodoPadrao(dados, q);
    // A memória só vale para continuações curtas ("e no dia 15?"); rankings e listas gerais começam do zero
    const usarContexto = !q.ranking && !q.paradas && (/^e\b/.test(q.t) || q.t.split(' ').length <= 3);
    if (usarContexto && !q.frota && contexto.frota && !q.equipe && !q.supervisor && (q.data || q.dataRelativa) && !contexto.equipe && !contexto.supervisor) q.frota = contexto.frota;
    const esc = escopo(dados, q, per, usarContexto);
    // Atualiza a memória da conversa
    if (q.equipe) { contexto.equipe = q.equipe; contexto.supervisor = null; contexto.frota = null; }
    else if (q.frota) { contexto.frota = q.frota; contexto.equipe = null; contexto.supervisor = null; }
    else if (q.supervisor) { contexto.supervisor = q.supervisor; contexto.equipe = null; contexto.frota = null; }
    else if (q.geral) { contexto.equipe = null; contexto.supervisor = null; }
    contexto.rf = per.rf; contexto.ano = per.ano;

    let resposta;
    if (q.frota && !q.ranking) resposta = respFrota(dados, q, per);
    else if (q.estrutura) resposta = respEstrutura(dados, q, per, esc);
    else if (q.observacao) resposta = respObservacoes(dados, q, per, esc);
    else if (q.paradas) resposta = respParadas(dados, q, per, esc);
    else if (q.ranking) resposta = respRanking(dados, q, per, esc);
    else if (q.data || q.dataRelativa) resposta = respDia(dados, q, per, esc);
    else if (q.porDia) resposta = respPorDia(dados, per, esc);
    else resposta = respMes(dados, per, esc);

    const aviso = r.usandoCache ? `\n\n*(dados salvos de ${new Date(r.usandoCache).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}, sem conexão com a planilha agora)*` : '';
    return { texto: resposta + aviso, links: LINK, fato: true };
  }

  window.FOLHITO_CONSULTAS = { pareceDados, responder, contexto };
})();
