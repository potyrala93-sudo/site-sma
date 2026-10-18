/* ==========================================================================
   SMA Silvicultura — rotas da API (/api/...), usadas em dois lugares:
   - no servidor local (server/folhito-server.mjs, "npm start")
   - na Vercel, pela função api/[...rota].js
   A chave da IA fica só no servidor (variável ANTHROPIC_API_KEY; na Vercel, em Settings → Environment Variables).
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { colecao, fotosNoBanco, TEM_BANCO, ONDE_SALVA } from './armazenamento.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const NA_VERCEL = Boolean(process.env.VERCEL);
export const MODELO = process.env.FOLHITO_MODELO || 'claude-opus-5-5';
const ipDe = req => String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'desconhecido';

/* ---------- Conhecimento do site (lido de js/dados.js, a mesma fonte das páginas) ---------- */
function carregarDados() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, 'js/dados.js'), 'utf8'), ctx);
  return ctx.window.SMA_DADOS;
}

function montarConhecimento(D) {
  const linhasPessoas = [];
  (function visitar(p, chefe, nivel) {
    linhasPessoas.push(`${'  '.repeat(nivel)}- ${p.nome} — ${p.cargo}${p.equipe ? ` — ${p.equipe}` : ''}${chefe ? ` (responde a ${chefe})` : ''}`);
    (p.filhos || []).forEach(f => visitar(f, p.nome, nivel + 1));
  })(D.ORGANOGRAMA, null, 0);

  const frota = D.ESTRUTURA.filter(e => e.tipo !== 'pessoas');
  const totalFrota = frota.reduce((s, e) => s + (e.qtd || 0), 0);
  const pessoas = D.ESTRUTURA.find(e => e.tipo === 'pessoas');

  return `## Unidade São Miguel — dados oficiais do site
Colaboradores: ${pessoas.qtd}
Frota (${totalFrota} veículos no total):
${frota.map(e => `- ${e.nome}: ${e.qtd ?? 'quantidade a confirmar'}`).join('\n')}

Organograma operacional:
${linhasPessoas.join('\n')}
Observação: Jefferson Becker é a mesma pessoa e aparece sob duas supervisoras/supervisores (Carina com as equipes BN/BV e Juliano com as equipes BT/BU).

Etapas do ciclo florestal (seção "O que é Silvicultura"):
${D.CICLO.map((e, i) => `${i + 1}. ${e.titulo}: ${e.texto}`).join('\n')}

Páginas de setores (todas ainda "em construção"): ${D.SETORES.filter(s => s.id !== 'home').map(s => `${s.nome} (${s.href})`).join(', ')}.
Seções da página inicial: início/hero (#inicio), O que é Silvicultura (#silvicultura), vídeo sobre eucalipto do canal Richard Rasmussen (#video), Nossa Estrutura (#estrutura), Organograma Operacional (#organograma).`;
}

const DADOS = carregarDados();
const DESTINOS_VALIDOS = ['#inicio', '#silvicultura', '#video', '#estrutura', '#organograma', ...DADOS.SETORES.filter(s => s.id !== 'home').map(s => s.href)];

const SISTEMA = `Você é o Folhito, mascote e assistente virtual do site da operação de silvicultura da SMA, Unidade São Miguel. Você é uma mudinha de árvore simpática, com folhas na cabeça, que segura um mapa (por isso adora ajudar as pessoas a se localizarem).

Quem conversa com você são colaboradores, lideranças e visitantes do site. Seu papel é ajudar em praticamente tudo: navegar pelo site, explicar a operação, tirar dúvidas sobre silvicultura, segurança do trabalho, qualidade, produtividade e meio ambiente, dar dicas e conselhos práticos, e também conversar sobre outros assuntos do dia a dia quando a pessoa quiser.

Como responder:
- Sempre em português do Brasil, com tom acolhedor, claro e direto, como um colega experiente de campo. Pode usar um emoji de vez em quando (🌱🌳🦺🚜), sem exagero.
- Respostas curtas: em geral de 2 a 6 frases. Use listas curtas com "- " quando ajudar. Use **negrito** só para destacar o essencial. Não use títulos (#) nem tabelas.
- Para dados da unidade (números da frota, colaboradores, nomes, cargos e equipes), use somente as informações abaixo. Se algo não estiver nelas (telefones, salários, escalas, metas, indicadores, documentos internos), diga com sinceridade que não tem essa informação e sugira procurar o encarregado, o supervisor ou o RH. Nunca invente nomes, números ou procedimentos internos da empresa.
- Em temas de segurança, priorize sempre a vida: em caso de acidente, emergência ou risco grave, oriente a parar a atividade, acionar a liderança e os serviços de emergência (SAMU 192, Bombeiros 193). Você não substitui procedimentos oficiais, treinamentos nem orientação médica.
- Em conselhos pessoais, seja gentil e respeitoso, e sugira ajuda profissional quando o assunto for sério.

Navegação: quando for útil levar a pessoa a uma parte do site, inclua no fim da resposta um ou mais botões no formato [[Texto do botão|destino]], usando apenas estes destinos: ${DESTINOS_VALIDOS.join(', ')}. Exemplo: [[Ver organograma|#organograma]]. Não escreva URLs.

${montarConhecimento(DADOS)}`;

