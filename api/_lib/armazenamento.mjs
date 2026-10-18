/* ==========================================================================
   SMA Silvicultura — onde ficam as programações e os experimentos salvos
   - Com banco Redis da Upstash (Vercel → Storage → Upstash for Redis): variáveis
     KV_REST_API_URL + KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
   - No computador (npm start): arquivos server/dados/<nome>.json.
   - Na Vercel sem banco: indisponível (o disco de lá não guarda nada) → o site usa o navegador.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const TOKEN_REDIS = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

async function redis(comando) {
  const r = await fetch(URL_REDIS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN_REDIS}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(comando),
    signal: AbortSignal.timeout(10_000)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `banco respondeu ${r.status}`);
  return j.result;
}

let filaGravacao = Promise.resolve();

export function colecao(nome) {
  if (URL_REDIS && TOKEN_REDIS) {
    const chave = `sma:${nome}`;
    return {
      disponivel: true,
      ler: async () => { const v = await redis(['GET', chave]); try { return v ? JSON.parse(v) : []; } catch { return []; } },
      gravar: lista => redis(['SET', chave, JSON.stringify(lista)])
    };
  }
  if (process.env.VERCEL) return { disponivel: false };

  const ARQ = path.join(RAIZ, 'server', 'dados', `${nome}.json`);
  return {
    disponivel: true,
    ler: async () => { try { return JSON.parse(fs.readFileSync(ARQ, 'utf8')); } catch { return []; } },
    // grava em fila e de forma atômica (arquivo temporário + renomear), para nunca corromper o arquivo
    gravar: lista => (filaGravacao = filaGravacao.then(() => {
      fs.mkdirSync(path.dirname(ARQ), { recursive: true });
      const tmp = ARQ + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(lista, null, 1));
      fs.renameSync(tmp, ARQ);
    }))
  };
}
