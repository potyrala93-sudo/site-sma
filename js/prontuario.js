/* ==========================================================================
   SMA · Silvicultura — Qualidade · Prontuário da UP
   Ficha completa de cada UP (talhão): junta PGO (apontamentos), acompanhamento e detalhe do plantio,
   coordenadas da fazenda (clima) e RH; mostra linha do tempo, atividades, equipes, clima histórico de cada
   atividade com os eventos sensíveis, previsão, texto analítico (IA ou regras), mapa, observações e alertas.
   Camadas: 1) leitura e índice por UP  2) cálculo da ficha  3) clima  4) tela  5) análise  6) PDF e comparação
   Limites em js/dados.js → PRONTUARIO (e CLIMA para a janela de aplicação).
   ========================================================================== */

(() => {
  const D = window.SMA_DADOS, P = window.SMA_PLANILHAS;
  const CFG = D?.PRONTUARIO, CL = D?.CLIMA;
  const raiz = document.getElementById('aba-prontuario');
  if (!CFG || !CL || !P || !raiz) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fmtHa = v => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt1 = v => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n0 = v => (v == null || !Number.isFinite(+v) ? '—' : Math.round(+v).toLocaleString('pt-BR'));
  const pct = v => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
  const brl = v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const DIA = 864e5;
  const meiaNoite = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const HOJE = meiaNoite(new Date());
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const deISO = t => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]) : null; };
  const br = d => (d ? d.toLocaleDateString('pt-BR') : '—');
  const brCurto = d => (d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');
  const somar = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const diasEntre = (a, b) => Math.round((meiaNoite(b) - meiaNoite(a)) / DIA);
  const comServidor = /^https?:$/.test(location.protocol);
  const tempoWMO = c => window.SMA_CLIMA_MOTOR?.tempo(c) || ['❔', 'Sem dado'];

  /* ---------- Grupos de atividade (mesma tabela da Produção Realizada) ---------- */
  const GRUPOS = D.PRODUCAO.realizada.grupos;
  const ICONE_GRUPO = { 'Irrigação': 'droplets', 'Adubações': 'flask-conical', 'Herbicidas / Capinas': 'spray-can', 'Corretivos': 'mountain', 'Plantio / Replantio': 'sprout', 'Preparo de solo': 'tractor', 'Combate a formigas': 'bug', 'Manejo de brotação': 'scissors', 'Apoio / Horas máquina': 'clock', 'Outros': 'circle-dot' };
  const G = { herb: 'Herbicidas / Capinas', adub: 'Adubações', plantio: 'Plantio / Replantio', irrig: 'Irrigação' };
  const corGrupo = nome => GRUPOS.find(g => g.nome === nome)?.cor || '#64748b';
  const STATUS_JANELA = [{ nome: 'Janela ideal', curto: 'Ideal', cor: '#22e07a' }, { nome: 'Atenção', curto: 'Atenção', cor: '#ffc83d' }, { nome: 'Não aplicar', curto: 'Não aplicar', cor: '#ff4d5e' }];
  const st = s => STATUS_JANELA[s] || { nome: 'Sem dado', curto: '—', cor: '#64748b' };
  function seloStatus(t) {
    const k = semAcento(t).toUpperCase();
    if (!k.trim()) return { texto: 'Sem status', cor: '#64748b' };
    if (/FINALIZ|CONCLU/.test(k)) return { texto: t, cor: '#22e07a' };
    if (/ANDAMENTO/.test(k)) return { texto: t, cor: '#fbbf24' };
    if (/AGUARD|PENDENTE/.test(k)) return { texto: t, cor: '#38bdf8' };
    if (/NAO PLANEJ|CANCEL/.test(k)) return { texto: t, cor: '#94a3b8' };
    return { texto: t, cor: '#a78bfa' };
  }

  /* ======================================================================
     1. LEITURA DAS BASES E ÍNDICE POR UP (uma vez; "Atualizar dados" lê de novo)
     ====================================================================== */
  const chaveUP = t => String(t ?? '').toUpperCase().replace(/\s+/g, '').trim();
  const limparNome = t => String(t ?? '').replace(/\s+/g, ' ').replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').trim();
  const codigoFaz = t => (/\(\s*([A-Z]{1,2}-[A-Z0-9]+)\s*\)/i.exec(t || '') || [])[1]?.toUpperCase() || '';
  const nomeFaz = t => semAcento(String(t ?? '').replace(/\([^)]*\)/g, ' ')).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const textoObs = (...v) => v.map(s => String(s ?? '').trim()).filter(s => s && s !== '-' && !/^#/.test(s)).join(' · ');

  const base = { pronto: false, carregando: null, idx: new Map(), lista: [], erros: {}, clima: null, rh: new Map(), climaIdx: null, quando: null };
  let carregarCliente = null;

  // Clima nas Fazendas: mesmo resumo do bloco da Home (coordenadas corrigidas, ponto central, contorno e previsão)
  const carregar = (tag, attrs) => new Promise((ok, falha) => { const e = document.createElement(tag); Object.assign(e, attrs); e.onload = ok; e.onerror = () => falha(new Error(`não carregou ${attrs.src}`)); document.head.appendChild(e); });
  const motor = async () => { if (!window.SMA_CLIMA_MOTOR) await carregar('script', { src: 'js/clima-motor.js' }); return window.SMA_CLIMA_MOTOR; };
  const completo = d => Object.keys(d?.pontos || {}).length && !(d.semPrevisao >= Object.keys(d.pontos).length / 4);
  async function climaResumo(fresco) {
    try { const c = JSON.parse(localStorage.getItem('clima:resumo') || 'null'); if (!fresco && c && Date.now() - c.quando < CL.cacheMin * 60_000 && c.dados?.fazendas && completo(c.dados)) return c.dados; } catch { /* sem cache */ }
    let d = null;
    if (comServidor) { try { const r = await fetch('api/clima', { signal: AbortSignal.timeout(25_000) }); if (r.ok) d = await r.json(); } catch { /* navegador */ } }
    if (!d?.fazendas) {
      const M = await motor();
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${CL.planilha}/export?format=csv&gid=${CL.aba}`, { signal: AbortSignal.timeout(25_000) });
      if (!r.ok) throw new Error('planilha de coordenadas indisponível');
      d = await M.montarResumo(await r.text(), CL);
    }
    if (completo(d)) { try { localStorage.setItem('clima:resumo', JSON.stringify({ quando: Date.now(), dados: d })); } catch { /* sem espaço */ } }
    return d;
  }

  function carregarBases(fresco = false) {
    if (base.carregando && !fresco) return base.carregando;
    const tarefas = {
      pgo: () => P.lerPlanilha(CFG.pgo.planilha, CFG.pgo.aba, { fresco, coluna: 'AREA APONTADA' }),
      plantio: () => P.lerPlanilha(CFG.plantio.planilha, CFG.plantio.aba, { fresco, coluna: 'TALHAO', cabecalho: 5 }),
      detalhe: () => P.lerPlanilha(CFG.detalhe.planilha, CFG.detalhe.aba, { fresco, coluna: 'AREA PLANTADA', cabecalho: true }),
      rh: () => P.lerPlanilha(CFG.rh.planilha, CFG.rh.aba, { fresco, coluna: 'CHAPA', cabecalho: true }),
      clima: () => climaResumo(fresco)
    };
    base.carregando = Promise.allSettled(Object.values(tarefas).map(f => f())).then(res => {
      const dados = {}; base.erros = {};
      Object.keys(tarefas).forEach((k, i) => { if (res[i].status === 'fulfilled') dados[k] = res[i].value; else { base.erros[k] = res[i].reason?.message || 'falhou'; console.warn(`Prontuário: falha ao ler ${k}`, res[i].reason); } });
      indexar(dados);
      base.pronto = true; base.quando = new Date();
      return base;
    });
    return base.carregando;
  }

  function indexar(d) {
    const idx = new Map();
    const pegar = up => idx.get(up) || idx.set(up, { up, pgo: [], plantio: [], detalhe: [], nomesFaz: new Map() }).get(up);
    const contarFaz = (x, nome) => { const n = limparNome(nome); if (n) x.nomesFaz.set(n, (x.nomesFaz.get(n) || 0) + 1); };
    (d.pgo || []).forEach(l => {
      const up = chaveUP(l.UP); if (!up || up === '-' || up.startsWith('#')) return;
      const ativ = P.atividades.normalizar(l.ATIVIDADE); if (!ativ) return;
      const g = P.atividades.grupo(ativ), x = pegar(up);
      x.pgo.push({
        data: P.dataBR(l.DATA), ativ, grupo: g.nome, cor: g.cor, apoio: !!g.apoio, equipe: (String(l.EQUIPE || '').trim().toUpperCase().replace(/^[-#].*$/, '') || '—'),
        area: P.num(l['AREA APONTADA']), tarifa: P.num(l.TARIFA), total: P.num(l.TOTAL), status: String(l.STATUS || '').trim(),
        areaUP: P.num(l['AREA DA UP']), acum: P.num(l['AREA ACUMULADA']), colab: P.num(l.COLABORADORES), horario: l.HORARIO || '',
        tipo: l['TIPO DE EQUIPE'] || '', obs: textoObs(l.OBSERVACAO, l.OBS, l.CONSIDERACOES), fazenda: limparNome(l.FAZENDA)
      });
      contarFaz(x, l.FAZENDA);
    });
    (d.plantio || []).forEach(l => {
      const up = chaveUP(l.TALHAO); if (!up || up === 'TALHAO') return;
      const x = pegar(up);
      x.plantio.push({
        fazenda: limparNome(l.FAZENDAS), areaTotal: P.num(l['HA TOTAL']), areaReal: P.num(l['HA REALIZADA']), encarregado: String(l.ENCARREGADO || '').trim(),
        ini: P.dataBR(l['DATA INICIO']), fim: P.dataBR(l['DATA FIM']), material: String(l['TIPO INSUMO'] || '').trim(), status: String(l.STATUS || '').trim(),
        obs: textoObs(l.OBSERVACAO), d120: P.dataBR(l['DATA 120 DIAS']), ano: l.ANO, rf: l.RF
      });
      contarFaz(x, l.FAZENDAS);
    });
    (d.detalhe || []).forEach(l => {
      const up = chaveUP(l.UP); if (!up) return;
      const x = pegar(up);
      x.detalhe.push({ fazenda: limparNome(l.FAZENDA), area: P.num(l['AREA PLANTADA']), tipo: String(l.TIPO || '').trim(), ano: l.ANO, mes: l.MES });
      contarFaz(x, l.FAZENDA);
    });
    idx.forEach(x => {
      x.fazenda = [...x.nomesFaz.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
      x.pgo.sort((a, b) => (a.data || 0) - (b.data || 0));
      x.area = areaDaUP(x);
    });
    base.idx = idx;
    base.lista = [...idx.values()].map(x => ({ up: x.up, fazenda: x.fazenda, area: x.area, busca: semAcento(`${x.up} ${x.fazenda}`).toUpperCase() })).sort((a, b) => a.up.localeCompare(b.up));
    // RH: código curto da equipe ("C02 - BA" → "BA") → encarregado(s) e colaboradores ativos
    base.rh = new Map();
    (d.rh || []).forEach(l => {
      const cod = String(l['COD. EQUIPE'] || l['COD EQUIPE'] || '').split(/\s+-\s+|\s*-\s*/).pop().trim().toUpperCase(); if (!cod) return;
      const e = base.rh.get(cod) || base.rh.set(cod, { encarregados: new Map(), ativos: 0, total: 0 }).get(cod);
      const nome = String(l.EQUIPE || '').trim(); if (nome) e.encarregados.set(nome, (e.encarregados.get(nome) || 0) + 1);
      e.total++; if (/^ATIVO/i.test(String(l.SITUACAO || '').trim())) e.ativos++;
    });
    // Clima: índice das fazendas por código e por nome
    base.clima = d.clima || null; base.climaIdx = null;
    if (base.clima) {
      const porCodigo = new Map(), porNome = new Map();
      base.clima.fazendas.forEach(f => { const c = codigoFaz(f.nome); if (c) porCodigo.set(c, f); const k = nomeFaz(f.nome); (porNome.get(k) || porNome.set(k, []).get(k)).push(f); });
      base.climaIdx = { porCodigo, porNome };
    }
  }
  // Área da UP: ÁREA DA UP do PGO (a mais recente preenchida) ou HÁ TOTAL do plantio ou a área plantada do detalhe
  function areaDaUP(x) {
    const pgo = [...x.pgo].reverse().find(l => l.areaUP > 0)?.areaUP;
    return pgo || x.plantio.find(p => p.areaTotal > 0)?.areaTotal || x.detalhe.reduce((s, l) => s + l.area, 0) || 0;
  }
  // Fazenda → base de coordenadas: mapeamento manual, código entre parênteses ou nome normalizado
  function fazendaClima(nome) {
    if (!base.climaIdx || !nome) return null;
    const manual = Object.entries(CFG.fazendasManuais || {}).find(([k]) => nomeFaz(k) === nomeFaz(nome) || limparNome(k) === limparNome(nome))?.[1];
    const tentar = alvo => {
      const c = codigoFaz(alvo) || (/^[A-Z]{1,2}-[A-Z0-9]+$/i.test(String(alvo).trim()) ? String(alvo).trim().toUpperCase() : '');
      if (c && base.climaIdx.porCodigo.has(c)) return base.climaIdx.porCodigo.get(c);
      const l = base.climaIdx.porNome.get(nomeFaz(alvo)) || [];
      return l.find(f => base.clima.pontos[f.ponto]) || l[0] || null;
    };
    return (manual && tentar(manual)) || tentar(nome);
  }

  /* ======================================================================
     2. CÁLCULO DA FICHA
     ====================================================================== */
  function montarFicha(up) {
    const x = base.idx.get(up); if (!x) return null;
    const pl = [...x.plantio].sort((a, b) => (b.fim || b.ini || 0) - (a.fim || a.ini || 0))[0] || null;
    const fClima = fazendaClima(x.fazenda) || x.plantio.map(p => fazendaClima(p.fazenda)).find(Boolean) || null;
    const statusPGO = [...x.pgo].reverse().find(l => l.status)?.status || '';
    const ultimo = [...x.pgo].reverse().find(l => l.data && !l.apoio) || [...x.pgo].reverse().find(l => l.data) || null;
    const fimPlantio = pl?.fim || pl?.ini || null;
    const idt = {
      up, fazenda: x.fazenda, municipio: fClima?.municipio || '—', area: x.area,
      material: pl?.material || '', encarregado: pl?.encarregado || '',
      ini: pl?.ini || null, fim: pl?.fim || null, status: pl?.status || statusPGO, idade: fimPlantio ? diasEntre(fimPlantio, HOJE) : null,
      d120: pl?.d120 || null, tipoPlantio: x.detalhe.map(d => d.tipo).filter(Boolean)[0] || ''
    };
    // Apontamentos agrupados: mesma data + atividade + equipe
    const grupos = new Map();
    x.pgo.forEach(l => {
      const k = `${l.data ? iso(l.data) : 'sem-data'}|${l.ativ}|${l.equipe}`;
      const e = grupos.get(k) || grupos.set(k, { tipo: 'pgo', data: l.data, ativ: l.ativ, grupo: l.grupo, cor: l.cor, apoio: l.apoio, equipe: l.equipe, area: 0, total: 0, linhas: 0, obs: [] }).get(k);
      e.area += l.area; e.total += l.total; e.linhas++; if (l.obs && !e.obs.includes(l.obs)) e.obs.push(l.obs);
    });
    const eventos = [...grupos.values()];
    if (pl?.ini) eventos.push({ tipo: 'plantio-ini', data: pl.ini, ativ: 'Início do plantio', grupo: G.plantio, cor: corGrupo(G.plantio), equipe: pl.encarregado || '—', material: pl.material, area: 0, total: 0 });
    if (pl?.fim) eventos.push({ tipo: 'plantio-fim', data: pl.fim, ativ: 'Fim do plantio', grupo: G.plantio, cor: corGrupo(G.plantio), equipe: pl.encarregado || '—', material: pl.material, area: pl.areaReal || pl.areaTotal || 0, total: 0 });
    eventos.sort((a, b) => (b.data || 0) - (a.data || 0));
    const producao = x.pgo.filter(l => !l.apoio);
    const datas = new Set(x.pgo.filter(l => l.data).map(l => iso(l.data)));
    const kpis = {
      area: producao.reduce((s, l) => s + l.area, 0), faturamento: x.pgo.reduce((s, l) => s + l.total, 0), dias: datas.size,
      atividades: new Set(x.pgo.map(l => l.ativ)).size, equipes: new Set(x.pgo.map(l => l.equipe).filter(e => e !== '—')), ultimo: ultimo?.data || null
    };
    // Atividades da UP
    const porAtiv = new Map();
    x.pgo.forEach(l => {
      const a = porAtiv.get(l.ativ) || porAtiv.set(l.ativ, { ativ: l.ativ, grupo: l.grupo, cor: l.cor, apoio: l.apoio, ini: l.data, fim: l.data, area: 0, total: 0, datas: new Set(), equipes: new Set() }).get(l.ativ);
      a.area += l.area; a.total += l.total; if (l.data) { a.datas.add(iso(l.data)); if (!a.ini || l.data < a.ini) a.ini = l.data; if (!a.fim || l.data > a.fim) a.fim = l.data; }
      if (l.equipe !== '—') a.equipes.add(l.equipe);
    });
    const atividades = [...porAtiv.values()].map(a => ({ ...a, dias: a.datas.size, pct: idt.area ? a.area / idt.area : null, rend: a.datas.size ? a.area / a.datas.size : 0 }))
      .sort((a, b) => GRUPOS.findIndex(g => g.nome === a.grupo) - GRUPOS.findIndex(g => g.nome === b.grupo) || (a.ini || 0) - (b.ini || 0));
    // Por grupo (avanço: maior % entre as atividades do grupo)
    const porGrupo = new Map();
    atividades.filter(a => !a.apoio).forEach(a => { const g = porGrupo.get(a.grupo) || porGrupo.set(a.grupo, { grupo: a.grupo, cor: a.cor, area: 0, pct: 0, total: 0, ultima: null, atividades: [] }).get(a.grupo); g.area += a.area; g.total += a.total; g.pct = Math.max(g.pct, a.pct || 0); g.atividades.push(a.ativ); if (!g.ultima || a.fim > g.ultima) g.ultima = a.fim; });
    // Equipes que passaram
    const porEquipe = new Map();
    x.pgo.filter(l => l.equipe !== '—').forEach(l => {
      const e = porEquipe.get(l.equipe) || porEquipe.set(l.equipe, { equipe: l.equipe, atividades: new Set(), area: 0, datas: new Set(), total: 0 }).get(l.equipe);
      e.atividades.add(l.ativ); if (!l.apoio) e.area += l.area; e.total += l.total; if (l.data) e.datas.add(iso(l.data));
    });
    const equipes = [...porEquipe.values()].map(e => {
      const rh = base.rh.get(e.equipe);
      return { ...e, dias: e.datas.size, rend: e.datas.size ? e.area / e.datas.size : 0, encarregado: rh ? [...rh.encarregados.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : '', ativos: rh?.ativos ?? null };
    }).sort((a, b) => b.area - a.area);
    // Observações de campo
    const obs = [
      ...x.plantio.filter(p => p.obs).map(p => ({ data: p.fim || p.ini, origem: 'Plantio', equipe: p.encarregado || '—', ativ: 'Plantio', texto: p.obs })),
      ...eventos.filter(e => e.tipo === 'pgo' && e.obs?.length).map(e => ({ data: e.data, origem: 'PGO', equipe: e.equipe, ativ: e.ativ, texto: e.obs.join(' · ') }))
    ].sort((a, b) => (b.data || 0) - (a.data || 0));
    // Alertas (os de clima entram depois, quando o histórico chega)
    const alertas = [];
    if (idt.area > 0) atividades.filter(a => !a.apoio && a.area > idt.area * 1.001).forEach(a => alertas.push({ nivel: 'alerta', icone: 'layers', texto: `${a.ativ}: área apontada acumulada de ${fmtHa(a.area)} ha passa da área da UP (${fmtHa(idt.area)} ha) — ${pct(a.area / idt.area)}.` }));
    const semValor = x.pgo.filter(l => l.area > 0 && Math.abs(l.total) < 0.005);
    if (semValor.length) alertas.push({ nivel: 'atencao', icone: 'circle-dollar-sign', texto: `${semValor.length} linha(s) com área apontada e faturamento R$ 0,00 (${[...new Set(semValor.map(l => `${l.ativ} em ${br(l.data)}`))].slice(0, 3).join('; ')}${semValor.length > 3 ? '…' : ''}).` });
    const emAndamento = /ANDAMENTO/i.test(semAcento(idt.status)) || /ANDAMENTO/i.test(semAcento(statusPGO));
    const diasSem = kpis.ultimo ? diasEntre(kpis.ultimo, HOJE) : null;
    if (emAndamento && diasSem != null && diasSem > CFG.semApontamentoDias) alertas.push({ nivel: 'atencao', icone: 'calendar-x', texto: `UP em andamento e sem apontamento há ${diasSem} dias (último em ${br(kpis.ultimo)}).` });
    if (pl?.ini && pl?.fim && pl.ini > pl.fim) alertas.push({ nivel: 'atencao', icone: 'calendar-range', texto: `Na planilha de plantio, a data de início (${br(pl.ini)}) está depois da data de fim (${br(pl.fim)}): conferir.` });
    if (idt.d120) {
      const faltam = diasEntre(HOJE, idt.d120);
      if (faltam >= 0 && faltam <= CFG.avisar120Dias) alertas.push({ nivel: 'alerta', icone: 'alarm-clock', texto: `Avaliação de 120 dias em ${br(idt.d120)}: faltam ${faltam} dia(s).` });
      else if (faltam > CFG.avisar120Dias) alertas.push({ nivel: 'info', icone: 'calendar-clock', texto: `Avaliação de 120 dias em ${br(idt.d120)} (faltam ${faltam} dias).` });
    }
    return { up, x, pl, fClima, idt, eventos, kpis, atividades, porGrupo: [...porGrupo.values()], equipes, obs, alertas, diasSem, clima: null, previsao: null, sensiveis: [], analise: null };
  }

  /* ======================================================================
     3. CLIMA: histórico diário do ponto central da fazenda (cache por data) e previsão
     ====================================================================== */
  const DIARIAS = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,relative_humidity_2m_mean';
  const historicos = new Map();   // "lat,lon" → promessa
  async function climaHistorico(lat, lon, desde) {
    const k = `${lat.toFixed(3)},${lon.toFixed(3)}`, chave = `pront:clima:${k}`;
    let c; try { c = JSON.parse(localStorage.getItem(chave) || 'null'); } catch { c = null; }
    c ||= { dias: {}, recente: 0 };
    const limite = somar(HOJE, -CFG.climaRecenteDias);     // daqui para trás: API de histórico
    const ler = (url, guardar) => fetch(url, { signal: AbortSignal.timeout(30_000) }).then(r => r.json()).then(j => {
      if (j.error) throw new Error(j.reason || 'Open-Meteo');
      const dd = j.daily; dd.time.forEach((t, i) => { if (guardar(t)) c.dias[t] = { c: dd.weather_code[i], tx: dd.temperature_2m_max[i], tn: dd.temperature_2m_min[i], p: dd.precipitation_sum[i] ?? 0, v: dd.wind_speed_10m_max[i], g: dd.wind_gusts_10m_max[i], u: dd.relative_humidity_2m_mean?.[i] }; });
    });
    const tarefas = [];
    const ini = somar(desde, -3);
    if (ini < limite) {
      let falta = null; for (let d = ini; d < limite; d = somar(d, 1)) if (!c.dias[iso(d)]) { falta = d; break; }
      if (falta) tarefas.push(ler(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${iso(falta)}&end_date=${iso(somar(limite, -1))}&daily=${DIARIAS}&timezone=America%2FSao_Paulo&wind_speed_unit=kmh`, t => t < iso(limite)));
    }
    if (Date.now() - c.recente > CL.cacheMin * 60_000) tarefas.push(ler(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&past_days=${CFG.climaRecenteDias}&forecast_days=1&daily=${DIARIAS}&timezone=America%2FSao_Paulo&wind_speed_unit=kmh`, t => t >= iso(limite) && t <= iso(HOJE)).then(() => { c.recente = Date.now(); }));
    const res = await Promise.allSettled(tarefas);
    try { localStorage.setItem(chave, JSON.stringify(c)); } catch { /* sem espaço: segue sem cache */ }
    const falha = res.find(r => r.status === 'rejected');
    if (falha && !Object.keys(c.dias).length) throw falha.reason;
    return c.dias;
  }
  const historicoDe = (f, desde) => {
    const k = `${f.lat},${f.lon}|${iso(desde)}`;
    if (!historicos.has(k)) historicos.set(k, climaHistorico(f.lat, f.lon, desde).catch(e => { historicos.delete(k); throw e; }));
    return historicos.get(k);
  };
  async function previsaoDoPonto(id) {
    if (comServidor) { try { const r = await fetch(`api/clima/ponto/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(25_000) }); if (r.ok) { const j = await r.json(); if (j.dias?.length) return j; } } catch { /* navegador */ } }
    const M = await motor(), p = M.pontoValido(id, CL); if (!p) throw new Error('ponto inválido');
    const [hourly] = await M.previsao([p]); if (!hourly) throw new Error('o Open-Meteo não respondeu');
    return M.montarDetalhe(id, hourly, CL);
  }
  // Clima de uma data e somas de chuva em volta
  const climaDia = (dias, d) => dias?.[iso(d)] || null;
  const chuvaEntre = (dias, d, de, ate) => { let s = 0, n = 0; for (let k = de; k <= ate; k++) { const c = climaDia(dias, somar(d, k)); if (c) { s += c.p || 0; n++; } } return n ? s : null; };
  function eventosSensiveis(F) {
    const dias = F.clima, S = CFG.sensiveis, out = [], visto = new Set();
    if (!dias) return out;
    const add = (tipo, e, texto) => { const k = `${tipo}|${iso(e.data)}`; if (visto.has(k)) return; visto.add(k); out.push({ tipo, data: e.data, grupo: e.grupo, ativ: e.ativ, texto }); };
    const irrigacoes = F.eventos.filter(e => e.grupo === G.irrig && e.data).map(e => e.data);
    F.eventos.filter(e => e.data && !e.apoio).forEach(e => {
      const c0 = climaDia(dias, e.data), c1 = climaDia(dias, somar(e.data, 1));
      if (e.grupo === G.herb) {
        const pior = Math.max(c0?.p ?? 0, c1?.p ?? 0);
        if (pior > S.herbicidaChuvaMm) add('lavagem', e, `${e.ativ} em ${br(e.data)}: chuva de ${fmt1(pior)} mm no dia ou no dia seguinte (risco de lavagem).`);
        if ((c0?.g ?? 0) > S.herbicidaRajadaKmh) add('deriva', e, `${e.ativ} em ${br(e.data)}: rajada de ${n0(c0.g)} km/h no dia (risco de deriva).`);
      }
      if (e.grupo === G.adub) {
        const ch = chuvaEntre(dias, e.data, 0, S.adubacaoDias);
        if (ch != null && ch > S.adubacaoChuvaMm) add('perda', e, `${e.ativ} em ${br(e.data)}: ${fmt1(ch)} mm de chuva em até ${S.adubacaoDias} dias (risco de perda do adubo).`);
      }
      if (e.grupo === G.plantio && e.tipo !== 'plantio-ini') {
        if (somar(e.data, 7) <= HOJE) {
          const ch = chuvaEntre(dias, e.data, 1, 7), irrigou = irrigacoes.some(d => d >= e.data && d <= somar(e.data, 7));
          if (ch != null && ch < S.plantioChuva7dMm && !irrigou) add('estresse', e, `${e.ativ} em ${br(e.data)}: só ${fmt1(ch)} mm de chuva nos 7 dias seguintes e sem irrigação apontada (risco de estresse hídrico).`);
        }
        let tx = null; for (let k = 1; k <= 3; k++) { const c = climaDia(dias, somar(e.data, k)); if (c?.tx != null) tx = Math.max(tx ?? -99, c.tx); }
        if (tx != null && tx > S.plantioTempMax) add('calor', e, `${e.ativ} em ${br(e.data)}: máxima de ${fmt1(tx)} °C nos 3 dias seguintes.`);
      }
    });
    return out.sort((a, b) => b.data - a.data);
  }
  const ROTULO_SENSIVEL = { lavagem: 'Lavagem', deriva: 'Deriva', perda: 'Perda de adubo', estresse: 'Estresse hídrico', calor: 'Calor' };
  const resumoSensiveis = F => Object.entries(F.sensiveis.reduce((m, s) => ({ ...m, [ROTULO_SENSIVEL[s.tipo]]: (m[ROTULO_SENSIVEL[s.tipo]] || 0) + 1 }), {})).map(([k, v]) => `${k.toLowerCase()} ${v}`).join(', ');

  /* ======================================================================
     4. TELA
     ====================================================================== */
  const estado = { ficha: null, ordem: -1, filtroGrupo: '', filtroEquipe: '', limiteLinha: 40, grafico: null, mapa: null, comparar: [], ia: null };
  const CHAVE_RECENTES = 'pront:recentes';
  const lerRecentes = () => { try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]'); } catch { return []; } };
  function guardarRecente(up) { const l = [up, ...lerRecentes().filter(u => u !== up)].slice(0, CFG.recentes); try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(l)); } catch { /* opcional */ } renderRecentes(); }
  function renderRecentes() {
    const l = lerRecentes().filter(u => !base.pronto || base.idx.has(u));
    $('#pr-recentes').innerHTML = l.length ? `<span class="pr-recentes-rot"><i data-lucide="history"></i>UPs recentes</span>${l.map(u => `<button type="button" class="chip-filtro pr-recente" data-up="${esc(u)}">${esc(u)}</button>`).join('')}` : '';
    icones();
  }
  $('#pr-recentes').addEventListener('click', e => { const b = e.target.closest('[data-up]'); if (b) abrirUP(b.dataset.up); });

  /* ---------- Busca com autocompletar (usada também na comparação) ---------- */
  function sugerir(texto, limite = 8) {
    const t = semAcento(texto).toUpperCase().replace(/\s+/g, ' ').trim(); if (!t) return [];
    const tUp = t.replace(/\s+/g, '');
    const pontos = base.lista.map(s => {
      let n = 0;
      if (s.up === tUp) n = 100; else if (s.up.startsWith(tUp)) n = 80; else if (s.up.includes(tUp)) n = 60; else if (s.busca.includes(t)) n = 40;
      return [n, s];
    }).filter(([n]) => n).sort((a, b) => b[0] - a[0] || a[1].up.localeCompare(b[1].up));
    return pontos.slice(0, limite).map(([, s]) => s);
  }
  // Códigos parecidos (para a UP que não existe): distância de edição pequena
  function parecidos(up, n = 5) {
    const dist = (a, b) => { const m = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { let ant = m[0]; m[0] = i; for (let j = 1; j <= b.length; j++) { const t = m[j]; m[j] = Math.min(m[j] + 1, m[j - 1] + 1, ant + (a[i - 1] === b[j - 1] ? 0 : 1)); ant = t; } } return m[b.length]; };
    return base.lista.map(s => [dist(up, s.up), s]).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, s]) => s);
  }
  function autocompletar(input, lista, escolher) {
    let itens = [], ativo = -1;
    const fechar = () => { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); ativo = -1; };
    const pintar = () => $$('li', lista).forEach((li, i) => { li.classList.toggle('ativo', i === ativo); li.setAttribute('aria-selected', String(i === ativo)); });
    input.addEventListener('input', () => {
      if (!base.pronto) return;
      itens = sugerir(input.value);
      lista.innerHTML = itens.map((s, i) => `<li role="option" id="${lista.id}-${i}" data-up="${esc(s.up)}"><b>${esc(s.up)}</b><span>${esc(s.fazenda)}</span><small>${s.area ? `${fmtHa(s.area)} ha` : '—'}</small></li>`).join('') || '<li class="pr-sem">Nenhuma UP ou fazenda com esse texto</li>';
      lista.hidden = !input.value.trim(); input.setAttribute('aria-expanded', String(!lista.hidden)); ativo = -1;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!itens.length) return; e.preventDefault(); ativo = (ativo + (e.key === 'ArrowDown' ? 1 : itens.length - 1)) % itens.length; pintar(); input.setAttribute('aria-activedescendant', `${lista.id}-${ativo}`); }
      else if (e.key === 'Enter') { e.preventDefault(); const up = itens[ativo]?.up || (itens.length === 1 ? itens[0].up : chaveUP(input.value)); if (up) { fechar(); escolher(up); } }
      else if (e.key === 'Escape') fechar();
    });
    lista.addEventListener('mousedown', e => { const li = e.target.closest('[data-up]'); if (!li) return; e.preventDefault(); fechar(); escolher(li.dataset.up); });
    input.addEventListener('blur', () => setTimeout(fechar, 120));
  }
  autocompletar($('#pr-busca'), $('#pr-sugestoes'), up => { $('#pr-busca').value = ''; abrirUP(up); });

  /* ---------- Abrir uma UP ---------- */
  async function abrirUP(upTexto, { rolar = true } = {}) {
    const up = chaveUP(upTexto);
    window.SMA_QUALIDADE_ABA?.('prontuario', false);
    history.replaceState(null, '', `${location.pathname}?up=${encodeURIComponent(up)}#prontuario`);
    if (!base.pronto) { $('#pr-ficha').innerHTML = esqueleto(); await carregarBases(); renderAvisos(); }
    const F = montarFicha(up);
    estado.comparar = []; $('#pr-comparacao').hidden = true;
    if (!F) {
      estado.ficha = null; $('#pr-pdf').disabled = $('#pr-comparar').disabled = true;
      $('#pr-ficha').innerHTML = `<section class="container fat-secao"><div class="fat-painel glass pr-nao-achou"><i data-lucide="search-x"></i><div><h3>UP <b>${esc(up)}</b> não encontrada</h3><p>Ela não aparece no PGO, no acompanhamento nem no detalhe do plantio. Códigos parecidos:</p>
        <div class="pr-parecidas">${parecidos(up).map(s => `<button type="button" class="chip-filtro" data-up="${esc(s.up)}">${esc(s.up)} <small>${esc(s.fazenda)}</small></button>`).join('')}</div></div></div></section>`;
      icones(); return;
    }
    estado.ficha = F; estado.filtroGrupo = estado.filtroEquipe = ''; estado.limiteLinha = 40;
    guardarRecente(up);
    $('#pr-pdf').disabled = $('#pr-comparar').disabled = false;
    renderFicha(F);
    if (rolar) $('#pr-ficha').scrollIntoView({ behavior: 'smooth', block: 'start' });
    carregarClimaDaFicha(F);
  }
  $('#pr-ficha').addEventListener('click', e => { const b = e.target.closest('.pr-parecidas [data-up]'); if (b) abrirUP(b.dataset.up); });

  function esqueleto() { return '<section class="container fat-secao"><div class="fat-painel glass"><div class="esqueleto tabela-esq"></div></div></section>'; }
  function renderAvisos() {
    const nomes = { pgo: 'PGO (apontamentos)', plantio: 'acompanhamento de plantio', detalhe: 'detalhe do plantio', rh: 'RH', clima: 'coordenadas / clima' };
    const e = Object.keys(base.erros);
    const el = $('#pr-avisos'); el.hidden = !e.length;
    if (e.length) el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>Parte da ficha ficou sem dados</strong><p>Não consegui ler: ${e.map(k => `<b>${nomes[k]}</b> (${esc(base.erros[k])})`).join(', ')}. O restante aparece normalmente.</p></div>`;
    const cache = P.avisoCache?.();
    $('#pr-status').textContent = `${base.lista.length.toLocaleString('pt-BR')} UPs indexadas · PGO, plantio, coordenadas e RH · lido às ${base.quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}${cache ? ' · parte vinda do cache do navegador' : ''}`;
    icones();
  }

  /* ---------- Ficha ---------- */
  const kpi = (ic, rot, val, ajuda = '', extra = '') => `<article class="kpi glass ${extra}"><span class="icon-box"><i data-lucide="${ic}"></i></span><span class="kpi-rot">${rot}</span><strong class="kpi-val">${val}</strong>${ajuda ? `<small class="kpi-ajuda">${ajuda}</small>` : ''}</article>`;
  const secao = (id, eyebrow, titulo, serif, corpo, acoes = '') => `<section class="container fat-secao" id="${id}" aria-labelledby="${id}-tit"><div class="fat-sec-head"><div><span class="eyebrow">${eyebrow}</span><h2 class="fat-sec-titulo" id="${id}-tit">${titulo} <span class="serif">${serif}</span></h2></div>${acoes}</div>${corpo}</section>`;

  function renderFicha(F) {
    const I = F.idt, K = F.kpis, sel = seloStatus(I.status);
    const ultimoHa = K.ultimo ? diasEntre(K.ultimo, HOJE) : null;
    $('#pr-ficha').innerHTML = `
      <section class="container fat-secao pr-identidade-wrap">
        <div class="pr-identidade glass" style="--c:${sel.cor}">
          <div class="pr-id-topo">
            <div><span class="eyebrow">Prontuário da UP</span><h2 class="pr-up">${esc(I.up)}</h2><p class="pr-faz">${esc(I.fazenda)} · <span>${esc(I.municipio)}</span></p></div>
            <span class="pr-selo" style="--c:${sel.cor}"><i></i>${esc(sel.texto)}</span>
          </div>
          <dl class="pr-id-grade">
            <div><dt>Área da UP</dt><dd>${I.area ? `${fmtHa(I.area)} ha` : '—'}</dd></div>
            <div><dt>Material genético</dt><dd>${esc(I.material || '—')}</dd></div>
            <div><dt>Encarregado do plantio</dt><dd>${esc(I.encarregado || '—')}</dd></div>
            <div><dt>Plantio</dt><dd>${I.ini || I.fim ? `${br(I.ini)} – ${br(I.fim)}` : '—'}</dd></div>
            <div><dt>Idade do plantio</dt><dd>${I.idade != null ? `<b>${I.idade.toLocaleString('pt-BR')}</b> dias` : '—'}</dd></div>
            <div><dt>Avaliação de 120 dias</dt><dd>${I.d120 ? br(I.d120) : '—'}</dd></div>
          </dl>
        </div>
      </section>
      <section class="container fat-secao"><div class="pr-kpis">
        ${kpi('land-plot', 'Área total apontada', `${fmtHa(K.area)} <small>ha</small>`, 'sem apoio / horas máquina')}
        ${kpi('wallet', 'Faturamento total', brl(K.faturamento), '', 'dinheiro')}
        ${kpi('calendar-days', 'Dias trabalhados', K.dias.toLocaleString('pt-BR'), 'datas distintas')}
        ${kpi('list-checks', 'Atividades diferentes', K.atividades.toLocaleString('pt-BR'))}
        ${kpi('users', 'Equipes que passaram', K.equipes.size.toLocaleString('pt-BR'), [...K.equipes].join(' · '))}
        ${kpi('history', 'Último apontamento', K.ultimo ? br(K.ultimo) : '—', ultimoHa != null ? (ultimoHa === 0 ? 'hoje' : `há ${ultimoHa} dia(s)`) : '')}
      </div></section>
      <div class="container pr-duas">
        <div class="pr-col-linha">${secao('pr-sec-linha', 'Histórico', 'Linha do', 'tempo', `<div class="pr-linha-filtros" id="pr-linha-filtros"></div><div class="fat-painel glass pr-linha" id="pr-linha"></div>`, `<button type="button" class="fat-btn" id="pr-inverter"><i data-lucide="arrow-down-up"></i><span>Mais antigos primeiro</span></button>`)}</div>
        <div class="pr-col-lado">
          ${secao('pr-sec-alertas', 'Alertas', 'Pontos de', 'atenção', '<div class="fat-painel glass" id="pr-alertas"></div>')}
        </div>
      </div>
      ${secao('pr-sec-mapa', 'Localização', 'Mapa da', 'fazenda', '<div class="fat-painel glass pr-mapa-wrap pr-mapa-largo"><div class="pr-mapa" id="pr-mapa" aria-label="Mapa da fazenda da UP"></div><p class="pr-mapa-nota"><i data-lucide="map-pin"></i>Localização da fazenda (a base não tem coordenada por UP).</p></div>')}
      ${secao('pr-sec-analise', 'Análise', 'Leitura', 'da UP', '<div class="fat-painel glass pr-analise" id="pr-analise"><p class="pr-carregando">Montando a análise depois que o clima chegar…</p></div>', '<button type="button" class="fat-btn" id="pr-regenerar" disabled><i data-lucide="sparkles"></i><span>Regenerar análise</span></button>')}
      ${secao('pr-sec-ativ', 'Operações', 'Atividades', 'da UP', `<div class="fat-painel glass q-tabela-wrap" id="pr-atividades">${tabelaAtividades(F)}</div>`)}
      ${secao('pr-sec-clima', 'Clima', 'Clima', 'e atividades', `<div class="fat-painel glass pr-clima-hist"><div class="fat-grafico alto"><canvas id="pr-graf" role="img" aria-label="Chuva diária e temperatura máxima no período da UP, com as atividades marcadas"></canvas><p class="pr-carregando" id="pr-graf-msg">Buscando o clima de cada dia na fazenda…</p></div></div>
        <div class="pr-sensiveis" id="pr-sensiveis"></div>`)}
      ${secao('pr-sec-prev', 'Previsão', 'Próximos', '7 dias', '<div class="fat-painel glass pr-previsao" id="pr-previsao"><p class="pr-carregando">Buscando a previsão…</p></div>')}
      ${secao('pr-sec-eq', 'Recursos', 'Equipes que', 'passaram', `<div class="fat-painel glass q-tabela-wrap">${tabelaEquipes(F)}</div>`)}
      ${secao('pr-sec-obs', 'Campo', 'Observações', 'de campo', `<div class="fat-painel glass" id="pr-obs">${listaObs(F)}</div>`)}`;
    renderFiltrosLinha(F); renderLinha(F); renderAlertas(F); renderMapa(F);
    icones();
  }

  function tabelaAtividades(F) {
    if (!F.atividades.length) return '<p class="pr-vazio">Nenhum apontamento desta UP no PGO.</p>';
    return `<table class="q-tab pr-tab"><thead><tr><th>Grupo</th><th>Atividade</th><th>Primeira</th><th>Última</th><th class="num">Área (ha)</th><th>% da área da UP</th><th class="num">Dias</th><th class="num">ha/dia</th><th class="num">Faturamento</th><th>Equipes</th></tr></thead><tbody>
      ${F.atividades.map(a => {
        const p = a.pct, larg = p == null ? 0 : Math.min(p, 1) * 100, passou = p != null && p > 1.001;
        return `<tr style="--c:${a.cor}"><td data-rotulo="Grupo"><span class="pr-grupo" style="--c:${a.cor}"><i data-lucide="${ICONE_GRUPO[a.grupo] || 'circle-dot'}"></i>${esc(a.grupo)}</span></td><td data-rotulo="Atividade"><b>${esc(a.ativ)}</b></td>
          <td data-rotulo="Primeira">${br(a.ini)}</td><td data-rotulo="Última">${br(a.fim)}</td><td data-rotulo="Área" class="num">${a.apoio ? `<span class="pr-mudo">${fmtHa(a.area)} (horas)</span>` : fmtHa(a.area)}</td>
          <td data-rotulo="% da área">${a.apoio || p == null ? '<span class="pr-mudo">—</span>' : `<div class="pr-barra ${passou ? 'passou' : ''}"><i style="width:${larg}%"></i><b>${pct(p)}</b></div>`}</td>
          <td data-rotulo="Dias" class="num">${a.dias}</td><td data-rotulo="ha/dia" class="num">${a.apoio ? '—' : fmtHa(a.rend)}</td><td data-rotulo="Faturamento" class="num">${brl(a.total)}</td><td data-rotulo="Equipes">${esc([...a.equipes].join(', ') || '—')}</td></tr>`;
      }).join('')}</tbody></table>`;
  }
  function tabelaEquipes(F) {
    if (!F.equipes.length) return '<p class="pr-vazio">Nenhuma equipe apontada nesta UP.</p>';
    return `<table class="q-tab pr-tab"><thead><tr><th>Equipe</th><th>Encarregado (RH)</th><th class="num">Colaboradores ativos</th><th>Atividades feitas</th><th class="num">Área (ha)</th><th class="num">Dias</th><th class="num">ha/dia</th></tr></thead><tbody>
      ${F.equipes.map(e => `<tr><td data-rotulo="Equipe"><span class="pr-equipe">${esc(e.equipe)}</span></td><td data-rotulo="Encarregado">${esc(e.encarregado || '—')}</td><td data-rotulo="Ativos" class="num">${e.ativos ?? '—'}</td>
        <td data-rotulo="Atividades">${[...e.atividades].map(a => `<span class="pr-ativ-mini">${esc(a)}</span>`).join('')}</td><td data-rotulo="Área" class="num">${fmtHa(e.area)}</td><td data-rotulo="Dias" class="num">${e.dias}</td><td data-rotulo="ha/dia" class="num">${fmtHa(e.rend)}</td></tr>`).join('')}</tbody></table>`;
  }
  function listaObs(F) {
    if (!F.obs.length) return '<p class="pr-vazio">Sem observações de campo nesta UP.</p>';
    return `<ul class="pr-obs">${F.obs.map(o => `<li><span class="pr-obs-data">${br(o.data)}</span><span class="pr-obs-origem ${o.origem === 'Plantio' ? 'plantio' : ''}">${o.origem}</span><div><small>${esc(o.ativ)} · equipe ${esc(o.equipe)}</small><p>${esc(o.texto)}</p></div></li>`).join('')}</ul>`;
  }

  /* ---------- Linha do tempo ---------- */
  function renderFiltrosLinha(F) {
    const grupos = [...new Set(F.eventos.map(e => e.grupo))], equipes = [...new Set(F.eventos.filter(e => e.tipo === 'pgo').map(e => e.equipe))].filter(e => e !== '—').sort();
    $('#pr-linha-filtros').innerHTML = `<label class="pr-sel"><i data-lucide="layers"></i><select id="pr-f-grupo" aria-label="Filtrar por grupo de atividade"><option value="">Todos os grupos</option>${grupos.map(g => `<option ${estado.filtroGrupo === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>
      <label class="pr-sel"><i data-lucide="users"></i><select id="pr-f-equipe" aria-label="Filtrar por equipe"><option value="">Todas as equipes</option>${equipes.map(e => `<option ${estado.filtroEquipe === e ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></label>`;
  }
  function renderLinha(F) {
    let ev = F.eventos.filter(e => (!estado.filtroGrupo || e.grupo === estado.filtroGrupo) && (!estado.filtroEquipe || e.equipe === estado.filtroEquipe));
    if (estado.ordem > 0) ev = [...ev].reverse();
    const sens = new Map(); F.sensiveis.forEach(s => { const k = iso(s.data); (sens.get(k) || sens.set(k, []).get(k)).push(s); });
    const mostrar = ev.slice(0, estado.limiteLinha);
    $('#pr-linha').innerHTML = !ev.length ? '<p class="pr-vazio">Nenhum evento com esses filtros.</p>' : `<ol class="pr-tl">${mostrar.map(e => {
      const c = F.clima && e.data ? climaDia(F.clima, e.data) : null, [ic, desc] = c ? tempoWMO(c.c) : ['', ''];
      const s = e.data ? (sens.get(iso(e.data)) || []).filter(x => x.grupo === e.grupo) : [];
      const plantio = e.tipo !== 'pgo';
      return `<li class="pr-ev ${plantio ? 'pr-ev-plantio' : ''} ${s.length ? 'sensivel' : ''}" style="--c:${e.cor}">
        <span class="pr-ev-ponto"><i data-lucide="${plantio ? (e.tipo === 'plantio-ini' ? 'flag' : 'flag-triangle-right') : ICONE_GRUPO[e.grupo] || 'circle-dot'}"></i></span>
        <div class="pr-ev-cartao">
          <div class="pr-ev-topo"><time>${e.data ? br(e.data) : 'sem data'}</time><span class="pr-grupo" style="--c:${e.cor}">${esc(e.grupo)}</span>${c ? `<span class="pr-ev-clima" title="${esc(desc)} · ${fmt1(c.tx)}° / ${fmt1(c.tn)}° · rajada ${n0(c.g)} km/h">${ic} ${fmt1(c.p)} mm</span>` : ''}</div>
          <b class="pr-ev-ativ">${esc(e.ativ)}</b>
          <div class="pr-ev-dados">${plantio
            ? `<span><i data-lucide="dna"></i>${esc(e.material || '—')}</span><span><i data-lucide="user"></i>${esc(e.equipe)}</span>${e.area ? `<span><i data-lucide="land-plot"></i>${fmtHa(e.area)} ha</span>` : ''}`
            : `<span><i data-lucide="users"></i>Equipe ${esc(e.equipe)}</span><span><i data-lucide="land-plot"></i>${fmtHa(e.area)} ${e.apoio ? 'h/ha' : 'ha'}</span><span><i data-lucide="wallet"></i>${brl(e.total)}</span>${e.linhas > 1 ? `<span class="pr-mudo">${e.linhas} apontamentos</span>` : ''}`}</div>
          ${s.map(x => `<p class="pr-ev-sens"><i data-lucide="cloud-alert"></i>${ROTULO_SENSIVEL[x.tipo]}: ${esc(x.texto.split(': ').slice(1).join(': '))}</p>`).join('')}
        </div></li>`;
    }).join('')}</ol>${ev.length > mostrar.length ? `<button type="button" class="fat-btn pr-mais" id="pr-mais"><i data-lucide="chevrons-down"></i><span>Mostrar mais ${Math.min(40, ev.length - mostrar.length)} de ${ev.length - mostrar.length}</span></button>` : ''}`;
    icones();
  }
  $('#pr-ficha').addEventListener('change', e => {
    if (!estado.ficha) return;
    if (e.target.id === 'pr-f-grupo') { estado.filtroGrupo = e.target.value; renderLinha(estado.ficha); }
    if (e.target.id === 'pr-f-equipe') { estado.filtroEquipe = e.target.value; renderLinha(estado.ficha); }
  });
  $('#pr-ficha').addEventListener('click', e => {
    if (!estado.ficha) return;
    if (e.target.closest('#pr-mais')) { estado.limiteLinha += 40; renderLinha(estado.ficha); }
    if (e.target.closest('#pr-inverter')) { estado.ordem *= -1; $('#pr-inverter span').textContent = estado.ordem > 0 ? 'Mais recentes primeiro' : 'Mais antigos primeiro'; renderLinha(estado.ficha); }
    if (e.target.closest('#pr-regenerar')) analisar(estado.ficha, true);
  });

  function renderAlertas(F) {
    const sens = F.sensiveis.map(s => ({ nivel: 'atencao', icone: 'cloud-alert', texto: s.texto }));
    const todos = [...F.alertas.filter(a => a.nivel === 'alerta'), ...F.alertas.filter(a => a.nivel === 'atencao'), ...sens, ...F.alertas.filter(a => a.nivel === 'info')];
    $('#pr-alertas').innerHTML = todos.length ? `<ul class="pr-alertas">${todos.map(a => `<li class="${a.nivel}"><i data-lucide="${a.icone}"></i><span>${esc(a.texto)}</span></li>`).join('')}</ul>` : '<p class="pr-ok"><i data-lucide="shield-check"></i>Nenhum alerta para esta UP.</p>';
    icones();
  }

  function renderMapa(F) {
    const el = $('#pr-mapa'); if (!el) return;
    estado.mapa?.remove(); estado.mapa = null;
    const f = F.fClima;
    if (!f || !window.L) { el.innerHTML = `<p class="pr-vazio">${f ? 'Mapa indisponível (biblioteca não carregou).' : 'Fazenda não encontrada na base de coordenadas. Se o nome for diferente, ajuste em js/dados.js → PRONTUARIO.fazendasManuais.'}</p>`; return; }
    const L = window.L, m = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 18, attribution: 'Imagens © Esri' }).addTo(m);
    const agora = base.clima?.pontos?.[f.ponto]?.agora, cor = st(agora?.status).cor;
    if (f.contorno?.length >= 3) { const pol = L.polygon(f.contorno, { color: cor, weight: 2, fillOpacity: .12 }).addTo(m); m.fitBounds(pol.getBounds(), { padding: [30, 30], maxZoom: 16 }); } else m.setView([f.lat, f.lon], 13);
    L.circleMarker([f.lat, f.lon], { radius: 9, color: '#fff', weight: 2, fillColor: cor, fillOpacity: 1 }).addTo(m)
      .bindTooltip(`${esc(f.nome)} · ${esc(f.municipio)}<br>Janela agora: <b>${st(agora?.status).nome}</b>`, { direction: 'top' });
    estado.mapa = m;
    setTimeout(() => m.invalidateSize(), 200);
  }

  /* ---------- Clima da ficha: histórico + previsão; depois sensíveis, gráfico e análise ---------- */
  async function carregarClimaDaFicha(F) {
    const f = F.fClima;
    const datas = F.eventos.map(e => e.data).filter(Boolean);
    const desde = datas.length ? new Date(Math.min(...datas)) : somar(HOJE, -30);
    const [hist, prev] = await Promise.allSettled([
      f ? historicoDe(f, desde) : Promise.reject(new Error('fazenda sem coordenadas')),
      f?.ponto ? previsaoDoPonto(f.ponto) : Promise.reject(new Error('fazenda sem coordenadas'))
    ]);
    if (estado.ficha !== F) return;
    F.clima = hist.status === 'fulfilled' ? hist.value : null;
    F.previsao = prev.status === 'fulfilled' ? prev.value : null;
    F.desde = desde;
    F.sensiveis = eventosSensiveis(F);
    renderLinha(F); renderAlertas(F); renderGrafico(F, hist.reason); renderSensiveis(F); renderPrevisao(F, prev.reason);
    analisar(F);
  }
  function renderSensiveis(F) {
    const el = $('#pr-sensiveis'); if (!el) return;
    const ch = F.clima ? chuvaDesde(F) : null;
    el.innerHTML = `<div class="pr-chuva-cards">
        <article class="kpi glass"><span class="icon-box"><i data-lucide="cloud-rain"></i></span><span class="kpi-rot">Chuva desde o plantio</span><strong class="kpi-val">${ch?.plantio != null ? `${fmt1(ch.plantio)} <small>mm</small>` : '—'}</strong><small class="kpi-ajuda">${F.idt.fim ? `desde ${br(F.idt.fim)}` : 'sem data de plantio'}</small></article>
        <article class="kpi glass"><span class="icon-box"><i data-lucide="droplets"></i></span><span class="kpi-rot">Chuva nos últimos 30 dias</span><strong class="kpi-val">${ch ? `${fmt1(ch.d30)} <small>mm</small>` : '—'}</strong></article>
        <article class="kpi glass"><span class="icon-box"><i data-lucide="cloud-alert"></i></span><span class="kpi-rot">Eventos sensíveis</span><strong class="kpi-val">${F.clima ? F.sensiveis.length : '—'}</strong><small class="kpi-ajuda">${Object.entries(F.sensiveis.reduce((m, s) => ({ ...m, [ROTULO_SENSIVEL[s.tipo]]: (m[ROTULO_SENSIVEL[s.tipo]] || 0) + 1 }), {})).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'nenhum'}</small></article>
      </div>
      ${F.sensiveis.length ? `<ul class="pr-alertas pr-sens-lista">${F.sensiveis.map(s => `<li class="atencao"><i data-lucide="cloud-alert"></i><span><b>${ROTULO_SENSIVEL[s.tipo]}</b> · ${esc(s.texto)}</span></li>`).join('')}</ul>` : ''}`;
    icones();
  }
  function chuvaDesde(F) {
    const soma = (de, ate) => { let s = 0; for (let d = meiaNoite(de); d <= ate; d = somar(d, 1)) s += climaDia(F.clima, d)?.p || 0; return s; };
    return { plantio: F.idt.fim && F.idt.fim <= HOJE ? soma(F.idt.fim, HOJE) : null, d30: soma(somar(HOJE, -29), HOJE) };
  }

  let chartLib = null;
  const chartjs = () => (chartLib ||= (window.Chart ? Promise.resolve() : carregar('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js' })).then(() => window.SMA_TEMA?.prepararGraficos()));
  // Dados do gráfico: um ponto por dia, do primeiro evento até hoje; eventos por grupo em linha própria
  function serieClima(F) {
    const labels = [], chuva = [], tmax = [], diasISO = [];
    for (let d = meiaNoite(F.desde); d <= HOJE; d = somar(d, 1)) { const c = climaDia(F.clima, d); diasISO.push(iso(d)); labels.push(brCurto(d) + (d.getMonth() === 0 && d.getDate() === 1 ? ` ${d.getFullYear()}` : '')); chuva.push(c?.p ?? null); tmax.push(c?.tx ?? null); }
    const grupos = [...new Set(F.eventos.filter(e => e.data && !e.apoio).map(e => e.grupo))];
    const porDia = new Map(); F.eventos.filter(e => e.data && !e.apoio).forEach(e => { const k = iso(e.data); (porDia.get(k) || porDia.set(k, []).get(k)).push(e); });
    const eventos = grupos.map(g => ({ g, cor: corGrupo(g), dados: diasISO.map(k => (porDia.get(k) || []).some(e => e.grupo === g) ? 1 : null) }));
    return { labels, chuva, tmax, eventos, porDia, diasISO };
  }
  async function renderGrafico(F, erro) {
    const msg = $('#pr-graf-msg');
    if (!F.clima) { if (msg) msg.textContent = `Não consegui ler o clima histórico (${erro?.message || 'fazenda sem coordenadas'}).`; return; }
    await chartjs(); if (estado.ficha !== F) return;
    msg?.remove(); estado.grafico?.destroy();
    const S = serieClima(F);
    estado.grafico = new window.Chart($('#pr-graf'), {
      data: { labels: S.labels, datasets: [
        { type: 'bar', label: 'Chuva (mm)', data: S.chuva, backgroundColor: 'rgba(56,189,248,.6)', yAxisID: 'mm', order: 5, barPercentage: 1, categoryPercentage: 1 },
        { type: 'line', label: 'Temperatura máx. (°C)', data: S.tmax, borderColor: '#fb923c', borderWidth: 1.6, pointRadius: 0, tension: .3, yAxisID: 't', order: 4 },
        ...S.eventos.map(e => ({ type: 'line', label: e.g, data: e.dados, showLine: false, pointRadius: 5, pointHoverRadius: 7, pointBackgroundColor: e.cor, pointBorderColor: '#04201a', yAxisID: 'ev', order: 1 }))
      ] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Manrope', weight: 700 } } },
          tooltip: { filter: it => it.dataset.yAxisID !== 'ev', callbacks: { afterBody: it => (S.porDia.get(S.diasISO[it[0].dataIndex]) || []).map(e => `• ${e.ativ} (${e.equipe})`) } }
        },
        scales: {
          x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 }, grid: { display: false } },
          mm: { position: 'right', beginAtZero: true, title: { display: true, text: 'mm' } },
          t: { position: 'left', title: { display: true, text: '°C' } },
          ev: { display: false, min: 0, max: 1.15 }
        }
      }
    });
  }

  function renderPrevisao(F, erro) {
    const el = $('#pr-previsao'); if (!el) return;
    const p = F.previsao;
    if (!p) { el.innerHTML = `<p class="pr-vazio">Previsão indisponível (${esc(erro?.message || 'sem coordenadas')}).</p>`; return; }
    const H = p.horas, i0 = H?.iAgora ?? 0, prox = p.proximaJanela;
    const horas = H ? H.horas.slice(i0, i0 + 48).map((t, k) => ({ t, s: H.status[i0 + k], ch: H.chuva[i0 + k], raj: H.rajada[i0 + k], v: H.vento[i0 + k], mot: H.motivo[i0 + k] })) : [];
    el.innerHTML = `<div class="pr-prev-topo"><span class="pr-janela" style="--c:${st(p.agora?.status).cor}"><i></i>Agora: <b>${st(p.agora?.status).nome}</b>${p.agora?.motivo ? ` · ${esc(p.agora.motivo)}` : ''}</span>
        <span class="pr-prox"><i data-lucide="calendar-clock"></i>Próxima janela boa: <b>${prox ? esc(prox.agora ? `agora (até ${prox.rotulo.split('–')[1]})` : prox.rotulo) : 'nenhuma nos próximos 7 dias'}</b></span>
        <span class="pr-prox"><i data-lucide="cloud-rain"></i>Chuva prevista em 7 dias: <b>${fmt1(p.chuva7d)} mm</b></span></div>
      <div class="pr-prev-dias">${p.dias.map(d => { const [ic, desc] = tempoWMO(d.codigo); return `<div class="pr-prev-dia" title="${esc(desc)}"><b>${esc(d.rotulo)}</b><span class="pr-prev-ic">${ic}</span><span><b>${n0(d.tmax)}°</b> / ${n0(d.tmin)}°</span><small>💧 ${fmt1(d.chuva)} mm · ${n0(d.prob)}%</small><small>💨 ${n0(d.vento)} · raj. ${n0(d.rajada)} km/h</small></div>`; }).join('')}</div>
      ${horas.length ? `<div class="pr-faixa-tit">Janela de aplicação hora a hora · próximas 48 h</div><div class="pr-faixa">${horas.map(h => `<span style="--c:${st(h.s).cor}" title="${h.t.slice(8, 10)}/${h.t.slice(5, 7)} ${h.t.slice(11, 13)}h · ${st(h.s).nome}${h.mot ? ` (${h.mot})` : ''} · vento ${n0(h.v)} · rajada ${n0(h.raj)} km/h · chuva ${fmt1(h.ch)} mm">${h.t.slice(11, 13) % 6 === 0 ? `<em>${h.t.slice(11, 13) === '00' ? `${h.t.slice(8, 10)}/${h.t.slice(5, 7)}` : `${h.t.slice(11, 13)}h`}</em>` : ''}</span>`).join('')}</div>
        <div class="pr-faixa-leg">${STATUS_JANELA.map(s => `<span><i style="--c:${s.cor}"></i>${s.curto}</span>`).join('')}</div>` : ''}`;
    icones();
  }

  /* ======================================================================
     5. TEXTO ANALÍTICO: IA da seção Experimento (só com os dados calculados) ou regras
     ====================================================================== */
  function dadosParaAnalise(F) {
    const I = F.idt, K = F.kpis, p = F.previsao, ch = F.clima ? chuvaDesde(F) : null;
    return {
      hoje: br(HOJE),
      identidade: { up: I.up, fazenda: I.fazenda, municipio: I.municipio, area_ha: +I.area.toFixed(2), material_genetico: I.material || null, encarregado_plantio: I.encarregado || null, plantio_inicio: I.ini ? br(I.ini) : null, plantio_fim: I.fim ? br(I.fim) : null, idade_plantio_dias: I.idade, status: I.status || null, data_120_dias: I.d120 ? br(I.d120) : null },
      indicadores: { area_apontada_ha: +K.area.toFixed(2), faturamento_rs: +K.faturamento.toFixed(2), dias_trabalhados: K.dias, atividades_diferentes: K.atividades, equipes: [...K.equipes], ultimo_apontamento: K.ultimo ? br(K.ultimo) : null, dias_desde_ultimo: F.diasSem },
      grupos: F.porGrupo.map(g => ({ grupo: g.grupo, area_ha: +g.area.toFixed(2), maior_percentual_da_area: g.pct ? +(g.pct * 100).toFixed(1) : null, ultima_data: g.ultima ? br(g.ultima) : null, atividades: g.atividades })),
      eventos_sensiveis: F.sensiveis.map(s => ({ tipo: ROTULO_SENSIVEL[s.tipo], data: br(s.data), descricao: s.texto })),
      chuva: ch ? { desde_plantio_mm: ch.plantio != null ? +ch.plantio.toFixed(1) : null, ultimos_30_dias_mm: +ch.d30.toFixed(1) } : null,
      previsao: p ? { chuva_7_dias_mm: p.chuva7d, janela_agora: st(p.agora?.status).nome, motivo_agora: p.agora?.motivo || null, proxima_janela_boa: p.proximaJanela?.rotulo || null, dias: p.dias.map(d => ({ dia: d.rotulo, chuva_mm: d.chuva, prob: d.prob, tmax: d.tmax, rajada_kmh: d.rajada })) } : null,
      alertas: F.alertas.filter(a => a.nivel !== 'info').map(a => a.texto).concat(F.alertas.filter(a => a.nivel === 'info').map(a => a.texto))
    };
  }
  function analisePorRegras(F) {
    const I = F.idt, K = F.kpis, p = F.previsao, ch = F.clima ? chuvaDesde(F) : null;
    const grupos = F.porGrupo.slice().sort((a, b) => (b.ultima || 0) - (a.ultima || 0));
    const fase = I.idade == null ? (grupos[0] ? `em ${grupos[0].grupo.toLowerCase()}` : 'sem atividades apontadas')
      : I.idade < 0 ? 'em plantio' : I.idade <= 120 ? `em pós-plantio (${I.idade} dias de plantio)` : `em manutenção (${I.idade} dias de plantio)`;
    const avanco = grupos.filter(g => g.pct).map(g => `${g.grupo} ${pct(g.pct)}`).join(', ');
    const ritmo = K.dias ? `${fmtHa(K.area / K.dias)} ha por dia trabalhado` : '';
    const situacao = `A UP ${I.up} (${fmtHa(I.area)} ha) está ${fase}${I.status ? `, com status "${I.status}"` : ''}. ${avanco ? `Avanço por grupo, pela maior cobertura da área: ${avanco}. ` : ''}Foram ${fmtHa(K.area)} ha apontados em ${K.dias} dia(s)${ritmo ? ` (${ritmo})` : ''}${K.ultimo ? `; o último apontamento foi em ${br(K.ultimo)}, há ${F.diasSem} dia(s)` : ''}.`;
    const clima = !F.clima ? 'O clima histórico não pôde ser lido para esta fazenda.'
      : `${F.sensiveis.length ? `Foram encontrados ${F.sensiveis.length} evento(s) sensível(is): ${F.sensiveis.slice(0, 3).map(s => `${ROTULO_SENSIVEL[s.tipo].toLowerCase()} em ${br(s.data)}`).join(', ')}${F.sensiveis.length > 3 ? ' e outros' : ''}.` : 'Nenhum evento sensível de clima nas datas das atividades.'} ${ch?.plantio != null ? `Choveu ${fmt1(ch.plantio)} mm desde o fim do plantio` : 'Sem data de plantio para somar a chuva'}; nos últimos 30 dias, ${fmt1(ch.d30)} mm.`;
    let proximos = 'Previsão indisponível.';
    if (p) {
      const partes = [`Chuva prevista de ${fmt1(p.chuva7d)} mm nos próximos 7 dias`];
      partes.push(p.proximaJanela ? `próxima janela boa para aplicação: ${p.proximaJanela.agora ? `agora (até ${p.proximaJanela.rotulo.split('–')[1]})` : p.proximaJanela.rotulo}` : 'sem janela boa para aplicação nos próximos 7 dias');
      const raj = Math.max(...p.dias.map(d => d.rajada || 0)); if (raj > CL.alertas.rajadaKmh) partes.push(`rajadas de até ${n0(raj)} km/h`);
      let texto = partes.join('; ') + '.';
      if (I.idade != null && I.idade >= 0 && I.idade <= 60 && p.chuva7d < CFG.sensiveis.plantioChuva7dMm) texto += ` Plantio recente e pouca chuva prevista: avaliar irrigação.`;
      proximos = texto;
    }
    const atencao = F.alertas.filter(a => a.nivel !== 'info').map(a => a.texto).slice(0, 5);
    const restantes = F.alertas.filter(a => a.nivel !== 'info').length - atencao.length;
    if (restantes > 0) atencao.push(`Mais ${restantes} alerta(s) no quadro de alertas.`);
    if (F.sensiveis.length) atencao.push(`${F.sensiveis.length} evento(s) sensível(is) de clima: ${resumoSensiveis(F)}.`);
    return { situacao, clima, proximos, atencao, origem: 'regras' };
  }
  async function iaDisponivel() {
    if (estado.ia != null) return estado.ia;
    if (!comServidor) return (estado.ia = false);
    try { const r = await fetch('api/experimento/status', { cache: 'no-store' }); estado.ia = r.ok && !!(await r.json()).ia; } catch { estado.ia = false; }
    return estado.ia;
  }
  async function analisar(F, regenerar = false) {
    const el = $('#pr-analise'), bt = $('#pr-regenerar'); if (!el) return;
    if (F.analise && !regenerar) return renderAnalise(F);
    bt.disabled = true; bt.classList.add('girando');
    el.innerHTML = '<p class="pr-carregando"><i data-lucide="sparkles"></i>Escrevendo a análise com os dados desta UP…</p>'; icones();
    let a = null;
    if (await iaDisponivel()) {
      try {
        const r = await fetch('api/experimento/prontuario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pedido: `Prontuário da UP ${F.up}`, dados: dadosParaAnalise(F) }) });
        const j = await r.json(); if (r.ok && j.analise?.situacao) a = { ...j.analise, origem: 'ia' };
      } catch { /* regras */ }
    }
    if (estado.ficha !== F) return;
    F.analise = a || analisePorRegras(F);
    bt.disabled = false; bt.classList.remove('girando');
    renderAnalise(F);
  }
  function renderAnalise(F) {
    const a = F.analise, el = $('#pr-analise'); if (!el || !a) return;
    const bloco = (n, ic, tit, txt) => `<div class="pr-an-bloco"><span class="pr-an-n">${n}</span><div><h4><i data-lucide="${ic}"></i>${tit}</h4><p>${esc(txt || '—')}</p></div></div>`;
    el.innerHTML = `${bloco(1, 'activity', 'Situação da UP', a.situacao)}${bloco(2, 'cloud-sun-rain', 'Como o clima influenciou', a.clima)}${bloco(3, 'calendar-clock', 'Próximos dias', a.proximos)}
      <div class="pr-an-bloco"><span class="pr-an-n">4</span><div><h4><i data-lucide="triangle-alert"></i>Pontos de atenção</h4>${a.atencao?.length ? `<ul>${a.atencao.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>Nenhum ponto de atenção.</p>'}</div></div>
      <p class="pr-an-aviso"><i data-lucide="info"></i>Sugestões automáticas; a decisão é do responsável técnico. <span>${a.origem === 'ia' ? 'Texto escrito pela IA com os dados calculados acima.' : 'Texto montado por regras (IA indisponível).'}</span></p>`;
    icones();
  }

  /* ======================================================================
     6. PDF (A4 retrato) E COMPARAÇÃO
     ====================================================================== */
  async function graficoPDF(F) {
    if (!F.clima) return '';
    await chartjs();
    const S = serieClima(F), cv = document.createElement('canvas'); cv.width = 1400; cv.height = 520;
    const fundo = { id: 'fundo', beforeDraw: c => { const x = c.ctx; x.save(); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.restore(); } };
    const g = new window.Chart(cv, {
      data: { labels: S.labels, datasets: [
        { type: 'bar', label: 'Chuva (mm)', data: S.chuva, backgroundColor: '#38bdf8', yAxisID: 'mm', order: 5, barPercentage: 1, categoryPercentage: 1 },
        { type: 'line', label: 'Temperatura máx. (°C)', data: S.tmax, borderColor: '#ea580c', borderWidth: 2, pointRadius: 0, yAxisID: 't', order: 4 },
        ...S.eventos.map(e => ({ type: 'line', label: e.g, data: e.dados, showLine: false, pointRadius: 6, pointBackgroundColor: e.cor, pointBorderColor: '#0b2a23', yAxisID: 'ev', order: 1 }))
      ] },
      options: { responsive: false, animation: false, devicePixelRatio: 1, plugins: { legend: { position: 'bottom', labels: { color: '#0b2a23', usePointStyle: true, font: { size: 14 } } } },
        scales: { x: { ticks: { color: '#334', maxTicksLimit: 14, maxRotation: 0 }, grid: { display: false } }, mm: { position: 'right', beginAtZero: true, ticks: { color: '#0369a1' }, title: { display: true, text: 'mm', color: '#0369a1' } }, t: { position: 'left', ticks: { color: '#c2410c' }, title: { display: true, text: '°C', color: '#c2410c' } }, ev: { display: false, min: 0, max: 1.15 } } },
      plugins: [fundo]
    });
    const url = cv.toDataURL('image/png'); g.destroy();
    return `<img class="pr-pdf-graf" src="${url}" alt="">`;
  }
  async function exportarPDF() {
    const F = estado.ficha; if (!F || !window.SMA_PDF) return;
    const bt = $('#pr-pdf'), rot = $('span', bt), original = rot.textContent;
    bt.disabled = true; bt.classList.add('girando'); rot.textContent = 'Preparando…';
    try {
      const I = F.idt, K = F.kpis, a = F.analise || analisePorRegras(F), sel = seloStatus(I.status);
      const cab = `<header class="pr-pdf-cab"><div><h1>Prontuário da UP ${esc(I.up)}</h1><p>${esc(I.fazenda)} · ${esc(I.municipio)} · emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></div><span class="pr-pdf-selo" style="--c:${sel.cor}">${esc(sel.texto)}</span></header>`;
      const mini = `<div class="pr-pdf-mini"><b>Prontuário da UP ${esc(I.up)}</b><span>${esc(I.fazenda)}</span></div>`;
      const linha = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
      const pag1 = `${cab}
        <table class="pr-pdf-id">${linha('Área da UP', I.area ? `${fmtHa(I.area)} ha` : '—')}${linha('Material genético', esc(I.material || '—'))}${linha('Encarregado do plantio', esc(I.encarregado || '—'))}${linha('Plantio', I.ini || I.fim ? `${br(I.ini)} a ${br(I.fim)}${I.idade != null ? ` · ${I.idade} dias` : ''}` : '—')}${linha('Avaliação de 120 dias', I.d120 ? br(I.d120) : '—')}</table>
        <div class="pr-pdf-kpis">${[['Área apontada', `${fmtHa(K.area)} ha`], ['Faturamento', brl(K.faturamento)], ['Dias trabalhados', K.dias], ['Atividades', K.atividades], ['Equipes', [...K.equipes].join(', ') || '—'], ['Último apontamento', K.ultimo ? `${br(K.ultimo)} (há ${F.diasSem} d)` : '—']].map(([r, v]) => `<div><small>${r}</small><b>${v}</b></div>`).join('')}</div>
        <h2>Análise</h2>
        <div class="pr-pdf-an"><h3>1. Situação da UP</h3><p>${esc(a.situacao)}</p><h3>2. Como o clima influenciou</h3><p>${esc(a.clima)}</p><h3>3. Próximos dias</h3><p>${esc(a.proximos)}</p><h3>4. Pontos de atenção</h3>${a.atencao?.length ? `<ul>${a.atencao.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p>Nenhum.</p>'}<p class="pr-pdf-nota">Sugestões automáticas; a decisão é do responsável técnico.</p></div>
        <h2>Alertas</h2><ul class="pr-pdf-alertas">${F.alertas.slice(0, 8).map(x => `<li class="${x.nivel}">${esc(x.texto)}</li>`).join('') || '<li class="info">Nenhum alerta.</li>'}${F.alertas.length > 8 ? `<li class="info">… e mais ${F.alertas.length - 8} alerta(s) no painel.</li>` : ''}${F.sensiveis.length ? `<li class="atencao">${F.sensiveis.length} evento(s) sensível(is) de clima (${resumoSensiveis(F)}): detalhe na página do clima.</li>` : ''}</ul>`;
      const cabAtiv = '<colgroup><col style="width:14%"><col style="width:29%"><col style="width:10%"><col style="width:10%"><col style="width:8%"><col style="width:7%"><col style="width:5%"><col style="width:11%"><col style="width:6%"></colgroup><thead><tr><th>Grupo</th><th>Atividade</th><th>Primeira</th><th>Última</th><th class="n">Área (ha)</th><th class="n">% UP</th><th class="n">Dias</th><th class="n">Faturamento</th><th>Equipes</th></tr></thead>';
      const linhasAtiv = F.atividades.map(x => `<tr style="--c:${x.cor}"><td>${esc(x.grupo)}</td><td>${esc(x.ativ)}</td><td>${br(x.ini)}</td><td>${br(x.fim)}</td><td class="n">${fmtHa(x.area)}</td><td class="n">${x.apoio || x.pct == null ? '—' : pct(x.pct)}</td><td class="n">${x.dias}</td><td class="n">${brl(x.total)}</td><td>${esc([...x.equipes].join(', '))}</td></tr>`);
      const ultimos = F.eventos.slice(0, 26);
      const tabLinha = `<table class="pr-pdf-tab"><colgroup><col style="width:11%"><col style="width:31%"><col style="width:14%"><col style="width:7%"><col style="width:8%"><col style="width:11%"><col style="width:18%"></colgroup><thead><tr><th>Data</th><th>Atividade</th><th>Grupo</th><th>Equipe</th><th class="n">Área</th><th class="n">Faturamento</th><th>Clima do dia</th></tr></thead><tbody>${ultimos.map(e => { const c = F.clima && e.data ? climaDia(F.clima, e.data) : null; return `<tr style="--c:${e.cor}"><td>${br(e.data)}</td><td>${esc(e.ativ)}</td><td>${esc(e.grupo)}</td><td>${esc(e.equipe)}</td><td class="n">${e.area ? fmtHa(e.area) : '—'}</td><td class="n">${e.total ? brl(e.total) : '—'}</td><td>${c ? `${tempoWMO(c.c)[1]} · ${fmt1(c.p)} mm · ${fmt1(c.tx)}°` : '—'}</td></tr>`; }).join('')}</tbody></table>`;
      const pags = [pag1];
      const POR = 24, partes = Math.max(1, Math.ceil(linhasAtiv.length / POR));
      for (let k = 0; k < partes; k++) pags.push(`${mini}<h2>Atividades da UP${partes > 1 ? ` <small>(${k + 1}/${partes})</small>` : ''}</h2><table class="pr-pdf-tab">${cabAtiv}<tbody>${linhasAtiv.slice(k * POR, (k + 1) * POR).join('') || '<tr><td colspan="9">Sem apontamentos no PGO.</td></tr>'}</tbody></table>`);
      pags.push(`${mini}<h2>Linha do tempo (últimos ${ultimos.length} eventos)</h2>${tabLinha}`);
      const graf = await graficoPDF(F);
      if (graf) pags.push(`${mini}<h2>Clima no período da UP</h2>${graf}<p class="pr-pdf-nota">Barras: chuva diária (mm) · linha: temperatura máxima · pontos: atividades por grupo. Clima do ponto central da fazenda (Open-Meteo).</p>
        ${F.sensiveis.length ? `<h2>Eventos sensíveis (${F.sensiveis.length})</h2><ul class="pr-pdf-alertas">${F.sensiveis.slice(0, 24).map(s => `<li class="atencao"><b>${ROTULO_SENSIVEL[s.tipo]}</b> · ${esc(s.texto)}</li>`).join('')}${F.sensiveis.length > 24 ? `<li class="info">… e mais ${F.sensiveis.length - 24} no painel.</li>` : ''}</ul>` : ''}`);
      await window.SMA_PDF.gerar(pags, `Prontuario_${I.up}.pdf`, { retrato: true, progresso: (i, n) => { rot.textContent = `Gerando PDF ${i}/${n}…`; } });
      rot.textContent = 'PDF baixado ✓';
    } catch (erro) {
      console.error('Prontuário: falha no PDF', erro); rot.textContent = 'Não consegui gerar o PDF';
    } finally { bt.disabled = false; bt.classList.remove('girando'); setTimeout(() => { rot.textContent = original; }, 2500); }
  }
  $('#pr-pdf').addEventListener('click', exportarPDF);

  // Comparar: a UP aberta + mais uma, lado a lado (identidade, KPIs, atividades por grupo e clima)
  $('#pr-comparar').addEventListener('click', () => {
    const el = $('#pr-comparacao'); el.hidden = false;
    el.innerHTML = `<section class="container fat-secao"><div class="fat-sec-head"><div><span class="eyebrow">Comparação</span><h2 class="fat-sec-titulo">Comparar <span class="serif">UPs</span></h2></div><button type="button" class="fat-btn" id="pr-cmp-fechar"><i data-lucide="x"></i><span>Fechar comparação</span></button></div>
      <div class="pr-busca glass pr-cmp-busca"><div class="pr-campo-wrap"><label class="pr-campo"><i data-lucide="search"></i><input type="search" id="pr-cmp-busca" placeholder="Comparar ${esc(estado.ficha.up)} com qual UP?" autocomplete="off" role="combobox" aria-expanded="false" aria-controls="pr-cmp-sug" aria-label="UP para comparar"></label><ul class="pr-sugestoes glass" id="pr-cmp-sug" role="listbox" hidden></ul></div></div>
      <div class="pr-cmp-grade" id="pr-cmp-grade"></div></section>`;
    icones();
    autocompletar($('#pr-cmp-busca'), $('#pr-cmp-sug'), up => comparar(up));
    $('#pr-cmp-busca').focus();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#pr-comparacao').addEventListener('click', e => { if (e.target.closest('#pr-cmp-fechar')) { $('#pr-comparacao').hidden = true; estado.comparar = []; } });
  async function comparar(up2) {
    const A = estado.ficha, B = montarFicha(chaveUP(up2));
    const grade = $('#pr-cmp-grade');
    if (!B) { grade.innerHTML = `<p class="pr-vazio">UP ${esc(up2)} não encontrada.</p>`; return; }
    const coluna = F => {
      const I = F.idt, K = F.kpis, ch = F.clima ? chuvaDesde(F) : null;
      return `<article class="fat-painel glass pr-cmp-col"><span class="eyebrow">${esc(I.fazenda)}</span><h3>${esc(I.up)} <span class="pr-selo" style="--c:${seloStatus(I.status).cor}"><i></i>${esc(seloStatus(I.status).texto)}</span></h3>
        <dl class="pr-cmp-dl"><div><dt>Área da UP</dt><dd>${fmtHa(I.area)} ha</dd></div><div><dt>Material genético</dt><dd>${esc(I.material || '—')}</dd></div><div><dt>Plantio</dt><dd>${br(I.fim)}${I.idade != null ? ` · ${I.idade} dias` : ''}</dd></div><div><dt>Município</dt><dd>${esc(I.municipio)}</dd></div>
          <div><dt>Área apontada</dt><dd>${fmtHa(K.area)} ha</dd></div><div><dt>Faturamento</dt><dd>${brl(K.faturamento)}</dd></div><div><dt>Dias trabalhados</dt><dd>${K.dias}</dd></div><div><dt>Último apontamento</dt><dd>${br(K.ultimo)}</dd></div>
          <div><dt>Chuva desde o plantio</dt><dd>${ch?.plantio != null ? `${fmt1(ch.plantio)} mm` : '—'}</dd></div><div><dt>Chuva 30 dias</dt><dd>${ch ? `${fmt1(ch.d30)} mm` : '—'}</dd></div><div><dt>Eventos sensíveis</dt><dd>${F.clima ? F.sensiveis.length : '—'}</dd></div></dl>
        <h4>Atividades por grupo (% da área)</h4>${F.porGrupo.map(g => `<div class="pr-cmp-g"><span>${esc(g.grupo)}</span><div class="pr-barra ${g.pct > 1.001 ? 'passou' : ''}" style="--c:${g.cor}"><i style="width:${Math.min(g.pct || 0, 1) * 100}%"></i><b>${g.pct ? pct(g.pct) : `${fmtHa(g.area)} ha`}</b></div></div>`).join('') || '<p class="pr-vazio">Sem atividades.</p>'}</article>`;
    };
    grade.innerHTML = coluna(A) + coluna(B); icones();
    // clima da segunda UP (o da primeira já está na ficha)
    const f = B.fClima;
    if (f) {
      const datas = B.eventos.map(e => e.data).filter(Boolean);
      B.desde = datas.length ? new Date(Math.min(...datas)) : somar(HOJE, -30);
      try { B.clima = await historicoDe(f, B.desde); B.sensiveis = eventosSensiveis(B); grade.innerHTML = coluna(A) + coluna(B); icones(); } catch { /* fica sem clima */ }
    }
  }

  /* ---------- Atualizar dados e início ---------- */
  $('#pr-atualizar').addEventListener('click', async () => {
    const bt = $('#pr-atualizar'); bt.disabled = true; bt.classList.add('girando');
    $('#pr-status').textContent = 'Lendo as planilhas de novo…';
    base.pronto = false; await carregarBases(true); renderAvisos(); renderRecentes();
    bt.disabled = false; bt.classList.remove('girando');
    if (estado.ficha) abrirUP(estado.ficha.up, { rolar: false });
  });
  // Outros painéis e a própria página abrem uma UP por evento (os códigos de UP viram link para cá)
  window.SMA_PRONTUARIO = { abrir: up => abrirUP(up) };

  let iniciado = false;
  function iniciar() {
    if (iniciado) return; iniciado = true;
    renderRecentes();
    const up = new URLSearchParams(location.search).get('up');
    if (up) abrirUP(up, { rolar: false });
    else $('#pr-ficha').innerHTML = `<section class="container fat-secao"><div class="fat-painel glass pr-inicio"><i data-lucide="folder-search"></i><div><h3>Escolha uma UP</h3><p>Digite o código da UP (ex.: S7A417) ou o nome da fazenda na busca acima. A ficha junta os apontamentos do PGO, o plantio, as equipes, o clima de cada atividade e uma análise.</p></div></div></section>`;
    icones();
    carregarBases().then(() => { renderAvisos(); renderRecentes(); });
  }
  document.addEventListener('qual:aba', e => { if (e.detail === 'prontuario') { iniciar(); setTimeout(() => estado.mapa?.invalidateSize(), 250); } });
  if (!raiz.hidden) iniciar();
})();
