/**
 * Apps Script do robô de apontamento ZFLPP005.
 *
 * Recebe do robô (Python) dois tipos de pedido:
 *   - "status": escreve o texto na coluna STATUS da linha informada;
 *   - "print":  salva o print em  APONTAMENTO SAP / <número da O.S.> / arquivo.png
 *               (cria as pastas se não existirem).
 *
 * Roda com a SUA conta Google, então tem acesso à planilha e ao seu Drive.
 * Como publicar: ver README do robô, seção "Planilha e Drive".
 */

// Mesmo valor de nuvem.token no config.yaml do robô. Troque por um texto só seu.
const TOKEN = 'lMCRBIunTexwHLCIo3Ytjv76';

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.token !== TOKEN) return resposta({ ok: false, erro: 'token inválido' });
    if (d.acao === 'status') return resposta(gravarStatus(d));
    if (d.acao === 'print') return resposta(salvarPrint(d));
    return resposta({ ok: false, erro: 'ação desconhecida: ' + d.acao });
  } catch (err) {
    return resposta({ ok: false, erro: String(err) });
  }
}

// Teste rápido: abrir a URL do app no navegador deve mostrar {"ok":true,...}
function doGet() {
  return resposta({ ok: true, mensagem: 'Apps Script do robô de apontamento no ar.' });
}

function gravarStatus(d) {
  const aba = SpreadsheetApp.openById(d.planilha).getSheets()
    .filter(function (s) { return s.getSheetId() == d.gid; })[0];
  if (!aba) return { ok: false, erro: 'aba gid=' + d.gid + ' não encontrada' };

  // Coluna STATUS pelo cabeçalho da linha 1; cria no fim se não existir
  const ultimaCol = Math.max(aba.getLastColumn(), 1);
  const cab = aba.getRange(1, 1, 1, ultimaCol).getValues()[0];
  let col = cab.findIndex(function (t) { return String(t).trim().toUpperCase() === 'STATUS'; }) + 1;
  if (col === 0) {
    col = ultimaCol + 1;
    aba.getRange(1, col).setValue('STATUS');
  }
  aba.getRange(d.linha, col).setValue(d.texto);
  return { ok: true };
}

function salvarPrint(d) {
  const raiz = pastaPorNome(null, d.pasta || 'APONTAMENTO SAP');
  const pastaOS = pastaPorNome(raiz, String(d.os));
  const blob = Utilities.newBlob(Utilities.base64Decode(d.conteudo), 'image/png', d.nome);
  const arq = pastaOS.createFile(blob);
  return { ok: true, url: arq.getUrl() };
}

// Procura a pasta pelo nome (dentro de "mae", ou em todo o Drive se mae == null); cria se não existir
function pastaPorNome(mae, nome) {
  const it = mae ? mae.getFoldersByName(nome) : DriveApp.getFoldersByName(nome);
  if (it.hasNext()) return it.next();
  return (mae || DriveApp.getRootFolder()).createFolder(nome);
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
