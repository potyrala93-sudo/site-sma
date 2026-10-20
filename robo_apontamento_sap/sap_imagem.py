"""
sap_imagem.py — PLANO B: automação por reconhecimento de imagem.

Use somente se o SAP GUI Scripting estiver bloqueado (config.yaml → modo: imagem).
Tem a MESMA interface do SapClient, então o main.py não muda.

Como funciona:
- pywinauto traz a janela do SAP para frente;
- pyautogui + opencv localizam na tela os prints da pasta /imagens (confidence configurável);
- campos são encontrados pelo RÓTULO (ex.: print do texto "Ordem de serviço") e clicados
  com um deslocamento (dx, dy) até a caixa de texto;
- a grade é lida clicando na célula e copiando com Ctrl+C (área de transferência);
  a linha N fica em: y do cabeçalho da coluna + dy_primeira_linha + N * altura_linha.

LIMITAÇÕES: depende de resolução, zoom do Windows (use 100%), tema do SAP e posição da
janela. Os deslocamentos em config.yaml → plano_b precisam ser CALIBRADOS na máquina.
Não lê o tipo da mensagem da barra de status; detecta erro pelo ícone vermelho.
"""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

from utils import (ErroConfiguracao, ErroNegocio, ErroSAP, ParadaEmergencia, TempoEsgotado,
                   esperar_ate, normalizar_servico, normalizar_texto, parse_numero)

log = logging.getLogger("robo.imagem")


def _pyautogui():
    try:
        import pyautogui
    except ImportError as e:
        raise ErroConfiguracao("pyautogui/opencv não instalados (pip install -r requirements.txt)") from e
    pyautogui.FAILSAFE = True  # mouse no canto superior esquerdo = aborta
    return pyautogui


def localizar_imagem(caminho: str | Path, confidence: float, timeout: float = 0):
    """Centro (x, y) da imagem na tela, ou None. Com timeout > 0, espera aparecer."""
    pag = _pyautogui()
    caminho = Path(caminho)
    if not caminho.exists():
        raise ErroConfiguracao(f"imagem de referência não existe: {caminho}")

    def achar():
        try:
            return pag.locateCenterOnScreen(str(caminho), confidence=confidence, grayscale=True)
        except Exception:  # noqa: BLE001 — versões novas lançam ImageNotFoundException
            return None
    if timeout <= 0:
        return achar()
    try:
        return esperar_ate(achar, timeout, intervalo=0.4, descricao=f"imagem {caminho.name}")
    except TempoEsgotado:
        return None


def clicar_imagem(caminho: str | Path, confidence: float, cliques: int = 1, timeout: float = 10,
                  dx: int = 0, dy: int = 0) -> tuple[int, int]:
    pos = localizar_imagem(caminho, confidence, timeout)
    if pos is None:
        raise TempoEsgotado(f"imagem não encontrada na tela: {Path(caminho).name}")
    x, y = int(pos[0]) + dx, int(pos[1]) + dy
    _pyautogui().click(x, y, clicks=cliques, interval=0.12)
    return x, y


def _ler_clipboard() -> str:
    import win32clipboard
    for _ in range(10):
        try:
            win32clipboard.OpenClipboard()
            try:
                if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                    return str(win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)).strip()
                return ""
            finally:
                win32clipboard.CloseClipboard()
        except Exception:  # noqa: BLE001 — clipboard ocupado por outro processo
            time.sleep(0.1)
    return ""


def _limpar_clipboard() -> None:
    import win32clipboard
    try:
        win32clipboard.OpenClipboard()
        win32clipboard.EmptyClipboard()
        win32clipboard.CloseClipboard()
    except Exception:  # noqa: BLE001
        pass


