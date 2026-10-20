/* ==========================================================================
   SMA Silvicultura — Clima nas Fazendas: cálculo (usado no servidor E no navegador)
   1) Coordenadas: corrige as que vieram sem a vírgula decimal ("-236.478" → -23.6478).
   2) Por fazenda: ponto central (média), município mais frequente e contorno (envoltória convexa).
   3) Fazendas próximas (mesma célula da grade) dividem um ponto de previsão (limite gratuito do Open-Meteo).
   4) Previsão hora a hora (7 dias para trás e 7 para frente) → dias, chuva, alertas e janela de aplicação.
   Limites em js/dados.js → CLIMA. Sem dependências: script comum (funciona até com a página aberta direto do arquivo);
   expõe globalThis.SMA_CLIMA_MOTOR — no Node, basta importar o arquivo.
   ========================================================================== */

(() => {
const API = 'https://api.open-meteo.com/v1/forecast';
const HORARIAS = ['temperature_2m', 'relative_humidity_2m', 'precipitation', 'precipitation_probability', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'weather_code'];
const TZ = 'America/Sao_Paulo';

/* ---------- Planilha ---------- */
function lerCSV(texto) {
  const linhas = []; let linha = [], celula = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) { if (c === '"') { if (texto[i + 1] === '"') { celula += '"'; i++; } else aspas = false; } else celula += c; }
    else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(celula); celula = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; linha.push(celula); linhas.push(linha); linha = []; celula = ''; }
    else celula += c;
  }
  if (celula || linha.length) { linha.push(celula); linhas.push(linha); }
  return linhas;
}
const chave = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// "-236.478" → -23.6478 (divide por 10 até cair na faixa); "-23,6478" já vem certo
function coordenada(texto, [min, max]) {
  const s = String(texto ?? '').trim();
  if (!s) return null;
  let v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(v) || v === 0) return null;
  for (let n = 0; (v < min || v > max) && n < 12; n++) v /= 10;
  return v >= min && v <= max ? v : null;
}

