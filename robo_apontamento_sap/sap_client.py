"""
sap_client.py — Automação da ZFLPP005 via SAP GUI Scripting (abordagem principal).

Hierarquia de objetos do SAP GUI Scripting:
    GetObject("SAPGUI").GetScriptingEngine   → aplicação
        .Children(0)                          → conexão (um sistema aberto no SAP Logon)
            .Children(0)                      → sessão (um "modo"/janela)
                .findById("wnd[0]/...")       → elementos da tela

Regras importantes usadas em todo o módulo:
1. Depois de QUALQUER ação que vá ao servidor (Enter, F8, duplo clique, botão),
   chamamos self.esperar(), que aguarda session.Busy == False.
2. Nunca guardamos objetos COM de uma tela para outra: depois de um roundtrip o SAP
   pode recriar os controles e a referência antiga fica inválida. Por isso a grade
   é sempre buscada de novo com self._grid().
3. "Ponto sem retorno": a partir do clique no check verde do popup o SAP já pode ter
   gravado algo. Daí em diante o robô não retenta a linha nem para no meio
   (ver checar_parada e main.py).
"""
from __future__ import annotations

import logging
import subprocess
import time
from pathlib import Path
from typing import Any

from utils import (ErroConfiguracao, ErroNegocio, ErroSAP, ParadaEmergencia, TempoEsgotado,
                   esperar_ate, normalizar_servico, normalizar_texto, parse_numero, vazio)

try:
    import win32com.client
except ImportError:  # permite importar o módulo fora do Windows (testes)
    win32com = None

log = logging.getLogger("robo.sap")


class ScriptingDesabilitado(ErroConfiguracao):
    """SAP Logon aberto, mas o GUI Scripting está desligado (cliente ou servidor)."""


def colecao(c: Any) -> list:
    """Converte uma GuiCollection do SAP em lista Python."""
    try:
        return [c.ElementAt(i) for i in range(c.Count)]
    except Exception:  # noqa: BLE001
        return [c(i) for i in range(c.Count)]


