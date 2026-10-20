# Robô de apontamento de O.S. — ZFLPP005 (SAP Suzano)

Lê as linhas de uma planilha Google Sheets e, para cada uma, faz o apontamento na
transação **ZFLPP005 – Entrada de apontamento - ord.serviço**: pesquisa a O.S., confere o
serviço, preenche o popup **Equipes e Eventos**, clica em **Salvar Guia** e confere se o
**Status Reg** ficou **Criado**. O resultado vai para a coluna **STATUS** da planilha e
para um relatório Excel/CSV.

> **Comece sempre em modo simulação** (`simulacao: true`, que é o padrão). Nesse modo o
> robô faz tudo, **menos** clicar no check verde e no Salvar Guia.

---

## 1. Arquivos

| Arquivo | Para que serve |
|---|---|
| `main.py` | Orquestra o fluxo, retentativas, relatório e STATUS |
| `sap_client.py` | Automação via **SAP GUI Scripting** (abordagem principal) |
| `sap_imagem.py` | **Plano B** por imagem (pyautogui + opencv + pywinauto) |
| `planilha.py` | Leitura da planilha e gravação do STATUS |
| `utils.py` | Conversões (data, quantidade, serviço), esperas, tecla de emergência, relatório |
| `config.yaml` | Configurações (colunas, fornecedor, período, timeouts, modo) |
| `sap_ids.yaml` | IDs dos campos do SAP — **precisam ser confirmados** |
| `imagens/` | Prints de referência (só plano B e ícone do SAP Logon) |
| `logs/`, `relatorios/` | Criadas automaticamente |

## 2. Instalação

1. Instale o **Python 3.11+** (marque *Add Python to PATH*).
2. Na pasta do robô:

```bash
python -m venv .venv
```

```bash
.venv\Scripts\activate
```

```bash
pip install -r requirements.txt
```

## 3. Habilitar o SAP GUI Scripting

São duas chaves — se uma estiver desligada, o robô avisa *"SAP GUI Scripting desabilitado"*.

**No servidor (time de Basis/TI da Suzano):** parâmetro `sapgui/user_scripting = TRUE`
(transação RZ11). Em muitas empresas é liberado por usuário — abra um chamado se necessário.

**No seu computador:**
1. No SAP, clique no ícone de **Opções** (monitor colorido, *Personalizar layout local*, ou Alt+F12) → **Opções...**
2. **Acessibilidade e Scripting → Scripting**.
3. Marque **Ativar scripting** e **desmarque** *Notificar quando um script se conectar ao SAP GUI*
   e *Notificar quando um script abrir uma conexão* (senão aparece um aviso a cada execução).
4. Feche e abra o SAP Logon.

Se a TI não liberar, use o **plano B**: `modo: imagem` no `config.yaml` (seção 9).

## 4. Conta de serviço do Google (para ler e gravar a planilha)

1. Acesse <https://console.cloud.google.com/>, crie (ou escolha) um projeto.
2. **APIs e serviços → Biblioteca**: ative **Google Sheets API** e **Google Drive API**.
3. **APIs e serviços → Credenciais → Criar credenciais → Conta de serviço**. Dê um nome
   (ex.: `robo-apontamento`) e conclua.
4. Abra a conta criada → aba **Chaves → Adicionar chave → JSON**. Salve o arquivo como
   `credentials.json` na pasta do robô. **Não compartilhe nem versione esse arquivo**.
5. Copie o e-mail da conta (algo como `robo-apontamento@projeto.iam.gserviceaccount.com`)
   e **compartilhe a planilha com ele como Editor** (botão Compartilhar da planilha).

Alternativa sem conta de serviço: se a planilha for pública ("qualquer pessoa com o link"),
use `planilha.modo: csv`. Nesse modo o robô **só lê**: o STATUS fica apenas no relatório.

## 5. Ajustar o `config.yaml`

Itens marcados com `# CONFIRMAR`:

- `planilha.colunas.os` → letra da coluna da O.S. (**[COLUNA_OS]**).
- `planilha.colunas.insumo` → letra da coluna de insumo (**[COLUNA_INSUMO]**), ou `null`.
  Valores considerados "tem insumo": `valores_com_insumo` (SIM, S, X, ...).
- `sap.saplogon_exe` → caminho do `saplogon.exe`.
- `selecao.periodo` → *Data planejada*:
  - `mes_atual`: 1º e último dia do mês corrente (padrão);
  - `mes_da_execucao`: mês da data da coluna G de cada linha;
  - `fixo`: usa `data_inicial` / `data_final`.

A coluna **STATUS** é encontrada pelo cabeçalho "STATUS"; se não existir, é criada após a
última coluna preenchida.

## 6. Mapear os IDs do SAP (`sap_ids.yaml`)

Transações Z têm nomes de campo próprios, então os IDs do arquivo são **exemplos**.

### Opção A — Gravador de Scripts (recomendado)
1. No SAP, **Alt+F12 → Gravação e reprodução de script...**
2. Clique em **Gravar** (botão vermelho). Anote o caminho do arquivo `.vbs` em *Salvar em*.
3. Faça **manualmente** um apontamento completo: entre na ZFLPP005, preencha a seleção,
   F8, clique na aba Operação/Material, dê duplo clique em *Maq Evento*, preencha o popup,
   marque *Confirmação final*, check verde, Salvar Guia. *(Faça numa O.S. de teste ou
   cancele antes de salvar.)*
4. Pare a gravação e abra o `.vbs` no Bloco de Notas. Você verá linhas como:

