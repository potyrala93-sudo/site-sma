/* ==========================================================================
   Vercel: uma única função atende toda a API do site (/api/...).
   As rotas são as mesmas do servidor local: api/_lib/rotas.mjs
   ========================================================================== */

import { tratarApi } from './_lib/rotas.mjs';

export default async function handler(req, res) {
  await tratarApi(req, res);
}