/* ---------- Cliente da API ---------- */
let cliente = null;
let iaDisponivel = false;
try {
  cliente = new Anthropic();
  // FOLHITO_IA=1 força a ativação quando a credencial vem de outro meio (ex.: login com "ant auth login")
  iaDisponivel = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE || process.env.FOLHITO_IA === '1');
} catch (erro) {
  console.warn('Folhito: cliente da API não configurado —', erro.message);
}

/* ---------- Proteções básicas ---------- */
const LIMITE_POR_MINUTO = 15;
const acessos = new Map();
function dentroDoLimite(ip) {
  const agora = Date.now();
  const lista = (acessos.get(ip) || []).filter(t => agora - t < 60_000);
  lista.push(agora);
  acessos.set(ip, lista);
  return lista.length <= LIMITE_POR_MINUTO;
}

function validarMensagens(mensagens) {
  if (!Array.isArray(mensagens) || !mensagens.length) return null;
  const recentes = mensagens.slice(-20)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (recentes.length && recentes[0].role !== 'user') recentes.shift();
  // garante alternância usuário/assistente
  const limpas = [];
  for (const m of recentes) {
    if (limpas.length && limpas.at(-1).role === m.role) limpas[limpas.length - 1] = m;
    else limpas.push(m);
  }
  if (!limpas.length || limpas.at(-1).role !== 'user') return null;
  return limpas;
}

export function lerCorpo(req, limite = 64_000) {
  return new Promise((resolve, reject) => {
    let corpo = '';
    req.on('data', parte => {
      corpo += parte;
      if (corpo.length > limite) { reject(new Error('corpo grande demais')); req.destroy(); }
    });
    req.on('end', () => resolve(corpo));
    req.on('error', reject);
  });
}

export function json(res, status, dados) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(dados));
}

