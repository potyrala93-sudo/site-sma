Crie um site institucional em HTML, CSS e JavaScript puro (sem frameworks), responsivo, elegante e interativo, para a operação de silvicultura da unidade São Miguel. Todo o texto do site em português do Brasil.

## 0. Antes de começar
- Trabalhe na pasta atual. Abra e analise as imagens de referência:
  - `download.jpg` → referência de layout e estilo (nav em formato pílula, título grande com uma palavra em itálico serifado, cards com ícone, cantos arredondados, brilho suave). Adapte para FUNDO BRANCO.
  - `Organograma.jpg` → referência do organograma (fotos em moldura hexagonal, faixa colorida com nome, cargo abaixo, setas ligando os níveis).
  - As demais imagens `.jpg` da pasta (plantas, chip, DNA, gráfico de crescimento) são as imagens temáticas do hero e da seção de silvicultura.
- Organize os arquivos assim (copie as imagens com nomes simples, sem espaços nem acentos):
  ```
  index.html
  faturamento.html, producao.html, qualidade.html, seguranca.html, estoque.html, custos.html, rh.html
  css/style.css
  js/main.js
  assets/img/hero/       (imagens temáticas renomeadas: hero-01.jpg, hero-02.jpg ...)
  assets/img/equipe/     (fotos das pessoas)
  assets/img/estrutura/  (fotos dos equipamentos)
  assets/video/          (vídeos, se houver)
  ```
- Se alguma foto não existir, NÃO quebre o layout: use fallback automático (avatar com as iniciais da pessoa ou ícone do equipamento) via `onerror`.