// Envoltória convexa (cadeia monótona) com pontos [lat, lon]
function envoltoria(pontos) {
  const p = [...new Map(pontos.map(([la, lo]) => [`${la.toFixed(5)},${lo.toFixed(5)}`, [lo, la]])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p.map(([lo, la]) => [la, lo]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const baixo = [], cima = [];
  for (const q of p) { while (baixo.length >= 2 && cruz(baixo.at(-2), baixo.at(-1), q) <= 0) baixo.pop(); baixo.push(q); }
  for (const q of [...p].reverse()) { while (cima.length >= 2 && cruz(cima.at(-2), cima.at(-1), q) <= 0) cima.pop(); cima.push(q); }
  return [...baixo.slice(0, -1), ...cima.slice(0, -1)].map(([lo, la]) => [+la.toFixed(5), +lo.toFixed(5)]);
}

function fazendasDoTexto(texto, CFG) {
  if (/^\s*</.test(texto)) throw new Error('a planilha não está pública');
  const linhas = lerCSV(texto);
  const iCab = linhas.findIndex(l => l.some(c => chave(c) === 'LATITUDE'));
  if (iCab < 0) throw new Error('cabeçalho com LATITUDE não encontrado');
  const cab = linhas[iCab].map(chave), col = n => cab.indexOf(n);
  const [cF, cLa, cLo, cM] = [col('FAZENDA'), col('LATITUDE'), col('LONGITUDE'), col('MUNICIPIO')];
  const porFazenda = new Map(), invalidos = [];
  for (const l of linhas.slice(iCab + 1)) {
    const nome = String(l[cF] ?? '').replace(/\s+/g, ' ').trim();
    if (!nome && !String(l[cLa] ?? '').trim()) continue;   // linha vazia
    const lat = coordenada(l[cLa], CFG.faixas.lat), lon = coordenada(l[cLo], CFG.faixas.lon);
    if (!nome || lat == null || lon == null) { invalidos.push({ fazenda: nome || '(sem nome)', latitude: l[cLa], longitude: l[cLo] }); continue; }
    const f = porFazenda.get(nome) || porFazenda.set(nome, { pontos: [], municipios: new Map() }).get(nome);
    f.pontos.push([lat, lon]);
    const m = String(l[cM] ?? '').replace(/\s+/g, ' ').trim();
    if (m) f.municipios.set(m, (f.municipios.get(m) || 0) + 1);
  }
  const fazendas = [...porFazenda.entries()].map(([nome, f]) => {
    const lat = f.pontos.reduce((s, p) => s + p[0], 0) / f.pontos.length, lon = f.pontos.reduce((s, p) => s + p[1], 0) / f.pontos.length;
    return { nome, municipio: [...f.municipios.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '—', lat: +lat.toFixed(5), lon: +lon.toFixed(5), pontos: f.pontos.length, contorno: envoltoria(f.pontos) };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { fazendas, invalidos };
}

/* ---------- Tempo: utilidades ---------- */
const partesSP = (d = new Date()) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(p => [p.type, p.value]));
const agoraSP = () => { const p = partesSP(); return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.year}-${p.month}-${p.day}T${p.hour}:00` }; };
const somarDias = (dia, n) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function rotuloDia(dia, hoje) {
  if (dia === hoje) return 'Hoje';
  if (dia === somarDias(hoje, 1)) return 'Amanhã';
  return `${DIAS_SEMANA[new Date(`${dia}T12:00:00Z`).getUTCDay()]} ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}
// Bulbo úmido (Stull, 2011) e Delta T = temperatura − bulbo úmido
function bulboUmido(t, ur) {
  return t * Math.atan(0.151977 * Math.sqrt(ur + 8.313659)) + Math.atan(t + ur) - Math.atan(ur - 1.676331) + 0.00391838 * ur ** 1.5 * Math.atan(0.023101 * ur) - 4.686035;
}
const r1 = v => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);

/* ---------- Janela de aplicação hora a hora: 0 = ideal, 1 = atenção, 2 = não aplicar ---------- */
function janelas(h, J) {
  const n = h.time.length, status = new Array(n), deltaT = new Array(n), motivo = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = h.temperature_2m[i], ur = h.relative_humidity_2m[i], v = h.wind_speed_10m[i], g = h.wind_gusts_10m[i];
    if ([t, ur, v].some(x => x == null)) { status[i] = null; continue; }
    const dT = t - bulboUmido(t, ur); deltaT[i] = r1(dT);
    let chuva = false, prob = 0;
    for (let k = i; k < Math.min(n, i + J.horasChuva); k++) { if ((h.precipitation[k] || 0) >= J.chuvaMinMm) chuva = true; prob = Math.max(prob, h.precipitation_probability[k] || 0); }
    const N = J.naoAplicar, I = J.ideal, m = [];
    if (v >= N.ventoMax) m.push('vento forte'); if (v < N.ventoMin) m.push('vento fraco (inversão térmica)');
    if (chuva) m.push(`chuva nas próximas ${J.horasChuva} h`); if (t >= N.tempMax) m.push('calor');
    if (ur < N.umidadeMin) m.push('ar seco'); if (dT > N.deltaTMax) m.push('Delta T alto');
    if (m.length) { status[i] = 2; motivo[i] = m.join(', '); continue; }
    const ideal = v >= I.ventoMin && v <= I.ventoMax && (g ?? 0) < I.rajadaMax && prob < I.probChuvaMax && t < I.tempMax && ur > I.umidadeMin && dT >= I.deltaTMin && dT <= I.deltaTMax;
    status[i] = ideal ? 0 : 1;
    if (!ideal) {
      const a = [];
      if (v > I.ventoMax) a.push('vento acima do ideal'); if ((g ?? 0) >= I.rajadaMax) a.push('rajadas'); if (prob >= I.probChuvaMax) a.push('chance de chuva');
      if (t >= I.tempMax) a.push('temperatura alta'); if (ur <= I.umidadeMin) a.push('umidade baixa'); if (dT < I.deltaTMin) a.push('Delta T baixo'); if (dT > I.deltaTMax) a.push('Delta T alto');
      motivo[i] = a.join(', ');
    }
  }
  return { status, deltaT, motivo };
}

/* ---------- Resumo de um ponto de previsão ---------- */
// nDias: 7 no painel geral; até 16 na previsão estendida de um ponto (Programação)
function resumir(h, CFG, nDias = 7) {
  const { dia: hoje, hora } = agoraSP();
  const J = CFG.janela, A = CFG.alertas;
  const { status, deltaT, motivo } = janelas(h, J);
  let iAgora = h.time.indexOf(hora);
  if (iAgora < 0) iAgora = Math.max(0, h.time.findIndex(t => t > hora) - 1);
  const v = (k, i) => h[k][i];
  const agora = {
    hora: h.time[iAgora], t: r1(v('temperature_2m', iAgora)), ur: v('relative_humidity_2m', iAgora), vento: r1(v('wind_speed_10m', iAgora)), rajada: r1(v('wind_gusts_10m', iAgora)),
    direcao: v('wind_direction_10m', iAgora), chuva: r1(v('precipitation', iAgora)), codigo: v('weather_code', iAgora), status: status[iAgora], deltaT: deltaT[iAgora], motivo: motivo[iAgora] || ''
  };
  // Dias (de hoje a +nDias−1) e chuva dos últimos 7 dias
  const porDia = new Map();
  h.time.forEach((t, i) => { const d = t.slice(0, 10); (porDia.get(d) || porDia.set(d, []).get(d)).push(i); });
  const dias = [];
  for (let k = 0; k < nDias; k++) {
    const d = somarDias(hoje, k), ix = porDia.get(d); if (!ix) continue;
    const vals = key => ix.map(i => h[key][i]).filter(x => x != null);
    const soma = a => a.reduce((s, x) => s + x, 0), max = a => (a.length ? Math.max(...a) : null), min = a => (a.length ? Math.min(...a) : null);
    const ideais = ix.filter(i => status[i] === 0 && +h.time[i].slice(11, 13) >= 6 && +h.time[i].slice(11, 13) <= 18).length;   // horas boas de dia (6h–18h)
    dias.push({ data: d, rotulo: rotuloDia(d, hoje), ideais, tmax: r1(max(vals('temperature_2m'))), tmin: r1(min(vals('temperature_2m'))), chuva: r1(soma(vals('precipitation'))), prob: max(vals('precipitation_probability')), vento: r1(max(vals('wind_speed_10m'))), rajada: r1(max(vals('wind_gusts_10m'))), codigo: max(vals('weather_code')) });
  }
  const passada = [...porDia.entries()].filter(([d]) => d < hoje && d >= somarDias(hoje, -7)).flatMap(([, ix]) => ix).reduce((s, i) => s + (h.precipitation[i] || 0), 0);
  // Próxima janela boa: primeira sequência de horas ideais (a partir de agora)
  let proxima = null;
  for (let i = iAgora; i < status.length && !proxima; i++) {
    if (status[i] !== 0) continue;
    let f = i; while (f + 1 < status.length && status[f + 1] === 0) f++;
    if (f - i + 1 >= J.janelaMinHoras) {
      const di = h.time[i].slice(0, 10), fim = h.time[Math.min(f + 1, h.time.length - 1)];
      proxima = { inicio: h.time[i], fim: h.time[f] , horas: f - i + 1, rotulo: `${rotuloDia(di, hoje)} ${h.time[i].slice(11, 13)}h–${(f + 1 < h.time.length ? fim : h.time[f]).slice(11, 13)}h`, agora: i === iAgora };
    }
    i = f;
  }
  const alertas = [];
  dias.forEach(d => {
    if (d.chuva > A.chuvaDiaMm) alertas.push({ tipo: 'chuva', texto: `Chuva forte ${d.rotulo.toLowerCase()} (${d.chuva} mm)` });
    if (d.rajada > A.rajadaKmh) alertas.push({ tipo: 'vento', texto: `Rajadas de ${Math.round(d.rajada)} km/h ${d.rotulo.toLowerCase()}` });
    if (d.tmax > A.tempMax) alertas.push({ tipo: 'calor', texto: `Calor de ${d.tmax} °C ${d.rotulo.toLowerCase()}` });
    if (d.tmin != null && d.tmin < A.geadaMin) alertas.push({ tipo: 'geada', texto: `Risco de geada ${d.rotulo.toLowerCase()} (mín. ${d.tmin} °C)` });
  });
  return {
    agora, dias, proximaJanela: proxima, alertas,
    chuvaHoje: dias[0]?.chuva ?? null, chuvaAmanha: dias[1]?.chuva ?? null, chuva7d: r1(dias.reduce((s, d) => s + (d.chuva || 0), 0)), chuvaPassada7d: r1(passada),
    rajadaHoje: dias[0]?.rajada ?? null
  };
}

// Hora a hora de hoje (desde 00h) até o fim do 7º dia: o gráfico usa as 24 h a partir de "agora" (iAgora)
// e cada card de dia abre as horas daquele dia
function horaAHora(h, CFG, nDias = 7) {
  const { dia: hoje, hora } = agoraSP();
  const { status, deltaT, motivo } = janelas(h, CFG.janela);
  const fim = somarDias(hoje, nDias);
  const ix = h.time.map((t, i) => (t >= hoje && t < fim ? i : -1)).filter(i => i >= 0);
  const col = k => ix.map(i => h[k][i]);
  const horas = col('time');
  let iAgora = horas.indexOf(hora); if (iAgora < 0) iAgora = Math.max(0, horas.findIndex(t => t > hora) - 1);
  return { iAgora, horas, t: col('temperature_2m'), ur: col('relative_humidity_2m'), chuva: col('precipitation'), prob: col('precipitation_probability'), vento: col('wind_speed_10m'), rajada: col('wind_gusts_10m'), direcao: col('wind_direction_10m'), codigo: col('weather_code'), status: ix.map(i => status[i]), deltaT: ix.map(i => deltaT[i]), motivo: ix.map(i => motivo[i] || '') };
}

/* ---------- Tempo pelo código WMO: [ícone, descrição] ---------- */
function tempo(c) {
  if (c == null) return ['❔', 'Sem dado'];
  if (c === 0) return ['☀️', 'Céu limpo']; if (c === 1) return ['🌤️', 'Predomínio de sol']; if (c === 2) return ['⛅', 'Parcialmente nublado']; if (c === 3) return ['☁️', 'Nublado'];
  if (c === 45 || c === 48) return ['🌫️', 'Nevoeiro'];
  if (c >= 51 && c <= 55) return ['🌦️', c === 55 ? 'Garoa forte' : 'Garoa']; if (c === 56 || c === 57) return ['🌧️', 'Garoa congelante'];
  if (c === 61) return ['🌧️', 'Chuva fraca']; if (c === 63) return ['🌧️', 'Chuva moderada']; if (c === 65) return ['🌧️', 'Chuva forte']; if (c === 66 || c === 67) return ['🌧️', 'Chuva congelante'];
  if (c >= 71 && c <= 77) return ['🌨️', 'Neve']; if (c === 80) return ['🌦️', 'Pancadas fracas']; if (c === 81) return ['🌧️', 'Pancadas de chuva']; if (c === 82) return ['⛈️', 'Pancadas fortes'];
  if (c === 85 || c === 86) return ['🌨️', 'Pancadas de neve']; if (c === 95) return ['⛈️', 'Trovoadas']; if (c >= 96) return ['⛈️', 'Trovoadas com granizo'];
  return ['🌥️', 'Variável'];
}

/* ---------- Open-Meteo ---------- */
// Lotes de até 25 pontos baixados ao mesmo tempo (no servidor da Vercel, um lote grande por vez passava do tempo).
// Um lote que falhar é tentado de novo; se falhar outra vez, só os pontos dele ficam sem previsão.
async function previsao(pontos, { tamanho = 25, prazo = 25_000, dias = 7 } = {}) {
  const baixar = async lote => {
    const url = `${API}?latitude=${lote.map(p => p.lat.toFixed(4)).join(',')}&longitude=${lote.map(p => p.lon.toFixed(4)).join(',')}&hourly=${HORARIAS.join(',')}&timezone=${encodeURIComponent(TZ)}&forecast_days=${dias}&past_days=7&wind_speed_unit=kmh`;
    for (let tentativa = 1; ; tentativa++) {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(prazo) });
        const texto = await r.text();
        let j = null; try { j = JSON.parse(texto); } catch { /* corpo incompleto */ }
        if (!r.ok || !j || j.error) throw new Error(j?.reason || `Open-Meteo respondeu ${r.status}${j ? '' : ' (resposta incompleta)'}`);
        return (Array.isArray(j) ? j : [j]).map(x => x.hourly);
      } catch (erro) {
        if (tentativa >= 2) { console.error('Clima: lote sem previsão —', erro.message); return lote.map(() => null); }
      }
    }
  };
  const lotes = [];
  for (let i = 0; i < pontos.length; i += tamanho) lotes.push(pontos.slice(i, i + tamanho));
  const res = await Promise.all(lotes.map(baixar));
  const saida = res.flat();
  if (saida.every(h => !h)) throw new Error('o Open-Meteo não respondeu');
  return saida;
}