/* ---------- Conversa com o Folhito (streaming via Server-Sent Events) ---------- */
async function conversar(req, res) {
  const ip = ipDe(req);
  if (!dentroDoLimite(ip)) return json(res, 429, { erro: 'Muitas mensagens em pouco tempo. Aguarde um minutinho. 🌱' });
  if (!cliente || !iaDisponivel) return json(res, 503, { erro: 'IA não configurada no servidor.' });

  let mensagens;
  try {
    mensagens = validarMensagens(JSON.parse(await lerCorpo(req)).mensagens);
  } catch {
    return json(res, 400, { erro: 'Requisição inválida.' });
  }
  if (!mensagens) return json(res, 400, { erro: 'Mensagem inválida.' });

  const enviar = dado => res.write(`data: ${JSON.stringify(dado)}\n\n`);
  let iniciou = false;

  try {
    const stream = cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 16000,
      // Conversa de chat: esforço baixo responde rápido e bem; o Opus 5.5 decide sozinho quando pensar mais
      output_config: { effort: 'low' },
      // Se um filtro de segurança recusar, a própria API tenta outro modelo adequado
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Prompt do sistema estável → cache de prompt
      system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
      messages: mensagens
    });

    for await (const evento of stream) {
      if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
        if (!iniciou) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
          iniciou = true;
        }
        enviar({ tipo: 'texto', texto: evento.delta.text });
      }
    }

    const final = await stream.finalMessage();
    if (!iniciou) {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' });
      iniciou = true;
    }
    if (final.stop_reason === 'refusal') {
      enviar({ tipo: 'texto', texto: '\n\nDesculpe, não posso ajudar com esse assunto. Posso te ajudar com outra coisa? 🌱' });
    } else if (final.stop_reason === 'max_tokens') {
      enviar({ tipo: 'texto', texto: '…' });
    }
    enviar({ tipo: 'fim' });
    res.end();
  } catch (erro) {
    let mensagem = 'Tive um probleminha para responder agora. Tente de novo em instantes.';
    if (erro instanceof Anthropic.AuthenticationError || erro instanceof Anthropic.PermissionDeniedError) {
      iaDisponivel = false;
      mensagem = 'A chave da IA não é válida no servidor.';
      console.error('Folhito: credencial inválida. Verifique ANTHROPIC_API_KEY.');
    } else if (erro instanceof Anthropic.RateLimitError) {
      mensagem = 'Muita gente conversando comigo agora! Tente de novo em alguns segundos. 🌱';
    } else if (erro instanceof Anthropic.APIConnectionError) {
      mensagem = 'Não consegui me conectar à IA. Verifique a internet do servidor.';
    } else {
      console.error('Folhito: erro na API —', erro);
    }
    if (!iniciou) return json(res, erro instanceof Anthropic.RateLimitError ? 429 : 503, { erro: mensagem });
    enviar({ tipo: 'erro', mensagem });
    res.end();
  }
}
/* ---------- Planilhas do Google (Faturamento) ---------- */
// Só as planilhas do painel podem ser buscadas por aqui (evita virar um proxy aberto)
const PLANILHAS_PERMITIDAS = new Set(['1gGcRAaVruH9wq3m531pEcA7iGSfpzJolqne5brBn8Ls', '1LZRtGcDHSfW4gIB9BhPaL1bjDZ0ekeOdLtXc-0abtYg', '1-h8nbKYjwksLczYMpCdluBVqCZpgsrGJGICxH14sQC8', '14j_RYF0RMpJonbUksQbVmGMJ6D9Ca2qTUb9MxirWuwo', '1wZLC-MZiasGY-jTyc6hTZAGoHBeq3uEOi9HEOu_vzxw', '1b14belPXohyMAVPHgtMVijDLBT_m5v8R', '11OZX_ieEj_SQ-Rc4xqbDfJiVWezTN5i26S_YnzFdH3s', '1RjlknbDlu5draerYFSZqJwwVJsdq6N67VljUjaYEJjs']);
const cachePlanilhas = new Map(); // chave → { quando, csv }

