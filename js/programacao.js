/* ==========================================================================
   SMA · Silvicultura — Produção · Programação de Atividades
   Camadas: 1) leitura da planilha  2) configuração salva  3) cálculo da programação
            4) assistente em etapas  5) resultado (cards, tabelas, calendário)  6) PDF e fotos
   ========================================================================== */

(() => {
  const D = window.SMA_DADOS, P = window.SMA_PLANILHAS;
  const CFG = D?.PRODUCAO, F = D?.FATURAMENTO;
  if (!CFG || !P || !document.getElementById('aba-prog')) return;

  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const icones = () => window.lucide?.createIcons();
  const escapar = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fmtHa = v => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt1 = v => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const brl = v => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const br = d => (d ? d.toLocaleDateString('pt-BR') : '—');
  const DIA = 864e5;
  const deISO = t => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], 12) : null; };
  const paraISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const somarDias = (d, n) => new Date(d.getTime() + n * DIA);
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const CORES = ['#3dffa8', '#38bdf8', '#c8f560', '#f472b6', '#fbbf24', '#a78bfa', '#2dd4bf', '#fb923c', '#60a5fa', '#e879f9', '#a3e635', '#f87171'];

  /* ======================================================================
     1. LEITURA
     ====================================================================== */
  const carregarProgramacao = fresco => P.lerPlanilha(CFG.planilha, CFG.aba, { fresco, coluna: 'FAZENDA', cabecalho: true });
  const valor = v => P.num(v);
  function normalizar(linhas) {
    return linhas
      .filter(l => (l.FAZENDA || '').trim() && (l.UP || '').trim())   // ignora linhas vazias
      .map((l, i) => {
        const fazenda = l.FAZENDA.replace(/\s+/g, ' ').trim(), up = l.UP.trim(), ativ = (l.ATIVIDADE || '').trim() || '—', rf = (l.RF || '').trim() || '—';
        return { id: `${rf}|${fazenda}|${up}|${ativ}|${i}`, rf, fazenda, up, atividade: ativ, area: valor(l.AREA), tarifa: valor(l.TARIFA), insumos: insumosDa(l) };
      });
  }
  // "Insumo 1" + "Dose 1", "Insumo 2" + "Dose 2"… (aparecem só no PDF, em páginas próprias)
  function insumosDa(l) {
    const lista = [];
    for (let n = 1; n <= 12; n++) {
      const nome = String(l[`INSUMO ${n}`] ?? '').trim(), dose = String(l[`DOSE ${n}`] ?? l[`DOSAGEM ${n}`] ?? '').trim();
      if (nome || dose) lista.push({ nome: nome || '—', dose });
    }
    return lista;
  }
  // Exemplo para conhecer a tela enquanto a planilha está vazia (sempre sinalizado na tela)
  function dadosExemplo() {
    const base = [
      ['RF 10', 'Santa Rita III', [['S7A601', 32.4], ['S7A602', 18.9], ['S7A605', 25.1]]],
      ['RF 10', 'Três Corações', [['S2D401', 89.5], ['S2D402', 52.1]]],
      ['RF 11', 'Sítio São Bento', [['S7BL02', 53.8], ['S7BL03', 79.4], ['S7BL04', 22.6]]],
      ['RF 11', 'Vitória', [['S7AK02', 6.5], ['S7AK17', 41.2], ['S7AK21', 28.7]]]
    ];
    return base.flatMap(([rf, faz, ups], fi) => ups.map(([up, area], ui) => ({ RF: rf, FAZENDA: faz, UP: up, AREA: String(area).replace('.', ','), ATIVIDADE: ui % 2 ? 'Adubação de cobertura' : 'Controle de matocompetição', ...(ui % 2 ? { 'INSUMO 1': 'NPK 20-00-20', 'DOSE 1': '150 kg/ha' } : { 'INSUMO 1': 'Glifosato', 'DOSE 1': '3,0 L/ha', 'INSUMO 2': 'Adjuvante', 'DOSE 2': '0,5 L/ha' }), TARIFA: `R$ ${(fi % 2 ? 182.5 : 164.9).toFixed(2).replace('.', ',')}` })));
  }

  /* ======================================================================
     2. CONFIGURAÇÃO (fica salva no navegador)
     ====================================================================== */
  const CHAVE = 'prog:config';
  const MANUAIS = CFG.equipesManuais || [];
  const TODAS_EQUIPES = [...CFG.equipes, ...MANUAIS];
  const DESLOC = CFG.diasDeslocamento ?? 1;
  const VERSAO = 2;
  const padrao = () => ({
    v: VERSAO, supervisor: null, rf: '', atividades: [], ordemFaz: [], semFaz: [], ordemUps: {}, semUps: [],
    entrada: paraISO(new Date()), fds: {}, feriados: [], equipes: {}
  });
  let cfg;
  try { cfg = Object.assign(padrao(), JSON.parse(localStorage.getItem(CHAVE) || 'null') || {}); } catch { cfg = padrao(); }
  if (cfg.v !== VERSAO) { cfg.equipes = {}; cfg.atividades = cfg.atividade ? [cfg.atividade] : []; delete cfg.atividade; delete cfg.sabado; delete cfg.domingo; cfg.v = VERSAO; }
  // Nenhuma equipe vem marcada: o usuário escolhe quem vai trabalhar
  TODAS_EQUIPES.forEach(e => { cfg.equipes[e] = Object.assign({ on: false, maq: 1, rend: MANUAIS.includes(e) ? 1 : 5 }, cfg.equipes[e]); });
  const ehManual = e => MANUAIS.includes(e);
  const salvar = () => { try { localStorage.setItem(CHAVE, JSON.stringify(cfg)); } catch { /* sem armazenamento */ } };

  const estado = { linhas: [], exemplo: false, passo: 1, resultado: null, carregando: true, aberta: null };

  // Linhas depois dos filtros de RF e Atividade
  const filtradas = () => estado.linhas.filter(l => (!cfg.rf || l.rf === cfg.rf) && (!cfg.atividades.length || cfg.atividades.includes(l.atividade)));
  // Fazendas na ordem escolhida (as novas entram no fim)
  function fazendas() {
    const lista = filtradas();
    const nomes = [...new Set(lista.map(l => l.fazenda))];
    const ordem = [...cfg.ordemFaz.filter(n => nomes.includes(n)), ...nomes.filter(n => !cfg.ordemFaz.includes(n))];
    return ordem.map((nome, i) => {
      const ups = upsDa(nome, lista);
      return { nome, cor: CORES[i % CORES.length], ups, executar: !cfg.semFaz.includes(nome), area: ups.reduce((s, u) => s + u.area, 0) };
    });
  }
  function upsDa(nome, lista = filtradas()) {
    const ups = lista.filter(l => l.fazenda === nome);
    const chave = u => `${u.up}|${u.atividade}|${u.rf}`;
    const ordem = cfg.ordemUps[nome] || [];
    return [...ups].sort((a, b) => {
      const ia = ordem.indexOf(chave(a)), ib = ordem.indexOf(chave(b));
      return (ia < 0 ? 1e6 : ia) - (ib < 0 ? 1e6 : ib);
    }).map(u => ({ ...u, chave: chave(u), executar: !cfg.semUps.includes(`${nome}|${chave(u)}`) }));
  }
  // Mecanizada: máquinas × rendimento por máquina · Manual: rendimento da equipe por dia
  const prodEquipe = e => (ehManual(e) ? (+cfg.equipes[e].rend || 0) : (+cfg.equipes[e].maq || 0) * (+cfg.equipes[e].rend || 0));
  const equipesAtivas = () => TODAS_EQUIPES.filter(e => cfg.equipes[e].on).map(e => ({ nome: e, ...cfg.equipes[e], manual: ehManual(e), prod: prodEquipe(e) }));
  const descEquipe = e => (e.manual ? `manual · ${fmt1(+e.rend)} ha/dia` : `${e.maq} máq. × ${fmt1(+e.rend)} ha/dia`);
  const producaoDiaria = () => equipesAtivas().reduce((s, e) => s + e.prod, 0);

  /* ======================================================================
     3. CÁLCULO DA PROGRAMAÇÃO (contínua: a próxima UP usa a sobra do dia)
     ====================================================================== */
  // Sábado e domingo: cada data tem sua resposta (fds[aaaa-mm-dd] = 'sim' | 'nao'); sem resposta = não trabalha
  const ehFimDeSemana = d => d.getDay() === 0 || d.getDay() === 6;
  function diaTrabalhado(d, fds = cfg.fds) {
    const k = paraISO(d);
    if (cfg.feriados.includes(k)) return false;
    return ehFimDeSemana(d) ? fds[k] === 'sim' : true;
  }
  const proximoDiaUtil = (d, fds) => { let x = d; for (let i = 0; i < 3660 && !diaTrabalhado(x, fds); i++) x = somarDias(x, 1); return x; };

  // Programação contínua: a próxima UP usa a sobra do dia. A cada troca de fazenda entra 1 dia de deslocamento.
  function programar(fds = cfg.fds) {
    const prod = producaoDiaria();
    const entrada = deISO(cfg.entrada);
    const faz = fazendas().filter(f => f.executar).map(f => ({ ...f, ups: f.ups.filter(u => u.executar) })).filter(f => f.ups.length);
    const porDia = new Map();   // 'aaaa-mm-dd' → [{ fazenda, cor, up, atividade, ha, desloc }]
    const EPS = 1e-9;
    let d = proximoDiaUtil(entrada, fds), sobra = 1, ordem = 0;
    const itens = [], linhas = [];
    // Consome "falta" dias de capacidade a partir do ponto atual, anotando cada dia usado
    const consumir = (falta, anotar) => {
      if (sobra <= EPS) { d = proximoDiaUtil(somarDias(d, 1), fds); sobra = 1; }
      const inicio = d; let fim = d;
      while (falta > EPS) {
        if (sobra <= EPS) { d = proximoDiaUtil(somarDias(d, 1), fds); sobra = 1; }
        const usa = Math.min(falta, sobra), k = paraISO(d);
        (porDia.get(k) || porDia.set(k, []).get(k)).push(anotar(usa));
        falta -= usa; sobra -= usa; fim = d;
      }
      return { inicio, fim };
    };
    faz.forEach((f, fi) => {
      if (fi > 0 && DESLOC > 0) {
        const de = faz[fi - 1].nome;
        const { inicio, fim } = consumir(DESLOC, () => ({ desloc: true, fazenda: f.nome, de, cor: f.cor }));
        linhas.push({ tipo: 'desloc', de, para: f.nome, cor: f.cor, inicio, fim, dias: DESLOC });
      }
      f.ups.forEach(u => {
        const { inicio, fim } = consumir(u.area / prod, usa => ({ fazenda: f.nome, cor: f.cor, up: u.up, atividade: u.atividade, ha: usa * prod }));
        const item = { ...u, tipo: 'up', ordem: ++ordem, cor: f.cor, inicio, fim, dias: u.area / prod, fat: u.area * u.tarifa };
        itens.push(item); linhas.push(item);
      });
    });
    const area = itens.reduce((s, i) => s + i.area, 0);
    const termino = linhas.length ? linhas[linhas.length - 1].fim : null;
    const diasDesloc = linhas.filter(l => l.tipo === 'desloc').length * DESLOC;
    // Sábados e domingos dentro do período (os que precisam de resposta)
    const fimDeSemana = [];
    if (termino) for (let x = entrada; x <= termino; x = somarDias(x, 1)) if (ehFimDeSemana(x) && !cfg.feriados.includes(paraISO(x))) fimDeSemana.push(x);
    return {
      itens, linhas, porDia, faz, prod, area, entrada, inicioReal: itens[0]?.inicio || entrada, termino, fimDeSemana,
      diasProducao: prod ? area / prod : 0, diasDesloc, diasCorridos: termino ? Math.round((termino - entrada) / DIA) + 1 : 0,
      faturamento: itens.reduce((s, i) => s + i.fat, 0), equipes: equipesAtivas()
    };
  }

  /* ======================================================================
     4. ASSISTENTE EM ETAPAS
     ====================================================================== */
  const ETAPAS = { 1: etapaFazendas, 2: etapaUps, 3: etapaData, 4: etapaEquipes, 5: etapaFimDeSemana };
  function renderEtapa() {
    $$('#p-passos [data-passo]').forEach(b => {
      const n = +b.dataset.passo;
      b.classList.toggle('ativo', n === estado.passo); b.classList.toggle('feito', n < estado.passo);
      b.setAttribute('aria-current', n === estado.passo ? 'step' : 'false');
    });
    $('#p-etapa').innerHTML = ETAPAS[estado.passo]();
    $('#p-voltar').disabled = estado.passo === 1;
    $('#p-proximo').hidden = estado.passo === 5;
    $('#p-nav-info').innerHTML = resumoNav();
    $('#p-destaque-equipes').textContent = equipesAtivas().map(e => e.nome).join(' · ') || '—';
    icones();
  }
  function resumoNav() {
    const fz = fazendas().filter(f => f.executar);
    const ups = fz.flatMap(f => f.ups.filter(u => u.executar));
    return `<b>${fz.length}</b> fazenda(s) · <b>${ups.length}</b> UP(s) · <b>${fmtHa(ups.reduce((s, u) => s + u.area, 0))} ha</b> · <b>${fmtHa(producaoDiaria())} ha/dia</b>`;
  }
  const ord = n => `${n}º`;
  const setas = (tipo, i, total, extra = '') => `
    <span class="p-setas"><button type="button" data-mover="${tipo}" data-i="${i}" data-dir="-1" ${extra} ${i === 0 ? 'disabled' : ''} aria-label="Subir"><i data-lucide="chevron-up"></i></button>
    <button type="button" data-mover="${tipo}" data-i="${i}" data-dir="1" ${extra} ${i === total - 1 ? 'disabled' : ''} aria-label="Descer"><i data-lucide="chevron-down"></i></button></span>`;

  function etapaFazendas() {
    const fz = fazendas();
    return `<h3 class="p-etapa-tit"><i data-lucide="map"></i>Etapa 1 · Sequência de fazendas</h3>
      <p class="p-etapa-sub">Marque as fazendas que serão executadas e arraste (ou use as setas) para definir a ordem.</p>
      <ul class="p-lista" data-lista="faz">${fz.map((f, i) => `
        <li class="p-item ${f.executar ? '' : 'off'}" draggable="true" data-i="${i}" style="--c:${f.cor}">
          <span class="p-arrastar" aria-hidden="true"><i data-lucide="grip-vertical"></i></span>
          <span class="p-ordem">${ord(i + 1)}</span>
          <label class="p-check"><input type="checkbox" data-faz="${escapar(f.nome)}" ${f.executar ? 'checked' : ''}><span>Executar</span></label>
          <span class="p-nome"><b>${escapar(f.nome)}</b><small>${f.ups.length} UP(s) · ${fmtHa(f.area)} ha</small></span>
          ${setas('faz', i, fz.length)}
        </li>`).join('')}</ul>`;
  }

  function etapaUps() {
    const fz = fazendas().filter(f => f.executar);
    if (!fz.length) return '<p class="vazio">Nenhuma fazenda marcada na etapa 1.</p>';
    return `<h3 class="p-etapa-tit"><i data-lucide="square-dashed"></i>Etapa 2 · Sequência de UPs</h3>
      <p class="p-etapa-sub">Dentro de cada fazenda, marque as UPs e defina a ordem.</p>
      ${fz.map(f => {
        const sel = f.ups.filter(u => u.executar);
        return `<div class="p-grupo" style="--c:${f.cor}">
          <header><span class="p-bolinha"></span><b>${escapar(f.nome)}</b><span class="p-sub">${sel.length}/${f.ups.length} UPs · <b>${fmtHa(sel.reduce((s, u) => s + u.area, 0))} ha</b> · <b>${brl(sel.reduce((s, u) => s + u.area * u.tarifa, 0))}</b></span></header>
          <ul class="p-lista" data-lista="up" data-faz="${escapar(f.nome)}">${f.ups.map((u, i) => `
            <li class="p-item ${u.executar ? '' : 'off'}" draggable="true" data-i="${i}">
              <span class="p-arrastar" aria-hidden="true"><i data-lucide="grip-vertical"></i></span>
              <span class="p-ordem">${ord(i + 1)}</span>
              <label class="p-check"><input type="checkbox" data-up="${escapar(f.nome + '|' + u.chave)}" ${u.executar ? 'checked' : ''}><span>Executar</span></label>
              <span class="p-nome"><b>${escapar(u.up)}</b><small>${escapar(u.rf)}</small></span>
              <span class="p-ativ" title="Atividade"><i data-lucide="list-checks"></i>${escapar(u.atividade)}</span>
              <span class="p-num"><small>Área</small>${fmtHa(u.area)} ha</span>
              <span class="p-num"><small>Tarifa</small>${brl(u.tarifa)}/ha</span>
              ${setas('up', i, f.ups.length, `data-faz="${escapar(f.nome)}"`)}
            </li>`).join('')}</ul></div>`;
      }).join('')}`;
  }

  function etapaData() {
    return `<h3 class="p-etapa-tit"><i data-lucide="calendar-plus"></i>Etapa 3 · Data de entrada</h3>
      <p class="p-etapa-sub">A partir desta data o sistema programa todo o resto em sequência.</p>
      <label class="ars-plantio p-entrada"><span class="ars-plantio-ico"><i data-lucide="flag"></i></span>
        <span class="eyebrow">Data de entrada na primeira fazenda</span>
        <input type="date" id="p-entrada" value="${escapar(cfg.entrada)}" required>
        <small class="ars-plantio-rel">${cfg.entrada ? deISO(cfg.entrada).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : 'Informe a data'}</small></label>`;
  }

  function etapaEquipes() {
    const total = producaoDiaria();
    return `<h3 class="p-etapa-tit"><i data-lucide="tractor"></i>Etapa 4 · Equipes e máquinas</h3>
      <p class="p-etapa-sub">Marque as equipes que vão trabalhar; elas trabalham juntas na mesma sequência. Mecanizada: máquinas × rendimento por máquina. Manual: só o rendimento da equipe por dia.</p>
      ${[['Mecanizadas', 'tractor', CFG.equipes], ['Manuais (sem máquina)', 'hand', MANUAIS]].filter(([, , l]) => l.length).map(([tit, ic, lista]) => `
      <h4 class="p-eq-grupo"><i data-lucide="${ic}"></i>${tit}</h4>
      <div class="p-equipes">${lista.map(e => {
        const q = cfg.equipes[e], prod = prodEquipe(e), manual = ehManual(e);
        return `<article class="p-equipe ${q.on ? 'on' : ''} ${manual ? 'manual' : ''}">
          <label class="p-eq-topo"><input type="checkbox" data-eq="${e}" data-campo="on" ${q.on ? 'checked' : ''}><span class="p-eq-nome">${e}</span><span class="p-eq-vai">${q.on ? 'Vai trabalhar' : 'Não vai'}</span></label>
          ${manual ? '<p class="p-eq-tipo"><i data-lucide="hand"></i>Equipe manual</p>' : `<label class="p-eq-campo"><span>Quantidade de máquinas</span><input type="number" min="0" step="1" inputmode="numeric" data-eq="${e}" data-campo="maq" value="${q.maq}" ${q.on ? '' : 'disabled'}></label>`}
          <label class="p-eq-campo"><span>${manual ? 'Rendimento da equipe (ha/dia)' : 'Rendimento por máquina (ha/dia)'}</span><input type="number" min="0" step="0.1" inputmode="decimal" data-eq="${e}" data-campo="rend" value="${q.rend}" ${q.on ? '' : 'disabled'}></label>
          <p class="p-eq-prod"><small>Produção/dia</small><b data-prod="${e}">${q.on ? fmtHa(prod) + ' ha' : '—'}</b></p>
        </article>`;
      }).join('')}</div>`).join('')}
      <p class="p-total-prod">Produção diária total <b id="p-total-prod">${fmtHa(total)} ha/dia</b></p>
      <div id="p-eq-erro">${validarEquipes()}</div>`;
  }
  function validarEquipes() {
    const at = equipesAtivas();
    if (!at.length) return '<p class="ars-val erro"><i data-lucide="triangle-alert"></i><span>Selecione pelo menos uma equipe.</span></p>';
    const ruins = at.filter(e => (!e.manual && !(+e.maq > 0)) || !(+e.rend > 0));
    return ruins.length ? `<p class="ars-val erro"><i data-lucide="triangle-alert"></i><span>Informe ${ruins.some(e => !e.manual) ? 'quantidade de máquinas e ' : ''}rendimento maiores que zero para: <b>${ruins.map(e => e.nome).join(', ')}</b>.</span></p>` : '';
  }

  function etapaFimDeSemana() {
    return `<h3 class="p-etapa-tit"><i data-lucide="calendar-range"></i>Etapa 5 · Fim de semana e geração</h3>
      <p class="p-etapa-sub">Ao gerar, o sistema calcula o período, mostra cada sábado e domingo que cai nele e pergunta, data por data, se haverá trabalho. Dias sem trabalho e feriados são pulados (cinza no calendário). A cada troca de fazenda entra ${DESLOC} dia de deslocamento.</p>
      <div class="p-checklist">${checklist().map(c => `<p class="ars-val ${c.ok ? 'ok' : 'erro'}"><i data-lucide="${c.ok ? 'badge-check' : 'circle-alert'}"></i><span>${c.t}</span></p>`).join('')}</div>`;
  }
  function checklist() {
    const fz = fazendas().filter(f => f.executar), ups = fz.flatMap(f => f.ups.filter(u => u.executar));
    return [
      { ok: !!cfg.supervisor, t: cfg.supervisor ? `Supervisor responsável: <b>${escapar(pessoa(cfg.supervisor)?.nome)}</b>` : 'Escolha o <b>supervisor responsável</b> na barra acima.' },
      { ok: ups.length > 0, t: ups.length ? `<b>${ups.length}</b> UP(s) em <b>${fz.length}</b> fazenda(s)` : 'Marque pelo menos uma UP para executar.' },
      { ok: ups.every(u => u.area > 0), t: ups.every(u => u.area > 0) ? 'Todas as UPs têm área' : `UP(s) sem área na planilha: <b>${ups.filter(u => !(u.area > 0)).map(u => u.up).join(', ')}</b>` },
      { ok: !!deISO(cfg.entrada), t: deISO(cfg.entrada) ? `Entrada em <b>${br(deISO(cfg.entrada))}</b>` : 'Informe a data de entrada (etapa 3).' },
      { ok: !validarEquipes(), t: validarEquipes() ? 'Revise as equipes (etapa 4).' : `Equipes: <b>${equipesAtivas().map(e => e.nome).join(', ')}</b> · ${fmtHa(producaoDiaria())} ha/dia` }
    ];
  }

  // Eventos do assistente
  $('#p-passos').addEventListener('click', e => { const b = e.target.closest('[data-passo]'); if (b) { estado.passo = +b.dataset.passo; renderEtapa(); } });
  $('#p-voltar').addEventListener('click', () => { estado.passo = Math.max(1, estado.passo - 1); renderEtapa(); });
  $('#p-proximo').addEventListener('click', () => { estado.passo = Math.min(5, estado.passo + 1); renderEtapa(); $('#p-passos').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'nearest' }); });

  function mover(tipo, i, dir, faz) {
    if (tipo === 'faz') {
      const nomes = fazendas().map(f => f.nome);
      const j = i + dir; if (j < 0 || j >= nomes.length) return;
      [nomes[i], nomes[j]] = [nomes[j], nomes[i]]; cfg.ordemFaz = nomes;
    } else {
      const chaves = upsDa(faz).map(u => u.chave);
      const j = i + dir; if (j < 0 || j >= chaves.length) return;
      [chaves[i], chaves[j]] = [chaves[j], chaves[i]]; cfg.ordemUps[faz] = chaves;
    }
    salvar(); renderEtapa();
  }
  function moverPara(tipo, de, para, faz) {
    if (de === para) return;
    const lista = tipo === 'faz' ? fazendas().map(f => f.nome) : upsDa(faz).map(u => u.chave);
    const [x] = lista.splice(de, 1); lista.splice(para, 0, x);
    if (tipo === 'faz') cfg.ordemFaz = lista; else cfg.ordemUps[faz] = lista;
    salvar(); renderEtapa();
  }
  const etapa = $('#p-etapa');
  etapa.addEventListener('click', e => {
    const b = e.target.closest('[data-mover]');
    if (b) mover(b.dataset.mover, +b.dataset.i, +b.dataset.dir, b.dataset.faz);
  });
  etapa.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset.faz && t.type === 'checkbox') { cfg.semFaz = cfg.semFaz.filter(n => n !== t.dataset.faz); if (!t.checked) cfg.semFaz.push(t.dataset.faz); }
    else if (t.dataset.up) { cfg.semUps = cfg.semUps.filter(n => n !== t.dataset.up); if (!t.checked) cfg.semUps.push(t.dataset.up); }
    else if (t.id === 'p-entrada') cfg.entrada = t.value;
    else if (t.dataset.eq && t.dataset.campo === 'on') cfg.equipes[t.dataset.eq].on = t.checked;
    else return;
    salvar(); renderEtapa();
  });
  // Máquinas e rendimento: atualiza a produção sem redesenhar (não perde o foco do campo)
  etapa.addEventListener('input', e => {
    const t = e.target; if (!t.dataset.eq || t.dataset.campo === 'on') return;
    cfg.equipes[t.dataset.eq][t.dataset.campo] = Math.max(0, parseFloat(String(t.value).replace(',', '.')) || 0);
    salvar();
    $(`[data-prod="${t.dataset.eq}"]`).textContent = `${fmtHa(prodEquipe(t.dataset.eq))} ha`;
    $('#p-total-prod').textContent = `${fmtHa(producaoDiaria())} ha/dia`;
    $('#p-eq-erro').innerHTML = validarEquipes(); icones();
    $('#p-nav-info').innerHTML = resumoNav();
    $('#p-destaque-equipes').textContent = equipesAtivas().map(e => e.nome).join(' · ') || '—';
  });
  // Arrastar e soltar
  let arrasto = null;
  etapa.addEventListener('dragstart', e => {
    const li = e.target.closest('.p-item'); if (!li) return;
    const ul = li.closest('[data-lista]');
    arrasto = { tipo: ul.dataset.lista, faz: ul.dataset.faz, de: +li.dataset.i, ul };
    li.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', li.dataset.i); } catch { /* ok */ }
  });
  etapa.addEventListener('dragover', e => {
    const li = e.target.closest('.p-item'); if (!arrasto || !li || li.closest('[data-lista]') !== arrasto.ul) return;
    e.preventDefault(); $$('.p-item.alvo', etapa).forEach(x => x.classList.remove('alvo')); li.classList.add('alvo');
  });
  etapa.addEventListener('drop', e => {
    const li = e.target.closest('.p-item'); if (!arrasto || !li || li.closest('[data-lista]') !== arrasto.ul) return;
    e.preventDefault(); const a = arrasto; arrasto = null; moverPara(a.tipo, a.de, +li.dataset.i, a.faz);
  });
  etapa.addEventListener('dragend', () => { arrasto = null; $$('.p-item', etapa).forEach(x => x.classList.remove('arrastando', 'alvo')); });

  /* ---------- Pergunta obrigatória: cada sábado e domingo do período ---------- */
  // O período depende das respostas (trabalhar num sábado encurta a programação), então a lista
  // é recalculada a cada resposta. Data sem resposta conta como "não trabalha" até ser respondida.
  const modal = $('#p-modal');
  let resposta = {};
  const DIAS_SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  function abrirPergunta() {
    const pend = checklist().filter(c => !c.ok);
    if (pend.length) { estado.passo = 5; renderEtapa(); $('#p-etapa').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'center' }); return; }
    resposta = { ...cfg.fds };   // mostra as respostas já dadas, para conferir
    renderPergunta(); modal.hidden = false; $('#p-modal-erro').hidden = true;
    $('#p-modal-ok').focus();
  }
  function renderPergunta() {
    const sim = programar(resposta);
    const datas = sim.fimDeSemana;
    const faltam = datas.filter(d => !resposta[paraISO(d)]).length;
    // agrupa sábado + domingo do mesmo fim de semana
    const grupos = [];
    datas.forEach(d => { const ult = grupos[grupos.length - 1]; if (ult && d.getDay() === 0 && dias(d, ult[ult.length - 1]) === 1) ult.push(d); else grupos.push([d]); });
    $('#p-fds-resumo').innerHTML = datas.length
      ? `Período previsto: <b>${br(sim.entrada)}</b> a <b>${br(sim.termino)}</b> · <b>${datas.length}</b> dia(s) de fim de semana${faltam ? ` · <b class="p-falta">${faltam} sem resposta</b>` : ' · <b class="p-ok">todos respondidos</b>'}`
      : `Período previsto: <b>${br(sim.entrada)}</b> a <b>${br(sim.termino)}</b> · nenhum sábado ou domingo no período.`;
    $('#p-fds-lista').innerHTML = grupos.map(g => `<div class="p-fds-grupo">${g.map(d => {
      const k = paraISO(d), v = resposta[k];
      return `<div class="p-pergunta ${v ? '' : 'pendente'}"><span><i data-lucide="${d.getDay() === 6 ? 'sun' : 'moon'}"></i><b>${DIAS_SEM[d.getDay()]}</b> ${br(d)}</span>
        <div class="p-simnao" data-data="${k}"><button type="button" data-v="sim" class="${v === 'sim' ? 'ativo' : ''}" aria-pressed="${v === 'sim'}">Sim</button><button type="button" data-v="nao" class="${v === 'nao' ? 'ativo' : ''}" aria-pressed="${v === 'nao'}">Não</button></div></div>`;
    }).join('')}</div>`).join('');
    $('#p-fds-rapido').hidden = !datas.length;
    $('#p-feriados-lista').innerHTML = cfg.feriados.length ? [...cfg.feriados].sort().map(f => `<span class="chip-filtro mini">${br(deISO(f))}<button type="button" data-tirar="${f}" aria-label="Remover ${br(deISO(f))}"><i data-lucide="x"></i></button></span>`).join('') : '<small>Nenhum feriado informado.</small>';
    icones();
    return { sim, faltam };
  }
  const dias = (a, b) => Math.round((a - b) / DIA);
  modal.addEventListener('click', e => {
    const b = e.target.closest('.p-simnao button');
    if (b) { resposta[b.closest('.p-simnao').dataset.data] = b.dataset.v; $('#p-modal-erro').hidden = true; renderPergunta(); return; }
    const r = e.target.closest('[data-rapido]');
    if (r) {
      // aplica a todos os sábados ou domingos do período até a lista parar de mudar
      const [dia, v] = r.dataset.rapido.split(':'), dow = dia === 'sab' ? 6 : 0;
      for (let i = 0; i < 20; i++) {
        const novos = programar(resposta).fimDeSemana.filter(d => d.getDay() === dow && resposta[paraISO(d)] !== v);
        if (!novos.length) break;
        novos.forEach(d => { resposta[paraISO(d)] = v; });
      }
      renderPergunta(); return;
    }
    const t = e.target.closest('[data-tirar]');
    if (t) { cfg.feriados = cfg.feriados.filter(f => f !== t.dataset.tirar); salvar(); renderPergunta(); return; }
    if (e.target === modal) modal.hidden = true;
  });
  $('#p-feriado-add').addEventListener('click', () => { const v = $('#p-feriado-data').value; if (v && !cfg.feriados.includes(v)) { cfg.feriados.push(v); salvar(); } $('#p-feriado-data').value = ''; renderPergunta(); });
  $('#p-modal-fechar').addEventListener('click', () => { modal.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
  $('#p-modal-ok').addEventListener('click', () => {
    const { faltam } = renderPergunta();
    if (faltam) { $('#p-modal-erro').hidden = false; $('#p-modal-erro').textContent = `Responda os ${faltam} sábado(s)/domingo(s) sem resposta para continuar.`; $('.p-pergunta.pendente')?.scrollIntoView({ block: 'center' }); return; }
    cfg.fds = { ...cfg.fds, ...resposta }; salvar();
    modal.hidden = true;
    gerar();
  });
  $('#p-gerar').addEventListener('click', abrirPergunta);

  /* ======================================================================
     5. RESULTADO
     ====================================================================== */
  function gerar() {
    estado.resultado = programar();
    $('#p-resultado').hidden = false;
    renderResultado();
    $('#p-resultado').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
  }
  // Fins de semana do período: quais trabalham e quais não
  function resumoFds(r) {
    const sim = r.fimDeSemana.filter(d => cfg.fds[paraISO(d)] === 'sim'), nao = r.fimDeSemana.filter(d => cfg.fds[paraISO(d)] !== 'sim');
    const lista = l => l.map(d => `${d.getDay() === 6 ? 'sáb' : 'dom'} ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`).join(', ');
    return { sim, nao, texto: r.fimDeSemana.length ? `Trabalha: <b>${sim.length ? lista(sim) : 'nenhum'}</b> · Não trabalha: <b>${nao.length ? lista(nao) : 'nenhum'}</b>` : 'Nenhum sábado ou domingo no período' };
  }
  function renderResultado() {
    const r = estado.resultado; if (!r) return;
    const sup = pessoa(cfg.supervisor);
    const fds = resumoFds(r);
    $('#p-sup-res').innerHTML = `
      <span class="sup-foto p-sup-foto"><img data-foto-sup alt="Foto de ${escapar(sup?.nome || '')}"></span>
      <div><span class="eyebrow">Supervisor responsável</span><strong>${escapar(sup?.nome || '—')}</strong><small>${escapar(sup?.cargo || '')}</small></div>
      <div class="p-sup-eq"><span class="eyebrow">Equipes programadas</span><div>${r.equipes.map(e => `<span class="p-eq-chip ${e.manual ? 'manual' : ''}">${e.nome}<small>${descEquipe(e)}</small></span>`).join('')}</div></div>
      <div class="p-sup-fds"><span class="eyebrow">Fins de semana</span><small>${fds.texto}${cfg.feriados.length ? ` · ${cfg.feriados.length} feriado(s)` : ''}</small></div>`;
    const totalDias = r.diasProducao + r.diasDesloc;
    const cards = [
      ['land-plot', 'Área total', `${fmtHa(r.area)} ha`],
      ['gauge', 'Produção diária', `${fmtHa(r.prod)} ha/dia`],
      ['hammer', 'Dias trabalhados', `${fmt1(totalDias)} <small>(${Math.ceil(totalDias - 1e-9)} dias · ${fmt1(r.diasProducao)} produção + ${r.diasDesloc} deslocamento)</small>`],
      ['calendar-range', 'Dias corridos', `${r.diasCorridos}`],
      ['flag', 'Data de término', br(r.termino)],
      ['wallet', 'Faturamento total', brl(r.faturamento)]
    ];
    $('#p-cards').innerHTML = cards.map(([ic, rot, v], i) => `<article class="kpi glass spot p-card ${i === 4 ? 'destaque' : ''} ${i === 5 ? 'dinheiro' : ''}"><span class="icon-box"><i data-lucide="${ic}"></i></span><span class="kpi-rot">${rot}</span><strong class="kpi-val">${v}</strong></article>`).join('');

    $('#p-tab-equipes').innerHTML = `<table class="q-tab p-tab-eq"><thead><tr><th>Equipe</th><th>Máquinas</th><th>Rendimento (ha/dia)</th><th>Produção/dia</th></tr></thead>
      <tbody>${r.equipes.map(e => `<tr><td data-rotulo="Equipe"><span class="p-eq-chip ${e.manual ? 'manual' : ''}">${e.nome}</span></td><td data-rotulo="Máquinas">${e.manual ? 'Manual' : e.maq}</td><td data-rotulo="Rendimento">${fmt1(+e.rend)} ${e.manual ? 'por equipe' : 'por máquina'}</td><td data-rotulo="Produção/dia"><b>${fmtHa(e.prod)} ha</b></td></tr>`).join('')}
      <tr class="p-total"><td data-rotulo="Total"><b>Total</b></td><td data-rotulo="Máquinas"><b>${r.equipes.filter(e => !e.manual).reduce((s, e) => s + +e.maq, 0)}</b></td><td></td><td data-rotulo="Produção/dia"><b>${fmtHa(r.prod)} ha/dia</b></td></tr></tbody></table>`;

    let html = '';
    r.faz.forEach((f, fi) => {
      const desl = r.linhas.find(l => l.tipo === 'desloc' && l.para === f.nome);
      if (desl) html += `<tr class="p-desloc" style="--c:${f.cor}"><td colspan="5" data-rotulo="Deslocamento"><span class="p-desloc-txt"><i data-lucide="truck"></i>Deslocamento: ${escapar(desl.de)} → ${escapar(desl.para)}</span></td><td></td><td></td><td></td>
        <td data-rotulo="Início">${br(desl.inicio)}</td><td data-rotulo="Término">${br(desl.fim)}</td><td data-rotulo="Dias">${fmt1(desl.dias)}</td></tr>`;
      const its = r.itens.filter(i => i.fazenda === f.nome);
      html += its.map(i => `<tr style="--c:${i.cor}">
        <td data-rotulo="Ordem"><span class="p-ordem">${ord(i.ordem)}</span></td><td data-rotulo="RF">${escapar(i.rf)}</td>
        <td data-rotulo="Fazenda"><span class="p-faz"><i class="p-bolinha"></i>${escapar(i.fazenda)}</span></td>
        <td data-rotulo="UP"><span class="q-up">${escapar(i.up)}</span></td><td data-rotulo="Atividade"><span class="p-ativ">${escapar(i.atividade)}</span></td>
        <td data-rotulo="Área (ha)">${fmtHa(i.area)}</td><td data-rotulo="Tarifa (R$/ha)">${brl(i.tarifa)}</td><td data-rotulo="Faturamento"><b>${brl(i.fat)}</b></td>
        <td data-rotulo="Início">${br(i.inicio)}</td><td data-rotulo="Término">${br(i.fim)}</td><td data-rotulo="Dias">${fmt1(i.dias)}</td></tr>`).join('');
      html += `<tr class="p-subtotal" style="--c:${f.cor}"><td colspan="5" data-rotulo="Subtotal">Subtotal · ${escapar(f.nome)}</td><td data-rotulo="Área">${fmtHa(its.reduce((s, i) => s + i.area, 0))}</td><td></td>
        <td data-rotulo="Faturamento">${brl(its.reduce((s, i) => s + i.fat, 0))}</td><td data-rotulo="Início">${br(its[0].inicio)}</td><td data-rotulo="Término">${br(its[its.length - 1].fim)}</td><td data-rotulo="Dias">${fmt1(its.reduce((s, i) => s + i.dias, 0))}</td></tr>`;
    });
    html += `<tr class="p-total"><td colspan="5" data-rotulo="Total geral">Total geral${r.diasDesloc ? ` <small>(inclui ${r.diasDesloc} dia(s) de deslocamento)</small>` : ''}</td><td data-rotulo="Área">${fmtHa(r.area)}</td><td></td><td data-rotulo="Faturamento">${brl(r.faturamento)}</td>
      <td data-rotulo="Início">${br(r.inicioReal)}</td><td data-rotulo="Término">${br(r.termino)}</td><td data-rotulo="Dias">${fmt1(totalDias)}</td></tr>`;
    $('#p-tab-prog').innerHTML = `<table class="q-tab p-tab-prog"><thead><tr><th>Ordem</th><th>RF</th><th>Fazenda</th><th>UP</th><th>Atividade</th><th>Área (ha)</th><th>Tarifa (R$/ha)</th><th>Faturamento (R$)</th><th>Início</th><th>Término</th><th>Dias</th></tr></thead><tbody>${html}</tbody></table>`;

    $('#p-legenda').innerHTML = r.faz.map(f => `<span><i style="--c:${f.cor}"></i>${escapar(f.nome)}</span>`).join('') + '<span><i class="cinza"></i>Sem trabalho</span>';
    renderCalendario(r);
    renderClima(r);
    carregarClima();
    renderCabecalhoPDF(r, sup);
    aplicarFotos();
    icones();
  }

  function renderCalendario(r) {
    if (!r.termino) { $('#p-meses').innerHTML = '<p class="vazio">Nada para programar.</p>'; return; }
    const ini = r.entrada, fim = r.termino;
    const meses = [];
    for (let m = new Date(ini.getFullYear(), ini.getMonth(), 1, 12); m <= fim; m = new Date(m.getFullYear(), m.getMonth() + 1, 1, 12)) meses.push(m);
    const SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    $('#p-meses').innerHTML = meses.map(m => {
      const ultimo = new Date(m.getFullYear(), m.getMonth() + 1, 0, 12).getDate();
      let cel = '';
      for (let i = 0; i < m.getDay(); i++) cel += '<div class="p-dia vazio" aria-hidden="true"></div>';
      for (let dd = 1; dd <= ultimo; dd++) {
        const d = new Date(m.getFullYear(), m.getMonth(), dd, 12), k = paraISO(d);
        const noPeriodo = d >= ini && d <= fim;
        const trab = r.porDia.get(k) || [];
        const fds = d.getDay() === 0 || d.getDay() === 6;
        const parado = noPeriodo && !diaTrabalhado(d);
        const marca = paraISO(ini) === k ? 'entrada' : paraISO(fim) === k ? 'termino' : '';
        // agrupa por fazenda + atividade: "Fazenda · UP1, UP2 · atividade"; deslocamento aparece à parte
        const grupos = [];
        trab.forEach(t => {
          const chave = t.desloc ? `desloc|${t.fazenda}` : `${t.fazenda}|${t.atividade}`;
          let g = grupos.find(x => x.chave === chave);
          if (!g) grupos.push(g = { chave, desloc: t.desloc, de: t.de, fazenda: t.fazenda, atividade: t.atividade, cor: t.cor, ups: [] });
          if (t.up && !g.ups.includes(t.up)) g.ups.push(t.up);
        });
        const trabalhoFds = fds && trab.length;
        const primeira = grupos.find(g => !g.desloc) || grupos[0];
        const tempoDia = [...new Set(grupos.map(g => g.fazenda))].map(nome => climaNoDia(nome, k)).filter(Boolean);
        cel += `<div class="p-dia ${noPeriodo ? '' : 'fora'} ${parado ? 'parado' : ''} ${fds ? 'fds' : ''} ${trabalhoFds ? 'fds-trab' : ''} ${marca}" ${primeira ? `style="--c:${primeira.cor}"` : ''}>
          <span class="p-dia-n">${dd}${marca ? `<em>${marca === 'entrada' ? 'Entrada' : 'Término'}</em>` : ''}${trabalhoFds ? '<i class="p-fds-tag" title="Fim de semana trabalhado">FDS</i>' : ''}${tempoDia.map(c => `<span class="p-dia-clima ${c.nivel} ${c.estendido ? 'estendido' : ''}" title="${escapar(c.titulo)}"><i>${c.ic}</i><b>${c.tmax}°</b><small>💧${c.chuva}</small>${c.nivel ? '<em>⚠</em>' : ''}</span>`).join('')}</span>
          ${parado ? `<span class="p-dia-sem">${cfg.feriados.includes(k) ? 'Feriado' : 'Sem trabalho'}</span>` : ''}
          ${grupos.map(g => g.desloc
            ? `<span class="p-dia-desloc" title="Deslocamento ${escapar(g.de)} → ${escapar(g.fazenda)}">🚚 Deslocamento<small>→ ${escapar(g.fazenda)}</small></span>`
            : `<span class="p-dia-faz" style="--c:${g.cor}"><b>${escapar(g.fazenda)}</b>${g.ups.map(escapar).join(', ')}<em>${escapar(g.atividade)}</em></span>`).join('')}
        </div>`;
      }
      return `<article class="p-mes fat-painel glass"><h3>${MESES[m.getMonth()]} <span>${m.getFullYear()}</span></h3>
        <div class="p-semana">${SEM.map(s => `<span>${s}</span>`).join('')}</div><div class="p-grade">${cel}</div></article>`;
    }).join('');
  }

  function renderCabecalhoPDF(r, sup) {
    $('#p-print-cab').innerHTML = `
      <div class="p-pc-titulo"><img src="assets/img/folhito/folhito-rosto.png" alt="" onerror="this.remove()"><div><h1>Programação de Atividades</h1><p>SMA Silvicultura · Unidade São Miguel · emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p></div></div>
      <div class="p-pc-sup"><img data-foto-sup alt=""><div><small>Supervisor responsável</small><b>${escapar(sup?.nome || '—')}</b><small>Equipes programadas: <b>${r.equipes.map(e => `${e.nome} (${descEquipe(e)})`).join(' · ')}</b></small></div></div>
      <p class="p-pc-filtros">Filtros: RF <b>${escapar(cfg.rf || 'todos')}</b> · Atividades <b>${escapar(cfg.atividades.join(', ') || 'todas')}</b> · Entrada <b>${br(r.entrada)}</b> · Deslocamento: <b>${DESLOC} dia por troca de fazenda</b><br>Fins de semana: ${resumoFds(r).texto}${cfg.feriados.length ? ` · Feriados: <b>${cfg.feriados.map(f => br(deISO(f))).join(', ')}</b>` : ''}${estado.exemplo ? ' · <b>DADOS DE EXEMPLO</b>' : ''}</p>`;
  }

  /* ======================================================================
     5b. CLIMA: cruza a fazenda programada com a base de clima (coordenadas e município)
     Mesmo resumo do painel de clima da Home (/api/clima, guardado no navegador por 30 min).
     ====================================================================== */
  const CL = D.CLIMA;
  const clima = { dados: null, indice: null, carregando: false, erro: '', ext: new Map(), pedidos: new Set(), tentados: new Set() };
  const DIAS_EXT = 16;   // previsão estendida (máximo do Open-Meteo) só para os pontos das fazendas programadas
  const CHAVE_CLIMA = 'clima:resumo';
  const carregarScript = src => new Promise((ok, falha) => { const e = document.createElement('script'); e.src = src; e.onload = ok; e.onerror = () => falha(new Error(`não carregou ${src}`)); document.head.appendChild(e); });
  const motorClima = async () => { if (!window.SMA_CLIMA_MOTOR) await carregarScript('js/clima-motor.js'); return window.SMA_CLIMA_MOTOR; };
  // previsão aceitável: no máximo 1/4 dos pontos sem resposta do Open-Meteo
  const completo = d => Object.keys(d.pontos || {}).length && !(d.semPrevisao >= Object.keys(d.pontos).length / 4);
  async function buscarClima() {
    try { const c = JSON.parse(localStorage.getItem(CHAVE_CLIMA) || 'null'); if (c && Date.now() - c.quando < CL.cacheMin * 60_000 && c.dados?.fazendas && completo(c.dados)) return c.dados; } catch { /* sem cache */ }
    let d = null;
    if (comServidor) {
      try { const r = await fetch('api/clima', { signal: AbortSignal.timeout(25_000) }); if (r.ok) d = await r.json(); } catch { /* cai para o navegador */ }
    }
    if (!d || !completo(d)) {
      const M = await motorClima();
      const r = await fetch(`https://docs.google.com/spreadsheets/d/${CL.planilha}/export?format=csv&gid=${CL.aba}`, { signal: AbortSignal.timeout(25_000) });
      if (!r.ok) throw new Error('planilha de coordenadas indisponível');
      d = await M.montarResumo(await r.text(), CL);
    }
    try { localStorage.setItem(CHAVE_CLIMA, JSON.stringify({ quando: Date.now(), dados: d })); } catch { /* sem espaço */ }
    return d;
  }
  async function carregarClima() {
    if (clima.dados || clima.carregando || !CL) return;
    clima.carregando = true;
    try {
      const [d] = await Promise.all([buscarClima(), motorClima()]);
      clima.dados = d; clima.indice = null; clima.erro = '';
    } catch (erro) { clima.erro = erro.message; console.warn('Programação: clima indisponível', erro); }
    clima.carregando = false;
    if (estado.resultado) { renderCalendario(estado.resultado); renderClima(estado.resultado); icones(); carregarEstendida(estado.resultado); }
  }
  // Previsão estendida (16 dias) dos pontos das fazendas programadas: cobre todos os dias até o término
  async function estendidaDoPonto(id) {
    const chave = `clima:ext:${id}`;
    try { const c = JSON.parse(localStorage.getItem(chave) || 'null'); if (c && Date.now() - c.quando < CL.cacheMin * 60_000) return c.dados; } catch { /* sem cache */ }
    let d = null;
    if (comServidor) {
      try { const r = await fetch(`api/clima/ponto/${encodeURIComponent(id)}?dias=${DIAS_EXT}`, { signal: AbortSignal.timeout(25_000) }); if (r.ok) d = await r.json(); } catch { /* cai para o navegador */ }
    }
    if (!d?.dias?.length) {
      const M = await motorClima(), p = M.pontoValido(id, CL); if (!p) return null;
      const [hourly] = await M.previsao([p], { dias: DIAS_EXT }); if (!hourly) return null;
      d = M.montarDetalhe(id, hourly, CL, Date.now(), DIAS_EXT);
    }
    const dados = { dias: d.dias, proximaJanela: d.proximaJanela };   // sem o hora a hora: fica leve no navegador
    try { localStorage.setItem(chave, JSON.stringify({ quando: Date.now(), dados })); } catch { /* sem espaço */ }
    return dados;
  }
  async function carregarEstendida(r) {
    if (!clima.dados || !r?.termino) return;
    const ultimo = Object.values(clima.dados.pontos)[0]?.dias.at(-1)?.data;
    if (!ultimo || paraISO(r.termino) <= ultimo) return;   // os 7 dias do resumo já cobrem a programação
    const ids = [...new Set(r.faz.map(f => fazendaClima(f.nome)?.f.ponto).filter(id => id && !clima.ext.has(id) && !clima.pedidos.has(id) && !clima.tentados.has(id)))];
    if (!ids.length) return;
    ids.forEach(id => { clima.pedidos.add(id); clima.tentados.add(id); });
    const res = await Promise.all(ids.map(id => estendidaDoPonto(id).catch(() => null)));
    ids.forEach((id, i) => { clima.pedidos.delete(id); if (res[i]) clima.ext.set(id, res[i]); });
    if (estado.resultado) { renderCalendario(estado.resultado); renderClima(estado.resultado); icones(); }
  }
  // Dias de previsão de um ponto: a estendida, se já veio; senão os 7 do resumo
  const diasDoPonto = id => clima.ext.get(id)?.dias || clima.dados?.pontos[id]?.dias || [];
  // Nome da fazenda → base de clima: 1º pelo código "(S-G12B)", depois pelo nome sem acentos
  const chaveNome = t => String(t ?? '').replace(/\([^)]*\)/g, ' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
  const codigoDe = t => (/\(\s*([A-Z]{1,2}-[A-Z0-9]+)\s*\)/i.exec(t || '') || [])[1]?.toUpperCase() || '';
  function fazendaClima(nome) {
    if (!clima.dados) return null;
    if (!clima.indice) {
      const porCodigo = new Map(), porNome = new Map();
      clima.dados.fazendas.forEach(f => {
        const c = codigoDe(f.nome); if (c) porCodigo.set(c, f);
        const k = chaveNome(f.nome); (porNome.get(k) || porNome.set(k, []).get(k)).push(f);
      });
      clima.indice = { porCodigo, porNome };
    }
    const c = codigoDe(nome);
    if (c && clima.indice.porCodigo.has(c)) return { f: clima.indice.porCodigo.get(c), varias: 1 };
    const l = clima.indice.porNome.get(chaveNome(nome)) || [];
    return l.length ? { f: l.find(f => clima.dados.pontos[f.ponto]) || l[0], varias: l.length } : null;
  }
  // Avisos de um dia de previsão (limites em js/dados.js → CLIMA.alertas e CLIMA.programacao)
  function avisosDoDia(d) {
    const A = CL.alertas, P = CL.programacao || {}, alerta = [], atencao = [];
    if (d.chuva > A.chuvaDiaMm) alerta.push(`chuva forte (${fmt1(d.chuva)} mm)`);
    else if (d.chuva >= P.chuvaMm || d.prob >= P.probChuva) atencao.push(`chuva de ${fmt1(d.chuva)} mm (${Math.round(d.prob ?? 0)}%)`);
    if (d.rajada > A.rajadaKmh) alerta.push(`rajadas de ${Math.round(d.rajada)} km/h`);
    else if (d.rajada >= P.rajadaKmh) atencao.push(`rajadas de ${Math.round(d.rajada)} km/h`);
    if (d.tmax > A.tempMax) alerta.push(`calor de ${Math.round(d.tmax)} °C`);
    if (d.tmin != null && d.tmin < A.geadaMin) alerta.push(`risco de geada (mín. ${Math.round(d.tmin)} °C)`);
    if (d.ideais != null && d.ideais < P.horasBoasMin) atencao.push(d.ideais ? `só ${d.ideais} h boas para aplicar` : 'nenhuma hora boa para aplicar');
    return { alerta, atencao, nivel: alerta.length ? 'alerta' : atencao.length ? 'atencao' : '' };
  }
  const tempoWMO = c => window.SMA_CLIMA_MOTOR?.tempo(c) || ['', ''];
  function climaNoDia(nome, dia) {
    const m = fazendaClima(nome); if (!m) return null;
    const d = diasDoPonto(m.f.ponto).find(x => x.data === dia); if (!d) return null;
    const [ic, desc] = tempoWMO(d.codigo), av = avisosDoDia(d);
    return {
      ic, tmax: Math.round(d.tmax), chuva: fmt1(d.chuva), nivel: av.nivel, estendido: d.data > limite7(),
      titulo: `${nome}: ${desc}, ${Math.round(d.tmax)}°/${Math.round(d.tmin)}°, chuva ${fmt1(d.chuva)} mm (${Math.round(d.prob ?? 0)}%), rajada ${Math.round(d.rajada)} km/h${av.nivel ? ` · Atenção: ${[...av.alerta, ...av.atencao].join(', ')}` : ''}`
    };
  }
  // Último dia da previsão de 7 dias (depois dele, previsão estendida: menos precisa)
  const limite7 = () => Object.values(clima.dados?.pontos || {})[0]?.dias.at(-1)?.data || '';
  // Painel fora do calendário: cada fazenda com o clima de todos os dias programados (até o término)
  function renderClima(r) {
    const el = $('#p-clima'); if (!el) return;
    if (!clima.dados) {
      el.innerHTML = clima.erro
        ? `<p class="p-cl-msg"><i data-lucide="cloud-off"></i>Não consegui ler a previsão do tempo (${escapar(clima.erro)}).</p>`
        : '<p class="p-cl-msg"><i data-lucide="cloud-sun"></i>Buscando a previsão do tempo das fazendas…</p>';
      return;
    }
    const ini = Object.values(clima.dados.pontos)[0]?.dias[0]?.data || paraISO(new Date());
    const termino = r.termino ? paraISO(r.termino) : ini;
    // até onde há previsão para as fazendas desta programação (16 dias quando a estendida chegou)
    const fim = r.faz.reduce((mx, f) => { const m = fazendaClima(f.nome); const u = m ? diasDoPonto(m.f.ponto).at(-1)?.data : ''; return u > mx ? u : mx; }, limite7());
    // ainda falta a estendida de algum ponto (pedida agora ou nem pedida ainda)
    const buscando = termino > fim && r.faz.some(f => { const id = fazendaClima(f.nome)?.f.ponto; return id && !clima.ext.has(id) && (clima.pedidos.has(id) || !clima.tentados.has(id)); });
    const foraDoAlcance = termino > fim && !buscando;
    const quando = new Date(clima.dados.atualizado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    const topo = `<div class="p-cl-topo"><div><span class="eyebrow">Previsão do tempo</span><h3>Clima nas fazendas programadas</h3></div><small>${br(deISO(ini))} a ${br(deISO(termino < fim ? termino : fim))} · Open-Meteo · atualizado ${quando}${fim > limite7() ? `<br>Depois de ${br(deISO(limite7()))}: previsão estendida (borda tracejada), menos precisa` : ''}</small></div>`
      + (buscando ? '<p class="p-cl-msg"><i data-lucide="loader"></i>Buscando a previsão estendida até o término…</p>' : '')
      + (foraDoAlcance ? `<p class="p-cl-msg"><i data-lucide="calendar-x"></i>A previsão alcança até ${br(deISO(fim))}; os dias seguintes até o término (${br(r.termino)}) ainda não têm previsão.</p>` : '');
    const cards = r.faz.map(f => ({
      f, m: fazendaClima(f.nome),
      diasFaz: [...r.porDia.entries()].filter(([k, l]) => k >= ini && k <= fim && l.some(t => t.fazenda === f.nome)).map(([k]) => k).sort()
    })).filter(x => x.diasFaz.length);
    if (!cards.length) { el.innerHTML = `${topo}<p class="p-cl-msg"><i data-lucide="calendar-clock"></i>Nenhum dia desta programação cai no alcance da previsão (até 16 dias): ela aparece aqui quando a data chegar perto.</p>`; return; }
    el.innerHTML = topo + `<div class="p-cl-grade">${cards.map(({ f, diasFaz, m }) => {
      if (!m) return `<article class="p-cl-faz" style="--c:${f.cor}"><header><b>${escapar(f.nome)}</b><small>Fazenda não encontrada na base de clima (coordenadas)</small></header></article>`;
      const p = clima.ext.get(m.f.ponto) || clima.dados.pontos[m.f.ponto];
      if (!p) return `<article class="p-cl-faz" style="--c:${f.cor}"><header><b>${escapar(f.nome)}</b><small>${escapar(m.f.municipio)} · previsão indisponível agora (o Open-Meteo não respondeu para este ponto)</small></header></article>`;
      const lista = diasFaz.map(k => diasDoPonto(m.f.ponto).find(d => d.data === k)).filter(Boolean);
      const avisos = lista.map(d => { const a = avisosDoDia(d); return { d, n: a.nivel, t: [...a.alerta, ...a.atencao].join(' · ') }; }).filter(a => a.n);   // um aviso por dia
      const rajMax = Math.max(0, ...lista.map(d => d.rajada || 0)), chuvaTot = lista.reduce((s, d) => s + (d.chuva || 0), 0);
      return `<article class="p-cl-faz" style="--c:${f.cor}">
        <header><b>${escapar(f.nome)}</b><small>${escapar(m.f.municipio)}${m.varias > 1 ? ' · há outra fazenda com este nome na base' : ''}</small></header>
        <div class="p-cl-resumo"><span>💨 Rajada máx. <b>${Math.round(rajMax)} km/h</b></span><span>💧 Chuva <b>${fmt1(chuvaTot)} mm</b></span><span>📅 <b>${lista.length}</b> dia(s) com previsão</span>${p.proximaJanela ? `<span>✅ Próxima janela boa <b>${escapar(p.proximaJanela.rotulo)}</b></span>` : ''}</div>
        <div class="p-cl-dias">${lista.map(d => {
          const [ic, desc] = tempoWMO(d.codigo), a = avisosDoDia(d);
          return `<div class="p-cl-dia ${a.nivel} ${d.data > limite7() ? 'estendido' : ''}" title="${escapar(desc)}${d.data > limite7() ? ' · previsão estendida' : ''}"><small class="p-cl-rot">${escapar(d.rotulo)}</small><i>${ic}</i><b>${Math.round(d.tmax)}° <span>/ ${Math.round(d.tmin)}°</span></b><small>💧 ${fmt1(d.chuva)} mm · ${Math.round(d.prob ?? 0)}%</small><small>💨 ${Math.round(d.vento)} · rajada ${Math.round(d.rajada)}</small>${d.ideais != null ? `<small>🟢 ${d.ideais} h boas</small>` : ''}</div>`;
        }).join('')}</div>
        ${avisos.length ? `<ul class="p-cl-avisos">${avisos.map(a => `<li class="${a.n}">⚠️ <b>${escapar(a.d.rotulo)}:</b> ${escapar(a.t)}</li>`).join('')}</ul>` : '<p class="p-cl-ok">✔ Sem avisos nos dias programados</p>'}
      </article>`;
    }).join('')}</div>`;
  }

  /* ======================================================================
     6. SUPERVISOR, FOTOS (trocam a cada 1 minuto) E PDF
     ====================================================================== */
  const supervisores = (F?.pessoas || []).filter(p => p.supervisor);
  const pessoa = id => supervisores.find(p => p.id === id);
  const fotos = {}, fotoAtual = {};
  async function carregarFotos() {
    await Promise.all(supervisores.map(async p => {
      let lista = F.fotos?.[p.id] || [];
      if (/^https?:$/.test(location.protocol)) {
        try { const r = await fetch(`api/fotos/${p.id}`); if (r.ok) { const j = await r.json(); if (j.fotos?.length) lista = j.fotos; } } catch { /* lista fixa */ }
      }
      fotos[p.id] = lista; fotoAtual[p.id] = lista[0] || '';
    }));
  }
  function sortearFotos() {
    Object.keys(fotos).forEach(id => { const l = fotos[id]; if (l.length > 1) fotoAtual[id] = l[(l.indexOf(fotoAtual[id]) + 1) % l.length]; });
    aplicarFotos(true);
  }
  function aplicarFotos(comFade) {
    $$('img[data-foto-sup]').forEach(img => {
      const src = fotoAtual[cfg.supervisor] || '';
      if (img.getAttribute('src') === src) return;
      if (!src) { img.removeAttribute('src'); return; }
      if (comFade && !reduzMovimento) { img.style.opacity = 0; setTimeout(() => { img.src = src; img.style.opacity = ''; }, 350); }
      else img.src = src;
    });
    $$('img[data-foto-pessoa]').forEach(img => { const s = fotoAtual[img.dataset.fotoPessoa]; if (s && img.getAttribute('src') !== s) img.src = s; });
  }
  function renderSupervisores() {
    $('#p-sups').innerHTML = supervisores.map(p => `
      <button type="button" class="pessoa-btn ${cfg.supervisor === p.id ? 'ativo' : ''}" data-sup="${p.id}" aria-pressed="${cfg.supervisor === p.id}">
        <span class="pessoa-foto"><img data-foto-pessoa="${p.id}" alt=""></span><span><strong>${p.nome}</strong><small>Supervisão</small></span>
      </button>`).join('');
    const sup = pessoa(cfg.supervisor);
    $('#p-destaque-nome').textContent = sup ? sup.nome : 'Selecione';
    $('#p-destaque-cargo').textContent = sup ? sup.cargo : 'escolha na barra abaixo';
    $('#p-destaque').classList.toggle('sem-sup', !sup);
    $('#p-destaque-equipes').textContent = equipesAtivas().map(e => e.nome).join(' · ') || '—';
    aplicarFotos();
  }
  $('#p-sups').addEventListener('click', e => {
    const b = e.target.closest('[data-sup]'); if (!b) return;
    cfg.supervisor = b.dataset.sup; salvar(); renderSupervisores();
    if (estado.passo === 5) renderEtapa();
    if (estado.resultado) renderResultado();
  });

  /* ---------- PDF: gerado direto no navegador (A4 paisagem), módulo compartilhado js/pdf.js ---------- */
  // Páginas: 1) cabeçalho + cards + equipes · 2..) tabela em partes · depois 1 mês por página
  /* ---------- Tabelas próprias do PDF: texto simples (sem "pílulas"), colunas largas, uma linha por UP ---------- */
  const unidadeDose = d => (String(d || '').match(/[a-zA-Zµ][\w/.\s]*$/) || [''])[0].trim();   // "3,0 L/ha" → "L/ha"
  const fmt2 = v => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function quantidade(dose, area) {
    const n = P.num(dose);
    if (!(n > 0)) return { texto: '—', valor: 0, un: '' };
    const un = unidadeDose(dose).replace(/\s*\/\s*ha$/i, '');
    return { texto: `${fmt2(n * area)}${un ? ` ${un}` : ''}`, valor: n * area, un };
  }
  function linhasTabelaPDF(r) {
    const variosRF = new Set(r.itens.map(i => i.rf)).size > 1;
    const cab = `<thead><tr><th class="c-ord">Ordem</th>${variosRF ? '<th class="c-rf">RF</th>' : ''}<th class="c-faz">Fazenda</th><th class="c-up">UP</th><th class="c-ativ">Atividade</th><th class="c-num c-area">Área (ha)</th><th class="c-num c-tar">Tarifa (R$/ha)</th><th class="c-num c-fat">Faturamento</th><th class="c-data">Início</th><th class="c-data">Término</th><th class="c-num c-dias">Dias</th></tr></thead>`;
    const vazio = variosRF ? '<td></td>' : '';
    const linhas = [];
    r.faz.forEach(f => {
      const desl = r.linhas.find(l => l.tipo === 'desloc' && l.para === f.nome);
      if (desl) linhas.push(`<tr class="t-desloc" style="--c:${f.cor}"><td colspan="${variosRF ? 7 : 6}">🚚 Deslocamento: ${escapar(desl.de)} → ${escapar(desl.para)}</td><td class="c-data">${br(desl.inicio)}</td><td class="c-data">${br(desl.fim)}</td><td class="c-num">${fmt1(desl.dias)}</td></tr>`);
      const its = r.itens.filter(i => i.fazenda === f.nome);
      its.forEach(i => linhas.push(`<tr style="--c:${i.cor}"><td class="c-ord"><b>${ord(i.ordem)}</b></td>${variosRF ? `<td>${escapar(i.rf)}</td>` : ''}<td>${escapar(i.fazenda)}</td><td><b>${escapar(i.up)}</b></td><td class="c-ativ">${escapar(i.atividade)}</td>
        <td class="c-num">${fmtHa(i.area)}</td><td class="c-num">${brl(i.tarifa)}</td><td class="c-num"><b>${brl(i.fat)}</b></td><td class="c-data">${br(i.inicio)}</td><td class="c-data">${br(i.fim)}</td><td class="c-num">${fmt1(i.dias)}</td></tr>`));
      linhas.push(`<tr class="t-sub" style="--c:${f.cor}"><td colspan="${variosRF ? 5 : 4}">Subtotal · ${escapar(f.nome)}</td><td class="c-num">${fmtHa(its.reduce((s, i) => s + i.area, 0))}</td><td></td><td class="c-num">${brl(its.reduce((s, i) => s + i.fat, 0))}</td><td class="c-data">${br(its[0].inicio)}</td><td class="c-data">${br(its.at(-1).fim)}</td><td class="c-num">${fmt1(its.reduce((s, i) => s + i.dias, 0))}</td></tr>`);
    });
    linhas.push(`<tr class="t-total"><td colspan="${variosRF ? 5 : 4}">Total geral${r.diasDesloc ? ` (inclui ${r.diasDesloc} dia(s) de deslocamento)` : ''}</td><td class="c-num">${fmtHa(r.area)}</td><td></td><td class="c-num">${brl(r.faturamento)}</td><td class="c-data">${br(r.inicioReal)}</td><td class="c-data">${br(r.termino)}</td><td class="c-num">${fmt1(r.diasProducao + r.diasDesloc)}</td></tr>`);
    return { cab, linhas, vazio };
  }
  // Insumos: resumo por produto (quantidade total) e detalhe por UP (dose × área)
  function paginasInsumosPDF(r, cabCurto) {
    const comInsumo = r.itens.filter(i => i.insumos?.length);
    if (!comInsumo.length) return [];
    const porProduto = new Map();
    comInsumo.forEach(i => i.insumos.forEach(x => {
      const k = `${x.nome}|${x.dose}`;
      const g = porProduto.get(k) || porProduto.set(k, { nome: x.nome, dose: x.dose, area: 0, ups: [], ini: i.inicio, fim: i.fim }).get(k);
      g.area += i.area; g.ups.push(i.up); if (i.inicio < g.ini) g.ini = i.inicio; if (i.fim > g.fim) g.fim = i.fim;
    }));
    const resumo = `<table class="p-pdf-tab p-pdf-ins"><thead><tr><th>Insumo</th><th class="c-num">Dose (por ha)</th><th class="c-num">Área (ha)</th><th class="c-num">Quantidade total</th><th class="c-num">UPs</th><th>Período</th></tr></thead><tbody>${[...porProduto.values()].map(g => `
      <tr><td class="c-quebra"><b>${escapar(g.nome)}</b></td><td class="c-num">${escapar(g.dose || '—')}</td><td class="c-num">${fmtHa(g.area)}</td><td class="c-num c-qtd">${quantidade(g.dose, g.area).texto}</td><td class="c-num">${g.ups.length}</td><td>${br(g.ini)} a ${br(g.fim)}</td></tr>`).join('')}</tbody></table>
      <p class="p-pdf-nota">Quantidade total = dose por hectare × área das UPs. Unidade da dose como está na planilha.</p>`;
    const linhas = comInsumo.map(i => i.insumos.map((x, k) => `<tr style="--c:${i.cor}">${k ? '' : `<td rowspan="${i.insumos.length}" class="c-ord"><b>${ord(i.ordem)}</b></td><td rowspan="${i.insumos.length}">${escapar(i.fazenda)}</td><td rowspan="${i.insumos.length}"><b>${escapar(i.up)}</b></td><td rowspan="${i.insumos.length}" class="c-num">${fmtHa(i.area)}</td>`}
      <td class="c-quebra">${escapar(x.nome)}</td><td class="c-num">${escapar(x.dose || '—')}</td><td class="c-num c-qtd">${quantidade(x.dose, i.area).texto}</td>${k ? '' : `<td rowspan="${i.insumos.length}" class="c-data">${br(i.inicio)}</td>`}</tr>`).join(''));
    const cab = '<thead><tr><th class="c-ord">Ordem</th><th class="c-faz">Fazenda</th><th class="c-up">UP</th><th class="c-num">Área (ha)</th><th class="c-ins">Insumo</th><th class="c-num">Dose (por ha)</th><th class="c-num">Quantidade</th><th class="c-data">Início</th></tr></thead>';
    const pags = [], POR = 16, partes = Math.ceil(linhas.length / POR);
    for (let p = 0; p < partes; p++) {
      pags.push(`${cabCurto}${p ? '' : `<h2 class="p-pdf-tit">Insumos e doses · resumo por produto</h2>${resumo}`}
        <h2 class="p-pdf-tit">Insumos e doses por UP${partes > 1 ? ` <small>(${p + 1}/${partes})</small>` : ''}</h2>
        <table class="p-pdf-tab p-pdf-ins-up">${cab}<tbody>${linhas.slice(p * POR, (p + 1) * POR).join('')}</tbody></table>`);
    }
    return pags;
  }

  function paginasPDF() {
    const r = estado.resultado, sup = pessoa(cfg.supervisor);
    const cabCompleto = $('#p-print-cab').innerHTML;
    const cabCurto = `<div class="p-pdf-mini"><b>Programação de Atividades</b><span>Supervisor: <b>${escapar(sup?.nome || '—')}</b> · Equipes: <b>${r.equipes.map(e => e.nome).join(', ')}</b> · ${br(r.entrada)} a ${br(r.termino)}</span></div>`;
    const pags = [`<header class="p-print-cab">${cabCompleto}</header>
      <div class="p-cards">${$('#p-cards').innerHTML}</div>
      <h2 class="p-pdf-tit">Equipes programadas</h2>${$('#p-tab-equipes').innerHTML}`];
    const { cab, linhas } = linhasTabelaPDF(r);
    const POR_PAGINA = 18;
    for (let i = 0; i < linhas.length; i += POR_PAGINA) {
      pags.push(`${cabCurto}<h2 class="p-pdf-tit">Tabela da programação${linhas.length > POR_PAGINA ? ` <small>(${Math.floor(i / POR_PAGINA) + 1}/${Math.ceil(linhas.length / POR_PAGINA)})</small>` : ''}</h2>
        <table class="p-pdf-tab">${cab}<tbody>${linhas.slice(i, i + POR_PAGINA).join('')}</tbody></table>`);
    }
    pags.push(...paginasInsumosPDF(r, cabCurto));
    if ($('#p-clima .p-cl-faz')) pags.push(`${cabCurto}<div class="p-clima">${$('#p-clima').innerHTML}</div>`);
    $$('#p-meses .p-mes').forEach(m => pags.push(`${cabCurto}<div class="p-legenda">${$('#p-legenda').innerHTML}</div><article class="p-mes">${m.innerHTML}</article>`));
    return pags;
  }
  async function gerarPDF() {
    if (!estado.resultado || !window.SMA_PDF) return;
    const bt = $('#p-imprimir'), rot = $('span', bt), original = rot.textContent;
    bt.disabled = true; bt.classList.add('girando'); rot.textContent = 'Preparando…';
    const sup = pessoa(cfg.supervisor)?.nome || 'Programacao';
    const nome = `Programacao_${sup}_${paraISO(estado.resultado.entrada)}${estado.aberta ? '_' + estado.aberta.nome.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 40) : ''}.pdf`;
    try {
      await window.SMA_PDF.gerar(paginasPDF(), nome, {
        preparar: () => aplicarFotos(),
        progresso: (i, n) => { rot.textContent = `Gerando PDF ${i}/${n}…`; }
      });
      rot.textContent = 'PDF baixado ✓';
    } catch (erro) {
      console.error('Programação: falha ao gerar o PDF', erro);
      rot.textContent = original;
      alertaTopo(`Não consegui gerar o PDF (${escapar(erro.message)}). Verifique a internet e tente de novo.`);
    } finally {
      bt.disabled = false; bt.classList.remove('girando');
      setTimeout(() => { rot.textContent = original; }, 2500);
    }
  }
  $('#p-imprimir').addEventListener('click', gerarPDF);
  function alertaTopo(html) {
    const el = $('#p-erros');
    el.innerHTML = `<i data-lucide="triangle-alert"></i><div><strong>Atenção</strong><p>${html}</p></div>`;
    el.hidden = false; icones();
    el.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'center' });
  }

  /* ======================================================================
     7. PROGRAMAÇÕES SALVAS (no servidor do site; sem servidor, neste navegador)
     ====================================================================== */
  const CHAVE_SALVAS = 'prog:salvas';
  const salvas = { lista: [], onde: 'navegador' };
  const comServidor = /^https?:$/.test(location.protocol);
  const lerLocal = () => { try { return JSON.parse(localStorage.getItem(CHAVE_SALVAS) || '[]'); } catch { return []; } };
  const gravarLocal = l => { localStorage.setItem(CHAVE_SALVAS, JSON.stringify(l)); };
  async function listarSalvas() {
    if (comServidor) {
      try {
        const r = await fetch('api/programacoes', { cache: 'no-store' });
        if (r.ok) { salvas.lista = (await r.json()).programacoes || []; salvas.onde = 'servidor'; return; }
      } catch { /* sem servidor: usa o navegador */ }
    }
    salvas.lista = lerLocal(); salvas.onde = 'navegador';
  }
  async function gravarSalva(p) {
    if (salvas.onde === 'servidor') {
      const r = await fetch(`api/programacoes/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || `erro ${r.status}`);
    } else gravarLocal([...lerLocal().filter(x => x.id !== p.id), p]);
    await listarSalvas();
  }
  async function excluirSalva(id) {
    if (salvas.onde === 'servidor') { const r = await fetch(`api/programacoes/${id}`, { method: 'DELETE' }); if (!r.ok) throw new Error(`erro ${r.status}`); }
    else gravarLocal(lerLocal().filter(x => x.id !== id));
    await listarSalvas();
  }
  const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  function renderSalvas() {
    $('#p-salvas-onde').innerHTML = salvas.onde === 'servidor'
      ? '<i data-lucide="server"></i>Salvas no servidor do site'
      : '<i data-lucide="hard-drive"></i>Salvas neste navegador';
    const termo = ($('#p-salvas-busca').value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const lista = [...salvas.lista].sort((a, b) => (b.atualizadoEm || '').localeCompare(a.atualizadoEm || ''))
      .filter(p => !termo || norm(`${p.nome} ${pessoa(p.cfg?.supervisor)?.nome} ${(p.resumo?.fazendas || []).join(' ')} ${(p.resumo?.atividades || []).join(' ')}`).includes(termo));
    $('#p-salvas').innerHTML = lista.length ? lista.map(p => {
      const s = pessoa(p.cfg?.supervisor), r = p.resumo || {};
      return `<article class="p-salva glass ${estado.aberta?.id === p.id ? 'aberta' : ''}">
        <header><span class="pessoa-foto"><img data-foto-pessoa="${escapar(p.cfg?.supervisor || '')}" alt=""></span>
          <div><strong>${escapar(p.nome)}</strong><small>${escapar(s?.nome || 'Sem supervisor')} · atualizada em ${new Date(p.atualizadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small></div>
          ${p.exemplo ? '<span class="p-tag-ex">exemplo</span>' : ''}</header>
        <dl>
          <div><dt>Período</dt><dd>${br(deISO(r.entrada))} → ${br(deISO(r.termino))}</dd></div>
          <div><dt>Área</dt><dd>${fmtHa(r.area)} ha</dd></div>
          <div><dt>Faturamento</dt><dd>${brl(r.faturamento)}</dd></div>
          <div><dt>Equipes</dt><dd>${escapar((r.equipes || []).join(', ') || '—')}</dd></div>
        </dl>
        <p class="p-salva-faz">${escapar((r.fazendas || []).join(' → '))}</p>
        ${p.obs ? `<p class="p-salva-obs"><i data-lucide="sticky-note"></i>${escapar(p.obs)}</p>` : ''}
        <footer>
          <button type="button" class="fat-btn" data-abrir="${p.id}"><i data-lucide="folder-open"></i>Abrir</button>
          <button type="button" class="fat-btn" data-editar="${p.id}"><i data-lucide="pencil"></i>Editar</button>
          <button type="button" class="fat-btn p-excluir" data-excluir="${p.id}" aria-label="Excluir ${escapar(p.nome)}"><i data-lucide="trash-2"></i></button>
        </footer>
      </article>`;
    }).join('') : `<p class="p-salvas-vazio"><i data-lucide="archive"></i>${salvas.lista.length ? 'Nenhuma programação encontrada na busca.' : 'Nenhuma programação salva ainda. Gere uma programação e toque em "Salvar programação".'}</p>`;
    aplicarFotos(); icones();
  }
  $('#p-salvas-busca').addEventListener('input', renderSalvas);

  // Salvar: guarda a configuração e as linhas da planilha usadas (para abrir igual no futuro)
  const modalSalvar = $('#p-modal-salvar');
  function abrirSalvar() {
    if (!estado.resultado) return;
    const sup = pessoa(cfg.supervisor)?.nome || 'Programação';
    $('#p-salvar-nome').value = estado.aberta?.nome || `${sup} · ${(cfg.atividades.join(' + ') || 'Todas as atividades')} · ${br(estado.resultado.entrada)}`;
    $('#p-salvar-obs').value = estado.aberta?.obs || '';
    $('#p-salvar-nova').hidden = !estado.aberta;
    $('#p-salvar-ok span').textContent = estado.aberta ? 'Salvar alterações' : 'Salvar';
    $('#p-salvar-info').innerHTML = `${salvas.onde === 'servidor' ? 'Fica salva no servidor do site: aparece em qualquer navegador que abrir este site.' : 'Sem o servidor do site, fica salva só neste navegador.'} Os dados da planilha usados agora também são guardados.`;
    modalSalvar.hidden = false; icones();
    setTimeout(() => $('#p-salvar-nome').select(), 30);
  }
  async function confirmarSalvar(comoNova) {
    const nome = $('#p-salvar-nome').value.trim();
    if (!nome) { $('#p-salvar-nome').focus(); return; }
    const r = estado.resultado, agora = new Date().toISOString();
    const id = !comoNova && estado.aberta ? estado.aberta.id : novoId();
    const anterior = salvas.lista.find(p => p.id === id);
    const p = {
      id, nome, obs: $('#p-salvar-obs').value.trim(), exemplo: estado.exemplo,
      criadoEm: anterior?.criadoEm || agora, atualizadoEm: agora,
      cfg: JSON.parse(JSON.stringify(cfg)), linhas: estado.linhas,
      resumo: {
        entrada: paraISO(r.entrada), termino: r.termino ? paraISO(r.termino) : null, area: r.area, faturamento: r.faturamento,
        equipes: r.equipes.map(e => e.nome), fazendas: r.faz.map(f => f.nome), atividades: [...new Set(r.itens.map(i => i.atividade))]
      }
    };
    const bt = $('#p-salvar-ok'); bt.disabled = true;
    try {
      await gravarSalva(p);
      estado.aberta = { id: p.id, nome: p.nome, obs: p.obs };
      modalSalvar.hidden = true;
      renderEditando(); renderSalvas();
      $('#p-salvar span').textContent = 'Salvo ✓';
      setTimeout(() => { $('#p-salvar span').textContent = 'Salvar programação'; }, 2500);
    } catch (erro) {
      $('#p-salvar-info').innerHTML = `<b class="p-falta">Não consegui salvar: ${escapar(erro.message)}</b>`;
    } finally { bt.disabled = false; }
  }
  $('#p-salvar').addEventListener('click', abrirSalvar);
  $('#p-salvar-ok').addEventListener('click', () => confirmarSalvar(false));
  $('#p-salvar-nova').addEventListener('click', () => confirmarSalvar(true));
  modalSalvar.addEventListener('click', e => { if (e.target === modalSalvar || e.target.closest('[data-fechar]')) modalSalvar.hidden = true; });
  $('#p-salvar-nome').addEventListener('keydown', e => { if (e.key === 'Enter') confirmarSalvar(false); });

  // Abrir (consultar) ou editar uma programação salva
  function carregarSalva(id, editar) {
    const p = salvas.lista.find(x => x.id === id); if (!p) return;
    cfg = Object.assign(padrao(), JSON.parse(JSON.stringify(p.cfg)));
    TODAS_EQUIPES.forEach(e => { cfg.equipes[e] = Object.assign({ on: false, maq: 1, rend: ehManual(e) ? 1 : 5 }, cfg.equipes[e]); });
    salvar();
    estado.linhas = p.linhas || []; estado.exemplo = !!p.exemplo;
    estado.aberta = { id: p.id, nome: p.nome, obs: p.obs };
    renderTudo();
    if (editar) {
      estado.passo = 1; renderEtapa();
      $('#p-assist-tit').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
    } else {
      estado.resultado = programar();   // consulta: mostra como foi salva (fins de semana já respondidos)
      $('#p-resultado').hidden = false; renderResultado();
      $('#p-resultado').scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
    }
    renderSalvas();
  }
  function renderEditando() {
    const el = $('#p-editando');
    el.hidden = !estado.aberta;
    if (estado.aberta) el.innerHTML = `<i data-lucide="folder-open"></i><span>Programação salva aberta: <b>${escapar(estado.aberta.nome)}</b>. Edite nas etapas, gere de novo e toque em "Salvar programação" para gravar as alterações.</span>
      <button type="button" id="p-planilha-atual">Usar dados atuais da planilha</button><button type="button" id="p-fechar-salva">Fechar</button>`;
    icones();
  }
  $('#p-editando').addEventListener('click', e => {
    if (e.target.closest('#p-fechar-salva')) { estado.aberta = null; carregar(); renderSalvas(); }
    else if (e.target.closest('#p-planilha-atual')) { const ab = estado.aberta; carregar(true).then(() => { estado.aberta = ab; renderEditando(); }); }
  });
  $('#p-salvas').addEventListener('click', async e => {
    const ab = e.target.closest('[data-abrir]'), ed = e.target.closest('[data-editar]'), ex = e.target.closest('[data-excluir]');
    if (ab) carregarSalva(ab.dataset.abrir, false);
    else if (ed) carregarSalva(ed.dataset.editar, true);
    else if (ex) {
      const p = salvas.lista.find(x => x.id === ex.dataset.excluir);
      if (!p || !confirm(`Excluir a programação "${p.nome}"? Essa ação não pode ser desfeita.`)) return;
      try { await excluirSalva(p.id); if (estado.aberta?.id === p.id) { estado.aberta = null; renderEditando(); } renderSalvas(); }
      catch (erro) { alertaTopo(`Não consegui excluir: ${escapar(erro.message)}`); }
    }
  });

  /* ---------- Filtros ---------- */
  function renderFiltros() {
    const rfs = [...new Set(estado.linhas.map(l => l.rf))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const ativs = [...new Set(estado.linhas.filter(l => !cfg.rf || l.rf === cfg.rf).map(l => l.atividade))].sort();
    if (cfg.rf && !rfs.includes(cfg.rf)) cfg.rf = '';
    cfg.atividades = cfg.atividades.filter(a => ativs.includes(a));
    $('#p-f-rf').innerHTML = `<option value="">Todos</option>${rfs.map(r => `<option ${r === cfg.rf ? 'selected' : ''}>${escapar(r)}</option>`).join('')}`;
    // Atividade: seleção múltipla (nenhuma marcada = todas)
    const n = cfg.atividades.length;
    $('#p-f-ativ-rot').textContent = !n ? 'Todas' : n === 1 ? cfg.atividades[0] : `${n} selecionadas`;
    $('#p-f-ativ-btn').classList.toggle('preenchido', n > 0);
    $('#p-f-ativ-lista').innerHTML = ativs.map(a => `<label class="p-multi-op"><input type="checkbox" value="${escapar(a)}" ${cfg.atividades.includes(a) ? 'checked' : ''}><span>${escapar(a)}</span><small>${estado.linhas.filter(l => l.atividade === a && (!cfg.rf || l.rf === cfg.rf)).length} UP(s)</small></label>`).join('') || '<small>Sem atividades na planilha.</small>';
  }
  $('#p-f-rf').addEventListener('change', e => { cfg.rf = e.target.value; salvar(); renderTudo(); });
  const popAtiv = $('#p-f-ativ-pop');
  const abrirAtiv = sim => { popAtiv.hidden = !sim; $('#p-f-ativ-btn').setAttribute('aria-expanded', String(sim)); };
  $('#p-f-ativ-btn').addEventListener('click', () => abrirAtiv(popAtiv.hidden));
  document.addEventListener('click', e => { if (!popAtiv.hidden && !e.target.closest('.p-multi')) abrirAtiv(false); });
  popAtiv.addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    cfg.atividades = $$('#p-f-ativ-lista input:checked').map(i => i.value);
    salvar(); renderTudo(); abrirAtiv(true);
  });
  popAtiv.addEventListener('click', e => {
    const b = e.target.closest('[data-ativ-todas]'); if (!b) return;
    cfg.atividades = b.dataset.ativTodas === 'marcar' ? $$('#p-f-ativ-lista input').map(i => i.value) : [];
    salvar(); renderTudo(); abrirAtiv(true);
  });

  function renderTudo() {
    const temDados = estado.linhas.length > 0;
    $('#p-vazio').hidden = temDados || estado.carregando;
    $('#p-conteudo').hidden = !temDados;
    $('#p-aviso-exemplo').hidden = !estado.exemplo;
    renderFiltros(); renderSupervisores(); renderEditando();
    if (!temDados) { icones(); return; }
    renderEtapa();
    $('#p-resultado').hidden = true; estado.resultado = null;   // mudou a base: gere de novo
  }

  /* ---------- Carga ---------- */
  async function carregar(fresco = false) {
    const bt = $('#p-atualizar'); bt.classList.add('girando'); bt.disabled = true;
    $('#p-status').textContent = 'Atualizando dados…';
    $('#p-erros').hidden = true;
    try {
      estado.linhas = normalizar(await carregarProgramacao(fresco));
      estado.exemplo = false;
      $('#p-vazio-tit').textContent = 'A planilha de programação está vazia';
      $('#p-status').textContent = estado.linhas.length ? `${estado.linhas.length} UPs · atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : 'Planilha sem linhas preenchidas';
    } catch (erro) {
      console.warn('Programação: falha ao ler a planilha', erro);
      estado.linhas = []; estado.exemplo = false;
      $('#p-vazio-tit').textContent = 'Não consegui ler a planilha de programação';
      $('#p-status').textContent = 'Sem acesso à planilha';
    }
    estado.carregando = false;
    bt.classList.remove('girando'); bt.disabled = false;
    renderTudo();
  }
  $('#p-atualizar').addEventListener('click', () => carregar(true));
  $('#p-exemplo').addEventListener('click', () => { estado.linhas = normalizar(dadosExemplo()); estado.exemplo = true; $('#p-status').textContent = 'Dados de exemplo'; renderTudo(); });
  $('#p-sair-exemplo').addEventListener('click', () => carregar(true));

  (async () => {
    renderSupervisores(); icones();
    await carregarFotos(); aplicarFotos();
    setInterval(sortearFotos, 60_000);   // troca a foto do supervisor a cada 1 minuto
    await Promise.all([carregar(), listarSalvas()]);
    renderSalvas();
  })();
})();
