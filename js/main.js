/* ==========================================================================
   SMA · Silvicultura — Unidade São Miguel
   Scripts do site (JavaScript puro)
   ========================================================================== */

const { SETORES, CICLO, ESTRUTURA, ORGANOGRAMA, PASTA_EQUIPE, PASTA_ESTRUTURA } = window.SMA_DADOS;

const reduzMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const toqueApenas = window.matchMedia('(hover: none)').matches;
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function iniciais(nome) {
  const partes = nome.trim().split(/\s+/);
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

/* ---------- Cabeçalho e rodapé ---------- */

function renderCabecalho() {
  const header = $('#site-header');
  if (!header) return;
  const atual = document.body.dataset.page;
  const links = SETORES.map(s => `
    <li><a href="${s.href}"${s.externo ? ' target="_blank" rel="noopener noreferrer"' : ''}${s.id === atual ? ' aria-current="page"' : ''}>
      <i data-lucide="${s.icone}"></i><span>${s.nome}</span>
    </a></li>`).join('');

  header.innerHTML = `
    <nav class="nav-pill" aria-label="Principal">
      <a class="brand" href="index.html" aria-label="SMA Silvicultura – página inicial">
        <span class="brand-mark"><i data-lucide="sprout"></i></span>
        <span class="brand-text">SMA <small>· Silvicultura</small></span>
      </a>
      <ul class="nav-links">${links}</ul>
      <button class="tema-btn" type="button" id="tema-btn" aria-label="Alternar entre modo claro e escuro" title="Modo claro / escuro">
        <i data-lucide="sun" class="ico-sol"></i><i data-lucide="moon" class="ico-lua"></i>
      </button>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-drawer" aria-label="Abrir menu">
        <i data-lucide="menu" class="ico-menu"></i><i data-lucide="x" class="ico-x"></i>
      </button>
    </nav>
    <div class="nav-overlay" aria-hidden="true"></div>
    <nav class="nav-drawer" id="nav-drawer" aria-label="Menu móvel">
      <ul class="nav-links">${links}</ul>
    </nav>`;
}

function renderRodape() {
  const footer = $('#site-footer');
  if (!footer) return;
  const links = SETORES.map(s => `
    <li><a href="${s.href}"${s.externo ? ' target="_blank" rel="noopener noreferrer"' : ''}><i data-lucide="${s.icone}"></i>${s.nome}</a></li>`).join('');
  const creditos = document.body.dataset.page === 'home' ? `
      <p class="footer-creditos">Imagens das etapas da silvicultura: National Park Service (domínio público); T. Grove, CSIRO (CC BY 3.0);
        “Under the same moon...” (CC BY 2.0); Charles J. Sharp e Ermell (CC BY-SA 4.0), via
        <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> e Openverse.
        Vídeo: Richard Rasmussen, via YouTube.</p>` : '';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="index.html">
            <span class="brand-mark"><i data-lucide="sprout"></i></span>
            <span class="brand-text">SMA <small>· Silvicultura</small></span>
          </a>
          <p class="footer-frase">Unindo <em>Segurança</em>, Qualidade e Produtividade.</p>
        </div>
        <nav aria-label="Links rápidos">
          <p class="footer-title">Setores</p>
          <ul class="footer-links">${links}</ul>
        </nav>
      </div>
      <div class="footer-bottom">
        <span>© 2026 SMA Silvicultura · Unidade São Miguel</span>
        <span>Manejo florestal com responsabilidade.</span>
      </div>
      ${creditos}
    </div>`;

  // Botão "voltar ao topo"
  const topo = document.createElement('button');
  topo.className = 'to-top';
  topo.type = 'button';
  topo.setAttribute('aria-label', 'Voltar ao topo');
  topo.innerHTML = '<i data-lucide="arrow-up"></i>';
  topo.addEventListener('click', () => window.scrollTo({ top: 0, behavior: reduzMovimento ? 'auto' : 'smooth' }));
  document.body.appendChild(topo);
}

/* ---------- Menu mobile, sombra, progresso e topo ---------- */

function iniciarMenu() {
  const header = $('#site-header');
  const botao = $('.nav-toggle');
  const drawer = $('#nav-drawer');
  if (!header || !botao) return;

  const definir = aberto => {
    header.classList.toggle('nav-open', aberto);
    botao.setAttribute('aria-expanded', String(aberto));
    botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    document.body.style.overflow = aberto ? 'hidden' : '';
    if (aberto) $('a', drawer)?.focus();
  };

  botao.addEventListener('click', () => definir(!header.classList.contains('nav-open')));
  $('.nav-overlay').addEventListener('click', () => definir(false));
  $$('a', drawer).forEach(a => a.addEventListener('click', () => definir(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && header.classList.contains('nav-open')) { definir(false); botao.focus(); }
  });
  window.addEventListener('resize', () => { if (window.innerWidth > 1220) definir(false); });
}

function iniciarRolagem() {
  const header = $('#site-header');
  const barra = $('.scroll-progress');
  const topo = $('.to-top');
  let pendente = false;
  const atualizar = () => {
    pendente = false;
    const y = window.scrollY;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    header?.classList.toggle('scrolled', y > 10);
    barra?.style.setProperty('--p', max > 0 ? (y / max).toFixed(4) : 0);
    topo?.classList.toggle('show', y > window.innerHeight * .8);
  };
  window.addEventListener('scroll', () => {
    if (!pendente) { pendente = true; requestAnimationFrame(atualizar); }
  }, { passive: true });
  atualizar();
}

// Brilho que acompanha o mouse nos cards com a classe .spot
function iniciarSpotlight() {
  if (toqueApenas) return;
  document.addEventListener('pointermove', e => {
    const card = e.target.closest?.('.spot');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    card.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });
}

/* ---------- Hero: partículas, slider e parallax ---------- */

function iniciarParticulas() {
  const alvo = $('#particles');
  if (!alvo || reduzMovimento) return;
  const total = window.innerWidth < 600 ? 14 : 28;
  for (let i = 0; i < total; i++) {
    const p = document.createElement('span');
    const tam = 2 + Math.random() * 3.5;
    p.className = 'particle';
    Object.assign(p.style, {
      width: tam + 'px', height: tam + 'px',
      left: Math.random() * 100 + '%',
      top: 20 + Math.random() * 80 + '%',
      animationDuration: 7 + Math.random() * 9 + 's',
      animationDelay: -Math.random() * 12 + 's'
    });
    alvo.appendChild(p);
  }
}

function iniciarSliderHero() {
  const slides = $$('#hero-media .slide');
  const dots = $('.hero-dots');
  const legenda = $('#slide-legenda');
  if (!slides.length || !dots) return;
  let atual = 0;
  let timer = null;

  slides.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-label', `Imagem ${i + 1} de ${slides.length}`);
    b.setAttribute('aria-selected', String(i === 0));
    b.addEventListener('click', () => { ir(i); reiniciar(); });
    dots.appendChild(b);
  });

  function ir(i) {
    slides[atual].classList.remove('active');
    dots.children[atual].setAttribute('aria-selected', 'false');
    atual = (i + slides.length) % slides.length;
    slides[atual].classList.add('active');
    dots.children[atual].setAttribute('aria-selected', 'true');
    if (legenda) legenda.textContent = slides[atual].dataset.legenda || '';
  }
  function reiniciar() {
    clearInterval(timer);
    if (!reduzMovimento) timer = setInterval(() => ir(atual + 1), 6000);
  }

  // Pré-carrega as próximas imagens depois que a página abrir
  window.addEventListener('load', () => slides.forEach(s => { const img = $('img', s); if (img) img.decoding = 'async'; }));
  if (legenda) legenda.textContent = slides[0].dataset.legenda || '';
  document.addEventListener('visibilitychange', () => document.hidden ? clearInterval(timer) : reiniciar());
  reiniciar();
}

function iniciarParallax() {
  const hero = $('.hero');
  const media = $('#hero-media');
  if (!hero || !media || reduzMovimento || toqueApenas) return;

  let raf = null;
  hero.addEventListener('mousemove', e => {
    const r = hero.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - .5;
    const y = (e.clientY - r.top) / r.height - .5;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      media.style.setProperty('--px', (x * -24).toFixed(1) + 'px');
      media.style.setProperty('--py', (y * -18).toFixed(1) + 'px');
    });
  });
  hero.addEventListener('mouseleave', () => {
    media.style.setProperty('--px', '0px');
    media.style.setProperty('--py', '0px');
  });

  // Tilt 3D nos cards do hero
  $$('.hcard').forEach(card => {
    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - .5;
      const y = (e.clientY - r.top) / r.height - .5;
      card.style.setProperty('--rx', (-y * 8).toFixed(1) + 'deg');
      card.style.setProperty('--ry', (x * 8).toFixed(1) + 'deg');
    });
    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });
}

/* ---------- Silvicultura: abas do ciclo e vídeo ---------- */

function iniciarCiclo() {
  const lista = $('#ciclo-tabs');
  const painel = $('#ciclo-panel');
  if (!lista || !painel) return;
  const INTERVALO = 7000;

  lista.innerHTML = CICLO.map((etapa, i) => `
    <button class="ciclo-tab" type="button" role="tab" id="ciclo-tab-${i}"
      aria-selected="${i === 0}" aria-controls="ciclo-panel" tabindex="${i === 0 ? 0 : -1}" style="--t:${INTERVALO}ms">
      <span class="num"><i data-lucide="${etapa.icone}"></i></span>
      <span><span class="tab-step">Etapa ${String(i + 1).padStart(2, '0')}</span>
      <span class="tab-label">${etapa.titulo}</span></span>
      <span class="barra" aria-hidden="true"></span>
    </button>`).join('');

  // Pré-carrega as imagens das etapas
  CICLO.forEach(e => { const im = new Image(); im.src = e.imagem; });

  const abas = $$('.ciclo-tab', lista);
  const img = $('#ciclo-img');
  let atual = -1;
  let timer = null;
  let automatico = !reduzMovimento;

  function mostrar(i, focar = false) {
    if (i === atual) return;
    const etapa = CICLO[i];
    abas.forEach((a, j) => {
      a.setAttribute('aria-selected', String(j === i));
      a.tabIndex = j === i ? 0 : -1;
      a.classList.remove('auto');
    });
    if (automatico) { void abas[i].offsetWidth; abas[i].classList.add('auto'); }
    if (focar) abas[i].focus();
    painel.setAttribute('aria-labelledby', abas[i].id);

    const aplicar = () => {
      img.src = etapa.imagem;
      img.alt = `Foto ilustrativa da etapa ${etapa.titulo}`;
      $('#ciclo-step').textContent = `Etapa ${String(i + 1).padStart(2, '0')} de ${String(CICLO.length).padStart(2, '0')}`;
      $('#ciclo-titulo').textContent = etapa.titulo;
      $('#ciclo-texto').textContent = etapa.texto;
      $('#ciclo-credito').textContent = etapa.credito;
      painel.classList.remove('trocando');
    };
    if (atual === -1 || reduzMovimento) aplicar();
    else { painel.classList.add('trocando'); setTimeout(aplicar, 320); }
    atual = i;
  }

  // Avança sozinho enquanto a seção está visível; para quando a pessoa interage
  const parar = () => { automatico = false; clearInterval(timer); abas.forEach(a => a.classList.remove('auto')); };
  const rodar = () => {
    clearInterval(timer);
    if (!automatico) return;
    abas[atual]?.classList.remove('auto'); void abas[atual]?.offsetWidth; abas[atual]?.classList.add('auto');
    timer = setInterval(() => mostrar((atual + 1) % CICLO.length), INTERVALO);
  };

  abas.forEach((a, i) => a.addEventListener('click', () => { parar(); mostrar(i); }));
  lista.addEventListener('keydown', e => {
    const mapa = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    let alvo = null;
    if (e.key in mapa) alvo = (atual + mapa[e.key] + CICLO.length) % CICLO.length;
    if (e.key === 'Home') alvo = 0;
    if (e.key === 'End') alvo = CICLO.length - 1;
    if (alvo !== null) { e.preventDefault(); parar(); mostrar(alvo, true); }
  });

  mostrar(0);
  if ('IntersectionObserver' in window && automatico) {
    new IntersectionObserver(([en]) => en.isIntersecting ? rodar() : clearInterval(timer), { threshold: .4 }).observe(painel);
  }
}

function iniciarVideo() {
  const card = $('#video-card');
  const play = $('#video-play');
  if (!card || !play) return;
  const id = card.dataset.youtube;

  // Só carrega o player do YouTube quando a pessoa clica (página mais leve)
  play.addEventListener('click', () => {
    const iframe = document.createElement('iframe');
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    iframe.title = 'O segredo do eucalipto que ninguém te conta – vídeo do YouTube';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    card.appendChild(iframe);
    card.classList.add('playing');
    iframe.focus();
  });
}

/* ---------- Estrutura: cards e contadores ---------- */

function pessoasDaEquipe() {
  const lista = [];
  const visitar = p => {
    if (!lista.some(x => x.foto === p.foto)) lista.push(p);
    (p.filhos || []).forEach(visitar);
  };
  visitar(ORGANOGRAMA);
  return lista;
}

function renderEstrutura() {
  const grid = $('#estrutura-grid');
  if (!grid) return;

  const [pessoas, ...frota] = ESTRUTURA;
  const conhecidos = frota.filter(e => e.qtd !== null);
  const pendentes = frota.filter(e => e.qtd === null);
  const totalFrota = conhecidos.reduce((s, e) => s + e.qtd, 0);
  const tratores = conhecidos.filter(e => e.tipo === 'trator').reduce((s, e) => s + e.qtd, 0);
  const caminhoes = totalFrota - tratores;
  const cores = ['#c8f560', '#9be86a', '#3dffa8', '#2fd8a6', '#22b59a', '#1c9488', '#187675', '#145a5b', '#2b4a48'];

  const equipe = pessoasDaEquipe();
  const destaque = `
    <article class="est-card destaque spot reveal">
      <div class="destaque-top">
        <span class="eyebrow">Nosso maior recurso</span>
        <div class="avatares" aria-hidden="true">
          ${equipe.slice(0, 6).map(p => `<img src="${PASTA_EQUIPE}${p.foto}" alt="" loading="lazy" onerror="this.remove()">`).join('')}
          <span>+${pessoas.qtd - Math.min(6, equipe.length)}</span>
        </div>
      </div>
      <div>
        <div class="destaque-num" data-count="${pessoas.qtd}">0</div>
        <div class="destaque-label">${pessoas.nome}<small>Pessoas que fazem a operação acontecer todos os dias.</small></div>
      </div>
    </article>`;

  const resumo = `
    <article class="est-card resumo spot reveal" style="--d:.1s">
      <div>
        <div class="resumo-top"><span class="icon-box"><i data-lucide="truck"></i></span> Total da frota</div>
        <div class="resumo-num"><span data-count="${totalFrota}">0</span><small>veículos</small></div>
        <p class="est-nome">${tratores} tratores e ${caminhoes} caminhões de apoio à operação${pendentes.length ? `, além de ${pendentes.map(p => p.nome.toLowerCase()).join(', ')} (quantidade a confirmar)` : ''}.</p>
      </div>
      <div>
        <div class="resumo-barras" aria-hidden="true">
          ${conhecidos.map((e, i) => `<span style="flex:${e.qtd};--c:${cores[i % cores.length]};transition-delay:${i * .08}s" title="${e.nome}: ${e.qtd}"></span>`).join('')}
        </div>
        <div class="resumo-legenda">
          ${conhecidos.map((e, i) => `<span style="--c:${cores[i % cores.length]}"><i></i>${e.nome.replace('Caminhão ', '')} ${e.qtd}</span>`).join('')}
        </div>
      </div>
    </article>`;

  const card = (e, i) => `
    <article class="est-card spot reveal" style="--d:${(i % 3) * .08}s">
      <div class="est-media${e.cena ? ' foto-cena' : ''}">
        <img src="${PASTA_ESTRUTURA}${e.foto}" alt="${e.nome}" loading="lazy"
          onerror="this.parentNode.classList.add('sem-foto')">
        <div class="est-fallback" aria-hidden="true"><i data-lucide="${e.icone}"></i></div>
      </div>
      <div class="est-body">
        <div>
          ${e.qtd === null
            ? `<div class="est-num pendente">—</div><div class="est-nome">${e.nome}</div><span class="est-pendente">Quantidade a confirmar</span>`
            : `<div class="est-num" data-count="${e.qtd}">0</div><div class="est-nome">${e.nome}</div>`}
        </div>
        <span class="icon-box" aria-hidden="true"><i data-lucide="${e.icone}"></i></span>
      </div>
    </article>`;

  grid.innerHTML = `
    <div class="est-top">${destaque}${resumo}</div>
    <div class="est-frota">${frota.map(card).join('')}</div>`;
}

function iniciarContadores() {
  const els = $$('[data-count]');
  const formatar = n => n.toLocaleString('pt-BR');
  const animar = el => {
    const fim = Number(el.dataset.count);
    if (reduzMovimento) { el.textContent = formatar(fim); return; }
    const dur = 1700;
    const t0 = performance.now();
    const passo = t => {
      const p = Math.min((t - t0) / dur, 1);
      el.textContent = formatar(Math.round(fim * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  };
  if (!('IntersectionObserver' in window)) { els.forEach(animar); return; }
  const io = new IntersectionObserver(entradas => {
    entradas.forEach(en => {
      if (en.isIntersecting) { animar(en.target); io.unobserve(en.target); }
    });
  }, { threshold: .5 });
  els.forEach(el => io.observe(el));
}

/* ---------- Organograma ---------- */

function renderOrganograma() {
  const arvore = $('#org-tree');
  if (!arvore) return;

  const no = (p, nivel, tom, chefe) => {
    const cor = p.tom || tom;
    const atraso = [0, .5, 1.1][nivel - 1];
    const filhos = p.filhos?.length
      ? `<ul>${p.filhos.map(f => (f.linhaEncarregados && nivel === 1
          // responde direto ao coordenador, mas aparece na linha dos encarregados: um espaço vazio ocupa a linha dos supervisores
          ? `<li class="nivel-2 org-vazio"><span class="org-oco" aria-hidden="true"></span><ul>${no(f, nivel + 2, cor, p.nome)}</ul></li>`
          : no(f, nivel + 1, cor, p.nome))).join('')}</ul>` : '';
    return `
      <li class="nivel-${nivel}">
        <button class="org-node" type="button" style="--c:${cor};--d:${atraso}s" aria-expanded="false"
          aria-label="${p.nome}, ${p.cargo}${p.equipe ? ', ' + p.equipe : ''}">
          <span class="hex"><span class="hex-in">
            <img src="${PASTA_EQUIPE}${p.foto}" alt="Foto de ${p.nome}" loading="lazy"
              onerror="this.parentNode.classList.add('sem-foto')">
            <span class="iniciais" aria-hidden="true">${iniciais(p.nome)}</span>
          </span></span>
          <span class="org-texto">
            <span class="org-nome">${p.nome}</span>
            <span class="org-cargo">${p.cargo}</span>
            ${p.equipe ? `<span class="org-equipe"><i data-lucide="users"></i>${p.equipe}</span>` : ''}
          </span>
          <span class="org-info" role="note">
            <strong>${p.nome}</strong>
            <span class="info-grid">
              <span class="k">Cargo</span><span>${p.cargo}</span>
              ${p.equipe ? `<span class="k">Equipe</span><span>${p.equipe}</span>` : ''}
              ${chefe ? `<span class="k">Responde a</span><span>${chefe}</span>` : '<span class="k">Nível</span><span>Coordenação da unidade</span>'}
              ${p.filhos?.length ? `<span class="k">Lidera</span><span>${p.filhos.map(f => f.nome.split(' ')[0]).join(', ')}</span>` : ''}
            </span>
          </span>
        </button>
        ${filhos}
      </li>`;
  };
  arvore.innerHTML = no(ORGANOGRAMA, 1, ORGANOGRAMA.tom, null);

  const legenda = $('#org-legenda');
  if (legenda) {
    legenda.innerHTML = `<span style="--c:${ORGANOGRAMA.tom}"><i></i>Coordenação</span>` +
      ORGANOGRAMA.filhos.filter(s => s.tom).map(s => `<span style="--c:${s.tom}"><i></i>Equipe de ${s.nome.split(' ')[0]}</span>`).join('');
  }

  // Clique/toque abre o painel de detalhes
  const nos = $$('.org-node', arvore);
  const fechar = () => nos.forEach(o => { o.classList.remove('open'); o.setAttribute('aria-expanded', 'false'); });
  nos.forEach(n => n.addEventListener('click', () => {
    const abrir = !n.classList.contains('open');
    fechar();
    n.classList.toggle('open', abrir);
    n.setAttribute('aria-expanded', String(abrir));
  }));
  document.addEventListener('click', e => { if (!e.target.closest('.org-node')) fechar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
}

// Posição de um elemento relativa ao contêiner (ignora transforms de animação)
function posicao(el, cont) {
  let x = 0, y = 0, atual = el;
  while (atual && atual !== cont) {
    x += atual.offsetLeft; y += atual.offsetTop;
    atual = atual.offsetParent;
  }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

function desenharLinhasOrganograma() {
  const wrap = $('#org-wrap');
  const svg = $('#org-lines');
  if (!wrap || !svg) return;
  if (window.innerWidth <= 860) { svg.innerHTML = ''; return; }

  const W = wrap.offsetWidth, H = wrap.offsetHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  let html = '';

  // o espaço vazio tem a altura de um card de supervisor, para o encarregado cair na linha dos encarregados
  const sup = $('.org-tree .nivel-2:not(.org-vazio) > .org-node', wrap);
  $$('.org-oco', wrap).forEach(o => { o.style.height = sup ? `${sup.offsetHeight}px` : ''; });

  $$('.org-tree li', wrap).forEach(li => {
    const pai = li.querySelector(':scope > .org-node');
    if (!pai) return;
    const filhos = $$(':scope > ul > li', li).flatMap(c => (c.classList.contains('org-vazio') ? $$(':scope > ul > li > .org-node', c) : $$(':scope > .org-node', c)));
    if (!filhos.length) return;
    const pp = posicao(pai, wrap);
    const x0 = pp.x + pp.w / 2;
    const y0 = pp.y + pp.h + 4;
    const atraso = li.classList.contains('nivel-1') ? .3 : .9;
    // a linha horizontal fica na metade até o filho mais próximo (quem está na linha de baixo só desce mais)
    const ym = y0 + (Math.min(...filhos.map(f => posicao(f, wrap).y + 4)) - y0) / 2;

    filhos.forEach(f => {
      const fp = posicao(f, wrap);
      const x1 = fp.x + fp.w / 2;
      const y1 = fp.y + 4;
      const cor = f.style.getPropertyValue('--c');
      const d = `M${x0},${y0} V${ym} H${x1} V${y1}`;
      html += `
        <g style="--c:${cor};--d:${atraso}s">
          <path class="linha" d="${d}" pathLength="100"/>
          <path class="pulso" d="${d}" pathLength="100"/>
          <path class="linha seta" d="M${x1 - 5},${y1 - 7} L${x1},${y1} L${x1 + 5},${y1 - 7}" style="stroke-dasharray:none;stroke-dashoffset:0"/>
        </g>`;
    });
  });
  svg.innerHTML = html;
}

/* ---------- Animações de entrada ---------- */

function iniciarRevelar() {
  const alvos = $$('.reveal, .org-wrap, .grafico');
  if (reduzMovimento || !('IntersectionObserver' in window)) {
    alvos.forEach(el => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver(entradas => {
    entradas.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { threshold: .15, rootMargin: '0px 0px -40px 0px' });
  alvos.forEach(el => io.observe(el));
}


/* ---------- Tema claro / escuro ---------- */
// A escolha fica no navegador ('sma:tema'); o <head> de cada página já aplica antes de desenhar (sem piscar).
const temaAtual = () => (document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro');
function definirTema(tema) {
  const html = document.documentElement;
  html.classList.add('tema-trocando');
  if (tema === 'claro') html.dataset.tema = 'claro'; else delete html.dataset.tema;
  try { localStorage.setItem('sma:tema', tema); } catch { /* sem armazenamento: vale só nesta página */ }
  const b = document.getElementById('tema-btn');
  if (b) b.setAttribute('aria-pressed', String(tema === 'claro'));
  atualizarGraficosDoTema();
  window.dispatchEvent(new CustomEvent('sma:tema', { detail: { tema } }));
  setTimeout(() => html.classList.remove('tema-trocando'), 400);
}
function iniciarTema() {
  const b = document.getElementById('tema-btn');
  if (!b) return;
  b.setAttribute('aria-pressed', String(temaAtual() === 'claro'));
  b.addEventListener('click', () => definirTema(temaAtual() === 'claro' ? 'escuro' : 'claro'));
  prepararGraficosDoTema();
}

// Gráficos (Chart.js): no tema claro, os textos e linhas de grade claros viram escuros (e voltam no escuro)
// Regra geral: cor clara e acinzentada (texto, grade) → escura no tema claro; cores vivas ficam como estão
function lerCor(c) {
  const t = String(c).trim().toLowerCase();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t);
  if (m) { const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1]; return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).concat(1); }
  m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(t);
  return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null;
}
function corDoTema(c) {
  if (temaAtual() !== 'claro' || typeof c !== 'string') return c;
  const v = lerCor(c); if (!v) return c;
  const [r, g, b, a] = v, luz = (0.299 * r + 0.587 * g + 0.114 * b) / 255, sat = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (luz < 0.55 || sat > 0.25) return c;
  if (a < 1) return `rgba(13, 52, 44, ${a})`;
  return luz > 0.85 ? '#10302a' : '#49625c';
}
function aplicarTemaNoGrafico(chart) {
  const o = chart.options; if (!o) return;
  const alvos = [];
  Object.values(o.scales || {}).forEach(sc => { if (!sc) return; alvos.push([sc.ticks, 'color'], [sc.grid, 'color'], [sc.border, 'color'], [sc.title, 'color'], [sc.pointLabels, 'color'], [sc.angleLines, 'color']); });
  alvos.push([o.plugins?.legend?.labels, 'color'], [o.plugins?.title, 'color'], [o, 'color']);
  chart.$temaOrig ||= new Map();
  alvos.forEach(([obj, k]) => {
    if (!obj) return;
    if (!chart.$temaOrig.has(obj)) chart.$temaOrig.set(obj, obj[k]);
    const orig = chart.$temaOrig.get(obj);
    if (typeof orig === 'string') obj[k] = corDoTema(orig);
  });
}
let graficosPreparados = false;
function prepararGraficosDoTema() {
  const C = window.Chart;
  if (!C || graficosPreparados) return;
  graficosPreparados = true;
  C.register({ id: 'temaSMA', beforeUpdate: aplicarTemaNoGrafico, beforeInit: aplicarTemaNoGrafico });
}
function atualizarGraficosDoTema() {
  const C = window.Chart; if (!C) return;
  prepararGraficosDoTema();
  if (!C.$temaDefaults) C.$temaDefaults = { color: C.defaults.color, borderColor: C.defaults.borderColor };
  C.defaults.color = corDoTema(C.$temaDefaults.color);
  C.defaults.borderColor = corDoTema(C.$temaDefaults.borderColor);
  Object.values(C.instances || {}).forEach(ch => { try { ch.update('none'); } catch { /* gráfico já removido */ } });
}
window.SMA_TEMA = { atual: temaAtual, definir: definirTema, prepararGraficos: () => { prepararGraficosDoTema(); atualizarGraficosDoTema(); } };

/* ---------- Inicialização ---------- */

function iniciar() {
  renderCabecalho();
  renderRodape();
  renderEstrutura();
  renderOrganograma();
  iniciarCiclo();

  if (window.lucide) window.lucide.createIcons();

  iniciarMenu();
  iniciarTema();
  iniciarRolagem();
  iniciarSpotlight();
  iniciarParticulas();
  iniciarSliderHero();
  iniciarParallax();
  iniciarVideo();
  iniciarContadores();
  iniciarRevelar();

  desenharLinhasOrganograma();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(desenharLinhasOrganograma, 150); });
  window.addEventListener('load', desenharLinhasOrganograma);
  document.fonts?.ready.then(desenharLinhasOrganograma);
}

/* ---------- Códigos de UP em qualquer painel abrem o Prontuário da UP (Qualidade) ---------- */
function iniciarLinksUP() {
  const upDe = el => String(el.textContent || '').toUpperCase().replace(/\s+/g, '');
  document.addEventListener('click', e => {
    const el = e.target.closest('.q-up');
    if (!el || el.closest('.p-pdf, a, button') || !/^[A-Z0-9]{4,10}$/.test(upDe(el))) return;
    const up = upDe(el), url = `qualidade.html?up=${encodeURIComponent(up)}#prontuario`;
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) window.open(url, '_blank', 'noopener');
    else if (window.SMA_PRONTUARIO) window.SMA_PRONTUARIO.abrir(up);   // já na página da Qualidade
    else location.href = url;
  }, true);
  document.addEventListener('mouseover', e => { const el = e.target.closest('.q-up'); if (el && !el.title) el.title = 'Abrir o prontuário desta UP'; });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
iniciarLinksUP();