```vb
session.findById("wnd[0]/usr/ctxtS_AUFNR-LOW").text = "123456"
session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell").setCurrentCell 0,"MAQ_EVENTO"
session.findById("wnd[0]/usr/cntlGRID1/shellcont/shell").doubleClickCurrentCell
session.findById("wnd[1]/usr/chkGS_X-CONF").selected = true
session.findById("wnd[1]/tbar[0]/btn[0]").press
```

5. Copie cada ID (o texto entre aspas do `findById`) para a chave correspondente do
   `sap_ids.yaml`. O que aparece no `setCurrentCell` (ex.: `MAQ_EVENTO`) é o **nome técnico**
   da coluna — use-o em `grade.colunas` (é mais confiável que o título).

### Opção B — Listar os IDs da tela
Deixe o SAP na tela desejada (seleção, grade ou com o popup aberto) e rode:

```bash
python main.py --listar-ids
```

Será gerado `ids_tela.txt` com todos os elementos (ID, tipo, texto) e, para a grade ALV,
as colunas no formato `coluna NOME_TECNICO = 'Título'`.

## 7. Como rodar

1. Abra o SAP e **faça login** (o robô nunca guarda nem digita senha). Se o SAP estiver
   fechado, ele abre o SAP Logon e espera você logar.
2. Simulação (padrão), só algumas linhas:

```bash
python main.py --simular --linhas 2-5
```

3. Confira o log em `logs/` e o relatório em `relatorios/`. Status `SIMULACAO` = o popup foi
   preenchido corretamente e cancelado.
4. Modo real (grava no SAP), primeiro numa linha só:

```bash
python main.py --real --linhas 2
```

5. Tudo certo? Rode a planilha inteira:

```bash
python main.py --real
```

**Parar com segurança:** pressione **Ctrl+Shift+Q**. O robô termina a etapa atual e para.
Se já tiver clicado no check verde, ele termina o Salvar Guia antes de parar, para não
deixar apontamento pela metade. (Plano B: levar o mouse ao canto superior esquerdo também aborta.)

## 8. Status e relatório

| Status | Significado | Reprocessa na próxima execução? |
|---|---|---|
| `OK` | Apontado, Status Reg = Criado | Não |
| `ERRO: <motivo>` | Nada foi gravado (OS não encontrada, serviço divergente, dado inválido...) | Sim |
| `VERIFICAR: <motivo>` | Falhou **depois** do check verde — confira no SAP | Não (corrija e apague o status) |
| `PULADO: <motivo>` | Tem insumo, ou já estava Criado no SAP | Sim |
| `SIMULACAO: ...` | Dry-run (não vai para a planilha) | — |

O relatório (`relatorios/relatorio_AAAAMMDD_HHMMSS.xlsx` + `.csv`) traz: linha, OS, serviço,
quantidade, data, status, mensagem, tentativas e data/hora. O CSV é gravado linha a linha,
então nada se perde se o robô cair.

## 9. Plano B — por imagem

1. `modo: imagem` (ou `auto`, que tenta o scripting e cai para imagem).
2. Capture os prints listados em `imagens/LEIA-ME.txt`.
3. Calibre em `config.yaml → plano_b`: `dx`/`dy` (distância do rótulo até a caixa de texto),
   `dy_primeira_linha` e `altura_linha` da grade, `confidence`.
4. Windows com zoom 100%, SAP maximizado, mesmo tema sempre.

É bem mais frágil que o scripting: use só se o scripting estiver bloqueado.

## 10. Como o robô funciona (partes críticas)

- **Esperas:** depois de cada ação o robô aguarda `session.Busy == False` (timeout
  `sap.timeout_padrao`) e espera elementos aparecerem — sem sleeps fixos.
- **Leitura do ALV:** a grade é um `GuiShell` do tipo `GridView`. O `GetCellValue(linha, coluna)`
  exige o nome técnico; o robô traduz títulos ("Serviço") para nomes técnicos e rola a grade
  (`firstVisibleRow`) antes de ler, porque o ALV só carrega as linhas visíveis.
- **Duplo clique na célula:** `setCurrentCell(linha, coluna)` + `doubleClickCurrentCell()`.
  Se *Maq Evento* for um link (hotspot), use `acao_maq_evento: clique`.
- **Comparação do serviço:** ignora zeros à esquerda (`0024001761` = `24001761`) e trata
  números vindos da planilha como `24001761.0`.
- **Popups inesperados:** o texto é registrado no log e a janela é fechada com **F12/Cancelar**
  (nunca Enter, que em popups de confirmação equivale a "Sim").
- **Retentativas:** só para falhas transitórias (timeout, erro COM). Erros de negócio não são
  retentados, e **nada é retentado depois do check verde** (evita apontamento duplicado).
- **Insumo:** linhas com insumo são marcadas `PULADO` **antes** de entrar no SAP
  (regra a definir — ponto `REGRA_INSUMO` em `main.py`).
- **Proteção contra duplicidade:** se a linha da grade já estiver *Criado*, o robô pula
  (`execucao.pular_se_ja_criado`).

## 11. Problemas comuns

| Mensagem | O que fazer |
|---|---|
| `SAP GUI Scripting desabilitado` | Seção 3, ou use o plano B |
| `elemento não encontrado: wnd[0]/usr/...` | ID errado no `sap_ids.yaml` — seção 6 |
| `coluna 'X' não encontrada no ALV. Disponíveis: ...` | Use um dos nomes técnicos listados em `grade.colunas` |
| `APIError 403` na planilha | Compartilhe a planilha com o e-mail da conta de serviço |
| Datas não batem | Ajuste `selecao.formato_data` ao formato de data do seu usuário SAP |
