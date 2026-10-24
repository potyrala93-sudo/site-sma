/* ==========================================================================
   SMA · Silvicultura — Gerador de PDF compartilhado (A4 paisagem)
   Monta cada página fora da tela, fotografa com html2canvas e junta no jsPDF.
   Uso: await SMA_PDF.gerar(['<html da página 1>', ...], 'Arquivo.pdf', { preparar, progresso })
   ========================================================================== */

(() => {
  const carregarScript = urls => new Promise((ok, falha) => {
    const tentar = i => {
      if (i >= urls.length) return falha(new Error('não foi possível carregar o gerador de PDF'));
      const s = document.createElement('script'); s.src = urls[i]; s.onload = ok; s.onerror = () => { s.remove(); tentar(i + 1); };
      document.head.appendChild(s);
    };
    tentar(0);
  });
  async function bibliotecas() {
    if (!window.html2canvas) await carregarScript(['https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js', 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js']);
    if (!window.jspdf) await carregarScript(['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js']);
  }

  // O html2canvas não entende cores modernas (color-mix, color(), oklab…): converte tudo para rgba antes da foto
  const tela = document.createElement('canvas'); tela.width = tela.height = 1;
  const ctx = tela.getContext('2d', { willReadFrequently: true });
  const paraRgba = v => {
    ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = v; ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
  };
  const MODERNA = /(color-mix|color\(|oklab|oklch|lab\(|lch\()/;
  function sanitizarCores(raiz) {
    [raiz, ...raiz.querySelectorAll('*')].forEach(el => {
      const cs = getComputedStyle(el);
      ['color', 'backgroundColor', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor', 'outlineColor', 'fill', 'stroke'].forEach(p => {
        const v = cs[p]; if (v && MODERNA.test(v)) el.style.setProperty(p.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), paraRgba(v), 'important');
      });
      if (MODERNA.test(cs.backgroundImage)) el.style.setProperty('background-image', 'none', 'important');
      // texto pintado com degradê (background-clip: text): o html2canvas desenha uma faixa por cima da palavra; vira cor sólida
      if ((cs.webkitBackgroundClip || cs.backgroundClip) === 'text') {
        const solida = getComputedStyle(raiz.ownerDocument.documentElement).getPropertyValue('--neon').trim() || '#3dffa8';
        ['background-image', 'background', '-webkit-background-clip', 'background-clip'].forEach(x => el.style.setProperty(x, x.includes('clip') ? 'border-box' : 'none', 'important'));
        el.style.setProperty('background-color', 'transparent', 'important');
        el.style.setProperty('-webkit-text-fill-color', solida, 'important');
        el.style.setProperty('color', solida, 'important');
      }
      // sombras com cores modernas também quebram o html2canvas: troca a cor de cada sombra por rgba
      ['boxShadow', 'textShadow'].forEach(p => {
        const v = cs[p]; if (!v || !MODERNA.test(v)) return;
        const convertida = v.replace(/(color-mix|color|oklab|oklch|lab|lch)\((?:[^()]|\([^()]*\))*\)/g, m => paraRgba(m));
        el.style.setProperty(p.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), MODERNA.test(convertida) ? 'none' : convertida, 'important');
      });
      // pseudo-elementos (::before/::after) não aceitam estilo direto: some com o que tiver cor moderna
      ['::before', '::after'].forEach(pseudo => {
        const ps = getComputedStyle(el, pseudo);
        if (ps.content && ps.content !== 'none' && [ps.color, ps.backgroundColor, ps.backgroundImage, ps.boxShadow, ps.borderTopColor].some(v => MODERNA.test(v || ''))) el.classList.add('sma-pdf-sem-pseudo');
      });
    });
    const doc = raiz.ownerDocument || document;
    if (!doc.getElementById('sma-pdf-estilo')) {
      const s = doc.createElement('style'); s.id = 'sma-pdf-estilo';
      s.textContent = '.sma-pdf-sem-pseudo::before, .sma-pdf-sem-pseudo::after { display: none !important; }';
      doc.head.appendChild(s);
    }
  }

  async function gerar(paginas, nomeArquivo, { preparar, progresso, retrato = false } = {}) {
    await bibliotecas();
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: retrato ? 'portrait' : 'landscape', unit: 'mm', format: 'a4' });
    const host = document.createElement('div');
    host.className = `p-pdf${retrato ? ' retrato' : ''}`;
    document.body.appendChild(host);
    const W = retrato ? 210 : 297, H = retrato ? 297 : 210, M = 8;
    const foto = el => window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    try {
      for (let i = 0; i < paginas.length; i++) {
        progresso?.(i + 1, paginas.length);
        host.innerHTML = `<div class="p-pdf-pag">${paginas[i]}<footer class="p-pdf-rodape">SMA Silvicultura · Unidade São Miguel · página ${i + 1} de ${paginas.length}</footer></div>`;
        preparar?.(host);
        window.lucide?.createIcons();
        sanitizarCores(host);
        await Promise.all([...host.querySelectorAll('img')].map(img => (img.complete ? null : new Promise(ok => { img.onload = img.onerror = ok; }))));
        let canvas, img;
        try { canvas = await foto(host.firstElementChild); img = canvas.toDataURL('image/jpeg', 0.92); }
        catch {   // site aberto sem servidor: as fotos "sujam" o canvas; refaz a página sem elas
          host.querySelectorAll('img').forEach(x => x.remove());
          canvas = await foto(host.firstElementChild); img = canvas.toDataURL('image/jpeg', 0.92);
        }
        let w = W - 2 * M, h = canvas.height * w / canvas.width;
        if (h > H - 2 * M) { h = H - 2 * M; w = canvas.width * h / canvas.height; }
        if (i) pdf.addPage();
        pdf.addImage(img, 'JPEG', (W - w) / 2, M, w, h);
      }
      pdf.save(nomeArquivo);
    } finally {
      host.remove();
    }
  }

  // Foto de um elemento da tela (para PNG). As cores são convertidas na cópia, sem mexer na página.
  async function capturar(el, opcoes = {}) {
    await bibliotecas();
    const base = { scale: 2, backgroundColor: opcoes.fundo || getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#04100f', useCORS: true, logging: false, onclone: (_doc, copia) => sanitizarCores(copia) };
    try { return await window.html2canvas(el, base); }
    catch { return window.html2canvas(el, { ...base, useCORS: false, ignoreElements: n => n.tagName === 'IMG' }); }
  }

  window.SMA_PDF = { gerar, capturar };
})();
