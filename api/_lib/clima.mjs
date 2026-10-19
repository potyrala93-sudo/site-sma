/* ==========================================================================
   SMA Silvicultura — Clima nas Fazendas (servidor)
   O cálculo fica em js/clima-motor.js (o mesmo que o navegador usa quando o servidor não responde).
   Aqui: baixar a planilha de coordenadas e guardar o resultado por 30 min — com o cache da rede da Vercel,
   o site inteiro faz no máximo uma consulta ao Open-Meteo por ponto a cada meia hora (limite gratuito).
   ========================================================================== */

import { montarResumo, previsao, pontoValido, montarDetalhe } from '../../js/clima-motor.js';

let cache = null;   // { quando, promessa }
const horarias = new Map();   // id do ponto → { quando, hourly }

async function textoDaPlanilha(CFG) {
  const r = await fetch(`https://docs.google.com/spreadsheets/d/${CFG.planilha}/export?format=csv&gid=${CFG.aba}`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`planilha respondeu ${r.status}`);
  return r.text();
}

export async function resumoClima(CFG, fresco = false) {
  const validade = CFG.cacheMin * 60_000;
  // "Atualizar previsão" só força nova consulta se o cache tiver mais de 5 minutos (protege o limite gratuito)
  if (!cache || Date.now() - cache.quando > validade || (fresco && Date.now() - cache.quando > 5 * 60_000)) {
    const promessa = textoDaPlanilha(CFG).then(texto => montarResumo(texto, CFG, (id, hourly) => horarias.set(id, { quando: Date.now(), hourly })));
    cache = { quando: Date.now(), promessa };
    promessa.catch(() => { if (cache?.promessa === promessa) cache = null; });
    // previsão incompleta (algum lote não respondeu): tenta de novo em 3 minutos em vez de 30
    promessa.then(d => { if (d.semPrevisao && cache?.promessa === promessa) cache.quando = Date.now() - validade + 3 * 60_000; }, () => {});
  }
  return cache.promessa;
}

export async function detalheClima(CFG, id) {
  const p = pontoValido(id, CFG);
  if (!p) throw Object.assign(new Error('ponto inválido'), { status: 400 });
  let h = horarias.get(id);
  if (!h || Date.now() - h.quando > CFG.cacheMin * 60_000) {
    const [hourly] = await previsao([p]);
    if (!hourly) throw Object.assign(new Error('o Open-Meteo não respondeu'), { status: 502 });
    h = { quando: Date.now(), hourly }; horarias.set(id, h);
  }
  return montarDetalhe(id, h.hourly, CFG, h.quando);
}
