/* ==========================================================================
   Servidor LOCAL do site SMA Silvicultura ("npm start" → http://localhost:3000)
   - Serve os arquivos do site (index.html, css, js, assets...)
   - Atende a API (/api/...) com as mesmas rotas da Vercel: api/_lib/rotas.mjs
   - Mantém atualizada a lista de fotos dos colaboradores (assets/img/colaboradores/fotos.js)
   Na Vercel este arquivo não é usado: os arquivos são servidos por ela e a API roda em api/[...rota].js.
   ========================================================================== */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, MODELO, PASTA_COLAB, PASTA_AVATARES, tratarApi, json, gravarManifestoFotos, iaAtiva } from '../api/_lib/rotas.mjs';

const PORTA = Number(process.env.PORT) || 3000;

/* ---------- Arquivos estáticos do site ---------- */
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const BLOQUEADOS = /^(server|api|node_modules)(\/|$)|(^|\/)\.|^package(-lock)?\.json$|^vercel\.json$|\.(md|py|mjs)$/i;

function servirArquivo(req, res) {
  let caminho;
  try { caminho = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { return json(res, 400, { erro: 'URL inválida' }); }
  if (caminho.endsWith('/')) caminho += 'index.html';
  const relativo = path.posix.normalize(caminho).replace(/^\/+/, '');
  const absoluto = path.resolve(RAIZ, relativo);
  if (!absoluto.startsWith(RAIZ + path.sep) || BLOQUEADOS.test(relativo)) { res.writeHead(404); return res.end('Não encontrado'); }

  fs.stat(absoluto, (erro, info) => {
    if (erro || !info.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Não encontrado'); }
    res.writeHead(200, {
      'Content-Type': TIPOS[path.extname(absoluto).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': /\.(html|js|css)$/.test(absoluto) ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(absoluto).pipe(res);
  });
}

/* ---------- Lista de fotos sempre em dia (também vai para o GitHub e é usada na Vercel) ---------- */
try {
  const pastas = [PASTA_COLAB, path.join(PASTA_AVATARES, 'masculino'), path.join(PASTA_AVATARES, 'feminino')];
  for (const p of pastas) fs.mkdirSync(p, { recursive: true });
  gravarManifestoFotos();
  let espera;
  const vigiar = (_t, nome) => { if (nome === 'fotos.js') return; clearTimeout(espera); espera = setTimeout(() => gravarManifestoFotos(), 800); };
  pastas.forEach(p => fs.watch(p, vigiar));
} catch { /* sem vigiar a pasta */ }

/* ---------- Servidor ---------- */
const servidor = http.createServer((req, res) => {
  if (tratarApi(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { erro: 'Método não permitido.' });
  servirArquivo(req, res);
});

servidor.listen(PORTA, () => {
  console.log(`🌱 Site SMA + Folhito rodando em http://localhost:${PORTA}`);
  console.log(iaAtiva() ? `   IA ativa (modelo ${MODELO}).` : '   IA desligada: defina ANTHROPIC_API_KEY no arquivo .env para ativar. O Folhito funciona no modo guia.');
});
