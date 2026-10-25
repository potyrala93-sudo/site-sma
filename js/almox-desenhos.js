/* =========================================================
   Desenhos dos produtos (usados quando o produto ainda não tem foto)
   Traço branco sobre a cor da categoria. viewBox 0 0 64 64.
   ========================================================= */
(function () {
  'use strict';
  const D = {
    bota: '<path d="M22 8h14v28l11 5c3.5 1.6 5 4 5 7.5V52H18V10a2 2 0 0 1 2-2z"/><path d="M18 46h34M22 16h14M22 24h14"/>',
    botina: '<path d="M20 20h14v14l12 5c3.5 1.4 5 3.8 5 7V52H18V22a2 2 0 0 1 2-2z"/><path d="M18 46h33M26 24l6 2M26 29l6 2"/>',
    calca: '<path d="M20 8h24l3 46H37l-5-28-5 28H17z"/><path d="M20 15h24M32 15v8"/>',
    camisa: '<path d="M25 9l7 6 7-6 11 6 5 17-7 2-3-9v30H19V25l-3 9-7-2 5-17z"/><path d="M32 15v39"/><circle cx="35" cy="24" r="1" fill="#fff"/><circle cx="35" cy="33" r="1" fill="#fff"/><circle cx="35" cy="42" r="1" fill="#fff"/>',
    camiseta: '<path d="M24 10l8 5 8-5 13 8-5 9-6-3v30H22V24l-6 3-5-9z"/><path d="M27 12c1.5 3 3 4 5 4s3.5-1 5-4"/>',
    camisetaml: '<path d="M25 9l7 5 7-5 11 6 5 18-7 2-3-10v29H19V25l-3 10-7-2 5-18z"/><path d="M19 38h26M19 44h26"/>',
    polo: '<path d="M24 10l8 6 8-6 13 8-5 9-6-3v30H22V24l-6 3-5-9z"/><path d="M28 10l4 8 4-8M32 18v8"/>',
    jaqueta: '<path d="M22 9l10 4 10-4 9 6 5 20-7 2-3-10v27H18V27l-3 10-7-2 5-20z"/><path d="M32 13v41M27 30h-5M42 30h-5"/>',
    meia: '<path d="M25 8h13v28l8 8c3 3 3 7.5 0 10.5s-7.5 3-10.5 0L25 43z"/><path d="M25 15h13"/>',
    bone: '<path d="M12 40c0-12 9-21 20-21s20 9 20 21z"/><path d="M32 40h22c0 3-3 5-6 5H32M32 19v21"/>',
    chapeu: '<path d="M20 36c0-11 5-18 12-18s12 7 12 18"/><ellipse cx="32" cy="38" rx="24" ry="6"/><path d="M21 31h22"/>',
    touca: '<path d="M14 40c0-13 8-23 18-23s18 10 18 23z"/><rect x="12" y="40" width="40" height="8" rx="3"/><circle cx="32" cy="13" r="3"/>',
    colete: '<path d="M23 8l9 12 9-12 9 6v40H39V30H25v24H14V14z"/><path d="M14 38h11M39 38h11M14 44h11M39 44h11"/>',
    avental: '<path d="M25 8h14v9l10 5v32H15V22l10-5z"/><path d="M25 8c-3 0-6 1-7 3M39 8c3 0 6 1 7 3"/><rect x="24" y="34" width="16" height="10" rx="2"/>',
    luva: '<path d="M21 56V32l-4-9c-1-2.5 2-4.5 4-2.5l4 6V12c0-2 1.3-3 2.8-3s2.7 1 2.7 3v14V9c0-2 1.3-3 2.8-3s2.7 1 2.7 3v17-14c0-2 1.3-3 2.7-3s2.8 1 2.8 3v16-10c0-2 1.3-3 2.7-3s2.8 1 2.8 3v20c0 9-5 15-13 15z"/><path d="M21 49h22"/>',
    oculos: '<path d="M6 28h22v10a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7zM36 28h22v10a7 7 0 0 1-7 7h-8a7 7 0 0 1-7-7z"/><path d="M28 31h8M6 28l-2-6M58 28l2-6"/>',
    respirador: '<path d="M12 27c7-10 33-10 40 0v9c0 11-9 18-20 18s-20-7-20-18z"/><circle cx="22" cy="39" r="5"/><circle cx="42" cy="39" r="5"/><path d="M12 27l-4-7M52 27l4-7"/>',
    abafador: '<path d="M14 36V30a18 18 0 0 1 36 0v6"/><rect x="8" y="34" width="12" height="18" rx="5"/><rect x="44" y="34" width="12" height="18" rx="5"/>',
    plug: '<path d="M18 46c-5-5-5-13 0-18l8 8c-2 3-5 6-8 10zM46 46c5-5 5-13 0-18l-8 8c2 3 5 6 8 10z"/><path d="M26 36c2 6 10 6 12 0"/>',
    capacete: '<path d="M10 42c0-14 10-25 22-25s22 11 22 25z"/><path d="M6 42h52v6H6zM32 17v10M24 20l2 8M40 20l-2 8"/>',
    viseira: '<path d="M14 22c0-7 8-12 18-12s18 5 18 12"/><path d="M12 22h40v6l-4 22c-1 3-3 5-6 5H22c-3 0-5-2-6-5l-4-22z"/><path d="M20 32h24"/>',
    perneira: '<path d="M22 6h20c2 0 3 1 3 3v40c0 5-6 9-13 9s-13-4-13-9V9c0-2 1-3 3-3z"/><path d="M19 18h26M19 32h26M19 46h26"/>',
    capa: '<path d="M32 6c-7 0-12 5-12 12v4L10 54h44L44 22v-4c0-7-5-12-12-12z"/><path d="M24 20c2 3 5 4 8 4s6-1 8-4M32 24v30"/>',
    capuz: '<path d="M32 6C20 6 12 16 12 30v24h40V30C52 16 44 6 32 6z"/><path d="M22 32c0-7 4-12 10-12s10 5 10 12v6c0 4-4 7-10 7s-10-3-10-7z"/>',
    protetor: '<path d="M24 14h16l3 38c0 2-1 4-4 4H25c-3 0-4-2-4-4z"/><rect x="26" y="6" width="12" height="8" rx="2"/><path d="M27 30l5-6 5 6c2 3 0 7-5 7s-7-4-5-7z"/>',
    bolsa: '<rect x="10" y="22" width="44" height="32" rx="5"/><path d="M24 22v-6c0-3 2-5 5-5h6c3 0 5 2 5 5v6M10 34h44"/>',
    papel: '<ellipse cx="24" cy="20" rx="12" ry="6"/><path d="M12 20v26c0 3.3 5.4 6 12 6h28V20H36"/><ellipse cx="24" cy="20" rx="4" ry="2"/>',
    sabonete: '<rect x="12" y="30" width="34" height="18" rx="9"/><circle cx="46" cy="18" r="6"/><circle cx="34" cy="16" r="3.5"/><circle cx="54" cy="30" r="3"/>',
    frasco: '<path d="M24 22h16v28c0 3-2 5-5 5h-6c-3 0-5-2-5-5z"/><path d="M27 22v-6h10v6M37 13h8l-2 5M28 34h8"/>',
    pano: '<path d="M10 18c8-4 14 4 22 0s14-4 22 0v28c-8 4-14-4-22 0s-14 4-22 0z"/><path d="M10 30c8-4 14 4 22 0s14-4 22 0"/>',
    saco: '<path d="M18 24c-4 6-6 14-6 20 0 7 6 12 20 12s20-5 20-12c0-6-2-14-6-20z"/><path d="M18 24c4 2 9 3 14 3s10-1 14-3M26 24l-4-12M38 24l4-12M22 12c3 3 6 4 10 4s7-1 10-4"/>',
    suporte: '<rect x="14" y="10" width="36" height="36" rx="5"/><path d="M14 22h36M28 46v6h8v-6"/><circle cx="32" cy="34" r="4"/>',
    bebida: '<path d="M18 10h28l-3 44H21z"/><path d="M18 10l3-4h22l3 4M20 24h24"/><path d="M28 34l4-6 4 6c1.5 2.5 0 5-4 5s-5.5-2.5-4-5z"/>',
    garrafa: '<rect x="20" y="16" width="24" height="40" rx="6"/><path d="M24 16v-6h16v6M44 24h4c2 0 3 1 3 3v12c0 2-1 3-3 3h-4M20 28h24"/>',
    torneira: '<path d="M10 22h24c5 0 9 4 9 9v7"/><path d="M10 16v12M26 22v-8M20 14h12"/><path d="M43 44c-2 3-2 5 0 6s3-1 1-6"/>',
    copo: '<path d="M18 12h28l-4 42H22z"/><path d="M19 22h26M20 32h24"/>',
    toalha: '<path d="M10 16h44v8c0 4-2 6-5 6H15c-3 0-5-2-5-6z"/><path d="M14 30l-2 24M50 30l2 24M22 30v14M32 30v18M42 30v14"/>',
    balanca: '<rect x="10" y="32" width="44" height="20" rx="4"/><path d="M14 32c0-8 8-14 18-14s18 6 18 14"/><rect x="24" y="38" width="16" height="8" rx="2"/>',
    kit: '<rect x="10" y="18" width="44" height="34" rx="5"/><path d="M24 18v-6h16v6M32 26v18M23 35h18"/>',
    extintor: '<rect x="22" y="20" width="20" height="36" rx="8"/><path d="M28 20v-6h8v6M36 14h10l-2 8M32 10v4M22 34h20"/>',
    cadeado: '<rect x="14" y="28" width="36" height="26" rx="5"/><path d="M22 28v-8a10 10 0 0 1 20 0v8"/><circle cx="32" cy="39" r="3"/><path d="M32 42v5"/>',
    etiqueta: '<path d="M10 14h26l18 18-18 18H10z"/><circle cx="20" cy="32" r="4"/><path d="M30 26h10M30 38h10"/>',
    fita: '<circle cx="28" cy="32" r="18"/><circle cx="28" cy="32" r="7"/><path d="M28 50h26v-8H40"/><path d="M42 50l4-8M48 50l4-8"/>',
    fitacrepe: '<circle cx="32" cy="32" r="20"/><circle cx="32" cy="32" r="9"/><path d="M32 52h22"/>',
    balde: '<path d="M14 22h36l-5 32H19z"/><path d="M14 22c0-8 8-14 18-14s18 6 18 14M14 30h36"/>',
    lima: '<path d="M10 50l30-30M14 54l30-30"/><path d="M40 20l8-8 6 6-8 8M17 47l4-1M21 43l4-1M25 39l4-1M29 35l4-1"/>',
    oleo: '<path d="M14 26h26l8 8v20H14z"/><path d="M40 26l12-10 4 4-8 14M22 26v-6h10v6"/><path d="M26 40l3-5 3 5c1 2 0 4-3 4s-4-2-3-4z"/>',
    ferramenta: '<path d="M40 10a12 12 0 0 0-12 15L10 43l11 11 18-18a12 12 0 0 0 15-12l-7 7-7-2-2-7z"/>',
    bomba: '<rect x="16" y="14" width="26" height="38" rx="6"/><path d="M42 24h8v18M50 42l6 10M22 14v-4h14v4M16 30h26"/>',
    cinta: '<path d="M6 26h52M6 38h52"/><rect x="24" y="20" width="16" height="24" rx="3"/><path d="M28 28h8M28 33h8"/>',
    tacografo: '<circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="4"/><path d="M32 10v6M32 48v6M10 32h6M48 32h6M17 17l4 4M43 43l4 4M47 17l-4 4M21 43l-4 4M32 32l10-8"/>',
    radio: '<rect x="18" y="18" width="28" height="38" rx="5"/><path d="M24 18V6M24 26h16M24 32h16M24 38h16"/><circle cx="32" cy="47" r="3"/>',
    caneta: '<path d="M44 8l12 12-28 28-14 4 4-14z"/><path d="M38 14l12 12M18 38l8 8"/>',
    caixa: '<path d="M8 22l24-12 24 12v24L32 58 8 46z"/><path d="M8 22l24 12 24-12M32 34v24M20 16l24 12"/>',
  };
  const CORES = {
    'Calçados': '#7a4f2c', 'Uniformes': '#2d5a4b', 'EPI': '#c25119', 'Higiene e limpeza': '#2a6a93',
    'Copa e hidratação': '#8a6a00', 'Primeiros socorros': '#b23b2a', 'Bloqueio e sinalização': '#47478a',
    'Ferramentas e máquinas': '#55605a', 'Embalagens e escritório': '#6a4c93', 'Outros': '#5f6b66',
  };
  window.ALMOX_DESENHOS = {
    lista: Object.keys(D),
    categorias: Object.keys(CORES),
    cor: (cat) => CORES[cat] || CORES.Outros,
    svg(icone, cat) {
      const corpo = D[icone] || D.caixa;
      return `<svg viewBox="0 0 64 64" role="img" aria-hidden="true" style="background:${CORES[cat] || CORES.Outros}"><circle cx="32" cy="34" r="27" fill="rgba(255,255,255,.08)"/><g fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${corpo}</g></svg>`;
    },
  };
})();
