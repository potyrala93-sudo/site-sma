# Robô de apontamento de O.S. — ZFLPP005 (SAP Suzano)

Lê as linhas de uma planilha Google Sheets e, para cada uma, faz o apontamento na
transação **ZFLPP005 – Entrada de apontamento - ord.serviço**: pesquisa a O.S., confere o
serviço, preenche o popup **Equipes e Eventos**, clica em **Salvar Guia** e confere se o
**Status Reg** ficou **Criado**. O resultado vai para a coluna **STATUS** da planilha e
para um relatório Excel/CSV.

O robô trabalha **por imagem** (modo padrão): ele enxerga a tela e clica como uma pessoa,
usando os recortes da pasta `imagens/`, tirados dos prints reais do SAP. **Não precisa de
IDs do SAP nem de liberar o GUI Scripting.**

> **Comece sempre em modo simulação** (`simulacao: true`, que é o padrão). Nesse modo o
> robô faz tudo, **menos** clicar no check verde e no Salvar Guia.

---

## 1. Arquivos

| Arquivo | Para que serve |
|---|---|
| `main.py` | Orquestra o fluxo, retentativas, relatório e STATUS |
| `sap_imagem.py` | Automação **por imagem** (pyautogui + opencv + pywinauto) — padrão |
| `sap_client.py` | Automação alternativa via SAP GUI Scripting (precisa de IDs — opcional) |
| `planilha.py` | Leitura da planilha e gravação do STATUS |
| `utils.py` | Conversões (data, quantidade, serviço), esperas, tecla de emergência, relatório |
| `config.yaml` | Configurações (colunas, fornecedor, período, posições das imagens) |
| `imagens/` | Recortes da tela usados para localizar cada campo e botão |
| `sap_ids.yaml` | Só para o modo scripting (pode ignorar) |
| `logs/`, `relatorios/` | Criadas automaticamente |

## 2. Instalação (uma vez)

Na pasta do robô:

```bash
python -m venv .venv
```

```bash
.venv\Scripts\Activate.ps1
```

```bash
pip install -r requirements.txt
```

## 3. Condições da tela (importante no modo imagem)

As imagens foram recortadas com a tela **nestas condições** — mantenha-as:

- Escala do Windows em **125%** (Configurações → Sistema → Tela → Escala).
- SAP **maximizado** (o robô maximiza sozinho), mesmo tema e tamanho de fonte.
- Grade **Operação/Material** com as colunas *Maq Evento*, *Status Reg*, *Serviço*,
  *% Exec.* e *Qt Executa* **visíveis** (sem rolar para o lado).
- **Não mexa no mouse/teclado** enquanto o robô roda — ele usa os mesmos.
- Não deixe outras janelas por cima do SAP.

Se algo mudar (outra escala, outro monitor, layout novo), basta recapturar as imagens
afetadas — veja a seção 8.

## 4. Conta de serviço do Google (para ler e gravar a planilha)

1. Acesse <https://console.cloud.google.com/>, crie (ou escolha) um projeto.
2. **APIs e serviços → Biblioteca**: ative **Google Sheets API** e **Google Drive API**.
3. **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**. Dê um nome
   (ex.: `robo-apontamento`) e conclua.
4. Abra a conta criada → aba **Chaves → Adicionar chave → JSON**. Salve o arquivo como
   `credentials.json` na pasta do robô. **Não compartilhe nem versione esse arquivo**.
5. Copie o e-mail da conta (algo como `robo-apontamento@projeto.iam.gserviceaccount.com`)
   e **compartilhe a planilha com ele como Editor**.

Alternativa sem conta de serviço: se a planilha for pública ("qualquer pessoa com o link"),
use `planilha.modo: csv`. Nesse modo o robô **só lê**: o STATUS fica apenas no relatório.

## 4.1 Planilha e Drive (STATUS "Apontado" + prints)

