/* ==========================================================================
   SMA Silvicultura — arquivos do site guardados no Supabase (Storage)
   Usa o mesmo projeto e a mesma chave secreta do App de Compras (COMPRAS_SUPABASE_KEY),
   que já estão no .env e na Vercel. Cada coleção vira um arquivo JSON numa pasta
   privada "sma-site" (só o servidor do site lê e grava; o navegador nunca vê a chave).
   ========================================================================== */

const URL_BANCO = (process.env.COMPRAS_SUPABASE_URL || 'https://rgexnevozabuccmbqghc.supabase.co').replace(/\/+$/, '');
const chave = () => process.env.COMPRAS_SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PASTA = 'sma-site';
export const nuvemDisponivel = () => Boolean(chave());
const cabecalhos = (extra = {}) => ({ apikey: chave(), Authorization: `Bearer ${chave()}`, ...extra });

let pastaPronta = false;
async function garantirPasta() {
  if (pastaPronta) return;
  const r = await fetch(`${URL_BANCO}/storage/v1/bucket/${PASTA}`, { headers: cabecalhos(), signal: AbortSignal.timeout(15000) });
  if (!r.ok) {
    const c = await fetch(`${URL_BANCO}/storage/v1/bucket`, { method: 'POST', headers: cabecalhos({ 'Content-Type': 'application/json' }), body: JSON.stringify({ id: PASTA, name: PASTA, public: false }), signal: AbortSignal.timeout(15000) });
    const txt = await c.text();
    if (!c.ok && !/already exists|duplicate/i.test(txt)) throw new Error(`não consegui criar a pasta no Supabase (${c.status} ${txt.slice(0, 120)})`);
  }
  pastaPronta = true;
}

export function colecaoNuvem(nome) {
  const caminho = `${URL_BANCO}/storage/v1/object/${PASTA}/${encodeURIComponent(nome)}.json`;
  return {
    disponivel: nuvemDisponivel(),
    async ler() {
      const r = await fetch(`${caminho}?t=${Date.now()}`, { headers: cabecalhos({ 'Cache-Control': 'no-cache' }), signal: AbortSignal.timeout(15000) });
      if (r.status === 400 || r.status === 404) return [];   // ainda não existe
      if (!r.ok) throw new Error(`Supabase respondeu ${r.status}`);
      try { return await r.json(); } catch { return []; }
    },
    async gravar(lista) {
      await garantirPasta();
      const r = await fetch(caminho, { method: 'POST', headers: cabecalhos({ 'Content-Type': 'application/json', 'x-upsert': 'true', 'Cache-Control': 'no-cache' }), body: JSON.stringify(lista), signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`Supabase não gravou (${r.status} ${(await r.text()).slice(0, 120)})`);
    }
  };
}
