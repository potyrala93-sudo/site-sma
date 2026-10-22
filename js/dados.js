/* ==========================================================================
   SMA · Silvicultura — Unidade São Miguel
   Dados do site (fonte única: usados pelas páginas e pelo Folhito)
   Para atualizar números, nomes ou fotos, edite apenas este arquivo.
   ========================================================================== */

(() => {
// Setores do menu (o mesmo array alimenta o cabeçalho e o rodapé)
const SETORES = [
  { id: 'home',        nome: 'Home',        href: 'index.html',       icone: 'house' },
  { id: 'faturamento', nome: 'Faturamento', href: 'faturamento.html', icone: 'receipt' },
  { id: 'producao',    nome: 'Produção',    href: 'producao.html',    icone: 'sprout' },
  { id: 'qualidade',   nome: 'Qualidade',   href: 'qualidade.html',   icone: 'badge-check' },
  { id: 'seguranca',   nome: 'Segurança',   href: 'seguranca.html',   icone: 'shield-check' },
  { id: 'estoque',     nome: 'Estoque',     href: 'estoque.html',     icone: 'package' },
  { id: 'custos',      nome: 'Custos',      href: 'custos.html',      icone: 'wallet' },
  { id: 'rh',          nome: 'RH',          href: 'rh.html',          icone: 'users' },
  { id: 'experimento', nome: 'Experimento', href: 'experimento.html', icone: 'flask-conical' }
];

// Etapas do ciclo florestal (imagens com licença livre; créditos exibidos na foto)
const CICLO = [
  {
    titulo: 'Produção de mudas', icone: 'sprout', imagem: 'assets/img/silvicultura/01-mudas.webp',
    credito: 'Foto: National Park Service (domínio público)',
    texto: 'No viveiro, sementes e clones selecionados dão origem a mudas sadias e uniformes, com controle de irrigação, nutrição e aclimatação antes de seguirem para o campo.'
  },
  {
    titulo: 'Preparo do solo', icone: 'shovel', imagem: 'assets/img/silvicultura/02-preparo-solo.jpg',
    credito: 'Foto: T. Grove, CSIRO (CC BY 3.0)',
    texto: 'Manejo dos resíduos, subsolagem, correção e adubação de base preparam o terreno para as raízes, com práticas de conservação que protegem o solo e a água.'
  },
  {
    titulo: 'Plantio', icone: 'hand-heart', imagem: 'assets/img/silvicultura/03-plantio.webp',
    credito: 'Foto: National Park Service (domínio público)',
    texto: 'As mudas são plantadas no espaçamento planejado, com irrigação de plantio e acompanhamento da sobrevivência para garantir uma floresta homogênea.'
  },
  {
    titulo: 'Tratos culturais e manutenção', icone: 'leaf', imagem: 'assets/img/silvicultura/04-tratos-culturais.jpg',
    credito: 'Foto: “Under the same moon...” (CC BY 2.0)',
    texto: 'Controle da matocompetição, adubações de cobertura e manutenção de estradas e aceiros garantem o crescimento vigoroso da floresta.'
  },
  {
    titulo: 'Proteção florestal', icone: 'shield-check', imagem: 'assets/img/silvicultura/05-protecao-florestal.jpg',
    credito: 'Foto: Charles J. Sharp (CC BY-SA 4.0)',
    texto: 'Monitoramento e combate a formigas cortadeiras e pragas, prevenção e brigada contra incêndios e vigilância constante das áreas plantadas.'
  },
  {
    titulo: 'Colheita e reforma', icone: 'axe', imagem: 'assets/img/silvicultura/06-colheita.jpg',
    credito: 'Foto: Ermell (CC BY-SA 4.0)',
    texto: 'Ao fim do ciclo, a madeira é colhida com planejamento e segurança, e a área é reformada para iniciar um novo ciclo produtivo.'
  }
];

// Estrutura da unidade (fonte: planilha da estrutura).
// qtd: null = quantidade ainda não informada (o card mostra "a confirmar").
// cena: true = foto com cenário (preenche o quadro); sem cena = recorte sobre fundo claro.
const ESTRUTURA = [
  { nome: 'Colaboradores',        qtd: 200,  icone: 'users',        tipo: 'pessoas' },
  { nome: 'Trator Médio',         qtd: 16,    foto: 'trator-medio-hd.png',         icone: 'tractor',      tipo: 'trator' },
  { nome: 'Trator Pesado',        qtd: 4,     foto: 'trator-pesado-hd.jpg',        icone: 'tractor',      tipo: 'trator' },
  { nome: 'Caminhão Pipa',        qtd: 5,     foto: 'caminhao-pipa-hd.png',        icone: 'droplets',     tipo: 'caminhao' },
  { nome: 'Caminhão Munck',       qtd: 2,     foto: 'caminhao-munck-hd.png',       icone: 'container',    tipo: 'caminhao' },
  { nome: 'Caminhão Comboio',     qtd: 1,    foto: 'caminhao-comboio-hd.jpg',     icone: 'fuel',         tipo: 'caminhao' },
  { nome: 'Caminhão Exército',    qtd: 1,     foto: 'caminhao-exercito-hd.jpg',    icone: 'truck',        tipo: 'caminhao' },
  { nome: 'Caminhão Suplementar', qtd: 2,     foto: 'caminhao-suplementar-hd.jpg', icone: 'package-plus', tipo: 'caminhao', cena: true },
  { nome: 'Caminhão Oficina',     qtd: 1,    foto: 'caminhao-oficina-hd.jpg',    icone: 'wrench',       tipo: 'caminhao', cena: true },
  { nome: 'Caminhão Prancha',     qtd: 2,  foto: 'caminhao-prancha-hd.png',     icone: 'truck',        tipo: 'caminhao' }
];

// Organograma operacional (hierárquico). "tom" é herdado pela equipe.
const ORGANOGRAMA = {
  nome: 'Anderson Ramos', cargo: 'Coordenador', foto: 'Anderson.jpg', tom: 'var(--tom-1)',
  filhos: [
    {
      nome: 'Carina Pereira', cargo: 'Supervisora Operacional', foto: 'Carina.jpg', tom: 'var(--tom-2)',
      filhos: [
        { nome: 'Jefferson Becker', cargo: 'Encarregado de Mecanizado', foto: 'jeferson.png', equipe: 'Equipes BN / BV' }
      ]
    },
    {
      nome: 'Juliano Almeida', cargo: 'Supervisor Operacional', foto: 'juliano.png', tom: 'var(--tom-3)',
      filhos: [
        { nome: 'Jefferson Becker', cargo: 'Encarregado de Mecanizado', foto: 'jeferson.png', equipe: 'Equipes BT / BU' }
      ]
    },
    {
      nome: 'Joyce Pontes', cargo: 'Supervisora Operacional', foto: 'Joyce.png', tom: 'var(--tom-4)',
      filhos: [
        { nome: 'Sidnei Oliveira',    cargo: 'Encarregado Manual', foto: 'Sidnei.jpg',   equipe: 'Equipe BD' },
        { nome: 'Fernando Rodrigues', cargo: 'Encarregado Manual', foto: 'Fernando.jpg', equipe: 'Equipe BM' },
        { nome: 'Lauro Batista',      cargo: 'Encarregado Manual', foto: 'Lauro.png',    equipe: 'Equipe BP' }
      ]
    }
  ]
};

const PASTA_EQUIPE = 'assets/img/equipe/';
const PASTA_ESTRUTURA = 'assets/img/estrutura/';

// Faturamento: planilhas do Google (CSV público) e pessoas do painel
const FATURAMENTO = {
  planilha: '1gGcRAaVruH9wq3m531pEcA7iGSfpzJolqne5brBn8Ls',
  abas: { anderson: 1528743316, carina: 1977761092, juliano: 1919415509, joyce: 413617224, diario: 992454151, frota: 476734629 },
  estrutura: { planilha: '1LZRtGcDHSfW4gIB9BhPaL1bjDZ0ekeOdLtXc-0abtYg', gid: 1338625970 },
  atualizarACadaMin: 5,
  pessoas: [
    { id: 'anderson', nome: 'Anderson', cargo: 'Coordenador', supervisor: null },
    { id: 'carina',   nome: 'Carina',   cargo: 'Supervisora Operacional', supervisor: 'Carina' },
    { id: 'juliano',  nome: 'Juliano',  cargo: 'Supervisor Operacional',  supervisor: 'Juliano' },
    { id: 'joyce',    nome: 'Joyce',    cargo: 'Supervisora Operacional', supervisor: 'Joyce' }
  ],
  // Fotos de cada pessoa (pasta assets/img/fotos/<nome>/). Com o servidor rodando, a pasta é lida
  // automaticamente; esta lista é usada quando o site é aberto sem o servidor.
  fotos: {
    anderson: ['assets/img/fotos/anderson/anderson.jpg', 'assets/img/fotos/anderson/anderson_2.jpg'],
    carina: ['assets/img/fotos/carina/carina.jpg', 'assets/img/fotos/carina/Carina.png'],
    juliano: ['assets/img/fotos/juliano/juliano.png'],
    joyce: ['assets/img/fotos/joyce/joyce.png', 'assets/img/fotos/joyce/joyce.jpg']
  }
};
// Qualidade: avaliações de 120 dias (e demais monitoramentos) e base de UPs para a projeção mensal
const QUALIDADE = {
  planilha: '1-h8nbKYjwksLczYMpCdluBVqCZpgsrGJGICxH14sQC8',
  abas: { avaliacoes: 631884741, ups: 249801391 },
  // Faixas de cor das notas (0 a 10): até 6,9 vermelho · 7,0 a 8,4 amarelo · 8,5 ou mais verde
  faixas: { vermelhoAte: 6.9, amareloAte: 8.4 },
  // Variação de altura da parcela (CV %): até 20 uniforme · até 30 intermediária · acima disso maior variação
  cv: { uniformeAte: 20, intermediariaAte: 30 }
};

// Produção: planilha da programação de atividades (colunas RF | Fazenda | UP | Area | Atividade | Tarifa)
const PRODUCAO = {
  planilha: '14j_RYF0RMpJonbUksQbVmGMJ6D9Ca2qTUb9MxirWuwo',
  aba: 0,
  equipes: ['BN', 'BT', 'BU', 'BV'],      // equipes mecanizadas: máquinas × rendimento por máquina
  equipesManuais: ['BD', 'BM', 'BP'],     // equipes manuais (sem máquina): só o rendimento da equipe por dia
  diasDeslocamento: 1,                    // dia perdido a cada troca de fazenda

  // Plantio: acompanhamento por UP (cabeçalho na linha 5, achado pela coluna TALHÃO), resumo mensal e detalhe por UP
  plantio: {
    ups: { planilha: '1b14belPXohyMAVPHgtMVijDLBT_m5v8R', aba: 1122494239 },
    resumo: { planilha: '11OZX_ieEj_SQ-Rc4xqbDfJiVWezTN5i26S_YnzFdH3s', aba: 0 },
    detalhe: { planilha: '11OZX_ieEj_SQ-Rc4xqbDfJiVWezTN5i26S_YnzFdH3s', aba: 692246056 },
    faixas: { verdeDesde: 1, amareloDesde: 0.8 }   // percentual da meta: ≥100% verde · 80–99% amarelo · <80% vermelho
  },

  // Produção por RF: base oficial do RF (colunas lidas pelo nome; aceita variações como "ÁREA (ha)")
  baseRF: {
    planilha: '1wZLC-MZiasGY-jTyc6hTZAGoHBeq3uEOi9HEOu_vzxw',
    aba: 934545260,
    colunas: {
      ANO: ['ANO'], RF: ['RF', 'RF (MES)', 'MES RF'], FAZENDA: ['FAZENDA', 'NOME FAZENDA'], UP: ['UP', 'COD UP', 'CODIGO UP'],
      ATIVIDADE: ['ATIVIDADE', 'OPERACAO', 'SERVICO'],
      AREA: ['AREA REALIZADA', 'AREA (HA)', 'AREA HA', 'AREA', 'AREA APONTADA', 'AREA RF', 'HA'],   // nunca "ÁREA DA UP"
      TARIFA: ['TARIFA', 'TARIFA (R$/HA)', 'PRECO', 'VALOR UNITARIO'],
      VALOR: ['VALOR', 'VALOR (R$)', 'TOTAL', 'VALOR TOTAL', 'FATURAMENTO']
    },
    toleranciaHa: 0.1,  // acima disso a área é considerada divergente
    // Aba BD da mesma planilha: apontamentos que formam o RF, com data (sem linha de cabeçalho → colunas pela posição)
    bd: { aba: 0, posicoes: { RF: 0, DATA: 6, FAZENDA: 7, UP: 8, ATIVIDADE: 12, AREA: 20 } }
  },

  // Remonta de herbicida pré-emergente mecanizado (aba BASE; colunas achadas pelo nome do cabeçalho)
  remonta: {
    planilha: '1SIhbYLG8Qg6LXS4_APPul7Q9pzEtHshT',
    aba: 1247467033,
    // Valores padrão dos parâmetros (o usuário muda no topo da aba e fica salvo no navegador)
    padrao: { r1: 20, r2: 20, r3: 20, alerta: 5, junto: 10, antiga: 30 }
  },

  // Produção Realizada: aba de apontamentos da planilha do Faturamento (cabeçalho achado pelo nome, não pela linha)
  realizada: {
    planilha: '1gGcRAaVruH9wq3m531pEcA7iGSfpzJolqne5brBn8Ls',
    aba: 711509723,
    // Grupos de atividade: vale a PRIMEIRA regra que bater. "contem" e "exceto" comparam sem acento e em maiúsculas.
    // "excetoInicio": não entra no grupo se a atividade começar com esse texto.
    grupos: [
      { nome: 'Irrigação',             cor: '#38bdf8', contem: ['IRRIGACAO'] },
      { nome: 'Adubações',             cor: '#3dffa8', contem: ['ADUB'], exceto: ['SEM ADUB'], excetoInicio: ['APOIO'] },
      { nome: 'Herbicidas / Capinas',  cor: '#c8f560', contem: ['HERB', 'CAPINA', 'DEFEN QUIMIC'], excetoInicio: ['APOIO'] },
      { nome: 'Corretivos',            cor: '#fbbf24', contem: ['CALCARIO', 'GESSO', 'CORRETIVO'], excetoInicio: ['APOIO'] },
      { nome: 'Plantio / Replantio',   cor: '#2dd4bf', contem: ['PLANTIO', 'REPLANTIO'], excetoInicio: ['APOIO'] },
      { nome: 'Preparo de solo',       cor: '#fb923c', contem: ['SUBSOLAGEM', 'GRADAGEM', 'PREPARO', 'COVEAMENTO'], excetoInicio: ['APOIO'] },
      { nome: 'Combate a formigas',    cor: '#f472b6', contem: ['FORMIGA'], excetoInicio: ['APOIO'] },
      { nome: 'Manejo de brotação',    cor: '#a78bfa', contem: ['BROTO', 'DESBROTA'] },
      { nome: 'Apoio / Horas máquina', cor: '#94a3b8', contem: ['APOIO', ' H NORMAL', 'HORA'], apoio: true },
      { nome: 'Outros',                cor: '#64748b', contem: [] }   // tudo o que não se encaixou acima
    ]
  }
};

// RH: catálogo de colaboradores (cabeçalho na linha 1, colunas pelo nome)
const RH = {
  planilha: '1RjlknbDlu5draerYFSZqJwwVJsdq6N67VljUjaYEJjs',
  aba: 0,
  // Cor de cada modalidade ("tipo" do colaborador); modalidades novas recebem cor automática
  modalidades: { 'MANUAL': '#22e07a', 'SEMI-MECANIZADA': '#fb923c', 'SEMI-MECANIZADO': '#fb923c', 'MECANIZADA': '#38bdf8', 'MECANIZADO': '#38bdf8', 'APOIO': '#a78bfa' },
  // Nível pelo tempo de casa (anos)
  niveis: [
    { ate: 1, nome: 'Novato', cor: '#7dd3fc', icone: 'sprout' },
    { ate: 3, nome: 'Em evolução', cor: '#3dffa8', icone: 'trending-up' },
    { ate: 5, nome: 'Experiente', cor: '#c8f560', icone: 'shield-check' },
    { ate: 10, nome: 'Veterano', cor: '#fbbf24', icone: 'medal' },
    { ate: Infinity, nome: 'Lenda', cor: '#f472b6', icone: 'crown' }
  ],
  escalaAnos: 15   // barra de tempo de casa vai até 15 anos
};

// Segurança · Notas SSQV (planilha com Ano | Mês | Nota; maior é melhor)
const SEGURANCA = {
  ssqv: {
    planilha: '1OBxsF_fmTIX04ck6V5ORlnlGiiiyB-q_jMPTXVsLzzM',
    aba: 0,
    META_NOTA: 100,            // meta mensal da nota SSQV (único lugar para mudar)
    toleranciaAmarelo: 0.05    // até 5% abaixo da meta = amarelo; mais que isso = vermelho
  }
};

// Clima nas Fazendas (Home): coordenadas por fazenda + previsão Open-Meteo. Todos os limites ficam aqui.
const CLIMA = {
  planilha: '1ue2hVLybVraqHHoZMrAhh9vFmaikp5PYUfIMEmsg6R4',
  aba: 0,
  faixas: { lat: [-35, -5], lon: [-75, -30] },   // coordenadas fora disso são descartadas
  gradeGraus: 0.2,      // fazendas a menos de ~22 km usam o mesmo ponto de previsão (~130 pontos: cabe no limite gratuito do Open-Meteo)
  cacheMin: 30,
  // Janela de aplicação (pulverização), hora a hora
  janela: {
    ideal: { ventoMin: 3, ventoMax: 10, rajadaMax: 15, probChuvaMax: 30, tempMax: 30, umidadeMin: 55, deltaTMin: 2, deltaTMax: 8 },
    naoAplicar: { ventoMax: 15, ventoMin: 3, tempMax: 32, umidadeMin: 45, deltaTMax: 10 },
    horasChuva: 4,          // chuva prevista nesta quantidade de horas à frente = não aplicar
    chuvaMinMm: 0.1,        // a partir de quanto conta como chuva
    janelaMinHoras: 2       // "próxima janela boa": pelo menos esta quantidade de horas verdes seguidas
  },
  alertas: { chuvaDiaMm: 30, rajadaKmh: 40, tempMax: 35, geadaMin: 3 },
  plantio: { chuva7dMm: 20 },  // acumulado em 7 dias ≥ isto = "umidade favorável ao plantio"; senão "prever irrigação"
  chuvaHojeMm: 1,            // "chuva prevista hoje" a partir deste total no dia
  // Bases da unidade: ponto de partida para a distância até as fazendas (mapa da Home, tela cheia e detalhe)
  bases: [
    { nome: 'Base São Miguel', lat: -23.882127, lon: -47.988015 }
  ],
  // Programação de Atividades: aviso de atenção no dia programado (além dos alertas acima)
  programacao: { chuvaMm: 5, probChuva: 60, rajadaKmh: 30 }
};
// Qualidade → Prontuário da UP: ficha de cada UP juntando PGO, plantio, coordenadas (clima) e RH.
// As planilhas são as mesmas dos outros painéis (mesma leitura e mesmo cache).
const PRONTUARIO = {
  pgo: { planilha: PRODUCAO.realizada.planilha, aba: PRODUCAO.realizada.aba },   // apontamentos (cabeçalho na linha 8, achado pelo nome)
  plantio: PRODUCAO.plantio.ups,         // acompanhamento de plantio (TALHÃO = UP)
  detalhe: PRODUCAO.plantio.detalhe,     // detalhe do plantio (FAZENDA | UP | AREA PLANTADA | TIPO)
  rh: { planilha: RH.planilha, aba: RH.aba },
  // Nome da fazenda na PGO/plantio → código ou nome da fazenda na base de coordenadas, quando não baterem sozinhos
  // ex.: 'SANTA MARIA II - VC': 'F-F449'
  fazendasManuais: {},
  semApontamentoDias: 15,     // UP em andamento sem apontamento há mais que isso = alerta
  avisar120Dias: 15,          // destaque quando faltar isso ou menos para a DATA 120 DIAS
  recentes: 5,                // quantas UPs ficam na lista "UPs recentes"
  climaRecenteDias: 92,       // até aqui o histórico vem da API de previsão (past_days); antes, da API de histórico
  // Eventos sensíveis de clima (marcados na linha do tempo e no texto analítico)
  sensiveis: {
    herbicidaChuvaMm: 5,      // herbicida/capina com chuva acima disso no dia ou no dia seguinte (lavagem)
    herbicidaRajadaKmh: 15,   // herbicida/capina com rajada acima disso no dia (deriva)
    adubacaoChuvaMm: 30,      // adubação seguida de chuva acima disso em até 2 dias (perda)
    adubacaoDias: 2,
    plantioChuva7dMm: 10,     // plantio/replantio com menos chuva que isso nos 7 dias seguintes e sem irrigação (estresse hídrico)
    plantioTempMax: 34        // plantio/replantio com máxima acima disso nos 3 dias seguintes
  }
};
// Mapas micro das fazendas (Produção → aba Mapas): pasta pública do Google Drive com os PDFs
const MAPAS = { pasta: '1SPU9-qjt1zEQywDvUnzB7yXCgpCr3lvK', cacheMin: 30 };

window.SMA_DADOS = { SETORES, CICLO, ESTRUTURA, ORGANOGRAMA, PASTA_EQUIPE, PASTA_ESTRUTURA, FATURAMENTO, QUALIDADE, PRODUCAO, RH, SEGURANCA, CLIMA, MAPAS, PRONTUARIO };
})();
