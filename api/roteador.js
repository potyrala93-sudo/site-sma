/* ==========================================================================
   Vercel: porta de entrada de TODA a API (/api/...).
   O arquivo api/[...rota].js só recebia caminhos de um nível (/api/clima); os de dois ou mais
   (/api/experimento/status, /api/folhito, /api/clima/ponto/…) davam 404 na Vercel.
   O vercel.json reescreve /api/<caminho> → /api/roteador?__api=<caminho>; aqui o caminho original é
   remontado e as rotas são as mesmas do servidor local (api/_lib/rotas.mjs).
   ========================================================================== */

import { tratarApi, json } from './_lib/rotas.mjs';

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const caminho = url.searchParams.get('__api');
  if (caminho != null) {
    url.searchParams.delete('__api');
    const resto = url.searchParams.toString();
    req.url = `/api/${caminho.replace(/^\/+/, '')}${resto ? `?${resto}` : ''}`;
  }
  const tratou = await tratarApi(req, res);
  if (tratou === false && !res.headersSent) json(res, 404, { erro: 'Rota da API não encontrada.' });
}