**STATUS — funciona sozinho, sem login.** A planilha está como "qualquer pessoa com o link
pode editar", então o robô lê pelo CSV público e, quando o Status Reg fica **Criado**,
abre a planilha num **Microsoft Edge invisível** (`planilha_web.py`), escreve **Apontado**
na coluna STATUS da linha da O.S. e confere pelo CSV que gravou. Se a planilha deixar de
ser editável pelo link, use o Apps Script abaixo.

**Prints no Drive — exige o Apps Script** (o Google não deixa salvar arquivos no Drive sem
login). Sem ele, os prints ficam em `prints/<O.S.>/` e na fila, e sobem quando a URL for
configurada. O Apps Script (`apps_script/Codigo.gs`) roda com a sua conta:

- quando o Status Reg fica **Criado**, escreve **Apontado** na coluna STATUS da linha;
- salva os prints de cada O.S. em **Drive › APONTAMENTO SAP › <número da O.S.>**
  (`1_grade`, `2_popup_preenchido`, `3_criado` e, se der problema, `erro`).

Publicar (uma vez):

1. Abra a planilha → **Extensões → Apps Script**.
2. Apague o conteúdo do `Código.gs` e cole todo o arquivo `apps_script/Codigo.gs`. Salve.
3. **Implantar → Nova implantação** → engrenagem → **App da Web**.
   *Executar como:* **Eu** · *Quem pode acessar:* **Qualquer pessoa**. Clique em **Implantar**
   e autorize o acesso (Planilhas e Drive).
4. Copie a **URL do app da Web** (termina em `/exec`) e cole em `config.yaml → nuvem.apps_script_url`.
5. Teste abrindo a URL no navegador: deve aparecer `{"ok":true,...}`.

O `TOKEN` no topo do `Codigo.gs` já é igual ao `nuvem.token` do `config.yaml` — é o que
impede outra pessoa de escrever na planilha pela URL. Mantenha os dois iguais.

Enquanto a URL não estiver configurada (ou sem internet), nada se perde: STATUS e prints
ficam em `pendentes.json` e são enviados na próxima execução. Os prints também ficam em
`prints/<O.S.>/` na pasta do robô.

**Histórico local (`apontados.json`):** depois de salva, a ZFLPP005 volta a mostrar a linha
como pendente se a O.S. for pesquisada de novo. Por isso o robô guarda tudo que levou a
"Criado" e **nunca aponta a mesma O.S. + serviço duas vezes**. Só use `--ignorar-historico`
se tiver certeza.

## 5. Ajustar o `config.yaml`

Itens marcados com `# CONFIRMAR`:

- `planilha.colunas.os` → letra da coluna da O.S. (**[COLUNA_OS]**).
- `planilha.colunas.insumo` → letra da coluna de insumo (**[COLUNA_INSUMO]**), ou `null`.
- `selecao.periodo` → *Data planejada*: `mes_atual` (padrão), `mes_da_execucao` ou `fixo`.

A coluna **STATUS** é encontrada pelo cabeçalho "STATUS"; se não existir, é criada após a
última coluna preenchida.

## 6. Como rodar

1. Abra o SAP e **faça login** (o robô nunca guarda nem digita senha).
2. **Teste das imagens** (deixe o SAP na tela de seleção da ZFLPP005):

```bash
python main.py --testar-imagens
```

   O log mostra quais imagens foram encontradas na tela. Repita com a grade aberta:
   o robô também tenta ler o Serviço da 1ª linha com Ctrl+C.

3. **Simulação** numa linha (preenche o popup e cancela com ESC):

```bash
python main.py --simular --linhas 2
```

4. **Modo real** numa linha, para validar:

```bash
python main.py --real --linhas 2
```

5. Tudo certo? A planilha inteira:

```bash
python main.py --real
```

**Parar com segurança:** **Ctrl+Shift+Q** (o robô termina a etapa atual e para; se já
tiver clicado no check verde, termina o Salvar Guia antes). **Emergência:** jogue o mouse
no **canto superior esquerdo** da tela — o pyautogui aborta na hora.

## 7. O que o robô faz em cada linha

