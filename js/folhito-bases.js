/* ==========================================================================
   Folhito — respostas com as bases dos painéis, SEM IA (direto no navegador)
   Usa o motor do Experimento (js/experimento-motor.js): entende a pergunta em português,
   baixa só as planilhas necessárias, calcula e escreve a resposta com os números.
   Exporta window.FOLHITO_BASES = { pareceDados(texto), responder(texto) }
   ========================================================================== */

(() => {
  const norm = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Assuntos sem base de dados no painel: responde com sinceridade, sem inventar
  const SEM_BASE = [
    [/seguranca|acidente|incidente|\bepi\b|\bcat\b|quase acidente|sesmt|\bdds\b/, 'Segurança', 'seguranca.html',
      'A seção de **Segurança** ainda não tem base de dados ligada ao painel, então não consigo trazer números de acidentes, EPIs ou inspeções. Para isso, procure o técnico de segurança ou a liderança. 🦺'],
    [/estoque|almoxarifado|insumo|muda(s)? em estoque|adubo em estoque|saldo de/, 'Estoque', 'estoque.html',
      'A seção de **Estoque** ainda não tem base de dados ligada ao painel, então não consigo informar saldos de insumos ou materiais. Procure o almoxarifado ou o supervisor.'],
    [/\bcustos?\b|gasto|despesa|orcamento/, 'Custos', 'custos.html',
      'Os **custos** ficam no painel externo Cost Flow, que eu não consigo ler. Você abre por aqui:']
  ];

  // Palavras que indicam pergunta sobre os dados (faturamento, produção, qualidade, RH, frota…)
  const PALAVRAS = /quant|qual|quais|quem|total|soma|media|maior|menor|ranking|top|lista|fatur|produ|area|hectare|\bha\b|rendimento|meta|aderencia|nota|qualidade|avaliac|uniformidade|colaborador|funcionari|pessoas|func(ao|oes)|cargo|modalidade|tempo de casa|ativos?|equipe|fazenda|\bup\b|ups|frota|maquina|supervisor|atividade|programac|rf ?\d|apontament|dias trabalhados/;

  // só trata como pedido de dados (e não como dúvida geral, ex.: "como usar o EPI?") quando pede números/registros
  const PEDE_NUMEROS = /quant|numero|indicador|taxa|total|dados|saldo|valor|relatorio|registr|como esta|como estao|situacao/;
  const semBaseDe = t => (PEDE_NUMEROS.test(t) ? SEM_BASE.find(([re]) => re.test(t)) : null);

  function pareceDados(texto) {
    const t = norm(texto);
    if (semBaseDe(t)) return true;
    return PALAVRAS.test(t) && !/^(oi|ola|bom dia|boa tarde|boa noite|obrigad|valeu)\b/.test(t) && t.length > 6;
  }

  // Carrega o motor do Experimento só quando precisa (as outras páginas não o incluem)
  let carregandoMotor = null;
  function motor() {
    if (window.SMA_EXPERIMENTO) return Promise.resolve(window.SMA_EXPERIMENTO);
    return carregandoMotor ||= new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = 'js/experimento-motor.js';
      s.onload = () => (window.SMA_EXPERIMENTO ? ok(window.SMA_EXPERIMENTO) : falha(new Error('motor indisponível')));
      s.onerror = () => { carregandoMotor = null; falha(new Error('não consegui carregar o motor de dados')); };
      document.head.appendChild(s);
    });
  }

  const PAGINA_DA_BASE = { faturamento: 'faturamento.html', faturamento_diario: 'faturamento.html', frota: 'faturamento.html', estrutura: '#estrutura', pgo: 'producao.html', programacao: 'producao.html', qualidade: 'qualidade.html', base_ups: 'qualidade.html', rh: 'rh.html' };
  const NOME_DIM = { EQUIPE: 'equipe', FAZENDA: 'fazenda', UP: 'UP', ATIVIDADE: 'atividade', GRUPO_ATIVIDADE: 'grupo', PERIODO: 'RF', DATA: 'dia', SUPERVISOR: 'supervisor', FROTA: 'máquina', AVALIADOR: 'avaliador', MONITORAMENTO: 'monitoramento', FUNCAO: 'função', MODALIDADE: 'modalidade', SITUACAO: 'situação', COLABORADOR: 'colaborador' };
  const carregadas = new Map();   // base → quando

  async function garantir(M, bases) {
    const faltam = bases.filter(b => !carregadas.has(b) || Date.now() - carregadas.get(b) > 5 * 60_000);
    if (!faltam.length) return;
    await M.carregarBases(false, faltam);
    faltam.forEach(b => { if (!M.erros[b]) carregadas.set(b, Date.now()); });
  }

  async function responder(texto) {
    const t = norm(texto);
    const semBase = semBaseDe(t);
    if (semBase && !/fatur|produc|qualidade|colaborador|area|nota/.test(t)) return { texto: semBase[3], links: [{ destino: semBase[2] }] };

    const M = await motor();
    // 1ª leitura: descobre quais bases a pergunta usa; baixa essas planilhas; 2ª leitura já reconhece nomes (equipe, fazenda, função…)
    let v = M.interpretar(texto);
    const fontes = v.especificacao?.fontes || [];
    if (!fontes.length) return null;
    await garantir(M, fontes);
    v = M.interpretar(texto);
    if (!v.ok) return null;
    const esp = v.especificacao;
    const res = M.executar(esp, {});
    const falhou = esp.fontes.filter(b => M.erros[b]);
    if (falhou.length && !res.linhas.length) return { texto: 'Não consegui ler a planilha agora (sem internet ou planilha fora do ar). Tente de novo em instantes. 🌱', links: [] };

    const col = res.colunas.find(c => c.id === esp.eixos.y[0]) || res.colunas[0];
    const nomeLinha = l => res.dims.map(d => M.formatarChave(l.chave[d])).join(' · ');
    let corpo;
    if (!res.linhas.length) corpo = 'Não encontrei registros para essa pergunta nas planilhas. Tente outro período, equipe ou nome. 🌱';
    else if (!res.dims.length) corpo = `**${col.rotulo}:** ${M.formatar(res.linhas[0].v[col.id], col.formato)}.`;
    else {
      const lista = res.dims.includes('COLABORADOR') && col.formato === 'int';   // lista de nomes: sem o "1" ao lado
      const max = lista ? 40 : 10;
      const ordenadas = lista ? [...res.linhas].sort((a, b) => nomeLinha(a).localeCompare(nomeLinha(b), 'pt-BR')) : res.linhas;
      const linhas = ordenadas.slice(0, max).map(l => (lista ? `- ${nomeLinha(l)}` : `- ${nomeLinha(l)}: **${M.formatar(l.v[col.id], col.formato)}**`));
      const analise = res.dims.length && !res.dims.includes('COLABORADOR') ? M.analisarLocal(esp, res) : null;
      if (lista) corpo = `**${res.linhas.length} colaborador(es):**\n${linhas.join('\n')}${res.linhas.length > max ? `\n- … e mais ${res.linhas.length - max}` : ''}`;
      else corpo = `${analise?.resumo ? `${analise.resumo}\n` : `**${col.rotulo}** por ${res.dims.map(d => NOME_DIM[d] || d.toLowerCase()).join(' e ')}:\n`}${linhas.join('\n')}${res.linhas.length > max ? `\n- … e mais ${res.linhas.length - max}` : ''}`;
    }
    const filtros = esp.filtros.filter(f => !(f.campo === 'AREA' && f.operador === '>')).map(f => `${f.campo.toLowerCase().replace(/_/g, ' ')} ${Array.isArray(f.valor) ? f.valor.join(', ') : f.valor}`);
    const temPeriodo = esp.fontes.some(b => 'RF' in M.BASES[b].campos);
    const nota = [...res.notas.filter(n => /^Período/.test(n)), temPeriodo && !esp.periodo ? 'Período: todos os RFs das planilhas (diga o RF, ex.: "no RF10", para filtrar).' : '', filtros.length ? `Filtro: ${filtros.join('; ')}.` : ''].filter(Boolean).join(' ');
    const base = M.BASES[esp.fontes[0]]?.nome;
    const paginas = [...new Set(esp.fontes.map(b => PAGINA_DA_BASE[b]).filter(Boolean))];
    return {
      texto: `${corpo}${nota ? `\n\n*${nota}*` : ''}${base ? `\n*Fonte: ${base}.*` : ''}`,
      links: paginas.map(destino => ({ destino }))
    };
  }

  // Faturamento, metas e frota continuam com as consultas próprias do Folhito (folhito-consultas.js), que entendem dias e equipes;
  // o resto (produção, qualidade, RH, programação, assuntos sem base) vem daqui primeiro
  const prefere = texto => !/fatur|aderenc|\bmeta|negoci|frota|maquina|produzido|ganh|zerad|parad/.test(norm(texto));

  window.FOLHITO_BASES = { pareceDados, responder, prefere };
})();