## 1. Identidade visual
- Fundo principal: branco (#ffffff), com seções alternando para um off-white esverdeado bem leve (#f4f8f7).
- Cor principal: verde #11514f. Derive uma paleta a partir dela e use variáveis CSS:
  - `--verde: #11514f;` `--verde-escuro: #0a3332;` `--verde-claro: #e3efed;`
  - `--neon: #3dffa8;` (verde neon para destaques, brilhos, glow em hover e detalhes de linha)
  - `--lima: #c8f560;` (acento secundário, usado com moderação, como o botão em download.jpg)
  - `--texto: #10201f;` `--texto-suave: #5b6b69;`
- Neon só em detalhes (bordas, glow, pontos, linhas, badges), nunca em blocos grandes de texto, para manter contraste e elegância no fundo branco.
- Tipografia (Google Fonts): títulos em "Manrope" ou "Inter" (peso 700–800); palavra de destaque em itálico serifado "Instrument Serif" ou "Playfair Display" na cor verde, como "grows" em download.jpg.
- Ícones: Lucide (CDN) ou Font Awesome, em todos os botões, cards e números.
- Cantos arredondados (16–24px), sombras suaves, efeito vidro (backdrop-filter) na barra de navegação e nos cards sobre imagens.
- Respeite `prefers-reduced-motion` (desligar animações para quem prefere).

## 2. Navegação (header fixo)
- Barra em formato pílula, fixa no topo, com efeito vidro, que ganha sombra ao rolar a página.
- Logo/nome à esquerda: "SMA · Silvicultura" (ou o logo, se houver arquivo).
- Botões, cada um com ícone: Home (house), Faturamento (receipt / dollar-sign), Produção (trees / sprout), Qualidade (badge-check), Segurança (shield-check), Estoque (package), Custos (wallet / calculator), RH (users).
- Indicador do item ativo (ponto/linha neon abaixo, como em download.jpg) e hover com glow verde.
- No celular: menu hambúrguer com painel deslizante.
- Home leva ao `index.html`. Os outros botões levam às suas páginas (.html), que por enquanto devem ter o mesmo header/footer e um bloco elegante de "Em construção" com o ícone e o nome do setor.

## 3. Hero (tela inicial interativa)
- Altura de tela cheia, fundo branco com formas orgânicas suaves em verde-claro e partículas/pontos neon flutuando bem sutis.
- Lado esquerdo — texto:
  - Badge pequeno no topo: "● Unidade São Miguel"
  - Título: "Unindo **Segurança**, *Qualidade* e **Produtividade**." (uma das palavras em itálico serifado verde)
  - Subtítulo: "Comprometidos com a excelência em silvicultura e no manejo sustentável de florestas."
  - Dois botões: "Conheça nossa estrutura" (primário, verde com seta) e "Ver organograma" (secundário, contorno).
  - Abaixo, três selos com ícone de check: "Segurança em primeiro lugar", "Qualidade em cada etapa", "Manejo sustentável".
- Lado direito — composição de imagens interativa usando as imagens temáticas:
  - Uma imagem principal grande com troca automática a cada ~5s (crossfade + leve zoom Ken Burns), com indicadores clicáveis.
  - 2 ou 3 miniaturas flutuantes em cards arredondados sobrepostos, com leve parallax que acompanha o movimento do mouse e efeito tilt 3D no hover.
  - Brilho/borda neon ao passar o mouse.
- Indicador "role para baixo" animado.

## 4. Seção "Silvicultura"
- Título: "O que é *Silvicultura*" + parágrafo curto: a ciência e a prática de implantar, conduzir e manejar florestas plantadas de forma produtiva e sustentável, do viveiro à colheita.
- Linha do tempo / abas interativas com as etapas do ciclo florestal (cada uma com ícone, texto curto e imagem que troca ao clicar):
  1. Produção de mudas
  2. Preparo do solo
  3. Plantio
  4. Tratos culturais e manutenção
  5. Proteção florestal (controle de pragas, formigas e incêndios)
  6. Colheita e reforma
- Bloco de vídeo: player em card arredondado (tag `<video>` apontando para `assets/video/silvicultura.mp4`, com poster de uma das imagens e botão de play customizado). Se o arquivo não existir, mostre a imagem com o botão de play e uma legenda.
- 3 cards de pilares com ícone e hover elevado: Sustentabilidade, Tecnologia no campo, Pessoas e segurança.
- Animações de entrada ao rolar (fade + slide) com IntersectionObserver.

## 5. Seção "Nossa Estrutura em São Miguel"
- Título: "Nossa *Estrutura* em São Miguel" + subtítulo "Equipe e frota preparadas para cada etapa da operação."
- Grid de cards (4 colunas no desktop, 2 no tablet, 1 no celular). Cada card: foto do item (arquivo em `assets/img/estrutura/`, com fallback para ícone grande), nome, quantidade em número grande com contador animado (conta de 0 até o valor quando aparece na tela), e ícone.
- Dados (fonte: planilha da estrutura):
  | Estrutura | Quantidade | Foto sugerida |
  |---|---|---|
  | Colaboradores | 200 | colaboradores.jpg |
  | Trator Médio | 16 | trator-medio.jpg |
  | Trator Pesado | 4 | trator-pesado.jpg |
  | Caminhão Pipa | 5 | caminhao-pipa.jpg |
  | Caminhão Munck | 2 | caminhao-munck.jpg |
  | Caminhão Comboio | 1 | caminhao-comboio.jpg |
  | Caminhão Exército | 1 | caminhao-exercito.jpg |
  | Caminhão Suplementar | 2 | caminhao-suplementar.jpg |
  | Caminhão Oficina | 1 | caminhao-oficina.jpg |
- Destaque o card "Colaboradores" (maior ou com fundo verde #11514f e número em neon).
- Mostre também o total da frota (soma automática dos veículos = 32) em um card de resumo.
- Guarde os dados em um array JS para facilitar a atualização.
- Hover: a imagem dá zoom suave, o card sobe e a borda ganha glow neon.

## 6. Seção "Organograma Operacional"
- Baseie o visual em `Organograma.jpg`: foto em moldura hexagonal com borda colorida, faixa com o nome, cargo abaixo e setas/linhas conectando os níveis. Use a paleta verde/neon em vez das cores da referência (cada supervisor com um tom de verde diferente, e a equipe dele herdando esse tom).
- Linhas de conexão com animação de "desenho" ao entrar na tela e um pulso neon percorrendo a linha.
- Badge da equipe (ex.: "Equipe BD") em formato pílula nos encarregados.
- Hover/clique no card: eleva, brilha e mostra um pequeno painel com nome, cargo e equipe.
- No celular, o organograma vira uma lista em árvore vertical (com recuo e linha lateral), sem rolagem horizontal.
- Guarde os dados em um array/objeto JS hierárquico.

Hierarquia:

**Nível 1 — Coordenação**
- Anderson Ramos — Coordenador — `assets/img/equipe/Anderson.jpg`

**Nível 2 — Supervisão (abaixo de Anderson)**
- Carina Pereira — Supervisora Operacional — `assets/img/equipe/Carina.jpg`
- Joyce Pontes — Supervisora Operacional — `assets/img/equipe/Joyce.png`

**Nível 3 — Encarregados**
- Abaixo de Carina Pereira:
  - Jefferson Becker — Encarregado de Mecanizado — `assets/img/equipe/jeferson.png` — Equipes BN / BV
- Direto abaixo de Anderson Ramos (sem supervisor; no desenho fica na linha dos encarregados):
  - Juliano Almeida — Encarregado de Mecanizado — `assets/img/equipe/juliano.png` — Equipes BT / BU
- Abaixo de Joyce Pontes:
  - Sidnei Oliveira — Encarregado Manual — `assets/img/equipe/Sidnei.jpg` — Equipe BD
  - Fernando Rodrigues — Encarregado Manual — `assets/img/equipe/Fernando.jpg` — Equipe BM
  - Lauro Batista — Encarregado Manual — `assets/img/equipe/Lauro.png` — Equipe BP

Mantenha exatamente os nomes de arquivo das fotos (maiúsculas/minúsculas importam). Use `object-fit: cover` e centralize o rosto.

## 7. Rodapé
- Fundo verde escuro (#0a3332), texto claro, linha neon fina no topo.
- Nome/logo, frase "Unindo Segurança, Qualidade e Produtividade.", links rápidos dos setores com ícones e "© 2026 SMA Silvicultura · Unidade São Miguel".

## 8. Qualidade do código
- HTML semântico (header, nav, main, section, footer), `alt` em todas as imagens, contraste acessível (WCAG AA), foco visível no teclado.
- CSS organizado por seções com variáveis; JS separado em funções (slider do hero, parallax, contadores, abas, organograma, menu mobile, animações de scroll).
- Imagens com `loading="lazy"` (exceto o hero).
- Revise todos os textos: ortografia, acentuação, padronização de maiúsculas e títulos claros.
- Ao final, abra o `index.html` no navegador, teste em desktop e celular (375px) e corrija qualquer problema de layout, sobreposição ou rolagem horizontal.
