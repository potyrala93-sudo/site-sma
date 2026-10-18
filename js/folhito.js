/* ==========================================================================
   Folhito — mascote e assistente virtual do site SMA Silvicultura
   - Modo IA: conversa livre via servidor (server/folhito-server.mjs + API do Claude)
   - Modo guia: respostas locais a partir de js/dados.js (funciona sem internet/servidor)
   ========================================================================== */

(() => {
  const D = window.SMA_DADOS;
  if (!D) return;

  const API = window.FOLHITO_API || 'api/folhito';
  const IMG = 'assets/img/folhito/';
  const CHAVE_CONVERSA = 'folhito:conversa';
  const CHAVE_SILENCIO = 'folhito:silencio';
  const CHAVE_DICAS = 'folhito:dicas-mostradas';
  const naHome = document.body.dataset.page === 'home';
  const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let modoIA = false;       // IA do servidor (Claude) disponível
  let ocupado = false;

  // IA gratuita no navegador (WebLLM): roda na placa de vídeo de quem usa o site
  const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm';
  const CHAVE_IA_LOCAL = 'folhito:ia-local';
  const iaLocal = { estado: 'desligada', motor: null, modelo: null, progresso: 0, texto: '', tamanho: '' };
  let conversa = ler(CHAVE_CONVERSA, []); // [{ role: 'user' | 'assistant', content }]

  /* ---------- Armazenamento seguro ---------- */
  function ler(chave, padrao) {
    try { const v = sessionStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
  }
  function gravar(chave, valor) {
    try { sessionStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
  }

  /* ---------- Utilidades de texto ---------- */
  const normalizar = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s/]/g, ' ').replace(/\s+/g, ' ').trim();
  const tem = (t, ...termos) => termos.some(x => new RegExp(`(^|\\s)${x}`).test(t));
  const sorteio = lista => lista[Math.floor(Math.random() * lista.length)];
  const escapar = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const primeiroNome = n => n.split(' ')[0];

  /* ---------- Destinos de navegação permitidos ---------- */
  const DESTINOS = {
    '#inicio':       { rotulo: 'Início', icone: 'house' },
    '#silvicultura': { rotulo: 'O que é silvicultura', icone: 'sprout' },
    '#video':        { rotulo: 'Vídeo', icone: 'play' },
    '#estrutura':    { rotulo: 'Nossa estrutura', icone: 'truck' },
    '#organograma':  { rotulo: 'Organograma', icone: 'network' }
  };
  D.SETORES.filter(s => s.id !== 'home').forEach(s => { DESTINOS[s.href] = { rotulo: s.nome, icone: s.icone }; });

  function resolverDestino(destino) {
    if (!(destino in DESTINOS)) return null;
    if (destino.startsWith('#')) return naHome ? destino : 'index.html' + (destino === '#inicio' ? '' : destino);
    return destino;
  }

  /* ---------- Conhecimento local (modo guia) ---------- */
  const pessoas = [];
  (function coletar(p, chefe) {
    pessoas.push({ ...p, chefe });
    (p.filhos || []).forEach(f => coletar(f, p));
  })(D.ORGANOGRAMA, null);

  const frota = D.ESTRUTURA.filter(e => e.tipo !== 'pessoas');
  const total = lista => lista.reduce((s, e) => s + (e.qtd || 0), 0);
  const colaboradores = D.ESTRUTURA.find(e => e.tipo === 'pessoas');

  const FUNCAO_EQUIPAMENTO = {
    'trator medio': 'versátil, usado em preparo de solo, roçada, aplicação de insumos e apoio às frentes de trabalho',
    'trator pesado': 'para as operações que exigem mais força, como subsolagem e preparo de áreas mais difíceis',
    'caminhao pipa': 'leva água para irrigação de plantio, controle de poeira nas estradas e apoio no combate a incêndios',
    'caminhao munck': 'tem um guindaste articulado para carregar e descarregar materiais e equipamentos pesados',
    'caminhao comboio': 'é o posto de combustível móvel: abastece e lubrifica as máquinas direto no campo',
    'caminhao exercito': 'é robusto e preparado para estradas de terra e terrenos difíceis, dando apoio logístico à operação',
    'caminhao suplementar': 'dá apoio no transporte de materiais e insumos entre as áreas',
    'caminhao oficina': 'é uma oficina móvel, que leva ferramentas e peças para fazer manutenção das máquinas no campo',
    'caminhao prancha': 'transporta máquinas pesadas, como tratores, de uma área para outra'
  };

  const DICAS = {
    seguranca: [
      'Antes de começar qualquer atividade, confira seus **EPIs**: capacete, óculos, luvas, perneira e botina. Equipamento danificado se troca, não se improvisa. 🦺',
      'Participe do **DDS** (Diálogo Diário de Segurança) com atenção: é ali que a equipe alinha os riscos do dia.',
      'Nunca passe por trás ou perto de máquinas em movimento sem fazer **contato visual** com o operador.',
      'Em dias quentes, **hidrate-se** de verdade: beba água a cada 20 ou 30 minutos, mesmo sem sede. ☀️',
      'Atenção com **animais peçonhentos**: olhe onde pisa e onde coloca as mãos, principalmente em touceiras e pilhas de galhos. 🐍',
      'Viu fumaça ou foco de incêndio? **Avise imediatamente** o supervisor e mantenha distância segura. 🔥',
      'Use o **cinto de segurança** em todos os veículos e respeite os limites de velocidade nas estradas internas.',
      'Encontrou uma condição insegura? **Pare, avise e só retome** quando estiver resolvido. Segurança vem antes da produção.'
    ],
    qualidade: [
      'Qualidade começa na muda: plante só **mudas sadias e uniformes**, descartando as danificadas. 🌱',
      'Respeitar o **espaçamento planejado** no plantio faz toda a diferença no crescimento da floresta.',
      'No controle de formigas, o segredo é **monitorar com frequência**: o combate antes do plantio protege as mudas novas. 🐜',
      'Registre corretamente os apontamentos do dia: **dado bem anotado** é decisão bem tomada.',
      'Na dúvida sobre um procedimento, **pergunte antes de fazer**. Retrabalho custa mais caro.'
    ],
    produtividade: [
      'Um bom **planejamento no início do dia** evita deslocamentos desnecessários entre as áreas.',
      'Máquina bem cuidada produz mais: faça o **check-list diário** antes de ligar o equipamento. 🚜',
      'Comunicação rápida entre as equipes evita **tempo parado**: avise logo qualquer problema ao seu encarregado.',
      'Produtividade sustentável é **constância**: ritmo seguro o dia todo rende mais que pressa no começo.'
    ],
    sustentabilidade: [
      'Respeite as **áreas de preservação** e as nascentes: elas fazem parte da floresta saudável. 💧',
      'Dê o **destino correto aos resíduos**: embalagens, óleo e lixo nunca ficam no campo. ♻️',
      'Manter os **resíduos da colheita** sobre o solo ajuda a proteger contra a erosão e devolve nutrientes.'
    ]
  };

  const CURIOSIDADES = [
    'O eucalipto é originário da **Austrália** e se adaptou muito bem ao clima brasileiro. 🇦🇺🇧🇷',
    'As **formigas cortadeiras** não comem as folhas que carregam: elas usam as folhas para cultivar um fungo, que é o alimento delas! 🐜🍄',
    'Mudas **clonais** são cópias de árvores selecionadas, o que garante florestas mais uniformes e produtivas.',
    'Enquanto crescem, as árvores retiram **gás carbônico** do ar e o armazenam na madeira. 🌳',
    'A palavra **silvicultura** vem do latim *silva*, que significa floresta.'
  ];

  const MENU_AJUDA = 'Posso te ajudar com:\n\n- **Dados do painel** direto da planilha: "quanto a equipe BM faturou no dia 08/10?", "aderência da Joyce", "frota 392 ontem", "estrutura da equipe BD"\n- **Navegar** pelo site (é só pedir: "me leve ao organograma")\n- **Estrutura**: quantos tratores, caminhões e colaboradores temos\n- **Organograma**: quem é quem e quem lidera cada equipe\n- **Silvicultura**: o que é e as etapas do ciclo florestal\n- **Dicas e conselhos** de segurança, qualidade e produtividade\n- **Curiosidades** sobre florestas 🌳';

  function saudacaoHorario() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  function responderLocal(pergunta) {
    const t = normalizar(pergunta);
    const r = (texto, links = []) => ({ texto, links });
    const f = (texto, links = []) => ({ texto, links, fato: true }); // fato da unidade: resposta exata, sem reescrita da IA

    if (!t) return r('Pode escrever sua pergunta que eu te ajudo! 🌱');

    // Conversa básica
    if (/^(oi+|ola|opa|eai|e ai|hey|bom dia|boa tarde|boa noite|salve)\b/.test(t) && t.split(' ').length <= 4)
      return r(`${saudacaoHorario()}! Eu sou o **Folhito** 🌱, o assistente do site da Unidade São Miguel. Como posso te ajudar?\n\n${MENU_AJUDA}`);
    if (tem(t, 'obrigad', 'valeu', 'agradec', 'brigad')) return r(sorteio(['Por nada! Sempre que precisar, é só chamar. 🌱', 'Disponha! Estou por aqui se surgir outra dúvida.', 'Imagina! Bom trabalho e muita segurança aí. 🦺']));
    if (tem(t, 'tchau', 'ate mais', 'ate logo', 'falou', 'adeus')) return r('Até mais! Lembre-se: **segurança em primeiro lugar**. 🌳');
    if (tem(t, 'quem e voce', 'quem voce e', 'seu nome', 'quem e o folhito', 'o que voce e', 'voce e um robo', 'voce e uma ia'))
      return r('Eu sou o **Folhito**, o mascote e assistente virtual da SMA Silvicultura! 🌱 Nasci de uma muda bem cuidada e estou aqui para te ajudar a navegar pelo site, tirar dúvidas e dar dicas no dia a dia.');
    if (tem(t, 'ajuda', 'o que voce sabe', 'o que voce faz', 'como funciona', 'menu', 'opcoes', 'comandos', 'pode fazer'))
      return r(MENU_AJUDA);

    // Data e hora
    if (tem(t, 'que horas', 'hora agora', 'horas sao')) return r(`Agora são **${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}**. ⏰`);
    if (tem(t, 'que dia', 'data de hoje', 'dia e hoje')) return r(`Hoje é **${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}**. 📅`);

    // Dicas e conselhos
    if (tem(t, 'dica', 'conselho', 'sugest', 'recomend', 'orient')) {
      let cat = 'seguranca';
      if (tem(t, 'qualidade')) cat = 'qualidade';
      else if (tem(t, 'produtiv', 'rendimento', 'render')) cat = 'produtividade';
      else if (tem(t, 'sustent', 'ambient', 'natureza')) cat = 'sustentabilidade';
      else if (!tem(t, 'seguranca', 'epi', 'acidente')) cat = sorteio(Object.keys(DICAS));
      const nomes = { seguranca: 'segurança', qualidade: 'qualidade', produtividade: 'produtividade', sustentabilidade: 'sustentabilidade' };
      return r(`💡 **Dica de ${nomes[cat]}:** ${sorteio(DICAS[cat])}\n\nQuer outra? É só pedir "mais uma dica".`);
    }
    if (tem(t, 'mais uma', 'outra dica', 'mais dica')) { const cat = sorteio(Object.keys(DICAS)); return r(`💡 ${sorteio(DICAS[cat])}`); }
    if (tem(t, 'epi', 'equipamento de protecao')) return r(`Os **EPIs** (Equipamentos de Proteção Individual) protegem você dos riscos da atividade. Na silvicultura, os mais comuns são capacete, óculos, luvas, perneira, protetor auricular e botina.\n\n💡 ${DICAS.seguranca[0]}`);
    if (tem(t, 'curiosidade', 'fato', 'sabia', 'interessante')) return r(`🌳 **Você sabia?** ${sorteio(CURIOSIDADES)}`);

    // Quantidades da estrutura
    if (tem(t, 'quant', 'numero', 'total', 'tem quantos', 'temos')) {
      const item = frota.find(e => t.includes(normalizar(e.nome)) || t.includes(normalizar(e.nome.replace('Caminhão ', '').replace('Trator ', 'trator '))));
      if (item) {
        const funcao = FUNCAO_EQUIPAMENTO[normalizar(item.nome)];
        const extra = funcao && tem(t, 'serve', 'para que', 'pra que', 'funcao', 'faz', 'usad') ? ` Ele ${funcao}.` : '';
        return f(item.qtd === null ? `A quantidade de **${item.nome}** ainda não foi informada.` : `Temos **${item.qtd} ${item.qtd > 1 ? 'unidades' : 'unidade'}** de **${item.nome}** na frota.${extra}`, [{ destino: '#estrutura' }]);
      }
      if (tem(t, 'colaborador', 'pessoa', 'funcionario', 'trabalhador'))
        return f(`A Unidade São Miguel conta com **${colaboradores.qtd} colaboradores**. 👷`, [{ destino: '#estrutura' }]);
      if (tem(t, 'trator')) {
        const tr = frota.filter(e => e.tipo === 'trator');
        return f(`São **${total(tr)} tratores**: ${tr.map(e => `${e.qtd} ${e.nome.toLowerCase()}`).join(' e ')}. 🚜`, [{ destino: '#estrutura' }]);
      }
      if (tem(t, 'caminh')) {
        const cm = frota.filter(e => e.tipo === 'caminhao');
        return f(`São **${total(cm)} caminhões**:\n\n${cm.map(e => `- ${e.nome}: **${e.qtd ?? 'a confirmar'}**`).join('\n')}`, [{ destino: '#estrutura' }]);
      }
      if (tem(t, 'frota', 'veiculo', 'maquina', 'equipamento', 'estrutura'))
        return f(`Nossa frota tem **${total(frota)} veículos**:\n\n${frota.map(e => `- ${e.nome}: **${e.qtd ?? 'a confirmar'}**`).join('\n')}\n\nAlém disso, somos **${colaboradores.qtd} colaboradores**.`, [{ destino: '#estrutura' }]);
    }

    // Função de cada equipamento
    const equip = Object.keys(FUNCAO_EQUIPAMENTO).find(k => t.includes(k) || t.includes(k.replace('caminhao ', '')) && tem(t, 'caminh', 'trator', 'o que', 'para que', 'serve', 'funcao'));
    if (equip) {
      const dado = frota.find(e => normalizar(e.nome) === equip);
      return f(`O **${dado?.nome || equip}** ${FUNCAO_EQUIPAMENTO[equip]}.${dado?.qtd ? ` Temos **${dado.qtd}** na unidade.` : ''}`, [{ destino: '#estrutura' }]);
    }

    // Pessoas e organograma
    const pessoa = pessoas.find(p => t.includes(normalizar(primeiroNome(p.nome))) || t.includes(normalizar(p.nome)));
    if (pessoa) {
      const mesmas = pessoas.filter(p => p.nome === pessoa.nome);
      const codigos = mesmas.flatMap(p => p.equipe ? p.equipe.replace(/Equipes? /, '').split(/\s*\/\s*/) : []);
      let txt = `**${pessoa.nome}** é **${pessoa.cargo}**`;
      if (codigos.length) txt += codigos.length > 1
        ? `, responsável pelas equipes ${codigos.slice(0, -1).join(', ')} e ${codigos.at(-1)}`
        : `, responsável pela equipe ${codigos[0]}`;
      if (pessoa.chefe) txt += `. Responde a **${mesmas.map(p => p.chefe.nome).filter((v, i, a) => a.indexOf(v) === i).join(' e ')}**`;
      if (pessoa.filhos?.length) txt += `. Lidera ${pessoa.filhos.map(f => `**${f.nome}**`).join(', ')}`;
      return f(txt + '.', [{ destino: '#organograma' }]);
    }
    const equipeCod = t.match(/\b(bd|bm|bp|bn|bv|bt|bu)\b/);
    if (equipeCod && tem(t, 'equipe', 'turma', 'time', equipeCod[1])) {
      const lider = pessoas.find(p => p.equipe && normalizar(p.equipe).split(/\s|\//).includes(equipeCod[1]));
      if (lider) return f(`A **equipe ${equipeCod[1].toUpperCase()}** é liderada por **${lider.nome}** (${lider.cargo}), que responde a **${lider.chefe.nome}**.`, [{ destino: '#organograma' }]);
    }
    if (tem(t, 'coordenador', 'coordena', 'chefe', 'gerente', 'lider')) {
      const c = D.ORGANOGRAMA;
      return f(`O coordenador da unidade é **${c.nome}**. Abaixo dele estão os supervisores ${c.filhos.map(f => `**${f.nome}**`).join(', ')}.`, [{ destino: '#organograma' }]);
    }
    if (tem(t, 'supervisor', 'supervisora', 'supervisao')) {
      return f(`Os supervisores operacionais são:\n\n${D.ORGANOGRAMA.filhos.map(s => `- **${s.nome}**: ${s.filhos.map(f => `${f.nome} (${f.equipe})`).join(', ')}`).join('\n')}`, [{ destino: '#organograma' }]);
    }
    if (tem(t, 'encarregad')) {
      const enc = pessoas.filter(p => p.equipe);
      return f(`Os encarregados são:\n\n${enc.map(p => `- **${p.nome}**: ${p.cargo}, ${p.equipe}`).join('\n')}`, [{ destino: '#organograma' }]);
    }
    if (tem(t, 'organograma', 'hierarquia', 'quem e quem', 'lideranca'))
      return f(`O organograma tem três níveis: a **coordenação** com ${D.ORGANOGRAMA.nome}, **${D.ORGANOGRAMA.filhos.length} supervisores** operacionais e os **encarregados** de cada equipe. Toque nos cards para ver os detalhes!`, [{ destino: '#organograma' }]);

    // Silvicultura e ciclo
    const etapa = D.CICLO.find(e => {
      const n = normalizar(e.titulo);
      const chaves = { 'producao de mudas': ['muda', 'viveiro'], 'preparo do solo': ['preparo', 'solo', 'subsolagem'], 'plantio': ['plantio', 'plantar'], 'tratos culturais e manutencao': ['tratos', 'manutencao', 'mato', 'adubacao'], 'protecao florestal': ['protecao', 'formiga', 'praga', 'incendio', 'fogo'], 'colheita e reforma': ['colheita', 'colher', 'reforma', 'corte'] }[n] || [];
      return chaves.some(k => tem(t, k));
    });
    if (etapa) return f(`**${etapa.titulo}**: ${etapa.texto}`, [{ destino: '#silvicultura' }]);
    if (tem(t, 'etapa', 'ciclo', 'fase')) return f(`O ciclo florestal tem **${D.CICLO.length} etapas**:\n\n${D.CICLO.map((e, i) => `${i + 1}. ${e.titulo}`).join('\n')}\n\nPergunte sobre qualquer uma que eu explico!`, [{ destino: '#silvicultura' }]);
    if (tem(t, 'silvicultura', 'silvicult')) return f('**Silvicultura** é a ciência e a prática de implantar, conduzir e manejar florestas plantadas de forma produtiva e sustentável, do viveiro à colheita. 🌲', [{ destino: '#silvicultura' }]);
    if (tem(t, 'eucalipto')) return r('O **eucalipto** é uma árvore de crescimento rápido, originária da Austrália, muito usada em florestas plantadas no Brasil para produção de celulose, madeira e energia. Tem um vídeo bem legal sobre ele aqui no site! 🎬', [{ destino: '#video' }]);
    if (tem(t, 'video', 'assistir')) return f('O vídeo sobre o eucalipto fica na seção de silvicultura. É só clicar no botão de play! 🎬', [{ destino: '#video' }]);

    // Navegação e setores
    const setor = D.SETORES.find(s => s.id !== 'home' && tem(t, normalizar(s.nome)));
    if (setor) return f(`A página de **${setor.nome}** ainda está em construção, mas em breve vai reunir as informações do setor. Quer dar uma olhada?`, [{ destino: setor.href }]);
    if (tem(t, 'estrutura', 'frota', 'trator', 'caminh', 'maquina', 'veiculo')) return f(`Nossa estrutura tem **${colaboradores.qtd} colaboradores** e **${total(frota)} veículos**, entre tratores e caminhões de apoio. 🚜`, [{ destino: '#estrutura' }]);
    if (tem(t, 'inicio', 'home', 'topo', 'comeco', 'pagina inicial')) return f('Claro! Vou te levar ao início.', [{ destino: '#inicio' }]);
    if (tem(t, 'contato', 'telefone', 'email', 'falar com', 'whatsapp'))
      return f('Ainda não tenho os contatos cadastrados. Por enquanto, procure seu **encarregado**, seu **supervisor** ou o **RH** da unidade.', [{ destino: 'rh.html' }, { destino: '#organograma' }]);
    if (tem(t, 'seguranca', 'acidente', 'risco')) return r(`Segurança é o nosso primeiro valor! 🦺\n\n💡 ${sorteio(DICAS.seguranca)}`, [{ destino: 'seguranca.html' }]);

    return r('Hmm, essa eu ainda não sei responder no modo guia. 🤔 Tente perguntar de outro jeito ou escolha um destes assuntos:', [{ destino: '#estrutura' }, { destino: '#organograma' }, { destino: '#silvicultura' }]);
  }

  /* ---------- Renderização de texto (markdown simples e seguro) ---------- */
  function extrairLinks(texto) {
    const links = [];
    const limpo = texto.replace(/\[\[([^\]|]{1,60})\|([^\]\s]{1,60})\]\]/g, (_, rotulo, destino) => {
      if (destino in DESTINOS) links.push({ rotulo: rotulo.trim(), destino });
      return '';
    });
    return { texto: limpo.replace(/\[\[[^\]]*$/, ''), links };
  }

  function markdown(texto) {
    const linhas = escapar(texto.trim()).split('\n');
    let html = '', lista = null;
    const inline = s => s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');
    const fechar = () => { if (lista) { html += `</${lista}>`; lista = null; } };
    for (const linha of linhas) {
      const ul = linha.match(/^\s*[-•]\s+(.*)/), ol = linha.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        const tipo = ul ? 'ul' : 'ol';
        if (lista !== tipo) { fechar(); html += `<${tipo}>`; lista = tipo; }
        html += `<li>${inline((ul || ol)[1])}</li>`;
      } else if (linha.trim()) { fechar(); html += `<p>${inline(linha)}</p>`; }
      else fechar();
    }
    fechar();
    return html;
  }

  /* ---------- Interface ---------- */
  const raiz = document.createElement('div');
  raiz.className = 'folhito';
  raiz.innerHTML = `
    <div class="folhito-balao" id="folhito-balao" role="status">
      <span class="folhito-balao-texto"></span>
      <button class="folhito-balao-fechar" type="button" aria-label="Dispensar mensagem do Folhito"><i data-lucide="x"></i></button>
    </div>
    <section class="folhito-janela" id="folhito-janela" role="dialog" aria-modal="false" aria-labelledby="folhito-nome" aria-hidden="true">
      <header class="folhito-topo">
        <span class="folhito-avatar"><img src="${IMG}folhito-rosto.png" alt=""></span>
        <div class="folhito-titulo">
          <strong id="folhito-nome">Folhito</strong>
          <span class="folhito-status"><span class="dot"></span> Assistente virtual <span class="folhito-modo" id="folhito-modo">Guia</span></span>
        </div>
        <div class="folhito-acoes-topo">
          <button class="folhito-btn-icone" type="button" id="folhito-limpar" aria-label="Começar nova conversa" title="Nova conversa"><i data-lucide="rotate-ccw"></i></button>
          <button class="folhito-btn-icone" type="button" id="folhito-fechar" aria-label="Fechar o Folhito" title="Fechar"><i data-lucide="x"></i></button>
        </div>
      </header>
      <div class="folhito-mensagens" id="folhito-mensagens" aria-live="polite"></div>
      <div class="folhito-sugestoes" id="folhito-sugestoes"></div>
      <form class="folhito-form" id="folhito-form">
        <label class="sr-only" for="folhito-campo">Mensagem para o Folhito</label>
        <textarea class="folhito-campo" id="folhito-campo" rows="1" maxlength="1500" placeholder="Pergunte ao Folhito…"></textarea>
        <button class="folhito-enviar" type="submit" aria-label="Enviar mensagem"><i data-lucide="send-horizontal"></i></button>
      </form>
      <p class="folhito-rodape" id="folhito-rodape">O Folhito pode errar. Confirme informações importantes com sua liderança.</p>
    </section>
    <button class="folhito-lancador" type="button" id="folhito-lancador" aria-controls="folhito-janela" aria-expanded="false" aria-label="Abrir o Folhito, assistente virtual">
      <img src="${IMG}folhito-rosto.png" alt="">
      <span class="folhito-online" aria-hidden="true"></span>
    </button>`;
  document.body.appendChild(raiz);

  const $ = s => raiz.querySelector(s);
  const janela = $('#folhito-janela');
  const lista = $('#folhito-mensagens');
  const campo = $('#folhito-campo');
  const form = $('#folhito-form');
  const lancador = $('#folhito-lancador');
  const balao = $('#folhito-balao');
  const sugestoes = $('#folhito-sugestoes');
  const icones = () => window.lucide?.createIcons();

  const SUGESTOES = [
    { texto: 'O que você sabe fazer?', icone: 'sparkles' },
    { texto: 'Quanto a unidade faturou ontem?', icone: 'receipt' },
    { texto: 'Qual equipe tem a maior aderência?', icone: 'trophy' },
    { texto: 'Quais frotas ficaram paradas no último dia?', icone: 'tractor' },
    { texto: 'Quem são os supervisores?', icone: 'network' },
    { texto: 'Me dá uma dica de segurança', icone: 'shield-check' },
    { texto: 'O que é silvicultura?', icone: 'sprout' },
    { texto: 'Me conta uma curiosidade', icone: 'lightbulb' }
  ];
  sugestoes.innerHTML = SUGESTOES.map(s => `<button type="button" class="folhito-chip" data-texto="${escapar(s.texto)}"><i data-lucide="${s.icone}"></i>${escapar(s.texto)}</button>`).join('');
  sugestoes.addEventListener('click', e => {
    const b = e.target.closest('.folhito-chip');
    if (b) enviar(b.dataset.texto);
  });

  function boasVindas() {
    lista.innerHTML = `
      <div class="folhito-boasvindas">
        <img src="${IMG}folhito.png" alt="Folhito, o mascote da SMA Silvicultura, segurando um mapa">
        <h3>Oi, eu sou o <span class="serif">Folhito</span>!</h3>
        <p>Estou aqui para te ajudar a navegar pelo site, tirar dúvidas e dar dicas. Pergunte o que quiser ou escolha uma sugestão abaixo. 🌱</p>
      </div>
      <div class="folhito-ia-cartao" id="folhito-ia-cartao" hidden></div>`;
    renderCartaoIA();
  }

  function renderLinks(links) {
    const validos = links.map(l => ({ ...l, href: resolverDestino(l.destino) })).filter(l => l.href);
    if (!validos.length) return '';
    return `<div class="folhito-links">${validos.map(l => {
      const info = DESTINOS[l.destino];
      return `<a class="folhito-link" href="${l.href}" data-destino="${l.destino}"><i data-lucide="${info.icone}"></i>${escapar(l.rotulo || info.rotulo)}</a>`;
    }).join('')}</div>`;
  }

  function adicionarMensagem(role, conteudo) {
    const el = document.createElement('div');
    el.className = `folhito-msg ${role === 'user' ? 'usuario' : 'bot'}`;
    el.innerHTML = `${role === 'user' ? '' : `<span class="folhito-msg-avatar"><img src="${IMG}folhito-rosto.png" alt=""></span>`}<div class="folhito-bolha"></div>`;
    lista.appendChild(el);
    atualizarBolha(el, role, conteudo);
    return el;
  }

  function atualizarBolha(el, role, conteudo) {
    const bolha = el.querySelector('.folhito-bolha');
    if (role === 'user') { bolha.innerHTML = markdown(conteudo); return; }
    const { texto, links } = extrairLinks(conteudo);
    bolha.innerHTML = markdown(texto) + renderLinks(links);
    if (links.length) icones(); // só redesenha ícones quando há botões (evita trabalho a cada palavra)
  }

  function rolarFim() { lista.scrollTop = lista.scrollHeight; }

  function digitando() {
    const el = document.createElement('div');
    el.className = 'folhito-msg bot folhito-digitando';
    el.innerHTML = `<span class="folhito-msg-avatar"><img src="${IMG}folhito-rosto.png" alt=""></span><div class="folhito-bolha" aria-label="Folhito está digitando"><i></i><i></i><i></i></div>`;
    lista.appendChild(el);
    rolarFim();
    return el;
  }

  function renderConversa() {
    boasVindas();
    conversa.forEach(m => adicionarMensagem(m.role, m.content));
    rolarFim();
  }

  /* ---------- Abrir, fechar e navegar ---------- */
  function abrir() {
    esconderBalao();
    raiz.classList.add('aberto');
    janela.setAttribute('aria-hidden', 'false');
    lancador.setAttribute('aria-expanded', 'true');
    lancador.setAttribute('aria-label', 'Fechar o Folhito');
    if (window.innerWidth <= 600) document.body.style.overflow = 'hidden';
    if (!lista.children.length) renderConversa();
    // Quem já ativou a IA gratuita antes: liga de novo automaticamente (vem do cache, sem novo download)
    let jaAtivou = false;
    try { jaAtivou = localStorage.getItem(CHAVE_IA_LOCAL) === '1'; } catch { /* sem armazenamento */ }
    if (jaAtivou && !modoIA && iaLocal.estado === 'desligada') iniciarIALocal();
    setTimeout(() => campo.focus(), 250);
  }
  function fechar() {
    raiz.classList.remove('aberto');
    janela.setAttribute('aria-hidden', 'true');
    lancador.setAttribute('aria-expanded', 'false');
    lancador.setAttribute('aria-label', 'Abrir o Folhito, assistente virtual');
    document.body.style.overflow = '';
  }
  lancador.addEventListener('click', () => raiz.classList.contains('aberto') ? fechar() : abrir());
  $('#folhito-fechar').addEventListener('click', () => { fechar(); lancador.focus(); });
  $('#folhito-limpar').addEventListener('click', () => {
    conversa = []; gravar(CHAVE_CONVERSA, conversa);
    reiniciarMemoriaIA();
    renderConversa(); campo.focus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && raiz.classList.contains('aberto')) { fechar(); lancador.focus(); } });

  lista.addEventListener('click', e => {
    const a = e.target.closest('.folhito-link');
    if (!a) return;
    const destino = a.getAttribute('href');
    if (destino.startsWith('#')) {
      e.preventDefault();
      const alvo = document.querySelector(destino === '#inicio' ? '#inicio' : destino);
      if (window.innerWidth <= 600) fechar();
      alvo?.scrollIntoView({ behavior: reduzMovimento ? 'auto' : 'smooth', block: 'start' });
    }
  });

  /* ---------- Envio de mensagens ---------- */
  campo.addEventListener('input', () => { campo.style.height = 'auto'; campo.style.height = Math.min(campo.scrollHeight, 120) + 'px'; });
  campo.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', e => { e.preventDefault(); enviar(campo.value); });

  async function enviar(textoBruto) {
    const texto = (textoBruto || '').trim().slice(0, 1500);
    if (!texto || ocupado) return;
    ocupado = true;
    form.querySelector('.folhito-enviar').disabled = true;
    campo.value = ''; campo.style.height = 'auto';

    conversa.push({ role: 'user', content: texto });
    adicionarMensagem('user', texto);
    const indicador = digitando();

    let resposta = '';
    // 1º: com a IA do servidor ligada, ela responde tudo, consultando as bases dos painéis (faturamento, produção,
    // qualidade, RH…) pelas ferramentas do servidor
    try {
      if (modoIA) resposta = await perguntarIA(indicador);
    } catch (erro) {
      console.warn('Folhito: IA do servidor indisponível.', erro);
      if (!/HTTP 429/.test(erro.message)) definirModo(false);
    }
    // 2º: sem a IA do servidor, perguntas de faturamento/frota/estrutura → resposta exata da planilha, calculada aqui
    if (!resposta && window.FOLHITO_CONSULTAS?.pareceDados(texto)) {
      try {
        const r = await window.FOLHITO_CONSULTAS.responder(texto);
        if (r) {
          resposta = r.texto + (r.links || []).map(l => ` [[${DESTINOS[l.destino]?.rotulo || 'Abrir'}|${l.destino}]]`).join('');
          indicador.remove();
          adicionarMensagem('assistant', resposta);
        }
      } catch (erro) { console.warn('Folhito: falha ao consultar os dados.', erro); }
    }
    if (!resposta && iaLocal.estado === 'pronta') {
      try { resposta = await perguntarIALocal(indicador, texto); }
      catch (erro) { console.warn('Folhito: IA local falhou, usando modo guia.', erro); }
    }
    if (!resposta) {
      await new Promise(r => setTimeout(r, reduzMovimento ? 0 : 450));
      const local = responderLocal(texto);
      resposta = local.texto + local.links.map(l => ` [[${DESTINOS[l.destino].rotulo}|${l.destino}]]`).join('');
      indicador.remove();
      adicionarMensagem('assistant', resposta);
    }

    conversa.push({ role: 'assistant', content: resposta });
    conversa = conversa.slice(-30);
    gravar(CHAVE_CONVERSA, conversa);
    rolarFim();
    ocupado = false;
    form.querySelector('.folhito-enviar').disabled = false;
    campo.focus();
  }

  // Envia o histórico ao servidor e mostra a resposta conforme ela chega (streaming)
  async function perguntarIA(indicador) {
    const resp = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagens: conversa.slice(-20), pagina: document.body.dataset.page })
    });
    if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);

    const leitor = resp.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = '', texto = '', el = null;
    while (true) {
      const { value, done } = await leitor.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const eventos = buffer.split('\n\n');
      buffer = eventos.pop();
      for (const ev of eventos) {
        const linha = ev.split('\n').find(l => l.startsWith('data: '));
        if (!linha) continue;
        const dado = JSON.parse(linha.slice(6));
        if (dado.tipo === 'erro') { if (texto) { indicador.remove(); return texto; } throw new Error(dado.mensagem); }
        if (dado.tipo === 'status') {
          // "Consultando as planilhas…" enquanto o servidor busca os números
          const bolha = indicador.isConnected ? indicador.querySelector('.folhito-bolha') : null;
          if (bolha) { bolha.classList.add('com-status'); bolha.innerHTML = `<i></i><i></i><i></i><span>${dado.texto.replace(/[<>&]/g, '')}</span>`; }
          else if (el) { indicador = digitando(); indicador.querySelector('.folhito-bolha').innerHTML = `<i></i><i></i><i></i><span>${dado.texto.replace(/[<>&]/g, '')}</span>`; indicador.querySelector('.folhito-bolha').classList.add('com-status'); }
          rolarFim();
        }
        if (dado.tipo === 'texto') {
          texto += dado.texto;
          if (!texto.trim()) continue;
          indicador.remove();
          if (!el) el = adicionarMensagem('assistant', texto.trimStart());
          else atualizarBolha(el, 'assistant', texto.trimStart());
          rolarFim();
        }
      }
    }
    indicador.remove();
    if (!texto.trim()) throw new Error('resposta vazia');
    return texto.trim();
  }

  function definirModo(ia) {
    modoIA = ia;
    atualizarSelo();
    renderCartaoIA();
  }

  function atualizarSelo() {
    const selo = $('#folhito-modo');
    if (modoIA) { selo.textContent = 'IA'; selo.title = 'Respostas geradas por inteligência artificial'; }
    else if (iaLocal.estado === 'pronta') { selo.textContent = 'IA grátis'; selo.title = 'IA gratuita rodando no seu navegador'; }
    else { selo.textContent = 'Guia'; selo.title = 'Respostas rápidas sobre o site (sem IA conectada)'; }
  }

  /* ---------- IA gratuita no navegador (WebLLM) ---------- */
  async function suporteWebGPU() {
    try {
      const adaptador = navigator.gpu && await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adaptador) return null;
      const info = adaptador.info || {};
      // Placa integrada (ex.: Intel UHD/Iris): mais lenta, recebe um modelo mais leve
      const integrada = /intel/i.test(info.vendor || '') && !/xe-hpg|arc/i.test(info.architecture || '');
      return { f16: adaptador.features.has('shader-f16'), integrada };
    } catch { return null; }
  }

  function escolherModelo(gpu) {
    const celular = window.matchMedia('(max-width: 900px), (hover: none)').matches;
    if (!gpu.f16) return { id: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', tamanho: '1,3 GB' };
    // Celular e placa integrada: Qwen3 1.7B (carrega ~4x e escreve ~1,7x mais rápido que o 3B)
    if (celular || gpu.integrada) return { id: 'Qwen3-1.7B-q4f16_1-MLC', tamanho: '1 GB' };
    // Placa de vídeo dedicada (NVIDIA/AMD): Qwen 2.5 3B, que conversa melhor
    return { id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC', tamanho: '1,7 GB' };
  }

  async function renderCartaoIA() {
    const cartao = raiz.querySelector('#folhito-ia-cartao');
    if (!cartao) return;
    if (modoIA || iaLocal.estado === 'pronta') { cartao.hidden = true; return; }
    cartao.hidden = false;

    if (iaLocal.estado === 'carregando') {
      const pct = Math.round(iaLocal.progresso * 100);
      const seg = Math.round((Date.now() - iaLocal.inicio) / 1000);
      const tempo = seg < 60 ? `${seg} s` : `${Math.floor(seg / 60)} min ${String(seg % 60).padStart(2, '0')} s`;
      cartao.innerHTML = `
        <div class="folhito-ia-topo"><i data-lucide="brain"></i><strong>Ligando meu cérebro de IA…</strong></div>
        <div class="folhito-ia-barra" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${Math.max(pct, 3)}%"></span></div>
        <p>${escapar(iaLocal.texto || 'Preparando…')} <strong>${pct}%</strong> · ${tempo}</p>
        <p class="folhito-ia-nota">${iaLocal.fase === 'gpu'
          ? 'Estou preparando a IA na sua placa de vídeo. Na primeira vez isso pode levar de 1 a 4 minutos; nas próximas é bem mais rápido.'
          : 'Pode continuar conversando: enquanto isso, respondo no modo guia.'}</p>`;
      icones();
      return;
    }
    if (iaLocal.estado === 'indisponivel') {
      cartao.innerHTML = `
        <div class="folhito-ia-topo"><i data-lucide="info"></i><strong>Não consegui ligar a IA gratuita</strong></div>
        <p>${escapar(iaLocal.texto || 'Este navegador não suporta WebGPU.')} Enquanto isso, sigo te ajudando no modo guia. 🌱</p>
        ${iaLocal.detalhe ? `<p class="folhito-ia-nota">Detalhe técnico: ${escapar(iaLocal.detalhe.slice(0, 160))}</p>` : ''}
        ${iaLocal.podeTentar ? '<button type="button" class="folhito-ia-botao" id="folhito-ia-ativar"><i data-lucide="rotate-ccw"></i> Tentar de novo</button>' : ''}`;
      cartao.querySelector('#folhito-ia-ativar')?.addEventListener('click', () => { iaLocal.estado = 'desligada'; iniciarIALocal(); });
      icones();
      return;
    }

    const gpu = await suporteWebGPU();
    if (!gpu) { iaLocal.estado = 'indisponivel'; iaLocal.texto = 'Este navegador ou dispositivo não suporta WebGPU.'; return renderCartaoIA(); }
    const modelo = escolherModelo(gpu);
    let emCache = false;
    try { emCache = await (await import(WEBLLM)).hasModelInCache(modelo.id); } catch { /* sem acesso ao cache */ }
    cartao.innerHTML = `
      <div class="folhito-ia-topo"><i data-lucide="sparkles"></i><strong>Converse comigo com IA gratuita</strong></div>
      <p>Posso conversar de forma natural usando uma IA que roda <strong>direto no seu computador</strong>: é grátis, não precisa de cadastro e suas mensagens não saem do seu navegador.</p>
      <p class="folhito-ia-nota">${emCache ? 'A IA já está baixada neste navegador: liga em poucos segundos.' : `Na primeira vez, baixa cerca de <strong>${modelo.tamanho}</strong> (fica salvo para as próximas visitas). Use de preferência uma rede Wi-Fi.`}</p>
      ${gpu.integrada ? '<p class="folhito-ia-nota">💡 Seu navegador está usando a placa de vídeo integrada. Se o computador tiver uma placa dedicada (NVIDIA/AMD), configure o navegador para usá-la e eu respondo bem mais rápido.</p>' : ''}
      <button type="button" class="folhito-ia-botao" id="folhito-ia-ativar"><i data-lucide="zap"></i> Ativar IA gratuita</button>`;
    cartao.querySelector('#folhito-ia-ativar').addEventListener('click', () => iniciarIALocal());
    icones();
  }

  // Cria o motor da IA num worker (processo separado), para o site não travar.
  // Em http(s) usa o arquivo js/folhito-ia-worker.js; abrindo o arquivo direto, usa um worker criado em memória.
  function criarWorker() {
    if (/^https?:$/.test(location.protocol)) return new Worker(new URL('js/folhito-ia-worker.js', location.href), { type: 'module' });
    const codigo = `import { WebWorkerMLCEngineHandler } from '${WEBLLM}';\nconst h = new WebWorkerMLCEngineHandler();\nself.onmessage = m => h.onmessage(m);`;
    return new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })), { type: 'module' });
  }

  // Executa a criação do motor com um "vigia": se o worker der erro ou nada avançar por 2 minutos, desiste com uma mensagem clara
  function comVigia(criar, worker) {
    return new Promise((resolve, reject) => {
      let ultimo = Date.now();
      const vigia = setInterval(() => {
        if (Date.now() - ultimo > 120000) { clearInterval(vigia); reject(new Error('sem-progresso')); }
      }, 5000);
      iaLocal.sinalVida = () => { ultimo = Date.now(); };
      worker?.addEventListener('error', e => { clearInterval(vigia); reject(new Error('worker: ' + (e.message || 'falhou ao iniciar'))); });
      criar().then(m => { clearInterval(vigia); resolve(m); }, e => { clearInterval(vigia); reject(e); });
    });
  }

  async function iniciarIALocal() {
    if (iaLocal.estado === 'carregando' || iaLocal.estado === 'pronta') return;
    const gpu = await suporteWebGPU();
    if (!gpu) { iaLocal.estado = 'indisponivel'; iaLocal.podeTentar = false; iaLocal.texto = 'Este navegador ou dispositivo não suporta WebGPU. Use o Chrome ou o Edge atualizados em um computador.'; return renderCartaoIA(); }
    const modelo = escolherModelo(gpu);
    Object.assign(iaLocal, { estado: 'carregando', progresso: 0, texto: 'Preparando…', fase: 'inicio', inicio: Date.now(), detalhe: '' });
    renderCartaoIA();
    // Atualiza o tempo decorrido a cada segundo, para nunca parecer travado
    const relogio = setInterval(() => { if (iaLocal.estado === 'carregando') renderCartaoIA(); else clearInterval(relogio); }, 1000);

    let quadro = 0;
    const config = {
      initProgressCallback: rel => {
        iaLocal.sinalVida?.();
        iaLocal.progresso = rel.progress || 0;
        const baixando = /fetch|download|loading model from cache/i.test(rel.text);
        iaLocal.fase = baixando ? 'download' : 'gpu';
        iaLocal.texto = baixando ? 'Carregando o modelo de IA…' : 'Preparando a IA na placa de vídeo…';
        console.info('Folhito IA:', rel.text);
        cancelAnimationFrame(quadro);
        quadro = requestAnimationFrame(renderCartaoIA);
      }
    };

    try {
      const webllm = await import(WEBLLM);
      try {
        const worker = criarWorker();
        iaLocal.motor = await comVigia(() => webllm.CreateWebWorkerMLCEngine(worker, modelo.id, config), worker);
      } catch (erroWorker) {
        // Plano B: se o worker falhar neste navegador, roda a IA na própria página
        if (String(erroWorker).includes('sem-progresso')) throw erroWorker;
        console.warn('Folhito IA: worker falhou, tentando sem worker.', erroWorker);
        iaLocal.texto = 'Tentando outro jeito de ligar a IA…';
        iaLocal.motor = await comVigia(() => webllm.CreateMLCEngine(modelo.id, config));
      }
      iaLocal.modelo = modelo.id;
      iaLocal.estado = 'pronta';
      try { localStorage.setItem(CHAVE_IA_LOCAL, '1'); } catch { /* sem armazenamento */ }
      atualizarSelo();
      renderCartaoIA();
      if (raiz.classList.contains('aberto') && !ocupado) {
        adicionarMensagem('assistant', 'Pronto! 🧠🌱 Minha IA gratuita está ligada. Agora a gente pode conversar à vontade: pergunte o que quiser!');
        rolarFim();
      }
    } catch (erro) {
      console.error('Folhito: não foi possível ligar a IA local.', erro);
      const msg = String(erro?.message || erro);
      iaLocal.estado = 'indisponivel';
      iaLocal.podeTentar = true;
      iaLocal.detalhe = msg;
      iaLocal.texto = msg.includes('sem-progresso')
        ? 'A preparação parou de avançar. Feche outras abas pesadas e tente de novo.'
        : /memory|out of memory|buffer|OOM/i.test(msg) ? 'Este computador não tem memória de vídeo livre suficiente para a IA. Feche outras abas e tente de novo.'
        : /fetch|network|Failed to fetch|NetworkError/i.test(msg) ? 'Não consegui baixar a IA. Verifique a internet (a rede precisa liberar huggingface.co e cdn.jsdelivr.net).'
        : 'Algo deu errado ao ligar a IA.';
      renderCartaoIA();
    } finally {
      clearInterval(relogio);
    }
  }

  // Prompt curto: quanto menor, mais rápido a IA começa a responder.
  // Os fatos da unidade não entram aqui: perguntas sobre eles são respondidas pelo cérebro verificado.
  const SISTEMA_LOCAL = 'Você é o Folhito, mascote da SMA Silvicultura (Unidade São Miguel), uma mudinha de árvore simpática. Fale sempre em português do Brasil, de forma natural e calorosa, como um colega de trabalho. Leia com atenção o que a pessoa disse e responda com empatia e bom senso, em no máximo 3 frases curtas. Pode usar um emoji às vezes. Dê dicas práticas de segurança, saúde, qualidade e meio ambiente quando fizer sentido. Não invente nomes, números ou regras da empresa: se perguntarem, diga que não sabe e sugira falar com o encarregado, o supervisor ou o RH. Em emergência, mande parar a atividade e chamar a liderança e o SAMU (192) ou os Bombeiros (193).';
  const LIMITE_CONTEXTO = 2600; // tokens; acima disso a conversa da IA é resumida às últimas trocas
  iaLocal.mensagens = [{ role: 'system', content: SISTEMA_LOCAL }];

  function reiniciarMemoriaIA(manterUltimas = 0) {
    const ultimas = manterUltimas ? iaLocal.mensagens.slice(1).slice(-manterUltimas) : [];
    iaLocal.mensagens = [{ role: 'system', content: SISTEMA_LOCAL }, ...ultimas];
  }

  async function perguntarIALocal(indicador, pergunta) {
    // Fatos da unidade (números, nomes, equipes, etapas) saem do cérebro verificado, sem reescrita:
    // modelos pequenos podem trocar números. A IA cuida da conversa livre, dicas e conselhos.
    const guia = responderLocal(pergunta);
    if (guia.fato) return '';
    const ehFallback = guia.texto.startsWith('Hmm, essa eu ainda não sei');

    // O histórico enviado é sempre o mesmo da rodada anterior + a nova pergunta.
    // Assim a WebLLM reaproveita a memória (cache KV) e só lê o que é novo: resposta bem mais rápida.
    iaLocal.mensagens.push({ role: 'user', content: pergunta });
    const fluxo = await iaLocal.motor.chat.completions.create({
      messages: iaLocal.mensagens,
      stream: true, stream_options: { include_usage: true },
      temperature: 0.6, top_p: 0.9, max_tokens: 200,
      extra_body: iaLocal.modelo?.startsWith('Qwen3') ? { enable_thinking: false } : undefined
    });

    let texto = '', el = null, agendado = false, uso = null;
    // O Qwen3 abre a resposta com um bloco <think> vazio: ele fica no histórico (para reaproveitar a memória), mas não aparece na tela
    const visivel = () => texto.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart();
    const desenhar = () => { agendado = false; atualizarBolha(el, 'assistant', visivel()); rolarFim(); };
    try {
      for await (const parte of fluxo) {
        if (parte.usage) uso = parte.usage;
        const delta = parte.choices[0]?.delta?.content || '';
        if (!delta) continue;
        texto += delta;
        if (!el) { if (!visivel()) continue; indicador.remove(); el = adicionarMensagem('assistant', visivel()); }
        else if (!agendado) { agendado = true; requestAnimationFrame(desenhar); } // no máximo 1 atualização por quadro
      }
    } catch (erro) {
      iaLocal.mensagens.pop();
      reiniciarMemoriaIA(4);
      throw erro;
    }
    if (!visivel().trim()) { iaLocal.mensagens.pop(); throw new Error('resposta vazia'); }
    iaLocal.mensagens.push({ role: 'assistant', content: texto });
    if (uso && uso.prompt_tokens + uso.completion_tokens > LIMITE_CONTEXTO) reiniciarMemoriaIA(4);
    if (uso?.extra) console.info(`Folhito IA: leitura ${uso.extra.prefill_tokens_per_s?.toFixed(0)} tok/s, escrita ${uso.extra.decode_tokens_per_s?.toFixed(1)} tok/s, ${uso.prompt_tokens} tokens no contexto`);

    // Botões de navegação vêm do modo guia (confiáveis), não do modelo
    const links = ehFallback ? '' : guia.links.map(l => ` [[${DESTINOS[l.destino].rotulo}|${l.destino}]]`).join('');
    atualizarBolha(el, 'assistant', visivel().trim() + links);
    return visivel().trim() + links;
  }

  async function verificarIA() {
    if (!/^https?:$/.test(location.protocol)) return;
    try {
      const r = await fetch(API + '/status', { cache: 'no-store' });
      if (r.ok) definirModo((await r.json()).ia === true);
    } catch { /* sem servidor: continua no modo guia */ }
  }

  /* ---------- Balão de boas-vindas e dicas por seção ---------- */
  let timerBalao = null;
  function mostrarBalao(html, duracao = 12000) {
    if (raiz.classList.contains('aberto') || ler(CHAVE_SILENCIO, false)) return;
    balao.querySelector('.folhito-balao-texto').innerHTML = html;
    balao.classList.add('visivel');
    clearTimeout(timerBalao);
    timerBalao = setTimeout(esconderBalao, duracao);
  }
  function esconderBalao() { balao.classList.remove('visivel'); clearTimeout(timerBalao); }
  balao.addEventListener('click', e => {
    if (e.target.closest('.folhito-balao-fechar')) { esconderBalao(); gravar(CHAVE_SILENCIO, true); return; }
    abrir();
  });

  const DICAS_SECAO = {
    silvicultura: 'Quer saber mais sobre alguma <strong>etapa do ciclo</strong>? Me pergunte! 🌱',
    estrutura: 'Posso te dizer para que serve <strong>cada caminhão</strong> da frota. É só perguntar! 🚜',
    organograma: 'Quer saber <strong>quem lidera cada equipe</strong>? Eu te conto! 👥'
  };
  function iniciarDicasSecao() {
    if (!naHome || !('IntersectionObserver' in window)) return;
    const mostradas = ler(CHAVE_DICAS, []);
    const io = new IntersectionObserver(entradas => {
      entradas.forEach(en => {
        const id = en.target.id;
        if (!en.isIntersecting || mostradas.includes(id) || balao.classList.contains('visivel')) return;
        mostradas.push(id); gravar(CHAVE_DICAS, mostradas);
        io.unobserve(en.target);
        mostrarBalao(DICAS_SECAO[id], 8000);
      });
    }, { threshold: .35 });
    Object.keys(DICAS_SECAO).forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  icones();
  verificarIA();
  if (!ler('folhito:saudou', false)) {
    setTimeout(() => { mostrarBalao(`Oi! Eu sou o <strong>Folhito</strong> 🌱 Posso te ajudar a navegar pelo site e tirar suas dúvidas.`); gravar('folhito:saudou', true); }, 3500);
  }
  setTimeout(iniciarDicasSecao, 6000);

  // Quem já ativou a IA gratuita: ela começa a ligar em segundo plano logo depois que a página carrega,
  // para estar pronta quando a pessoa abrir o chat.
  window.addEventListener('load', () => {
    let jaAtivou = false;
    try { jaAtivou = localStorage.getItem(CHAVE_IA_LOCAL) === '1'; } catch { /* sem armazenamento */ }
    if (!jaAtivou) return;
    const ligar = () => { if (!modoIA && iaLocal.estado === 'desligada') iniciarIALocal(); };
    setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(ligar, { timeout: 4000 }) : ligar()), 2500);
  });
})();