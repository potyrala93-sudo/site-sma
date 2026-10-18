/* ==========================================================================
   SMA · Silvicultura — RH · Avatar estilo anime (ilustração própria em SVG)
   Rosto com contorno, olhos grandes com íris em degradê e brilhos, cílios marcados,
   cabelo em mechas com sombra e reflexo. Masculino/feminino; mesma semente → mesmo avatar.
   Uso: SMA_AVATAR_ANIME({ semente, sexo: 'M'|'F', fundo: '#22e07a' }) → data URI (SVG)
   ========================================================================== */

(() => {
  // Sorteio determinístico a partir da semente (CHAPA)
  function sorteio(semente) {
    let h = 2166136261; for (const ch of String(semente)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  const rgb = hex => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mistura = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const f = n => +n.toFixed(1);

  // Mecha afunilada: raiz larga (rx,ry) → ponta (tx,ty), com leve curva
  function mecha(rx, ry, tx, ty, w, curva = 0) {
    const my = (ry + ty) / 2, dx = tx - rx;
    return `M${f(rx - w)} ${f(ry)} Q${f(rx - w * .25 + dx * .35 + curva)} ${f(my)} ${f(tx)} ${f(ty)} Q${f(rx + w * .45 + dx * .45 + curva)} ${f(my)} ${f(rx + w)} ${f(ry)} Z`;
  }

  // Olho do lado direito da imagem; o esquerdo é o mesmo espelhado
  function olho(cx, cy, d, id) {
    const { a, hu, hl, fem, iris, irisE, irisC, cilio, linha } = d;
    const forma = `M${cx - a} ${cy + 2} C${cx - a + 4} ${cy - hu} ${cx + a - 6} ${cy - hu - 2} ${cx + a} ${cy - hu * .35} C${cx + a - 2} ${cy + hl * .7} ${cx - a + 8} ${cy + hl} ${cx - a} ${cy + 2} Z`;
    const irx = a * .68, iry = (hu + hl) * .74, icy = cy + 1.5;
    return `
      <clipPath id="${id}"><path d="${forma}"/></clipPath>
      <path d="${forma}" fill="#fbfbff"/>
      <g clip-path="url(#${id})">
        <ellipse cx="${cx}" cy="${icy}" rx="${f(irx)}" ry="${f(iry)}" fill="url(#gi)" stroke="${irisE}" stroke-width="1.2"/>
        <path d="M${f(cx - irx * .75)} ${f(icy + iry * .35)} Q${cx} ${f(icy + iry * 1.05)} ${f(cx + irx * .75)} ${f(icy + iry * .35)} Q${cx} ${f(icy + iry * .7)} ${f(cx - irx * .75)} ${f(icy + iry * .35)} Z" fill="${irisC}" opacity=".75"/>
        <ellipse cx="${cx}" cy="${f(icy + 1)}" rx="${f(irx * .42)}" ry="${f(iry * .52)}" fill="${irisE}"/>
        <ellipse cx="${cx}" cy="${f(cy - hu + 1)}" rx="${a + 4}" ry="${fem ? 7 : 6}" fill="${irisE}" opacity=".35"/>
        <ellipse cx="${f(cx + a * .28)}" cy="${f(cy - hu * .3)}" rx="${fem ? 3.8 : 3.2}" ry="${fem ? 4.8 : 4}" fill="#fff"/>
        <circle cx="${f(cx - a * .3)}" cy="${f(cy + hl * .4)}" r="${fem ? 2 : 1.6}" fill="#fff" opacity=".9"/>
        ${fem ? `<circle cx="${f(cx + a * .05)}" cy="${f(cy + hl * .55)}" r="1" fill="#fff" opacity=".8"/>` : ''}
      </g>
      <path d="M${cx - a - 1} ${cy + 1.5} C${cx - a + 4} ${cy - hu - 1} ${cx + a - 6} ${cy - hu - 3.2} ${f(cx + a + 2)} ${f(cy - hu * .35 + 1)}" stroke="${cilio}" stroke-width="${fem ? 4.4 : 3.6}" fill="none" stroke-linecap="round"/>
      ${fem
        ? `<path d="M${cx + a} ${f(cy - hu * .4)} l6 -4.5 M${cx + a - 3} ${f(cy - hu * .75)} l4.5 -5 M${cx + a - 7} ${f(cy - hu * .95)} l2.5 -4.5" stroke="${cilio}" stroke-width="1.8" stroke-linecap="round"/>`
        : `<path d="M${cx + a + 1} ${f(cy - hu * .35 + 1)} l2.5 3" stroke="${cilio}" stroke-width="2" stroke-linecap="round"/>`}
      <path d="M${f(cx - a * .15)} ${f(cy + hl + .6)} Q${f(cx + a * .55)} ${f(cy + hl + .2)} ${cx + a - 1} ${f(cy + hl * .3)}" stroke="${cilio}" stroke-width="1.3" fill="none" stroke-linecap="round" opacity=".75"/>
      <path d="M${cx - a + 5} ${cy - hu - 4} Q${cx + 2} ${cy - hu - 8.5} ${cx + a} ${cy - hu - 2.5}" stroke="${linha}" stroke-width="1.1" fill="none" stroke-linecap="round" opacity=".55"/>`;
  }

  function avatarAnime({ semente, sexo, fundo = '#3dffa8' }) {
    const r = sorteio(semente), pick = l => l[Math.floor(r() * l.length)], entre = (a, b) => a + r() * (b - a);
    const fem = sexo === 'F';

    // Paleta
    const pele = pick(['#fde6d6', '#fadccb', '#f5cdb2', '#ebb994', '#d29a72', '#a8714f']);
    const peleS = mistura(pele, '#c0665a', .32), linha = mistura(pele, '#4a1e18', .62);
    const cabelo = pick(fem ? ['#6b4228', '#8a5632', '#4a2c1c', '#24202e', '#a8703e', '#3a2a4a', '#7a3a2c'] : ['#141a33', '#1a1a22', '#2a1e18', '#3e2c22', '#1c2750', '#4a3426']);
    const cabE = mistura(cabelo, '#000000', .5), cabC = mistura(cabelo, fem ? '#ffe2b8' : '#a9c1ff', .42);
    const irisBase = pick(fem ? ['#b5762e', '#8f5a2a', '#c48a3c', '#3f74c8', '#2f8b6e', '#7a52b8'] : ['#2f6fd6', '#2a86c8', '#3a5ab8', '#8a5a2b', '#2e8b6a', '#6a4bc4']);
    const roupa = pick(fem ? ['#f3efe9', '#f6d7de', '#d9e6f5', '#2d3748', '#e8e0f5'] : ['#1d2230', '#2b3346', '#f1f1f1', '#1f4f43', '#3a2f4a']);
    const roupaE = mistura(roupa, '#000000', .25);
    const d = {
      fem, a: 15, hu: fem ? 13 : 10, hl: fem ? 9 : 7,
      iris: irisBase, irisE: mistura(irisBase, '#0a0a18', .7), irisC: mistura(irisBase, '#ffffff', .45),
      cilio: mistura(cabelo, '#120a0a', .75), linha
    };

    // Cabelo de trás
    let tras;
    if (fem) {
      const estilo = Math.floor(r() * 3);
      tras = [
        `<path d="M54 96 C46 44 72 22 100 22 C128 22 154 44 146 96 C150 132 156 170 162 200 L38 200 C44 170 50 132 54 96 Z" fill="${cabelo}" stroke="${cabE}" stroke-width="1.2"/>`,
        `<path d="M52 100 C44 46 72 22 100 22 C128 22 156 46 148 100 C152 128 158 152 166 172 L152 166 L148 180 L136 166 L64 166 L52 180 L48 166 L34 172 C42 152 48 128 52 100 Z" fill="${cabelo}" stroke="${cabE}" stroke-width="1.2" stroke-linejoin="round"/>`,
        `<path d="M56 100 C50 48 74 24 100 24 C126 24 150 48 144 100 Z" fill="${cabelo}"/><path d="M126 38 C168 36 178 96 162 162 L154 140 L150 156 C148 120 144 92 128 66 Z" fill="${cabelo}" stroke="${cabE}" stroke-width="1.2" stroke-linejoin="round"/><path d="M124 34 C130 30 138 32 140 40 C134 42 128 42 124 34 Z" fill="${roupa}" stroke="${roupaE}" stroke-width="1"/>`
      ][estilo];
    } else {
      // silhueta espetada em volta da cabeça
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const ang = Math.PI * (1.02 + i / 16 * .96), raio = i % 2 ? entre(1.08, 1.22) : entre(.94, 1);
        pts.push(`${f(100 + Math.cos(ang) * 50 * raio)} ${f(84 + Math.sin(ang) * 58 * raio)}`);
      }
      tras = `<path d="M54 112 L${pts.join(' L')} L146 112 Z" fill="${cabelo}" stroke="${cabE}" stroke-width="1.2" stroke-linejoin="round"/>`;
    }

    // Mechas da franja e laterais
    const franja = [], lados = [];
    const varre = r() < .5 ? -1 : 1;
    if (fem) {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), rx = 64 + t * 72, ry = 52 - Math.sin(t * Math.PI) * 10;
        franja.push(mecha(rx, ry, rx + entre(-4, 4) + (t - .5) * 6, entre(96, 106) - Math.abs(t - .5) * 6, entre(9.5, 12), entre(-2, 2)));
      }
      lados.push(mecha(68, 64, entre(56, 60), entre(150, 164), 8, -4), mecha(132, 64, entre(140, 144), entre(150, 164), 8, 4));
      lados.push(mecha(72, 70, 66, entre(128, 138), 5, -1), mecha(128, 70, 134, entre(128, 138), 5, 1));
    } else {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), rx = 64 + t * 72, ry = 50 - Math.sin(t * Math.PI) * 10;
        const longo = Math.sin(t * Math.PI);
        franja.push(mecha(rx, ry, rx + varre * entre(2, 9) + entre(-3, 3), 86 + longo * entre(10, 18), entre(10, 13), varre * entre(0, 4)));
      }
      lados.push(mecha(65, 72, 58, entre(118, 126), 6.5, -2), mecha(135, 72, 142, entre(118, 126), 6.5, 2));
      // pontas soltas no alto da cabeça
      lados.push(mecha(86, 40, entre(68, 74), entre(20, 26), 10), mecha(116, 40, entre(128, 136), entre(20, 26), 10));
    }
    const capa = `M58 100 C54 52 76 30 100 30 C124 30 146 52 142 100 C138 84 130 70 116 62 C106 58 94 58 84 62 C70 70 62 84 58 100 Z`;
    const todas = [...lados, ...franja];
    const brilhos = franja.filter((_, i) => i % 2 === 0).map((_, j) => {
      const i = j * 2, n = franja.length, t = i / (n - 1), rx = 64 + t * 72, ry = (fem ? 52 : 50) - Math.sin(t * Math.PI) * 10;
      return mecha(rx, ry + 4, rx + (fem ? 0 : varre * 3), ry + 22, 2.2);
    });
    const ahoge = r() < .3 ? `<path d="M100 32 C94 14 106 6 116 8 C106 12 104 20 104 32 Z" fill="${cabelo}" stroke="${cabE}" stroke-width="1"/>` : '';

    // Rosto
    const rosto = 'M60 92 C60 122 70 146 86 160 C92 165 96 168 100 168 C104 168 108 165 114 160 C130 146 140 122 140 92 C140 58 122 40 100 40 C78 40 60 58 60 92 Z';
    const sobr = fem
      ? `<path d="M68 86 Q80 80 92 85" stroke="${cabE}" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M108 85 Q120 80 132 86" stroke="${cabE}" stroke-width="2" fill="none" stroke-linecap="round"/>`
      : `<path d="M66 89 L92 84 L92 87.5 L67 92 Z" fill="${cabE}"/><path d="M134 89 L108 84 L108 87.5 L133 92 Z" fill="${cabE}"/>`;
    const boca = fem
      ? `<path d="M92 147 Q100 151.5 108 147" stroke="${mistura(linha, '#b0304a', .35)}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M96 152 Q100 153.5 104 152" stroke="${peleS}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`
      : `<path d="M92 148 Q100 149.6 108 148" stroke="${linha}" stroke-width="1.7" fill="none" stroke-linecap="round"/><path d="M96 153 Q100 154 104 153" stroke="${peleS}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    const blush = `<g opacity="${fem ? 1 : .45}"><ellipse cx="74" cy="132" rx="10" ry="4.6" fill="#ff8a8a" opacity=".32"/><ellipse cx="126" cy="132" rx="10" ry="4.6" fill="#ff8a8a" opacity=".32"/>${fem ? '<path d="M69 134 l3 -4 M73.5 134 l3 -4 M78 134 l3 -4 M121 134 l3 -4 M125.5 134 l3 -4 M130 134 l3 -4" stroke="#e8686e" stroke-width="1" stroke-linecap="round" opacity=".6"/>' : ''}</g>`;
    const roupaSvg = fem
      ? `<path d="M8 200 C12 182 40 174 78 172 C86 180 114 180 122 172 C160 174 188 182 192 200 Z" fill="${roupa}" stroke="${roupaE}" stroke-width="1.2"/><path d="M80 172 L100 194 L120 172 C112 178 88 178 80 172 Z" fill="${pele}"/><path d="M80 172 L100 194 L120 172" stroke="${roupaE}" stroke-width="1.4" fill="none"/><path d="M86 184 Q92 186 96 184 M104 184 Q108 186 114 184" stroke="${peleS}" stroke-width="1.1" fill="none"/>`
      : `<path d="M6 200 C10 180 40 172 76 170 C84 182 116 182 124 170 C160 172 190 180 194 200 Z" fill="${roupa}" stroke="${roupaE}" stroke-width="1.2"/><path d="M76 170 C84 184 116 184 124 170" stroke="${roupaE}" stroke-width="4" fill="none"/><path d="M40 186 Q44 194 42 200 M160 186 Q156 194 158 200" stroke="${roupaE}" stroke-width="1.2" fill="none" opacity=".7"/>`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="22 16 156 156">
      <defs>
        <radialGradient id="gf" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="${mistura(fundo, '#ffffff', .55)}"/><stop offset=".6" stop-color="${mistura(fundo, '#ffffff', .15)}"/><stop offset="1" stop-color="${mistura(fundo, '#000000', .25)}"/></radialGradient>
        <linearGradient id="gi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${mistura(irisBase, '#0a0a18', .55)}"/><stop offset=".55" stop-color="${irisBase}"/><stop offset="1" stop-color="${mistura(irisBase, '#ffffff', .5)}"/></linearGradient>
        <linearGradient id="gc" gradientUnits="userSpaceOnUse" x1="0" y1="28" x2="0" y2="170"><stop offset="0" stop-color="${mistura(cabelo, '#ffffff', .08)}"/><stop offset="1" stop-color="${mistura(cabelo, '#000000', .25)}"/></linearGradient>
        <clipPath id="cr"><path d="${rosto}"/></clipPath>
      </defs>
      <rect width="200" height="200" fill="url(#gf)"/><circle cx="160" cy="40" r="26" fill="#ffffff" opacity=".12"/><circle cx="40" cy="150" r="18" fill="#ffffff" opacity=".08"/>
      ${tras}
      <path d="M84 146 L84 186 L116 186 L116 146 Z" fill="${pele}"/>
      <path d="M84 150 C92 166 108 166 116 150 L116 172 C108 178 92 178 84 172 Z" fill="${peleS}"/>
      ${roupaSvg}
      <path d="M62 104 C52 100 50 116 56 124 C58 128 62 128 64 126 Z" fill="${pele}" stroke="${linha}" stroke-width="1.2"/>
      <path d="M138 104 C148 100 150 116 144 124 C142 128 138 128 136 126 Z" fill="${pele}" stroke="${linha}" stroke-width="1.2"/>
      <path d="${rosto}" fill="${pele}" stroke="${linha}" stroke-width="1.4"/>
      <g clip-path="url(#cr)">
        <g transform="translate(2 6)" fill="${peleS}" opacity=".85">${franja.map(p => `<path d="${p}"/>`).join('')}<path d="${capa}"/></g>
        <path d="M132 100 C134 126 126 146 112 160 C138 150 146 120 140 96 Z" fill="${peleS}" opacity=".6"/>
      </g>
      ${blush}
      ${sobr}
      ${olho(120, 112, d, 'od')}
      <g transform="matrix(-1 0 0 1 160 0)">${olho(80, 112, d, 'oe')}</g>
      <path d="M101 124 L97.5 134 L102 134.5" stroke="${linha}" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/>
      ${boca}
      ${todas.map(p => `<path d="${p}" fill="url(#gc)" stroke="${cabE}" stroke-width=".8" stroke-opacity=".55" stroke-linejoin="round"/>`).join('')}
      <path d="${capa}" fill="url(#gc)"/>
      <path d="M58 100 C54 52 76 30 100 30 C124 30 146 52 142 100" fill="none" stroke="${cabE}" stroke-width="1"/>
      ${brilhos.map(p => `<path d="${p}" fill="${cabC}" opacity=".55"/>`).join('')}
      ${[[72, 54, 80, 46], [86, 43, 96, 39], [104, 39, 114, 42], [120, 45, 128, 52]].map(([x1, y1, x2, y2]) => `<path d="M${x1} ${y1} Q${(x1 + x2) / 2} ${(y1 + y2) / 2 - 3} ${x2} ${y2}" stroke="${cabC}" stroke-width="3" fill="none" stroke-linecap="round" opacity=".55"/>`).join('')}
      ${ahoge}
    </svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n\s*/g, ''))}`;
  }

  window.SMA_AVATAR_ANIME = avatarAnime;
})();
