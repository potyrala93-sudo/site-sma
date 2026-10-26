/* ==========================================================================
   SMA · Silvicultura — leitura da planilha TERMAC pela imagem, no próprio navegador (OCR)
   Sem chave de IA: o Tesseract.js (gratuito) lê célula por célula.
     1. acha as linhas e colunas da tabela (as linhas finas da grade);
     2. em cada célula separa o texto da cor de fundo (amarelo, vermelho, verde…);
     3. lê cada célula e corrige pelo que a coluna pode ter (data, placa, Válido/Atenção/Vencido…);
     4. aproxima frota, placa, tipo e observação do que já existia na última planilha.
   window.SMA_TERMAC_OCR.ler(arquivo, { anterior, progresso }) → { planilha, linhas, duvidas }
   ========================================================================== */

(() => {
  const TESSERACT = ['https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js'];
  const COLUNAS = ['frota', 'tipo', 'placa', 'regional', 'venc', 'validade', 'resultado', 'obs'];
  const TIPOS_CONHECIDOS = ['Caminhão', 'Munck', 'Caminhão de Apoio PIPA', 'Apoio', 'Comboio', 'Pipa', 'Caminhão Suplementar', 'Caminhão de Apoio', 'Caminhão Prancha', 'Trator', 'Implemento/Ripper', 'Implemento/Multiuso', 'Implemento/Subsolador', 'Reserva', 'Thomaz'];

  const carregarScript = urls => new Promise((ok, falha) => {
    if (window.Tesseract) return ok();
    const tentar = i => {
      if (i >= urls.length) return falha(new Error('Não consegui baixar o leitor de imagem (sem internet?).'));
      const s = document.createElement('script'); s.src = urls[i]; s.onload = ok; s.onerror = () => { s.remove(); tentar(i + 1); };
      document.head.appendChild(s);
    };
    tentar(0);
  });
  const abrirImagem = arquivo => new Promise((ok, falha) => {
    const img = new Image(), url = URL.createObjectURL(arquivo);
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não consegui abrir a imagem.')); };
    img.src = url;
  });

  /* ---------- texto: comparar parecidos ---------- */
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  function distancia(a, b) {
    a = semAcento(a).replace(/\s+/g, ''); b = semAcento(b).replace(/\s+/g, '');
    const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n);
    let ant = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      ant = cur;
    }
    return ant[n];
  }
  // o mais parecido da lista, se for parecido o bastante (até "tolerancia" da maior palavra)
  const parecido = (txt, lista, tolerancia = 0.34) => {
    let melhor = null, dMin = Infinity;
    lista.forEach(op => { const d = distancia(txt, op); if (d < dMin) { dMin = d; melhor = op; } });
    return melhor && dMin <= Math.max(1, Math.round(Math.max(semAcento(txt).length, semAcento(melhor).length) * tolerancia)) ? melhor : null;
  };

  /* ---------- correções por coluna ---------- */
  const PARA_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' };
  const PARA_NUM = { O: '0', Q: '0', D: '0', I: '1', L: '1', J: '1', Z: '2', A: '4', S: '5', G: '6', T: '7', B: '8' };
  const letra = c => (/[A-Z]/.test(c) ? c : PARA_LETRA[c] || c);
  const numero = c => (/\d/.test(c) ? c : PARA_NUM[c] || c);
  function placa(txt, conhecidas, trator = false) {
    let p = String(txt).toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!p || /^-+$/.test(p) || p.length < 4) return { v: '-', ok: true };
    if (trator && /^[\dOISBZ]{4}[J1I]?$/.test(p)) { p = [...p.slice(0, 4)].map(numero).join('') + 'J'; return { v: p, ok: /^\d{4}J$/.test(p) }; }   // modelo do trator (7200J)
    const mercosul = q => [0, 1, 2].map(i => letra(q[i])).join('') + numero(q[3]) + q[4] + numero(q[5]) + numero(q[6]);
    const PADRAO = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;
    if (p.length === 7) p = mercosul(p);
    else if (p.length === 8) { const c = [...p].map((_, i) => mercosul(p.slice(0, i) + p.slice(i + 1))).find(q => PADRAO.test(q)); if (c) p = c; }   // um caractere a mais
    const conhecida = conhecidas.length ? parecido(p, conhecidas, 0.3) : null;
    if (conhecida) return { v: conhecida, ok: true };
    return { v: p, ok: /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(p) };
  }
  function frota(txt, conhecidas) {
    const t = String(txt).replace(/[|\[\]{}()_=—–]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || /^[-.\s]*$/.test(t)) return { v: '-', ok: true };
    if (/alug/i.test(t)) return { v: 'Alugado', ok: true };
    const s = t.toUpperCase().replace(/\s+/g, '');
    let v = null;
    if (/^TR[A4]/.test(s)) v = `TRA ${[...s.slice(3)].map(numero).join('').replace(/\D/g, '')}`;
    else if (/^[I1L][MN][PR]/.test(s)) v = `IMP${[...s.slice(3)].map(numero).join('').replace(/\D/g, '').slice(-4)}`;   // IMP + 4 dígitos (o leitor às vezes repete o 5)
    else if (/^[\dOISBZ]{2,5}$/.test(s)) v = [...s].map(numero).join('');
    const conhecida = conhecidas.length ? parecido(v || t, conhecidas, 0.25) : null;
    if (conhecida) return { v: conhecida, ok: true };
    return { v: v || t, ok: Boolean(v && /^(TRA \d{3}|IMP\d{4}|\d{2,5})$/.test(v)) };
  }
  function data(txt) {
    const d = [...String(txt).toUpperCase()].map(numero).join('').replace(/\D/g, '');
    if (d.length < 8) return { v: '', ok: false };
    const dd = d.slice(0, 2), mm = d.slice(2, 4), aaaa = d.slice(4, 8);
    const ok = +dd >= 1 && +dd <= 31 && +mm >= 1 && +mm <= 12 && +aaaa >= 2020 && +aaaa <= 2040;
    return { v: ok ? `${aaaa}-${mm}-${dd}` : '', ok };
  }
  const validade = txt => { const t = semAcento(txt); return /venc|enci/.test(t) ? { v: 'Vencido', ok: true } : /aten|tenc|tenç|ncao|ngao/.test(t) ? { v: 'Atenção!', ok: true } : /lido|val|vál/.test(t) ? { v: 'Válido', ok: true } : { v: txt.trim() || '-', ok: false }; };
  const resultado = txt => { const t = semAcento(txt); return /repr|epro|prov.*re/.test(t) && !/^apro/.test(t) ? { v: 'Reprovado', ok: true } : /apro|prov/.test(t) ? { v: 'Aprovado', ok: true } : /venc|enci/.test(t) ? { v: 'Vencido', ok: true } : { v: txt.trim() || '-', ok: false }; };
  const textoLivre = (txt, conhecidos) => {
    const t = String(txt).replace(/[|\[\]{}_=—–]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || /^[-.\s]*$/.test(t) || t.length < 2) return { v: '-', ok: true };
    return { v: (conhecidos.length && parecido(t, conhecidos, 0.3)) || t, ok: true };
  };

  /* ---------- grade da tabela ---------- */
  function luminancia(img) {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, L = new Float32Array(c.width * c.height);
    for (let i = 0; i < L.length; i++) L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return { c, g, d, L, W: c.width, H: c.height };
  }
  // posições onde a linha fina da grade aparece (mais escura que os vizinhos) na maior parte do comprimento
  const agrupar = lista => { const r = []; lista.forEach(v => { if (!r.length || v - r.at(-1)[1] > 3) r.push([v, v]); else r.at(-1)[1] = v; }); return r.map(([a, b]) => Math.round((a + b) / 2)); };
  function grade(im) {
    const { L, W, H } = im;
    const ys = [];
    for (let y = 2; y < H - 2; y++) { let n = 0, t = 0; for (let x = 5; x < W - 5; x += 4) { t++; const v = L[y * W + x]; if (v < L[(y - 2) * W + x] - 15 && v < L[(y + 2) * W + x] - 15) n++; } if (n / t > 0.45) ys.push(y); }
    const linhas = agrupar(ys);
    if (linhas.length < 3) throw new Error('Não achei as linhas da tabela na imagem. Use um print da planilha (não foto torta).');
    const y0 = linhas[0], y1 = linhas.at(-1), xs = [];
    for (let x = 2; x < W - 2; x++) { let n = 0, t = 0; for (let y = y0 + 3; y < y1 - 3; y += 3) { t++; const v = L[y * W + x]; if (v < L[y * W + x - 2] - 15 && v < L[y * W + x + 2] - 15) n++; } if (n / t > 0.45) xs.push(x); }
    const cortes = [0, ...agrupar(xs).filter(x => x > 20 && x < W - 20), W];
    if (cortes.length !== 9) throw new Error(`Achei ${cortes.length - 1} colunas na tabela (esperava 8). Use um print da planilha inteira.`);
    // faixas entre as linhas: as de dados têm a altura "normal" e fundo claro; o cabeçalho é escuro
    const faixas = [];
    for (let i = 0; i < linhas.length - 1; i++) faixas.push([linhas[i], linhas[i + 1]]);
    const alturas = faixas.map(([a, b]) => b - a).sort((a, b) => a - b), normal = alturas[Math.floor(alturas.length / 2)];
    if (H - linhas.at(-1) >= normal * 0.7) faixas.push([linhas.at(-1), Math.min(H, linhas.at(-1) + normal + 2)]);   // última linha, sem linha embaixo
    const media = ([a, b]) => { let s = 0, n = 0; for (let y = a + 2; y < b - 1; y += 2) for (let x = 10; x < W - 10; x += 9) { s += L[y * W + x]; n++; } return s / n; };
    const dados = faixas.filter(f => Math.abs((f[1] - f[0]) - normal) <= normal * 0.3 && media(f) > 120);
    // o título (TERMAC … / TST …) fica acima do primeiro bloco escuro
    const cabecalho = faixas.find(f => media(f) <= 120);
    return { cortes, dados, topoTitulo: cabecalho ? cabecalho[0] : y0 };
  }

  // recorta a célula e separa o texto do fundo: o fundo é a cor mais comum da borda; texto = o que for bem diferente dela
  function celula(im, x0, y0, x1, y1, escala = 3, inverter = false) {
    const { d, W } = im, m = 3;
    x0 += m; y0 += m; x1 -= m; y1 -= m;
    const w = x1 - x0, h = y1 - y0; if (w < 4 || h < 4) return null;
    const borda = [];
    for (let x = x0; x < x1; x += 2) { borda.push((y0 * W + x) * 4, ((y1 - 1) * W + x) * 4); }
    for (let y = y0; y < y1; y += 2) { borda.push((y * W + x0) * 4, (y * W + x1 - 1) * 4); }
    const med = k => { const v = borda.map(i => d[i + k]).sort((a, b) => a - b); return v[v.length >> 1]; };
    const fundo = [med(0), med(1), med(2)];
    const c = document.createElement('canvas'); c.width = w * escala; c.height = h * escala;
    const peq = new ImageData(w, h); let tinta = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = ((y0 + y) * W + x0 + x) * 4, o = (y * w + x) * 4;
      const dist = Math.abs(d[i] - fundo[0]) + Math.abs(d[i + 1] - fundo[1]) + Math.abs(d[i + 2] - fundo[2]);
      const texto = inverter ? false : dist > 110;
      if (texto) tinta++;
      const v = texto ? 0 : 255; peq.data[o] = peq.data[o + 1] = peq.data[o + 2] = v; peq.data[o + 3] = 255;
    }
    if (tinta < w * h * 0.01) return null;   // célula vazia
    const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = h; tmp.getContext('2d').putImageData(peq, 0, 0);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = true; g.drawImage(tmp, 0, 0, c.width, c.height);
    // margem branca em volta ajuda o leitor
    const f = document.createElement('canvas'); f.width = c.width + 40; f.height = c.height + 30;
    const gf = f.getContext('2d'); gf.fillStyle = '#fff'; gf.fillRect(0, 0, f.width, f.height); gf.drawImage(c, 20, 15);
    return f;
  }
  // título claro sobre verde-escuro: inverte para letras pretas
  function titulo(im, y1) {
    const { L, W } = im, h = Math.max(10, y1);
    const c = document.createElement('canvas'); c.width = W * 2; c.height = h * 2;
    const peq = new ImageData(W, h);
    for (let i = 0; i < W * h; i++) { const v = L[i] > 150 ? 0 : 255; peq.data[i * 4] = peq.data[i * 4 + 1] = peq.data[i * 4 + 2] = v; peq.data[i * 4 + 3] = 255; }
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = h; tmp.getContext('2d').putImageData(peq, 0, 0);
    c.getContext('2d').drawImage(tmp, 0, 0, c.width, c.height);
    return c;
  }

  async function ler(arquivo, { anterior = null, progresso = () => {} } = {}) {
    progresso('Preparando o leitor…', 0);
    await carregarScript(TESSERACT);
    const img = await abrirImagem(arquivo);
    const im = luminancia(img), G = grade(im);
    const workers = await Promise.all([0, 1].map(() => window.Tesseract.createWorker('por', 1)));
    try {
      // cabeçalho (duas linhas): unidade e TST
      await workers[0].setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      progresso('Lendo o cabeçalho…', 0.02);
      const cab = (await workers[0].recognize(titulo(im, G.topoTitulo))).data.text;
      // o logo da JFI fica à direita, separado por um espaço grande: corta ali
      const limpar = s => (s || '').split(/\s{3,}/)[0].replace(/[^A-Za-zÀ-ÿ\s]/g, '').trim();
      const unidade = limpar(cab.match(/TERMAC\s+([^\n]+)/i)?.[1]);
      const tst = limpar(cab.match(/RESPONS\S*\s*:?\s*([^\n]+)/i)?.[1]);
      const titulo1 = s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos)\b/g, w => w.toLowerCase());

      // células
      const tarefas = [];
      G.dados.forEach(([ya, yb], r) => COLUNAS.forEach((col, ci) => tarefas.push({ r, col, canvas: celula(im, G.cortes[ci], ya, G.cortes[ci + 1], yb) })));
      // coluna por coluna, cada uma só com os caracteres que ela pode ter
      const textos = G.dados.map(() => ({}));
      const MAI = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', PERMITIDOS = { frota: MAI + MAI.toLowerCase() + '0123456789- ', placa: MAI + '0123456789-', regional: MAI + MAI.toLowerCase(), venc: '0123456789/' };
      let feitas = 0;
      for (const col of COLUNAS) {
        await Promise.all(workers.map(w => w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: PERMITIDOS[col] || '' })));
        const fila = tarefas.filter(t => t.col === col);
        await Promise.all(workers.map(async w => {
          while (fila.length) {
            const t = fila.shift();
            textos[t.r][t.col] = t.canvas ? (await w.recognize(t.canvas)).data.text.replace(/\n/g, ' ').trim() : '';
            feitas++; progresso(`Lendo a tabela… ${Math.round(feitas / tarefas.length * 100)}%`, feitas / tarefas.length);
          }
        }));
      }

      // corrige cada linha pelo que a coluna pode ter e pelo que já existia
      const ant = anterior?.linhas || [];
      const dic = k => [...new Set(ant.map(l => l[k]).filter(v => v && v !== '-'))];
      const conh = { frota: dic('frota'), placa: dic('placa'), obs: dic('obs'), tipo: [...new Set([...TIPOS_CONHECIDOS, ...dic('tipo')])] };
      const duvidas = [];
      const linhas = textos.map((t, i) => {
        const f = frota(t.frota, conh.frota), p = placa(t.placa, conh.placa, /^TRA/.test(f.v) || /trator/i.test(t.tipo || '')), dt = data(t.venc), va = validade(t.validade), re = resultado(t.resultado);
        const tp = t.tipo ? { v: parecido(t.tipo, conh.tipo, 0.4) || t.tipo.trim(), ok: Boolean(parecido(t.tipo, conh.tipo, 0.4)) } : { v: '-', ok: false };
        const linha = { frota: f.v, tipo: tp.v, placa: p.v, regional: /s\s*m\s*a/i.test(t.regional || '') || !t.regional ? 'SMA' : t.regional.trim(), venc: dt.v, validade: va.v, resultado: re.v, obs: textoLivre(t.obs, conh.obs).v };
        // placa ou frota que não existiam: o mesmo equipamento costuma ter o mesmo tipo e o mesmo vencimento da planilha anterior
        const novaPlaca = conh.placa.length && linha.placa !== '-' && !conh.placa.includes(linha.placa);
        const novaFrota = conh.frota.length && linha.frota !== '-' && !conh.frota.includes(linha.frota);
        if (novaPlaca || novaFrota) {
          const igual = ant.filter(a => a.tipo === linha.tipo && a.venc === linha.venc);
          if (igual.length === 1) { if (novaPlaca) linha.placa = igual[0].placa; if (novaFrota) linha.frota = igual[0].frota; }
          else { if (novaPlaca) p.ok = false; if (novaFrota) f.ok = false; }   // equipamento novo ou leitura ruim: pede conferência
        }
        const ruins = Object.entries({ frota: f.ok, tipo: tp.ok, placa: p.ok, venc: dt.ok, validade: va.ok, resultado: re.ok }).filter(([, ok]) => !ok).map(([k]) => k);
        if (ruins.length) duvidas.push({ linha: i, campos: ruins });
        return linha;
      });
      return {
        planilha: { unidade: unidade ? titulo1(unidade) : anterior?.planilha?.unidade || '-', tst: tst ? titulo1(tst) : anterior?.planilha?.tst || '-', data: new Date().toLocaleDateString('sv-SE') },
        linhas, duvidas
      };
    } finally {
      workers.forEach(w => w.terminate());
    }
  }

  window.SMA_TERMAC_OCR = { ler };
})();
