/* ==========================================================================
   SMA · Silvicultura — Estoque: botões para escolher Insumos ou Almoxarifado
   A escolha fica no endereço (#insumos / #almoxarifado) e é lembrada.
   ========================================================================== */
(() => {
  const abas = [...document.querySelectorAll('.est-aba')];
  if (!abas.length) return;
  const painel = b => document.getElementById(b.getAttribute('aria-controls'));
  const nomes = abas.map(b => b.dataset.aba);

  function mostrar(nome, foco) {
    if (!nomes.includes(nome)) nome = nomes[0];
    abas.forEach(b => {
      const ativo = b.dataset.aba === nome;
      b.setAttribute('aria-selected', String(ativo));
      b.tabIndex = ativo ? 0 : -1;
      painel(b).hidden = !ativo;
      if (ativo && foco) b.focus();
    });
    try { localStorage.setItem('sma:estoque:aba', nome); } catch (_) {}
    if (location.hash.slice(1) !== nome) history.replaceState(null, '', '#' + nome);
    window.lucide?.createIcons();
  }

  abas.forEach((b, i) => {
    b.addEventListener('click', () => mostrar(b.dataset.aba));
    b.addEventListener('keydown', e => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) { e.preventDefault(); mostrar(abas[(i + d + abas.length) % abas.length].dataset.aba, true); }
    });
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (nomes.includes(h)) mostrar(h); });

  // número de produtos com estoque em cada botão (lido dos resumos das tabelas)
  const contar = (resumo, alvo) => {
    const r = document.getElementById(resumo), a = document.getElementById(alvo);
    if (!r || !a) return;
    const atualizar = () => { const m = r.textContent.match(/^(\d+)/); a.textContent = m ? m[1] : ''; };
    new MutationObserver(atualizar).observe(r, { childList: true, characterData: true, subtree: true });
    atualizar();
  };
  contar('e-resumo', 'aba-insumos-n');
  contar('a-resumo', 'aba-almox-n');

  let inicial = location.hash.slice(1);
  if (!nomes.includes(inicial)) { try { inicial = localStorage.getItem('sma:estoque:aba') || ''; } catch (_) { inicial = ''; } }
  mostrar(inicial);
})();