class SapImagem:
    def __init__(self, cfg: dict, ids: dict, parada: ParadaEmergencia) -> None:
        self.cfg = cfg
        self.pb = cfg["plano_b"]
        self.parada = parada
        self.pasta = Path(self.pb.get("pasta_imagens", "imagens"))
        self.conf = float(self.pb.get("confidence", 0.85))
        self.timeout = float(self.pb.get("timeout_imagem", 10))
        self.transacao = str(cfg["sap"].get("transacao", "ZFLPP005")).upper()
        self.ponto_sem_retorno = False
        self.pag = _pyautogui()
        self.pag.PAUSE = float(self.pb.get("pausa_entre_acoes", 0.3))

    # ------------------------------------------------------------- utilitários
    def _img(self, nome: str) -> Path:
        arq = self.pb.get("imagens", {}).get(nome, nome)
        return self.pasta / arq

    def checar_parada(self) -> None:
        if not self.ponto_sem_retorno:
            self.parada.verificar()

    def _aguardar_tela(self, segundos: float | None = None) -> None:
        """Sem session.Busy no plano B: esperamos a ampulheta sumir (imagem opcional)
        e damos uma pausa mínima para a tela redesenhar."""
        time.sleep(float(self.pb.get("pausa_pos_roundtrip", 0.8)))
        ocupado = self._img("cursor_ocupado")
        if ocupado.exists():
            esperar_ate(lambda: localizar_imagem(ocupado, self.conf) is None,
                        segundos or self.timeout * 3, descricao="SAP terminar o processamento")

    def _erro_na_barra(self) -> bool:
        icone = self._img("erro_barra_status")
        return icone.exists() and localizar_imagem(icone, self.conf) is not None

    def _digitar_no_campo(self, campo: dict, valor: Any) -> None:
        clicar_imagem(self._img(campo["imagem"]), self.conf, timeout=self.timeout,
                      dx=int(campo.get("dx", 0)), dy=int(campo.get("dy", 0)))
        self.pag.press("end")
        self.pag.hotkey("shift", "home")
        self.pag.press("delete")
        self.pag.write(str(valor), interval=0.03)

    def _comando(self, texto: str) -> None:
        clicar_imagem(self._img("campo_comando"), self.conf, timeout=self.timeout)
        self.pag.hotkey("ctrl", "a")
        self.pag.write(texto, interval=0.03)
        self.pag.press("enter")
        self._aguardar_tela()

    # ---- grade: posição da célula = cabeçalho da coluna + deslocamento da linha
    def _pos_celula(self, coluna: str, linha: int) -> tuple[int, int]:
        g = self.pb["grade"]
        pos = localizar_imagem(self._img(g["cabecalhos"][coluna]), self.conf, self.timeout)
        if pos is None:
            raise TempoEsgotado(f"cabeçalho da coluna '{coluna}' não encontrado na tela")
        y = int(pos[1]) + int(g.get("dy_primeira_linha", 18)) + linha * int(g.get("altura_linha", 18))
        return int(pos[0]), y

    def _ler_celula(self, coluna: str, linha: int) -> str:
        x, y = self._pos_celula(coluna, linha)
        _limpar_clipboard()
        self.pag.click(x, y)
        self.pag.hotkey("ctrl", "c")
        time.sleep(0.2)
        return _ler_clipboard()

    # --------------------------------------------------------------- interface
    def conectar(self) -> None:
        from pywinauto import Desktop
        titulo = self.pb.get("titulo_janela_sap", ".*SAP.*")
        try:
            janela = Desktop(backend="win32").window(title_re=titulo)
            janela.wait("exists", timeout=5)
        except Exception:  # noqa: BLE001
            exe = self.cfg["sap"].get("saplogon_exe")
            if exe and Path(exe).exists():
                import subprocess
                subprocess.Popen([exe])
            else:
                clicar_imagem(self._img("icone_sap"), self.conf, cliques=2, timeout=10)
            log.warning(">>> Abra a conexão e faça LOGIN no SAP manualmente.")
            janela = Desktop(backend="win32").window(title_re=titulo)
            janela.wait("exists", timeout=float(self.cfg["sap"].get("timeout_login", 300)))
        janela.set_focus()
        if self.pb.get("maximizar", True):
            janela.maximize()
        log.info("Janela do SAP em foco (plano B por imagem).")

    def na_tela_selecao(self) -> bool:
        campo = self.pb["campos_selecao"]["ordem_servico"]
        return localizar_imagem(self._img(campo["imagem"]), self.conf) is not None

    def abrir_transacao(self) -> None:
        self.checar_parada()
        self._comando(f"/n{self.transacao}")
        if not self.na_tela_selecao():
            fav = self._img("favorito_zflpp005")
            if fav.exists():
                self._comando("/n")
                clicar_imagem(fav, self.conf, cliques=2, timeout=self.timeout)
                self._aguardar_tela()
        esperar_ate(self.na_tela_selecao, self.timeout, descricao="tela de seleção")

    def pesquisar_os(self, os_valor: str, data_ini: str, data_fim: str) -> None:
        self.checar_parada()
        if not self.na_tela_selecao():
            self.abrir_transacao()
        s, c = self.cfg["selecao"], self.pb["campos_selecao"]
        valores = {"ordem_servico": os_valor, "nucleo": s.get("nucleo", "*"), "centro": s.get("centro", "*"),
                   "fornecedor": s.get("fornecedor", ""), "lote_de": s.get("lote_de", "0"),
                   "lote_ate": s.get("lote_ate", "0"), "data_de": data_ini, "data_ate": data_fim,
                   "max_registros": s.get("max_registros", "1000")}
        for chave, valor in valores.items():
            if chave in c:
                self._digitar_no_campo(c[chave], valor)
        self.pag.press("f8")
        self._aguardar_tela()
        if self.na_tela_selecao() or self._erro_na_barra():
            raise ErroNegocio("OS não encontrada (tela de seleção permaneceu ou erro na barra de status)")
        aba = self._img("aba_operacao_material")
        if aba.exists():
            clicar_imagem(aba, self.conf, timeout=self.timeout)
            self._aguardar_tela()

    def localizar_servico(self, servico: Any) -> int:
        self.checar_parada()
        alvo = normalizar_servico(servico)
        vistos = []
        for i in range(int(self.pb["grade"].get("max_linhas", 15))):
            v = self._ler_celula("servico", i)
            if not v:
                break
            vistos.append(v)
            if normalizar_servico(v) == alvo:
                return i
        if not vistos:
            raise ErroNegocio("OS não encontrada (grade vazia)")
        raise ErroNegocio(f"serviço divergente (SAP={', '.join(vistos)}, planilha={servico})")

    def ja_criado(self, linha: int) -> bool:
        st = self._ler_celula("status_reg", linha)
        return normalizar_texto(st) == normalizar_texto(self.cfg["sap"].get("status_criado", "Criado"))

    def apontar(self, linha: int, data_exec: str, quantidade: str, simulacao: bool) -> None:
        self.checar_parada()
        x, y = self._pos_celula("maq_evento", linha)
        self.pag.doubleClick(x, y)
        self._aguardar_tela()
        p = self.pb["popup"]
        if localizar_imagem(self._img(p["titulo"]), self.conf, self.timeout) is None:
            raise ErroNegocio("popup 'Equipes e Eventos' não abriu")
        self._digitar_no_campo(p["data_execucao"], data_exec)
        self._digitar_no_campo(p["quantidade_executada"], quantidade)
        desmarcado = localizar_imagem(self._img(p["checkbox_desmarcado"]), self.conf, 2)
        if desmarcado is not None:
            self.pag.click(int(desmarcado[0]), int(desmarcado[1]))
        if localizar_imagem(self._img(p["checkbox_marcado"]), self.conf, 3) is None:
            raise ErroSAP("não consegui marcar 'Confirmação final'")
        if simulacao:
            log.info("[SIMULAÇÃO] popup preenchido; NÃO clicando no check verde.")
            self.pag.press("esc")
            self._aguardar_tela()
            return
        self.checar_parada()
        self.ponto_sem_retorno = True
        clicar_imagem(self._img(p["botao_confirmar"]), self.conf, timeout=self.timeout)
        self._aguardar_tela()
        if self._erro_na_barra():
            self.pag.press("esc")
            raise ErroSAP("SAP mostrou erro após o check verde (ver tela/log)")
        if localizar_imagem(self._img(p["titulo"]), self.conf) is not None:
            self.pag.press("esc")
            raise ErroSAP("popup não fechou após o check verde")

    def conferir_apontamento(self, linha: int, servico: Any, quantidade: float) -> int:
        perc = self._ler_celula("perc_exec", linha)
        qt = self._ler_celula("qt_executada", linha)
        try:
            ok = abs(parse_numero(perc.replace("%", "")) - 100) <= 0.01 and parse_numero(qt) > 0
        except ValueError:
            ok = False
        if not ok:
            raise ErroSAP(f"conferência falhou (% Exec.='{perc}', Qt Executa='{qt}')")
        return linha

    def salvar(self, linha: int, servico: Any) -> str:
        clicar_imagem(self._img("botao_salvar_guia"), self.conf, timeout=self.timeout)
        self._aguardar_tela()
        conf_salvar = self._img("botao_sim_salvar")
        if conf_salvar.exists() and localizar_imagem(conf_salvar, self.conf, 2) is not None:
            clicar_imagem(conf_salvar, self.conf)
            self._aguardar_tela()
        if self._erro_na_barra():
            raise ErroSAP("erro na barra de status ao salvar")
        try:
            esperar_ate(lambda: self.ja_criado(linha),
                        float(self.cfg["sap"].get("timeout_status_criado", 30)), intervalo=2,
                        descricao="Status Reg = Criado")
        except TempoEsgotado:
            raise ErroSAP("status não ficou Criado")
        return ""

    def voltar_selecao(self) -> None:
        for _ in range(3):
            if self.na_tela_selecao():
                return
            self.pag.press("esc")
            self._aguardar_tela()
        self.abrir_transacao()

    def recuperar(self) -> None:
        self.pag.press("esc")
        self.abrir_transacao()

    def listar_ids(self, arquivo: str | Path) -> Path:
        raise ErroConfiguracao("--listar-ids só funciona no modo scripting")
