/* ==========================================================================
   SMA Silvicultura — motor de dados no servidor (para as consultas do Folhito)
   Roda os MESMOS arquivos do site (js/dados.js, js/planilhas.js, js/experimento-motor.js) num
   ambiente isolado do Node, com um "navegador" mínimo. Assim as regras de período (Ano · RF),
   atividades, supervisores etc. são exatamente as dos painéis.
   As planilhas são baixadas direto do Google (CSV) e reaproveitadas por alguns minutos.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ARQUIVOS = ['js/dados.js', 'js/planilhas.js', 'js/experimento-motor.js'];
const VALIDADE_MS = 5 * 60_000;

let contexto = null;
const cargas = new Map();   // grupo de planilha → { quando, promessa }

// Na Vercel, lê as planilhas pelo próprio site (/api/planilha), que fica em cache na rede da Vercel:
// a planilha grande de apontamentos não precisa ser baixada do Google a cada pergunta.
const DOMINIO = process.env.VERCEL_PROJECT_PRODUCTION_URL || '';

function criarContexto() {
  const memoria = new Map();
  const ctx = {
    console, AbortSignal, URL, URLSearchParams, TextDecoder, setTimeout, clearTimeout, Intl,
    fetch: (url, opcoes) => fetch(DOMINIO ? new URL(url, `https://${DOMINIO}/`) : url, opcoes),
    // sem domínio (computador): não usa o proxy e baixa o CSV direto do Google
    location: { protocol: DOMINIO ? 'https:' : 'node:' },
    localStorage: { getItem: k => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, String(v)), removeItem: k => memoria.delete(k) },
    document: { createElement() { throw new Error('sem navegador'); }, head: {} }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const a of ARQUIVOS) vm.runInContext(fs.readFileSync(path.join(RAIZ, a), 'utf8'), ctx, { filename: a });
  if (!ctx.SMA_EXPERIMENTO) throw new Error('motor de dados não carregou');
  return ctx;
}

/** Motor com as bases pedidas carregadas (cada planilha fica em memória por alguns minutos) */
export async function motor(bases = null) {
  contexto ||= criarContexto();
  const M = contexto.SMA_EXPERIMENTO;
  const pedidas = (bases || Object.keys(M.BASES)).filter(b => M.BASES[b]);
  const grupos = new Set(pedidas.map(b => M.GRUPO_DA_BASE[b]));
  if (grupos.has('pgo')) grupos.add('fat');
  const vencidos = [...grupos].filter(g => { const c = cargas.get(g); return !c || Date.now() - c.quando > VALIDADE_MS; });
  if (vencidos.length) {
    const basesDosGrupos = Object.keys(M.BASES).filter(b => vencidos.includes(M.GRUPO_DA_BASE[b]));
    const promessa = M.carregarBases(false, basesDosGrupos);
    vencidos.forEach(g => cargas.set(g, { quando: Date.now(), promessa }));
    promessa.catch(() => vencidos.forEach(g => cargas.delete(g)));
  }
  await Promise.all([...grupos].map(g => cargas.get(g)?.promessa));
  // uma planilha que falhou é tentada de novo na próxima pergunta
  pedidas.filter(b => M.erros[b]).forEach(b => cargas.delete(M.GRUPO_DA_BASE[b]));
  return M;
}
const quandoCarregou = bases => Math.min(...bases.map(b => cargas.get(contexto.SMA_EXPERIMENTO.GRUPO_DA_BASE[b])?.quando || Date.now()));

/** Começa a baixar as planilhas mais usadas antes da IA pedir (ganha tempo na primeira pergunta) */
export function preaquecer() { motor(['faturamento', 'faturamento_diario', 'frota', 'estrutura', 'qualidade', 'base_ups', 'programacao', 'rh']).catch(() => {}); }

/** Descrição fixa das bases (sem baixar nada): vai no prompt do Folhito */
export function descricaoBases() {
  contexto ||= criarContexto();
  const { BASES } = contexto.SMA_EXPERIMENTO;
  return Object.entries(BASES).map(([id, b]) => `- ${id} — ${b.nome}: ${b.descricao}\n  Campos: ${Object.entries(b.campos).map(([n, [tipo, un, desc]]) => `${n} (${tipo}${un ? `, ${un}` : ''}${desc ? `: ${desc}` : ''})`).join('; ')}`).join('\n');
}

/** Valores existentes de um campo (para a IA acertar nomes de equipe, fazenda, função…) */
export async function valoresDoCampo({ base, campo, busca = '', limite = 60 }) {
  const M = await motor([base]);
  if (!M.BASES[base]) return { erro: `A base "${base}" não existe. Bases: ${Object.keys(M.BASES).join(', ')}.` };
  if (!M.BASES[base].campos[campo]) return { erro: `O campo "${campo}" não existe em ${base}. Campos: ${Object.keys(M.BASES[base].campos).join(', ')}.` };
  const norm = t => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cont = new Map();
  (M.dados[base] || []).forEach(r => { const v = r[campo]; if (v == null || v === '') return; const k = M.formatarChave(v); cont.set(k, (cont.get(k) || 0) + 1); });
  const lista = [...cont.entries()].filter(([v]) => !busca || norm(v).includes(norm(busca))).sort((a, b) => b[1] - a[1]);
  return { base, campo, total_distintos: lista.length, valores: lista.slice(0, Math.min(200, limite)).map(([valor, linhas]) => ({ valor, linhas })), erro_carga: M.erros[base] ? String(M.erros[base].message || M.erros[base]) : undefined };
}

/** Executa uma consulta (mesmo formato de especificação do Experimento) e devolve a tabela já formatada */
export async function consultar(especificacao) {
  contexto ||= criarContexto();
  const v = contexto.SMA_EXPERIMENTO.validar({ tipo: 'tabela', ...especificacao });
  if (!v.ok) return { erro: 'Consulta inválida', problemas: v.problemas };
  const fontes = v.especificacao.fontes;
  const M = await motor(fontes);
  const r = M.executar(v.especificacao, {});
  const errosCarga = fontes.filter(b => M.erros[b]).map(b => `${b}: ${M.erros[b].message || M.erros[b]}`);
  const maxLinhas = 80;
  return {
    linhas_total: r.total,
    linhas: r.linhas.slice(0, maxLinhas).map(l => ({
      ...Object.fromEntries(r.dims.map(d => [d, M.formatarChave(l.chave[d])])),
      ...Object.fromEntries(r.colunas.map(c => [c.rotulo, M.formatar(l.v[c.id], c.formato)]))
    })),
    cortado: r.total > maxLinhas ? `Mostrando ${maxLinhas} de ${r.total} linhas; refine com filtros ou limite.` : undefined,
    notas: r.notas.length ? r.notas : undefined,
    erros_de_carga: errosCarga.length ? errosCarga : undefined,
    dados_de: new Date(quandoCarregou(fontes)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  };
}
