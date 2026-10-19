/* ==========================================================================
   SMA · Silvicultura — Mapas micro: nome de cada mapa a partir do arquivo do Drive
   Ex.: "S2AR - Boa Vista (S-G12B)_Silvicultura (1).pdf" → Boa Vista · código S-G12B · talhão S2AR · Silvicultura
        "BOA VISTA (S-G12B )_SILVICULTURA.pdf"          → a mesma fazenda (nome repetido vira uma entrada só)
   Script comum (sem módulos): registra globalThis.SMA_MAPAS_NOMES — usado pela página e pelo servidor.
   ========================================================================== */

(() => {
  const semAcento = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ENTIDADES = { '&#39;': "'", '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#039;': "'" };
  // "SÃ£o" (UTF-8 lido como Latin-1) → "São"
  // (o Drive às vezes entrega o "Ã" decomposto, A + til: por isso normaliza antes)
  function corrigirAcentos(t) {
    return String(t).normalize('NFC').replace(/[ÂÃ][\u0080-¿]/g, m => { try { return decodeURIComponent(escape(m)); } catch { return m; } });
  }
  const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd']);
  const ROMANOS = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i;
  function titulo(t) {
    if (/[a-zà-ú]/.test(t)) return t;   // já tem minúsculas: mantém como veio
    return t.toLowerCase().split(/(\s+|-|')/).map((p, i) => {
      if (ROMANOS.test(p)) return p.toUpperCase();
      if (i > 0 && MINUSCULAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    }).join('');
  }

  function analisar(arquivo) {
    let s = corrigirAcentos(String(arquivo || '').replace(/&#?\w+;/g, m => ENTIDADES[m] || m)).replace(/\.pdf$/i, '').replace(/\s+/g, ' ').trim();
    const original = s;
    let talhao = '', codigo = '', tipo = '';
    // código da fazenda: (S-G12B ) / (F-F473)
    s = s.replace(/\(\s*([SF]-[A-Z0-9]+)\s*\)/i, (_, c) => { codigo = c.toUpperCase(); return ' '; });
    // talhão no começo ("S2A9 - ", "S7B9 -") ou no fim ("... S2AV")
    s = s.replace(/^(S\d[A-Z0-9]{2,3})\s*-\s*/i, (_, c) => { talhao = c.toUpperCase(); return ''; });
    s = s.replace(/^Fa[nz]+enda\s+/i, '').replace(/^Faz[_\s]+/i, '');
    s = s.replace(/\s+(S\d[A-Z0-9]{2})\b(?=\s|$|\()/i, (_, c) => { talhao ||= c.toUpperCase(); return ' '; });
    if (/^(S\d[A-Z0-9]{2})\b/i.test(s.trim())) { talhao ||= s.trim().slice(0, 4).toUpperCase(); s = s.trim().slice(4); }
    s = s.replace(/^[\s_-]+/, '');
    // tipo do mapa
    const mt = s.match(/silvi[a-z]*ltura|silvicultura|colheita|corte/i);
    if (mt) tipo = /colheita/i.test(mt[0]) ? 'Colheita' : /corte/i.test(mt[0]) ? 'Corte' : 'Silvicultura';
    // o nome é o que vem antes do tipo; o resto vira detalhe (P1, A3, Estrada…)
    let [nome, ...resto] = s.split(/[_\s]*-?\s*(?:silvi[a-z]*ltura|silvicultura|colheita|corte)(?![a-z])/i);
    let detalhe = resto.join(' ');
    nome = nome.replace(/_/g, ' ');
    // sufixos de sistema: " SP2_040543", "_035921", cópias "(1)", "-1"
    nome = nome.replace(/\s*SP\d+\s*\d*$/i, '').replace(/\s*\d{5,}$/, '');
    detalhe = detalhe.replace(/\(\d+\)/g, ' ').replace(/^[\s_-]+|[\s_-]+$/g, '').replace(/_/g, ' ');
    nome = nome.replace(/\(\d+\)/g, ' ').replace(/-\d+$/, '').replace(/\s+/g, ' ').trim().replace(/[\s_-]+$/, '');
    // " - VC", " - SP6": parte curta depois do traço é variação, não nome
    const curto = nome.match(/^(.*\S)\s+-\s+([A-Z0-9]{1,4})$/);
    if (curto) { nome = curto[1]; detalhe = [curto[2], detalhe].filter(Boolean).join(' '); }
    detalhe = detalhe.replace(/\b\d{1,2}[.,]\d{1,2}[.,]\d{2,4}\b/g, '').replace(/\s+/g, ' ').trim();
    if (/^\d{1,2}$/.test(detalhe)) detalhe = '';   // "-1" de cópia
    detalhe = detalhe.replace(/^mapa\b/i, 'Mapa');
    if (!nome) return { nome: talhao || original, codigo, talhao, tipo, detalhe };   // só o código: fica em maiúsculas
    return { nome: titulo(nome), codigo, talhao, tipo, detalhe };
  }

  const chave = nome => semAcento(nome).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const acentos = t => (t.normalize('NFD').match(/[̀-ͯ]/g) || []).length;

  // arquivos: [{ id, nome }] → fazendas: [{ chave, nome, codigos, talhoes, mapas: [{ id, arquivo, rotulo }] }]
  function agrupar(arquivos) {
    const grupos = new Map();
    for (const a of arquivos) {
      const x = analisar(a.nome);
      const k = chave(x.nome);
      const g = grupos.get(k) || grupos.set(k, { chave: k, nomes: new Map(), codigos: new Set(), talhoes: new Set(), mapas: [] }).get(k);
      g.nomes.set(x.nome, (g.nomes.get(x.nome) || 0) + 1);
      if (x.codigo) g.codigos.add(x.codigo);
      if (x.talhao) g.talhoes.add(x.talhao);
      g.mapas.push({ id: a.id, arquivo: corrigirAcentos(String(a.nome).replace(/&#?\w+;/g, m => ENTIDADES[m] || m)), tipo: x.tipo, detalhe: x.detalhe });
    }
    return [...grupos.values()].map(g => {
      // nome exibido: a grafia com mais acentos e com letras minúsculas (mais "bonita"), depois a mais frequente
      const nome = [...g.nomes.entries()].sort((a, b) => acentos(b[0]) - acentos(a[0]) || (/[a-z]/.test(b[0]) - /[a-z]/.test(a[0])) || b[1] - a[1])[0][0];
      const usados = new Map();
      const mapas = g.mapas.map(m => {
        let rotulo = [m.tipo, m.detalhe].filter(Boolean).join(' · ') || 'Mapa';
        const n = (usados.get(rotulo) || 0) + 1; usados.set(rotulo, n);
        return { ...m, rotulo: n > 1 ? `${rotulo} (${n})` : rotulo };
      }).sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));
      return { chave: g.chave, nome, codigos: [...g.codigos], talhoes: [...g.talhoes], mapas };
    }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  // Lista de arquivos da página pública "embeddedfolderview" do Google Drive
  function lerPastaDrive(html) {
    const lista = [];
    const re = /<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?flip-entry-title">([^<]*)</g;
    let m;
    while ((m = re.exec(html))) if (!/\/folders\//.test(m[2])) lista.push({ id: m[1], nome: m[3].trim() });
    return lista;
  }

  globalThis.SMA_MAPAS_NOMES = { analisar, agrupar, lerPastaDrive, chave };
})();