/* ---------- Montagem do resumo de todas as fazendas ---------- */
async function montarResumo(texto, CFG, guardarHoraria = () => {}) {
  const { fazendas, invalidos } = fazendasDoTexto(texto, CFG);
  const g = CFG.gradeGraus, celulas = new Map();
  fazendas.forEach(f => {
    const k = `${Math.round(f.lat / g)}|${Math.round(f.lon / g)}`;
    (celulas.get(k) || celulas.set(k, { fazendas: [] }).get(k)).fazendas.push(f);
  });
  const pontos = [...celulas.values()].map(c => {
    const lat = c.fazendas.reduce((s, f) => s + f.lat, 0) / c.fazendas.length, lon = c.fazendas.reduce((s, f) => s + f.lon, 0) / c.fazendas.length;
    const id = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    c.fazendas.forEach(f => { f.ponto = id; });
    return { id, lat, lon };
  });
  const hs = await previsao(pontos);
  const quando = Date.now(), resumos = {};
  pontos.forEach((p, i) => { if (!hs[i]) return; guardarHoraria(p.id, hs[i]); resumos[p.id] = resumir(hs[i], CFG); });
  return {
    atualizado: new Date(quando).toISOString(), fonte: 'Open-Meteo', grade: g,
    invalidos: { qtd: invalidos.length, exemplos: invalidos.slice(0, 20) },
    semPrevisao: pontos.filter((_, i) => !hs[i]).length,
    fazendas, pontos: resumos
  };
}

/* ---------- Detalhe de um ponto (hora a hora, 7 dias) ---------- */
function pontoValido(id, CFG) {
  const m = /^(-?\d{1,2}\.\d{1,4}),(-?\d{1,3}\.\d{1,4})$/.exec(id || '');
  if (!m) return null;
  const lat = +m[1], lon = +m[2];
  if (lat < CFG.faixas.lat[0] || lat > CFG.faixas.lat[1] || lon < CFG.faixas.lon[0] || lon > CFG.faixas.lon[1]) return null;
  return { lat, lon };
}
function montarDetalhe(id, hourly, CFG, quando = Date.now(), nDias = 7) {
  return { id, atualizado: new Date(quando).toISOString(), nDias, ...resumir(hourly, CFG, nDias), horas: horaAHora(hourly, CFG, nDias) };
}

  globalThis.SMA_CLIMA_MOTOR = { fazendasDoTexto, resumir, horaAHora, tempo, previsao, montarResumo, pontoValido, montarDetalhe };
})();
