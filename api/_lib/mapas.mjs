/* ==========================================================================
   SMA Silvicultura — Mapas micro (servidor)
   Lê a pasta pública do Google Drive (página "embeddedfolderview") e devolve a lista de PDFs.
   Os nomes das fazendas são montados no navegador (js/mapas-nomes.js, o mesmo usado aqui para validar).
   No computador, também grava js/mapas-lista.js: a lista fica no site mesmo sem servidor.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../js/mapas-nomes.js';   // script comum: registra globalThis.SMA_MAPAS_NOMES

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { lerPastaDrive } = globalThis.SMA_MAPAS_NOMES;
let cache = null;   // { quando, promessa }

async function baixar(CFG) {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(CFG.pasta)}`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`Google Drive respondeu ${r.status}`);
  const arquivos = lerPastaDrive(await r.text());
  if (!arquivos.length) throw new Error('a pasta veio vazia ou não está compartilhada');
  const dados = { atualizado: new Date().toISOString(), arquivos };
  if (!process.env.VERCEL) {
    const conteudo = `/* Gerado automaticamente pelo servidor: lista dos mapas micro (pasta do Google Drive). */\nwindow.SMA_MAPAS_LISTA = ${JSON.stringify(dados, null, 1)};\n`;
    try { fs.writeFileSync(path.join(RAIZ, 'js', 'mapas-lista.js'), conteudo); } catch { /* só leitura */ }
  }
  return dados;
}

export function listaMapas(CFG, fresco = false) {
  const validade = (CFG.cacheMin || 30) * 60_000;
  if (!cache || Date.now() - cache.quando > validade || (fresco && Date.now() - cache.quando > 60_000)) {
    const promessa = baixar(CFG);
    cache = { quando: Date.now(), promessa };
    promessa.catch(() => { if (cache?.promessa === promessa) cache = null; });
  }
  return cache.promessa;
}