1. Clica no campo de comando, digita `/nZFLPP005` e Enter (se falhar, duplo clique no favorito).
2. Preenche Ordem de Serviço, Núcleo `*`, Centro `*`, Fornecedor, Lote 0 até 0, Data
   planejada e Nº máx de registros; aperta **F8**.
3. Na grade, lê o **Serviço** (clique na célula + Ctrl+C) e compara com a coluna E
   ignorando zeros à esquerda. Divergente → `ERRO`, ESC, próxima linha.
4. Duplo clique no ícone de **Maq Evento** → popup **Equipes e Eventos**: Data Execução
   (`DDMMAAAA`), Quantidade Executada (`45,620`), marca **Confirmação final**, check verde.
5. Confere **% Exec. = 100,00**, clica em **Salvar Guia** e espera **Status Reg = Criado**.
6. Grava `OK` na planilha, ESC e vai para a próxima.

O texto é colado via área de transferência (Ctrl+V), então o teclado ABNT2 não atrapalha.
A espera é sempre "até a próxima tela aparecer", com limite em `imagem.timeout`.

## 8. Recapturar uma imagem

1. Deixe o SAP na tela onde o elemento aparece.
2. **Win+Shift+S** → recorte **só** o elemento, com pouca margem.
3. Salve em `imagens/` com **o mesmo nome** do arquivo que está substituindo (lista em
   `imagens/LEIA-ME.txt`).
4. Se recapturar um **rótulo** de campo, confira o `dx` em `config.yaml → imagem.campos`
   (distância em pixels do centro do rótulo até onde clicar). Rode `--testar-imagens`.

`imagem.confidence` (0.9) controla o quanto a imagem precisa ser parecida: baixe para 0.85
se ele não encontrar algo; suba se confundir elementos.

## 9. Status e relatório

| Status | Significado | Reprocessa na próxima execução? |
|---|---|---|
| `OK` | Apontado, Status Reg = Criado | Não |
| `ERRO: <motivo>` | Nada foi gravado (OS não encontrada, serviço divergente, dado inválido...) | Sim |
| `VERIFICAR: <motivo>` | Falhou **depois** do check verde — confira no SAP | Não (corrija e apague o status) |
| `PULADO: <motivo>` | Tem insumo, ou já estava Criado no SAP | Sim |
| `SIMULACAO: ...` | Dry-run (não vai para a planilha) | — |

O relatório (`relatorios/relatorio_AAAAMMDD_HHMMSS.xlsx` + `.csv`) traz: linha, OS, serviço,
quantidade, data, status, mensagem, tentativas e data/hora.

## 10. Proteções

- **Retentativas** só para falhas transitórias (tela demorou, imagem não apareceu).
  Erros de negócio não são retentados, e **nada é retentado depois do check verde**
  (evita apontamento duplicado).
- **Já Criado:** se a linha da grade já mostrar *Criado*, o robô pula.
- **Insumo:** linhas com insumo viram `PULADO` antes de entrar no SAP
  (regra a definir — ponto `REGRA_INSUMO` em `main.py`).

## 11. Problemas comuns

| Mensagem | O que fazer |
|---|---|
| `'tela_selecao' não apareceu` / `imagem não encontrada` | Rode `--testar-imagens`; confira escala 125% e SAP maximizado; recapture a imagem |
| `não consegui ler a coluna Serviço (Ctrl+C retornou vazio)` | Teste Ctrl+C manualmente numa célula da grade; se o SAP não copiar, use `exigir_leitura_servico: false` (a validação do serviço deixa de ser feita) |
| `cabeçalho da coluna 'X' não encontrado` | A coluna saiu da área visível ou mudou de largura: restaure o layout da grade |
| `APIError 403` na planilha | Compartilhe a planilha com o e-mail da conta de serviço |

## 12. Modo scripting (alternativo)

Se um dia o SAP GUI Scripting for liberado, `modo: scripting` usa o `sap_client.py`, que é
mais rápido e não depende da tela. Exige preencher os IDs em `sap_ids.yaml` (gravador de
scripts: Alt+F12 → Gravação e reprodução de script, ou `python main.py --listar-ids`).
