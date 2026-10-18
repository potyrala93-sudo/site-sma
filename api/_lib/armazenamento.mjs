/* ==========================================================================
   SMA Silvicultura — onde ficam as programações, os experimentos e as fotos enviadas pelo painel
   - Com banco Redis da Upstash (Vercel → Storage → Upstash for Redis → Connect Project):
     a Vercel cria KV_REST_API_URL + KV_REST_API_TOKEN (aceita também com prefixo, ex.:
     SMA_KV_REST_API_URL, ou UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
   - No computador (npm start): arquivos server/dados/<nome>.json e a pasta das fotos.
   - Na Vercel sem banco: indisponível (o disco de lá não guarda nada) → o site usa o navegador.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const variavel = (...finais) => {
  for (const fim of finais) {
    if (process.env[fim]) return process.env[fim];
    const k = Object.keys(process.env).find(n => n.endsWith(`_${fim}`) && process.env[n]);
    if (k) return process.env[k];
  }
  return '';
};
const URL_REDIS = variavel('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const TOKEN_REDIS = variavel('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
export const TEM_BANCO = Boolean(URL_REDIS && TOKEN_REDIS);
export const ONDE_SALVA = TEM_BANCO ? 'banco' : process.env.VERCEL ? 'navegador' : 'arquivo';

export async function redis(comando) {
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
  if (TEM_BANCO) {
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

/* ---------- Fotos enviadas pelo painel, guardadas no banco (site publicado) ----------
   sma:fotos        → hash CHAPA → versão (data do envio)
   sma:foto:<CHAPA> → a foto em JPEG (base64) */
export const fotosNoBanco = {
  async listar() {
    const r = await redis(['HGETALL', 'sma:fotos']) || [];
    const lista = [];
    for (let i = 0; i < r.length; i += 2) lista.push({ nome: r[i], url: `api/colab-fotos/${encodeURIComponent(r[i])}?v=${r[i + 1]}` });
    return lista;
  },
  async ler(chapa) { const b64 = await redis(['GET', `sma:foto:${chapa}`]); return b64 ? Buffer.from(b64, 'base64') : null; },
  async gravar(chapa, bytes) {
    const v = Date.now();
    await redis(['SET', `sma:foto:${chapa}`, bytes.toString('base64')]);
    await redis(['HSET', 'sma:fotos', chapa, String(v)]);
    return `api/colab-fotos/${encodeURIComponent(chapa)}?v=${v}`;
  },
  async apagar(chapa) { await redis(['DEL', `sma:foto:${chapa}`]); await redis(['HDEL', 'sma:fotos', chapa]); }
};