class SapClient:
    def __init__(self, cfg: dict, ids: dict, parada: ParadaEmergencia) -> None:
        self.cfg = cfg
        self.ids = ids
        self.parada = parada
        sap = cfg["sap"]
        self.transacao = str(sap.get("transacao", "ZFLPP005")).upper()
        self.timeout = float(sap.get("timeout_padrao", 60))
        self.timeout_popup = float(sap.get("timeout_popup", 15))
        self.status_criado = sap.get("status_criado", "Criado")
        self.session = None
        self.ponto_sem_retorno = False
        self._cols: dict[str, str] = {}  # cache: nome lógico → nome técnico da coluna do ALV

    # =====================================================================
    # Utilitários de baixo nível
    # =====================================================================
    def _id(self, caminho: str, obrigatorio: bool = True) -> str | None:
        """Lê um ID do sap_ids.yaml no formato 'secao.chave'."""
        no: Any = self.ids
        for parte in caminho.split("."):
            no = no.get(parte) if isinstance(no, dict) else None
        if vazio(no) and obrigatorio:
            raise ErroConfiguracao(f"ID '{caminho}' não definido em sap_ids.yaml")
        return no

    def _find(self, id_: str | None):
        """findById que devolve None em vez de exceção."""
        if not id_:
            return None
        try:
            return self.session.findById(id_)
        except Exception:  # noqa: BLE001
            return None

    def _elemento(self, id_: str, timeout: float = 5):
        """findById com espera curta (a tela pode ainda estar sendo desenhada)."""
        try:
            return esperar_ate(lambda: self._find(id_), timeout, descricao=f"elemento {id_}")
        except TempoEsgotado as e:
            raise TempoEsgotado(f"elemento não encontrado: {id_} — confira o sap_ids.yaml "
                                f"(python main.py --listar-ids mostra os IDs da tela atual)") from e

    def esperar(self, timeout: float | None = None) -> None:
        """Espera inteligente: aguarda o SAP terminar o processamento (session.Busy).
        Enquanto ocupado o SAP pode rejeitar chamadas COM — tratamos como "ocupado"."""
        fim = time.monotonic() + (timeout or self.timeout)
        while True:
            try:
                if not self.session.Busy:
                    return
            except Exception:  # noqa: BLE001 — RPC_E_CALL_REJECTED etc.
                pass
            if time.monotonic() > fim:
                raise TempoEsgotado(f"SAP ocupado por mais de {timeout or self.timeout:.0f}s")
            time.sleep(0.2)

    def _wnd0(self):
        return self.session.findById("wnd[0]")

    def _janela(self, n: int):
        return self._find(f"wnd[{n}]")

    def _ultima_janela(self) -> int:
        """Índice da janela modal mais alta aberta (0 = só a principal)."""
        for n in range(6, 0, -1):
            if self._janela(n) is not None:
                return n
        return 0

    def status_bar(self) -> tuple[str, str]:
        """(tipo, texto) da barra de status. Tipos: S=sucesso, W=aviso, E=erro,
        A=cancelamento, I=informação, ''=vazia."""
        sbar = self._find(self._id("geral.barra_status", obrigatorio=False) or "wnd[0]/sbar")
        if sbar is None:
            return "", ""
        try:
            return str(sbar.MessageType or ""), str(sbar.Text or "").strip()
        except Exception:  # noqa: BLE001
            return "", ""

    def _textos(self, obj, prof: int = 0, saida: list | None = None) -> list[str]:
        """Coleta recursivamente os textos visíveis de uma janela (para o log)."""
        saida = [] if saida is None else saida
        try:
            if obj.Type in ("GuiLabel", "GuiTextField", "GuiCTextField", "GuiTitlebar") and str(obj.Text).strip():
                saida.append(str(obj.Text).strip())
        except Exception:  # noqa: BLE001
            pass
        if prof < 8:
            try:
                for filho in colecao(obj.Children):
                    self._textos(filho, prof + 1, saida)
            except Exception:  # noqa: BLE001 — elemento sem filhos
                pass
        return saida

    def texto_janela(self, n: int) -> str:
        w = self._janela(n)
        if w is None:
            return ""
        partes = self._textos(w)
        try:
            sb = self._find(f"wnd[{n}]/sbar")
            if sb is not None and str(sb.Text).strip():
                partes.append(f"barra: {sb.Text.strip()}")
        except Exception:  # noqa: BLE001
            pass
        return f"[{w.Text}] " + " | ".join(dict.fromkeys(partes))

    def _fechar_janela(self, n: int) -> None:
        """Fecha a janela n de forma SEGURA: F12 (Cancelar); se não fechar, Close().
        Nunca usa Enter, porque em popups de confirmação Enter = 'Sim'."""
        w = self._janela(n)
        if w is None:
            return
        try:
            w.sendVKey(12)
            self.esperar()
        except Exception:  # noqa: BLE001
            pass
        if self._janela(n) is not None:
            try:
                self._janela(n).Close()
                self.esperar()
            except Exception:  # noqa: BLE001
                pass

    def fechar_popups(self) -> list[str]:
        """TRATAMENTO DE POPUPS INESPERADOS: registra o texto de cada janela modal
        (wnd[1], wnd[2]...) e fecha da mais alta para a mais baixa."""
        textos = []
        for _ in range(8):
            n = self._ultima_janela()
            if n == 0:
                break
            t = self.texto_janela(n)
            log.warning("Popup wnd[%d]: %s", n, t)
            textos.append(t)
            self._fechar_janela(n)
            if self._janela(n) is not None and self._ultima_janela() == n:
                raise ErroSAP(f"não foi possível fechar o popup wnd[{n}]: {t}")
        return textos

    def checar_parada(self) -> None:
        """Só respeita a tecla de emergência ANTES do ponto sem retorno,
        para nunca deixar um apontamento confirmado e não salvo."""
        if not self.ponto_sem_retorno:
            self.parada.verificar()

    # =====================================================================
    # 3.1 Conexão / abertura do SAP
    # =====================================================================
    def conectar(self) -> None:
        if win32com is None:
            raise ErroConfiguracao("pywin32 não instalado: pip install pywin32")
        sap = self.cfg["sap"]
        engine = self._obter_engine()

        if engine.Children.Count == 0:
            desc = sap.get("conexao_descricao")
            if not desc:
                raise ErroConfiguracao("SAP Logon aberto mas sem conexão. Faça login no SAP ou "
                                       "informe sap.conexao_descricao no config.yaml.")
            log.info("Abrindo conexão '%s' no SAP Logon...", desc)
            engine.OpenConnection(desc, True)

        ic, is_ = int(sap.get("indice_conexao", 0)), int(sap.get("indice_sessao", 0))
        conexao = esperar_ate(lambda: engine.Children(ic) if engine.Children.Count > ic else None,
                              30, descricao="conexão SAP")
        self.session = esperar_ate(lambda: conexao.Children(is_) if conexao.Children.Count > is_ else None,
                                   30, descricao="sessão SAP")

        # Nunca digitamos senha: se estiver na tela de logon (S000), o usuário entra manualmente.
        def logado():
            info = self.session.Info
            return bool(info.User) and str(info.Transaction).upper() != "S000"
        if not logado():
            log.warning(">>> Faça o LOGIN no SAP manualmente. Aguardando até %ss...", sap.get("timeout_login", 300))
            esperar_ate(logado, float(sap.get("timeout_login", 300)), intervalo=1, descricao="login no SAP")
        info = self.session.Info
        log.info("Conectado: sistema %s, mandante %s, usuário %s.", info.SystemName, info.Client, info.User)

    def _obter_engine(self):
        sap = self.cfg["sap"]

        def sapgui():
            try:
                return win32com.client.GetObject("SAPGUI")
            except Exception:  # noqa: BLE001
                return None

        app = sapgui()
        if app is None:
            log.info("SAP Logon não está aberto. Abrindo...")
            self._abrir_saplogon()
            app = esperar_ate(sapgui, float(sap.get("timeout_abrir_saplogon", 90)), intervalo=1,
                              descricao="SAP Logon")
        try:
            engine = app.GetScriptingEngine
        except Exception as e:  # noqa: BLE001
            raise ScriptingDesabilitado(
                "SAP GUI Scripting desabilitado. Habilite (ver README) ou use modo: imagem.") from e
        if engine is None:
            raise ScriptingDesabilitado("SAP GUI Scripting desabilitado.")
        return engine

    def _abrir_saplogon(self) -> None:
        exe = self.cfg["sap"].get("saplogon_exe")
        if exe and Path(exe).exists():
            subprocess.Popen([exe])  # forma preferida
            return
        # Alternativa: clicar no ícone do SAP Logon na tela (imagens/icone_sap.png)
        from sap_imagem import clicar_imagem
        im = self.cfg.get("imagem", {})
        icone = Path(__file__).resolve().parent / im.get("pasta", "imagens") / "icone_sap.png"
        log.info("saplogon.exe não encontrado; procurando o ícone %s na tela.", icone)
        clicar_imagem(icone, float(im.get("confidence", 0.9)), timeout=10)

    # =====================================================================
    # 3.2 Entrar na transação
    # =====================================================================
    def na_tela_selecao(self) -> bool:
        id_os = self._id("selecao.ordem_servico")
        try:
            return (str(self.session.Info.Transaction).upper() == self.transacao
                    and self._find(id_os) is not None
                    and self._ultima_janela() == 0)
        except Exception:  # noqa: BLE001
            return False

    def abrir_transacao(self) -> None:
        self.checar_parada()
        self.fechar_popups()
        okcd = self._elemento(self._id("geral.campo_comando"))
        okcd.text = f"/n{self.transacao}"
        self._wnd0().sendVKey(0)
        self.esperar()
        try:
            esperar_ate(self.na_tela_selecao, 10, descricao="tela de seleção")
            return
        except TempoEsgotado:
            tipo, txt = self.status_bar()
            log.warning("/n%s não abriu a tela (%s %s). Tentando pelo favorito...", self.transacao, tipo, txt)
        self._abrir_favorito()
        esperar_ate(self.na_tela_selecao, 15, descricao="tela de seleção (favorito)")

    def _abrir_favorito(self) -> None:
        """Fallback: duplo clique no favorito 'ZFLPP005 - ...' da árvore do SAP Easy Access."""
        self.fechar_popups()
        okcd = self._elemento(self._id("geral.campo_comando"))
        okcd.text = "/n"
        self._wnd0().sendVKey(0)
        self.esperar()
        arvore = self._elemento(self._id("geral.arvore_easy_access"), timeout=10)
        for chave in colecao(arvore.GetAllNodeKeys()):
            if self.transacao in str(arvore.GetNodeTextByKey(chave)).upper():
                arvore.selectNode(chave)
                arvore.doubleClickNode(chave)
                self.esperar()
                return
        raise ErroConfiguracao(f"favorito {self.transacao} não encontrado no SAP Easy Access")

    # =====================================================================
    # 3.3 Tela de seleção
    # =====================================================================
    def _preencher(self, chave_id: str, valor: Any, obrigatorio: bool = True) -> None:
        id_ = self._id(chave_id, obrigatorio)
        if not id_:
            return
        campo = self._elemento(id_)
        campo.text = ""          # limpa antes de digitar
        campo.text = str(valor)

    def pesquisar_os(self, os_valor: str, data_ini: str, data_fim: str) -> None:
        self.checar_parada()
        if not self.na_tela_selecao():
            self.abrir_transacao()
        s = self.cfg["selecao"]
        self._preencher("selecao.ordem_servico", os_valor)
        self._preencher("selecao.nucleo", s.get("nucleo", "*"), obrigatorio=False)
        self._preencher("selecao.centro", s.get("centro", "*"), obrigatorio=False)
        self._preencher("selecao.fornecedor", s.get("fornecedor", ""))
        self._preencher("selecao.lote_de", s.get("lote_de", "0"), obrigatorio=False)
        self._preencher("selecao.lote_ate", s.get("lote_ate", "0"), obrigatorio=False)
        self._preencher("selecao.data_de", data_ini)
        self._preencher("selecao.data_ate", data_fim)
        self._preencher("selecao.max_registros", s.get("max_registros", "1000"), obrigatorio=False)
        for id_ in self.ids.get("selecao", {}).get("limpar") or []:   # demais campos em branco
            campo = self._find(id_)
            if campo is not None:
                campo.text = ""

        log.debug("F8 — OS %s, período %s a %s", os_valor, data_ini, data_fim)
        self._wnd0().sendVKey(8)
        self.esperar()

        # Popup logo após o F8 (ex.: "Nenhum dado encontrado")
        if self._ultima_janela():
            textos = self.fechar_popups()
            raise ErroNegocio(f"OS não encontrada ({'; '.join(textos)})")

        tipo, txt = self.status_bar()
        if self.na_tela_selecao():  # continuou na seleção = sem resultado ou erro de validação
            raise ErroNegocio(f"OS não encontrada{f' ({txt})' if txt else ''}")
        if tipo in ("E", "A"):
            raise ErroSAP(txt)

        aba = self._find(self._id("grade.aba_operacao_material", obrigatorio=False))
        if aba is not None:
            aba.select()
            self.esperar()

        if self._grid().RowCount == 0:
            raise ErroNegocio("OS não encontrada (grade vazia)")

    # =====================================================================
    # 3.4 Leitura do ALV (GuiShell / GridView)
    # =====================================================================
    def _grid(self, timeout: float = 15):
        """Localiza a grade ALV. Usa o ID do sap_ids.yaml; se não houver (ou mudar),
        procura recursivamente o primeiro GuiShell com SubType 'GridView' em wnd[0]/usr."""
        def achar():
            g = self._find(self._id("grade.id", obrigatorio=False))
            if g is None:
                usr = self._find("wnd[0]/usr")
                g = self._procurar_grid(usr) if usr is not None else None
            return g
        try:
            return esperar_ate(achar, timeout, descricao="grade ALV")
        except TempoEsgotado as e:
            raise TempoEsgotado("grade ALV (Operação/Material) não encontrada na tela") from e

    def _procurar_grid(self, obj, prof: int = 0):
        try:
            if obj.Type == "GuiShell" and obj.SubType == "GridView":
                return obj
        except Exception:  # noqa: BLE001
            pass
        if prof > 10:
            return None
        try:
            filhos = colecao(obj.Children)
        except Exception:  # noqa: BLE001
            return None
        for f in filhos:
            g = self._procurar_grid(f, prof + 1)
            if g is not None:
                return g
        return None

    def _col(self, grid, logico: str) -> str:
        """Traduz o nome lógico ('servico', 'maq_evento'...) para o nome TÉCNICO da
        coluna do ALV. O GetCellValue só aceita o nome técnico, mas no sap_ids.yaml
        pode-se usar o título visível ('Serviço') — aqui comparamos com os títulos
        de cada coluna (curto/médio/longo), sem acento e sem diferenciar maiúsculas."""
        if logico in self._cols:
            return self._cols[logico]
        alvo = self._id(f"grade.colunas.{logico}")
        tecnicos = [str(c) for c in colecao(grid.ColumnOrder)]
        if alvo in tecnicos:
            self._cols[logico] = alvo
            return alvo

        alvo_n = normalizar_texto(alvo)
        titulos_por_col: dict[str, set[str]] = {}
        for c in tecnicos:
            titulos = set()
            try:
                titulos.add(normalizar_texto(grid.GetDisplayedColumnTitle(c)))
            except Exception:  # noqa: BLE001
                pass
            try:
                titulos.update(normalizar_texto(t) for t in colecao(grid.GetColumnTitles(c)))
            except Exception:  # noqa: BLE001
                pass
            titulos.discard("")
            titulos_por_col[c] = titulos
            if alvo_n in titulos:
                self._cols[logico] = c
                log.debug("Coluna '%s' → %s", alvo, c)
                return c
        # Título truncado na tela (ex.: 'Qt Executa' de 'Qt Executada')
        for c, titulos in titulos_por_col.items():
            if any(t.startswith(alvo_n) or alvo_n.startswith(t) for t in titulos):
                self._cols[logico] = c
                log.debug("Coluna '%s' → %s (correspondência parcial)", alvo, c)
                return c
        disponiveis = ", ".join(f"{c}={'/'.join(sorted(t))}" for c, t in titulos_por_col.items())
        raise ErroConfiguracao(f"coluna '{alvo}' não encontrada no ALV. Disponíveis: {disponiveis}")

    def _garantir_visivel(self, grid, linha: int) -> None:
        """O ALV carrega as linhas sob demanda: célula fora da área visível pode vir
        vazia. Rolamos a grade (firstVisibleRow) até a linha antes de ler/clicar."""
        try:
            primeira, visiveis = int(grid.FirstVisibleRow), max(int(grid.VisibleRowCount), 1)
            if not (primeira <= linha < primeira + visiveis):
                grid.firstVisibleRow = linha
                self.esperar()
        except Exception:  # noqa: BLE001
            pass

    def _celula(self, grid, linha: int, logico: str) -> str:
        col = self._col(grid, logico)
        self._garantir_visivel(grid, linha)
        return str(grid.GetCellValue(linha, col) or "").strip()

    def localizar_servico(self, servico: Any) -> int:
        """Procura na grade a linha cujo 'Serviço' bate com a planilha
        (ignorando zeros à esquerda). Com várias linhas iguais, prefere a que
        ainda não está 'Criado'. Retorna o índice da linha (base 0)."""
        self.checar_parada()
        alvo = normalizar_servico(servico)
        grid = self._grid()
        vistos, iguais = [], []
        for i in range(int(grid.RowCount)):
            v = self._celula(grid, i, "servico")
            vistos.append(v)
            if normalizar_servico(v) == alvo:
                iguais.append(i)
        if not vistos:
            raise ErroNegocio("OS não encontrada (grade vazia)")
        if not iguais:
            sap = ", ".join(dict.fromkeys(vistos))
            raise ErroNegocio(f"serviço divergente (SAP={sap}, planilha={servico})")
        for i in iguais:
            if not self.ja_criado(i):
                return i
        return iguais[0]

    def _reconfirmar_linha(self, grid, linha: int, servico: Any) -> int:
        """Depois de um roundtrip a grade pode ter sido recarregada/reordenada."""
        alvo = normalizar_servico(servico)
        if linha < int(grid.RowCount) and normalizar_servico(self._celula(grid, linha, "servico")) == alvo:
            return linha
        for i in range(int(grid.RowCount)):
            if normalizar_servico(self._celula(grid, i, "servico")) == alvo:
                return i
        raise ErroSAP(f"serviço {servico} sumiu da grade após o apontamento")

    def ja_criado(self, linha: int) -> bool:
        st = self._celula(self._grid(), linha, "status_reg")
        return normalizar_texto(st) == normalizar_texto(self.status_criado)

    # =====================================================================
    # 3.5 Apontamento — popup "Equipes e Eventos"
    # =====================================================================
    def apontar(self, linha: int, data_exec: str, quantidade: str, simulacao: bool) -> None:
        self.checar_parada()
        grid = self._grid()
        col = self._col(grid, "maq_evento")
        self._garantir_visivel(grid, linha)

        # DUPLO CLIQUE NA CÉLULA: no ALV não existe "clicar em coordenada". Primeiro
        # posicionamos o cursor na célula (setCurrentCell = currentCellRow +
        # currentCellColumn) e depois disparamos o evento de duplo clique nela.
        # Se a coluna for um hotspot (link sublinhado), o evento certo é clickCurrentCell.
        grid.setCurrentCell(linha, col)
        if str(self.ids["grade"].get("acao_maq_evento", "duplo_clique")) == "clique":
            grid.clickCurrentCell()
        else:
            grid.doubleClickCurrentCell()
        self.esperar()

        try:
            popup = esperar_ate(lambda: self._janela(1), self.timeout_popup, descricao="popup Equipes e Eventos")
        except TempoEsgotado:
            _, txt = self.status_bar()
            raise ErroNegocio(f"popup 'Equipes e Eventos' não abriu{f' ({txt})' if txt else ''}")

        esperado = self.ids.get("popup", {}).get("titulo", "Equipes e Eventos")
        if normalizar_texto(esperado) not in normalizar_texto(popup.Text):
            textos = self.fechar_popups()
            raise ErroSAP(f"abriu outro popup em vez de '{esperado}': {'; '.join(textos)}")

        self._preencher("popup.data_execucao", data_exec)
        self._preencher("popup.quantidade_executada", quantidade)
        self._elemento(self._id("popup.confirmacao_final")).selected = True
        log.debug("Popup preenchido: data=%s qtd=%s confirmação final=ON", data_exec, quantidade)

        if simulacao:
            log.info("[SIMULAÇÃO] popup preenchido; NÃO clicando no check verde.")
            cancelar = self._find(self._id("popup.botao_cancelar", obrigatorio=False))
            if cancelar is not None:
                cancelar.press()
                self.esperar()
            self._fechar_janela(1)
            return

        self.checar_parada()  # última chance de parar
        self.ponto_sem_retorno = True
        self._elemento(self._id("popup.botao_confirmar")).press()
        self.esperar()

        # Popup de confirmação adicional, se a transação tiver (configurável)
        sim = self._id("popup.botao_sim_pos_confirmacao", obrigatorio=False)
        if sim and self._ultima_janela() and self._find(sim) is not None:
            log.info("Confirmando popup pós-check: %s", self.texto_janela(self._ultima_janela()))
            self._find(sim).press()
            self.esperar()

        tipo, txt = self.status_bar()
        if tipo in ("E", "A"):
            self.fechar_popups()
            raise ErroSAP(txt)
        if self._ultima_janela():
            # Popup não fechou: o SAP recusou os dados (mensagem no próprio popup) ou abriu outro
            textos = self.fechar_popups()
            raise ErroSAP(f"popup não fechou após o check verde: {'; '.join(textos)}")
        if tipo == "W":
            log.warning("Aviso do SAP após o apontamento: %s", txt)

    # =====================================================================
    # 3.6 Conferência e Salvar Guia
    # =====================================================================
    def conferir_apontamento(self, linha: int, servico: Any, quantidade: float) -> int:
        grid = self._grid()
        linha = self._reconfirmar_linha(grid, linha, servico)
        perc = self._celula(grid, linha, "perc_exec")
        qt = self._celula(grid, linha, "qt_executada")
        try:
            p = parse_numero(perc.replace("%", ""))
        except ValueError:
            p = None
        if p is None or abs(p - 100) > 0.01:
            raise ErroSAP(f"% Exec. ficou '{perc}' (esperado 100,00)")
        try:
            q = parse_numero(qt)
        except ValueError:
            q = 0.0
        if q == 0:
            raise ErroSAP(f"Qt Executa não foi preenchida ('{qt}')")
        if abs(q - quantidade) > 0.0015:
            log.warning("Qt Executa no SAP (%s) difere da planilha (%s).", qt, quantidade)
        return linha

    def salvar(self, linha: int, servico: Any) -> str:
        cfg = self.ids["salvar_guia"]
        grid = self._grid()
        linha = self._reconfirmar_linha(grid, linha, servico)
        if cfg.get("selecionar_linha"):
            grid.selectedRows = str(linha)

        tipo_botao = str(cfg.get("tipo", "botao"))
        if tipo_botao == "grid_toolbar":
            grid.pressToolbarButton(cfg["id"])
        elif tipo_botao == "tecla":
            self._wnd0().sendVKey(int(cfg["id"]))
        else:
            self._elemento(cfg["id"]).press()
        self.esperar()

        sim = cfg.get("popup_confirmar_botao")
        if sim and self._janela(1) is not None:
            log.info("Confirmando popup do Salvar: %s", self.texto_janela(1))
            self._elemento(sim).press()
            self.esperar()

        tipo, txt = self.status_bar()
        if tipo in ("E", "A"):
            self.fechar_popups()
            raise ErroSAP(txt)
        if self._ultima_janela():
            textos = self.fechar_popups()
            raise ErroSAP(f"popup inesperado ao salvar: {'; '.join(textos)}")

        ultimo = {"st": ""}

        def criado() -> bool:
            g = self._grid(timeout=3)
            r = self._reconfirmar_linha(g, linha, servico)
            ultimo["st"] = self._celula(g, r, "status_reg")
            return normalizar_texto(ultimo["st"]) == normalizar_texto(self.status_criado)

        try:
            esperar_ate(criado, float(self.cfg["sap"].get("timeout_status_criado", 30)), intervalo=1,
                        descricao="Status Reg = Criado")
        except TempoEsgotado:
            raise ErroSAP(f"status não ficou {self.status_criado} (Status Reg='{ultimo['st']}', barra: '{txt}')")
        return txt

    # =====================================================================
    # 3.7 Voltar para a seleção / recuperação
    # =====================================================================
    def voltar_selecao(self) -> None:
        for _ in range(3):
            if self.na_tela_selecao():
                return
            if self._ultima_janela():
                self.fechar_popups()   # ex.: "dados serão perdidos?" → Cancelar
            else:
                self._wnd0().sendVKey(12)  # ESC
                self.esperar()
        if not self.na_tela_selecao():
            log.info("ESC não voltou à seleção; reabrindo /n%s.", self.transacao)
            self.abrir_transacao()

    def recuperar(self) -> None:
        """Chamado antes de uma retentativa: limpa popups e reabre a transação."""
        try:
            self.fechar_popups()
        except Exception as e:  # noqa: BLE001
            log.warning("Falha ao fechar popups na recuperação: %s", e)
        self.abrir_transacao()

    # =====================================================================
    # Ferramenta de mapeamento de IDs
    # =====================================================================
    def listar_ids(self, arquivo: str | Path) -> Path:
        """Grava todos os IDs das janelas abertas (wnd[0], wnd[1]...) num TXT.
        Para grades ALV, lista também as colunas (nome técnico = título)."""
        linhas: list[str] = []

        def visitar(obj, prof: int) -> None:
            try:
                id_ = str(obj.Id)
                id_ = id_[id_.find("wnd["):] if "wnd[" in id_ else id_
                texto = ""
                try:
                    texto = str(obj.Text)[:60]
                except Exception:  # noqa: BLE001
                    pass
                linhas.append(f"{'  ' * prof}{id_}  [{obj.Type}]  {texto!r}")
                if obj.Type == "GuiShell" and obj.SubType == "GridView":
                    for c in colecao(obj.ColumnOrder):
                        linhas.append(f"{'  ' * (prof + 1)}coluna {c} = {obj.GetDisplayedColumnTitle(c)!r}")
            except Exception:  # noqa: BLE001
                return
            if prof < 15:
                try:
                    for f in colecao(obj.Children):
                        visitar(f, prof + 1)
                except Exception:  # noqa: BLE001
                    pass

        for n in range(7):
            w = self._janela(n)
            if w is not None:
                visitar(w, 0)
        arquivo = Path(arquivo)
        arquivo.write_text("\n".join(linhas), encoding="utf-8")
        return arquivo
