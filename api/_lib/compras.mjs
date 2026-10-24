/* ==========================================================================
   SMA Silvicultura — Compras (App de Compras, banco Supabase)
   O banco só mostra os pedidos para quem entra com usuário e senha do app.
   O painel de Custos mostra tudo sem login: quem lê é o servidor, com a chave
   secreta do Supabase (COMPRAS_SUPABASE_KEY), que nunca vai para o navegador.
   Local: arquivo .env · Vercel: Settings → Environment Variables.
   ========================================================================== */

// Mesmo endereço do config.js do App de Compras (pode ser trocado por variável)
const URL_BANCO = (process.env.COMPRAS_SUPABASE_URL || 'https://rgexnevozabuccmbqghc.supabase.co').replace(/\/+$/, '');
const chave = () => process.env.COMPRAS_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const comprasConfigurado = () => Boolean(chave());

// Lê uma tabela inteira em páginas de 1000 linhas (limite do Supabase por resposta)
async function tabela(nome, select, ordem) {
  const k = chave();
  const cab = { apikey: k, Accept: 'application/json' };
  if (!k.startsWith('sb_')) cab.Authorization = `Bearer ${k}`;   // chaves antigas (JWT) também vão no Authorization
  const linhas = [];
  for (let ini = 0; ; ini += 1000) {
    const r = await fetch(`${URL_BANCO}/rest/v1/${nome}?select=${select}&order=${ordem}`, { headers: { ...cab, Range: `${ini}-${ini + 999}`, 'Range-Unit': 'items' }, signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`${nome}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    const parte = await r.json();
    linhas.push(...parte);
    if (parte.length < 1000) return linhas;
  }
}

// Guarda a última leitura por 1 minuto (várias pessoas abrindo a página não pesam no banco)
let cache = null;
export async function lerCompras(fresco = false) {
  if (!fresco && cache && Date.now() - cache.em < 60_000) return cache.dados;
  const [pedidos, perfis, eventos] = await Promise.all([
    tabela('pedidos', '*', 'criado_em.desc'),
    tabela('perfis', 'id,nome,cargo,cdc,foto_url', 'nome.asc'),
    tabela('pedido_eventos', '*', 'id.asc')
  ]);
  const dados = { pedidos, perfis, eventos, atualizado: new Date().toISOString() };
  cache = { em: Date.now(), dados };
  return dados;
}