async function buscarPlanilha(req, res) {
  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('id') || '';
  const gid = url.searchParams.get('gid') || '';
  if (!PLANILHAS_PERMITIDAS.has(id) || !/^\d{1,12}$/.test(gid)) return json(res, 400, { erro: 'Planilha não permitida.' });

  const chave = `${id}:${gid}`;
  const emCache = cachePlanilhas.get(chave);
  if (emCache && Date.now() - emCache.quando < 60_000 && url.searchParams.get('fresco') !== '1') {
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'X-Cache': 'HIT' });
    return res.end(emCache.csv);
  }
  try {
    const resposta = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`, { redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    if (!resposta.ok) throw new Error(`Google respondeu ${resposta.status}`);
    const csv = await resposta.text();
    if (/^\s*<!DOCTYPE html/i.test(csv)) throw new Error('A planilha não está pública');
    cachePlanilhas.set(chave, { quando: Date.now(), csv });
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(csv);
  } catch (erro) {
    if (emCache) { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'X-Cache': 'STALE' }); return res.end(emCache.csv); }
    json(res, 502, { erro: `Não foi possível ler a planilha: ${erro.message}` });
  }
}

/* ---------- Fotos dos responsáveis (todas as fotos da pasta de cada pessoa) ---------- */
function listarFotos(res, nome) {
  if (!/^[a-z]{2,20}$/.test(nome)) return json(res, 400, { erro: 'Nome inválido.' });
  const pasta = path.join(RAIZ, 'assets/img/fotos', nome);
  let arquivos = [];
  try { arquivos = fs.readdirSync(pasta); } catch { return json(res, 200, { fotos: [] }); }
  const fotos = arquivos.filter(a => /\.(jpe?g|png|webp)$/i.test(a)).sort().map(a => `assets/img/fotos/${nome}/${encodeURIComponent(a)}`);
  json(res, 200, { fotos });
}

/* ---------- Itens salvos: programações (Produção) e experimentos ----------
   Onde ficam (ver armazenamento.mjs): no computador, em server/dados/*.json; na Vercel, no banco Redis
   (Upstash) ligado ao projeto. Sem banco na Vercel, a API responde 503 e o site guarda no navegador.
   Sem login no site: o que é salvo fica disponível para todos os usuários do dashboard. */
function rotaColecao(nome, chaveLista, limite) {
  const base = colecao(nome);
  return async function rota(req, res, id) {
    if (!base.disponivel) return json(res, 503, { erro: 'Armazenamento compartilhado não configurado; o site guarda neste navegador.' });
    try {
      if (req.method === 'GET' && !id) return json(res, 200, { [chaveLista]: await base.ler() });
      if (!id || !/^[a-z0-9-]{6,40}$/.test(id)) return json(res, 400, { erro: 'Identificador inválido.' });
      if (req.method === 'PUT') {
        const item = JSON.parse(await lerCorpo(req, limite));
        if (!item || typeof item !== 'object' || item.id !== id || typeof item.nome !== 'string' || !item.nome.trim()) return json(res, 400, { erro: 'Item inválido.' });
        const lista = (await base.ler()).filter(p => p.id !== id);
        lista.push({ ...item, nome: item.nome.slice(0, 120) });
        await base.gravar(lista);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        await base.gravar((await base.ler()).filter(p => p.id !== id));
        return json(res, 200, { ok: true });
      }
    } catch (erro) {
      return json(res, 400, { erro: `Não foi possível salvar: ${erro.message}` });
    }
    return json(res, 405, { erro: 'Método não permitido.' });
  };
}
const rotaProgramacoes = rotaColecao('programacoes', 'programacoes', 3_000_000);
const rotaExperimentos = rotaColecao('experimentos', 'experimentos', 300_000);

/* ---------- Fotos dos colaboradores (RH) ----------
   Arquivos na pasta com o nome do colaborador ("JOAO DA SILVA.jpg", "JOAO DA SILVA (2).jpg"…) ou com a CHAPA.
   O envio pelo painel grava <CHAPA>.jpg. O navegador agrupa os arquivos de cada pessoa. */
export const PASTA_COLAB = path.join(RAIZ, 'assets', 'img', 'colaboradores');
export const PASTA_AVATARES = path.join(RAIZ, 'assets', 'img', 'avatares');
function imagensDe(pasta, prefixo) {
  let arquivos = [];
  try { arquivos = fs.readdirSync(pasta); } catch { return []; }
  return arquivos.filter(a => /\.(jpe?g|png|webp|gif)$/i.test(a)).map(a => {
    let v = 0; try { v = Math.round(fs.statSync(path.join(pasta, a)).mtimeMs); } catch { /* sem data */ }
    return { nome: a.replace(/\.[^.]+$/, ''), url: `${prefixo}/${encodeURIComponent(a)}?v=${v}` };
  }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
}
// Arquivos "Avatar_masculino_N" / "Avatar_feminino_N" na pasta dos colaboradores são avatares, não fotos de alguém
const AVATAR_MASC = /^avatar[\s_-]*masc/i, AVATAR_FEM = /^avatar[\s_-]*fem/i;
const fotosColab = () => imagensDe(PASTA_COLAB, 'assets/img/colaboradores').filter(a => !AVATAR_MASC.test(a.nome) && !AVATAR_FEM.test(a.nome));
// Avatares ilustrados (quando não há foto): Avatar_masculino_N / Avatar_feminino_N e as pastas assets/img/avatares/masculino e /feminino
const avataresColab = () => {
  const numero = a => +(a.nome.match(/(\d+)\s*$/)?.[1] || 0);
  const naPasta = imagensDe(PASTA_COLAB, 'assets/img/colaboradores').sort((a, b) => numero(a) - numero(b));
  return {
    M: [...naPasta.filter(a => AVATAR_MASC.test(a.nome)), ...imagensDe(path.join(PASTA_AVATARES, 'masculino'), 'assets/img/avatares/masculino')].map(a => a.url),
    F: [...naPasta.filter(a => AVATAR_FEM.test(a.nome)), ...imagensDe(path.join(PASTA_AVATARES, 'feminino'), 'assets/img/avatares/feminino')].map(a => a.url)
  };
};
// Manifesto para quando o site é aberto direto do arquivo (sem a API): assets/img/colaboradores/fotos.js
export function gravarManifestoFotos(lista = fotosColab(), avatares = avataresColab()) {
  const conteudo = `/* Gerado automaticamente pelo servidor: lista das fotos e dos avatares. */\nwindow.SMA_FOTOS_COLAB = ${JSON.stringify(lista, null, 1)};\nwindow.SMA_AVATARES_COLAB = ${JSON.stringify(avatares, null, 1)};\n`;
  const alvo = path.join(PASTA_COLAB, 'fotos.js');
  try { if (!fs.existsSync(alvo) || fs.readFileSync(alvo, 'utf8') !== conteudo) fs.writeFileSync(alvo, conteudo); } catch { /* pasta só leitura */ }
}
async function listarFotosColab(res) {
  const lista = fotosColab(), avatares = avataresColab();
  if (!NA_VERCEL) gravarManifestoFotos(lista, avatares);
  // fotos enviadas pelo painel no site publicado (banco): entram com o nome = CHAPA
  if (TEM_BANCO) { try { lista.push(...await fotosNoBanco.listar()); } catch (erro) { console.error('Fotos no banco:', erro.message); } }
  json(res, 200, { arquivos: lista, avatares });
}
async function rotaFotoColab(req, res, chapa) {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(chapa)) return json(res, 400, { erro: 'Chapa inválida.' });
  const arquivo = path.join(PASTA_COLAB, `${chapa}.jpg`);
  try {
    if (req.method === 'GET') {
      const bytes = TEM_BANCO ? await fotosNoBanco.ler(chapa) : null;
      if (!bytes) return json(res, 404, { erro: 'Foto não encontrada.' });
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': bytes.length, 'Cache-Control': 'public, max-age=31536000, immutable' });
      return res.end(bytes);
    }
    // Na Vercel sem banco o disco é só leitura: o painel guarda a foto só no navegador
    if (NA_VERCEL && !TEM_BANCO) return json(res, 501, { erro: 'Banco não configurado no site publicado; a foto fica só neste navegador.' });
    if (req.method === 'PUT') {
      const { imagem } = JSON.parse(await lerCorpo(req, 1_500_000));
      const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(imagem || ''));
      if (!m) return json(res, 400, { erro: 'Envie a foto em JPEG.' });
      const bytes = Buffer.from(m[1], 'base64');
      if (bytes.length > 900_000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return json(res, 400, { erro: 'Imagem inválida ou grande demais.' });
      if (NA_VERCEL) return json(res, 200, { ok: true, url: await fotosNoBanco.gravar(chapa, bytes) });
      fs.mkdirSync(PASTA_COLAB, { recursive: true });
      fs.writeFileSync(arquivo, bytes);
      return json(res, 200, { ok: true, url: `assets/img/colaboradores/${chapa}.jpg?v=${Date.now()}` });
    }
    if (req.method === 'DELETE') {
      if (NA_VERCEL) await fotosNoBanco.apagar(chapa); else fs.rmSync(arquivo, { force: true });
      return json(res, 200, { ok: true });
    }
  } catch (erro) { return json(res, 400, { erro: `Não foi possível salvar a foto: ${erro.message}` }); }
  return json(res, 405, { erro: 'Método não permitido.' });
}

/* ---------- Experimento: IA que monta a visualização e escreve a análise ---------- */
// A IA nunca recebe a base inteira: só o pedido + o catálogo de dados (para a especificação)
// ou o resultado já agregado (para o texto analítico). Ela responde apenas JSON.
const SISTEMA_ESPEC = `Você transforma pedidos de análise (em português) em uma ESPECIFICAÇÃO JSON de visualização para o painel de silvicultura da SMA (Unidade São Miguel). Você nunca escreve código, nunca inventa dados e responde SOMENTE com um objeto JSON válido, sem texto antes ou depois.

Você recebe o CATÁLOGO DE DADOS: as bases disponíveis (id, nome, campos com tipo, unidade e valores de exemplo) e as chaves de cruzamento. Use apenas ids de base e nomes de campo exatamente como aparecem no catálogo.

Formato da resposta:
{
  "titulo": "título curto e claro",
  "tipo": "barra | barra_horizontal | linha | area | pizza | rosca | dispersao | combinado | mapa_calor | treemap | funil | gauge | kpi | tabela | ranking",
  "agrupar_por": ["CAMPO", "..."],            // 0 a 2 dimensões; precisam existir em TODAS as bases das métricas
  "metricas": [{ "id": "m1", "fonte": "id_da_base", "campo": "CAMPO", "agregacao": "soma | media | contagem | contagem_distinta | dias_distintos | min | max", "rotulo": "nome amigável" }],
  "calculadas": [{ "id": "rend", "rotulo": "Rendimento (ha/dia)", "formula": "m1 / m2", "formato": "ha_dia | num | pct | brl | ha" }],
  "filtros": [{ "campo": "CAMPO", "operador": "= | != | > | < | >= | <= | entre | contem | em | nao_em", "valor": "..." }],
  "periodo": { "tipo": "global" } | { "tipo": "ultimos_rfs", "n": 3 } | { "tipo": "rf", "ano": 2026, "rf": 10 } | { "tipo": "ano", "ano": 2026 },
  "ordenar": { "campo": "id_da_metrica_ou_dimensao", "direcao": "asc | desc" },
  "limite": 20,
  "eixos": { "x": "dimensão do eixo X", "y": ["ids de métricas/calculadas"], "serie": "segunda dimensão (opcional)" }
}

Regras:
- Cruzamento entre bases: use métricas de bases diferentes com as mesmas dimensões em agrupar_por (ex.: FAZENDA); o sistema agrega cada base e junta pelo valor da dimensão.
- "dias trabalhados" = agregacao "dias_distintos" (conta datas distintas). Rendimento por dia = soma de AREA ÷ dias_distintos (use "calculadas").
- O período padrão é o filtro global do painel ({"tipo":"global"}). Use "ultimos_rfs" quando o pedido falar em últimos N RFs/meses; nesse caso inclua "PERIODO" em agrupar_por se a comparação for entre períodos.
- RF é o período de apontamento (ANO + RF da base), não o mês civil da data.
- Para evolução no tempo use "linha" com DATA, MES ou PERIODO no eixo X. Para participação, "pizza"/"rosca" com poucas categorias. Para ranking de maiores/menores, "ranking" com ordenar e limite.
- Valores de filtro de texto devem ser exatamente valores do catálogo (ex.: equipe "BV").
- Se o pedido não puder ser atendido com o catálogo, responda {"erro": "explicação curta em português", "sugestao": "como reformular, citando campos disponíveis"}.`;

const SISTEMA_ANALISE = `Você é analista de operações de silvicultura da SMA. Recebe um pedido, a especificação da visualização e o RESULTADO JÁ CALCULADO (tabela agregada). Escreva uma leitura analítica em português simples, usando SOMENTE os números da tabela recebida (proibido inventar valores, médias de mercado ou causas não indicadas pelos dados). Números no padrão brasileiro (1.234,56; R$ 1.234,56; 12,3%; 45,20 ha).
Responda SOMENTE com JSON:
{ "resumo": "2 a 3 frases", "destaques": ["maiores/menores, variações, concentração"], "atencao": ["pontos de atenção baseados nos números"], "sugestao": "um próximo pedido de análise, escrito como o usuário digitaria" }`;

const extrairJSON = texto => {
  const ini = texto.indexOf('{'), fim = texto.lastIndexOf('}');
  if (ini < 0 || fim < ini) throw new Error('resposta sem JSON');
  return JSON.parse(texto.slice(ini, fim + 1));
};
async function perguntarJSON(sistema, conteudo, esforco) {
  const resposta = await cliente.beta.messages.create({
    model: MODELO,
    max_tokens: 16000,
    output_config: { effort: esforco },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: conteudo }]
  });
  if (resposta.stop_reason === 'refusal') throw new Error('pedido recusado pela IA');
  const texto = resposta.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return extrairJSON(texto);
}
async function rotaExperimentoIA(req, res, acao) {
  const ip = ipDe(req);
  if (!dentroDoLimite(ip)) return json(res, 429, { erro: 'Muitos pedidos em pouco tempo. Aguarde um minutinho.' });
  if (!cliente || !iaDisponivel) return json(res, 503, { erro: 'IA não configurada no servidor.' });
  let corpo;
  try { corpo = JSON.parse(await lerCorpo(req, 400_000)); } catch { return json(res, 400, { erro: 'Requisição inválida.' }); }
  const pedido = String(corpo.pedido || '').slice(0, 1500);
  if (!pedido.trim()) return json(res, 400, { erro: 'Pedido vazio.' });
  try {
    if (acao === 'especificar') {
      const conteudo = `CATÁLOGO DE DADOS:\n${JSON.stringify(corpo.catalogo)}\n\nPERÍODO GLOBAL DO PAINEL: ${JSON.stringify(corpo.global || {})}\n` +
        (corpo.atual ? `\nESPECIFICAÇÃO ATUAL (ajuste-a conforme o novo pedido, mantendo o que não foi pedido para mudar):\n${JSON.stringify(corpo.atual)}\n\nAJUSTE PEDIDO: ${pedido}` : `\nPEDIDO: ${pedido}`);
      return json(res, 200, { especificacao: await perguntarJSON(SISTEMA_ESPEC, conteudo, 'medium') });
    }
    const conteudo = `PEDIDO: ${pedido}\n\nESPECIFICAÇÃO:\n${JSON.stringify(corpo.especificacao)}\n\nRESULTADO CALCULADO (${corpo.resultado?.linhas?.length || 0} linhas):\n${JSON.stringify(corpo.resultado).slice(0, 60_000)}`;
    return json(res, 200, { analise: await perguntarJSON(SISTEMA_ANALISE, conteudo, 'low') });
  } catch (erro) {
    if (erro instanceof Anthropic.AuthenticationError || erro instanceof Anthropic.PermissionDeniedError) { iaDisponivel = false; return json(res, 503, { erro: 'A chave da IA não é válida no servidor.' }); }
    if (erro instanceof Anthropic.RateLimitError) return json(res, 429, { erro: 'A IA está ocupada. Tente de novo em alguns segundos.' });
    if (erro instanceof Anthropic.APIConnectionError) return json(res, 503, { erro: 'Sem conexão com a IA.' });
    console.error('Experimento: erro na IA —', erro.message);
    return json(res, 502, { erro: `A IA não conseguiu montar a resposta (${erro.message}).` });
  }
}

/* ---------- Roteador: devolve true se a requisição era da API ---------- */
export function tratarApi(req, res) {
  const rota = req.url.split('?')[0];
  if (!rota.startsWith('/api/')) return false;
  if (rota === '/api/planilha' && req.method === 'GET') return Promise.resolve(buscarPlanilha(req, res));
  const prog = rota.match(/^\/api\/programacoes(?:\/([^/]+))?$/);
  if (prog) return Promise.resolve(rotaProgramacoes(req, res, prog[1]));
  if (rota === '/api/colab-fotos' && req.method === 'GET') return Promise.resolve(listarFotosColab(res));
  const fotoColab = rota.match(/^\/api\/colab-fotos\/([^/]+)$/);
  if (fotoColab) return Promise.resolve(rotaFotoColab(req, res, decodeURIComponent(fotoColab[1])));
  const exp = rota.match(/^\/api\/experimentos(?:\/([^/]+))?$/);
  if (exp) return Promise.resolve(rotaExperimentos(req, res, exp[1]));
  if (rota === '/api/experimento/status' && req.method === 'GET') return Promise.resolve(json(res, 200, { ia: Boolean(cliente && iaDisponivel) }));
  const expIA = rota.match(/^\/api\/experimento\/(especificar|analisar)$/);
  if (expIA && req.method === 'POST') return Promise.resolve(rotaExperimentoIA(req, res, expIA[1]));
  const fotos = rota.match(/^\/api\/fotos\/([a-z]+)$/);
  if (fotos && req.method === 'GET') return Promise.resolve(listarFotos(res, fotos[1]));
  if (rota === '/api/status' && req.method === 'GET') return Promise.resolve(json(res, 200, { ia: Boolean(cliente && iaDisponivel), modelo: MODELO, salvamento: ONDE_SALVA, vercel: NA_VERCEL }));
  if (rota === '/api/folhito/status' && req.method === 'GET') return Promise.resolve(json(res, 200, { ia: Boolean(cliente && iaDisponivel), modelo: MODELO }));
  if (rota === '/api/folhito' && req.method === 'POST') return Promise.resolve(conversar(req, res));
  return Promise.resolve(json(res, 404, { erro: 'Rota não encontrada.' }));
}
export const iaAtiva = () => Boolean(cliente && iaDisponivel);
