/* ==========================================================================
   SMA · Silvicultura — Aviso de compras na Home
   Mostra um aviso pequeno quando há pedido atrasado ou emergencial esperando
   aprovação no App de Compras. Some ao fechar (até a próxima visita).
   ========================================================================== */

(async () => {
  try { if (sessionStorage.getItem('sma:compras:aviso-fechado')) return; } catch (_) {}
  let d;
  try {
    const r = await fetch('api/compras', { cache: 'no-store' });
    if (!r.ok) return;
    d = await r.json();
  } catch (_) { return; }

  const hoje = new Date().toLocaleDateString('sv-SE');
  const aberto = p => !['recebido', 'negado'].includes(p.etapa);
  const atrasados = d.pedidos.filter(p => aberto(p) && String(p.data_necessidade).slice(0, 10) < hoje).length;
  const emerg = d.pedidos.filter(p => p.tipo_pedido === 'Emergencial' && ['coordenador', 'analista'].includes(p.etapa)).length;
  if (!atrasados && !emerg) return;

  const partes = [
    atrasados && `<b>${atrasados}</b> ${atrasados === 1 ? 'pedido atrasado' : 'pedidos atrasados'}`,
    emerg && `<b>${emerg}</b> ${emerg === 1 ? 'emergencial esperando aprovação' : 'emergenciais esperando aprovação'}`
  ].filter(Boolean);
  const el = document.createElement('aside');
  el.className = 'c-aviso-home';
  el.setAttribute('role', 'status');
  el.innerHTML = `<i data-lucide="shopping-cart"></i>
    <a href="custos.html"><strong>Compras</strong><span>${partes.join(' · ')}</span><small>Ver em Custos →</small></a>
    <button type="button" aria-label="Fechar aviso"><i data-lucide="x"></i></button>`;
  el.querySelector('button').addEventListener('click', () => {
    el.remove();
    try { sessionStorage.setItem('sma:compras:aviso-fechado', '1'); } catch (_) {}
  });
  document.body.appendChild(el);
  window.lucide?.createIcons();
})();
