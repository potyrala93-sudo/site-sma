"""
sap_imagem.py — Automação da ZFLPP005 por RECONHECIMENTO DE IMAGEM (sem IDs do SAP).

As imagens da pasta /imagens foram recortadas dos prints reais da tela (Windows com
escala 125%, SAP maximizado). O robô procura cada imagem na tela e clica nela ou a uma
distância fixa dela (dx, dy em config.yaml → imagem).

Como cada coisa é encontrada:
- Campo de comando ......... ícone verde de Enter (icone_enter.png) + dx até a caixa
- Campos da seleção ........ rótulo do campo (ex.: rotulo_ordem_servico.png) + dx até a caixa
- Grade (Operação/Material)  cabeçalho da coluna (col_*.png); a linha N fica
                             dy_primeira_linha + N * altura_linha abaixo do cabeçalho
- Ler o "Serviço" .......... clica na célula e copia com Ctrl+C (área de transferência)
- % Exec. = 100,00 ......... imagem perc_100.png na célula da linha
- Status Reg = Criado ...... imagem status_criado.png na célula da linha
- Popup .................... título "Equipes e Eventos" + rótulos dos campos
- Texto digitado ........... colado via área de transferência (Ctrl+V), o que evita
                             problemas com o teclado ABNT2 (/, *, acentos)

Espera inteligente: em vez de sleeps fixos, o robô espera a PRÓXIMA imagem esperada
aparecer (ou sumir), com timeout configurável.

Se a escala do Windows, o tema do SAP ou o tamanho da fonte mudarem, as imagens precisam
ser recapturadas (ver README → "Modo imagem").
"""
from __future__ import annotations

import ctypes
import logging
import re
import subprocess
import time
from pathlib import Path
from typing import Any

from utils import (ErroConfiguracao, ErroNegocio, ErroSAP, ParadaEmergencia, TempoEsgotado,
                   esperar_ate, normalizar_servico, parse_numero)

log = logging.getLogger("robo.imagem")

try:  # coordenadas em pixels físicos, iguais às dos prints (antes de importar o pyautogui)
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:  # noqa: BLE001
    pass


def _pyautogui():
    try:
        import pyautogui
    except ImportError as e:
        raise ErroConfiguracao("pyautogui/opencv não instalados (pip install -r requirements.txt)") from e
    pyautogui.FAILSAFE = True  # mouse no canto superior esquerdo = aborta
    return pyautogui


# ---------------------------------------------------------------------------
# Funções de imagem (também usadas pelo sap_client para achar o ícone do SAP)
# ---------------------------------------------------------------------------
def localizar_imagem(caminho: str | Path, confidence: float, timeout: float = 0,
                     regiao: tuple[int, int, int, int] | None = None):
    """Centro (x, y) da imagem na tela, ou None. Com timeout > 0, espera aparecer."""
    pag = _pyautogui()
    caminho = Path(caminho)
    if not caminho.exists():
        raise ErroConfiguracao(f"imagem de referência não existe: {caminho}")

    def achar():
        try:
            box = pag.locateOnScreen(str(caminho), confidence=confidence, grayscale=True, region=regiao)
        except Exception:  # noqa: BLE001 — versões novas lançam ImageNotFoundException
            return None
        return None if box is None else (int(box.left + box.width / 2), int(box.top + box.height / 2))

    if timeout <= 0:
        return achar()
    try:
        return esperar_ate(achar, timeout, intervalo=0.3, descricao=f"imagem {caminho.name}")
    except TempoEsgotado:
        return None


def clicar_imagem(caminho: str | Path, confidence: float, cliques: int = 1, timeout: float = 10,
                  dx: int = 0, dy: int = 0) -> tuple[int, int]:
    pos = localizar_imagem(caminho, confidence, timeout)
    if pos is None:
        raise TempoEsgotado(f"imagem não encontrada na tela: {Path(caminho).name}")
    x, y = pos[0] + dx, pos[1] + dy
    _pyautogui().click(x, y, clicks=cliques, interval=0.15)
    return x, y


# ---------------------------------------------------------------------------
# Área de transferência (pyperclip abre o clipboard com uma janela "dona"; sem isso
# o Windows recusa a escrita com 'identificador inválido', principalmente no Citrix)
# ---------------------------------------------------------------------------
def ler_clipboard() -> str:
    import pyperclip
    for _ in range(10):
        try:
            return (pyperclip.paste() or "").strip()
        except Exception:  # noqa: BLE001 — ocupada por outro processo
            time.sleep(0.1)
    return ""


def escrever_clipboard(texto: str) -> None:
    """Grava e confere (o Citrix sincroniza o clipboard com o servidor remoto)."""
    import pyperclip
    for _ in range(15):
        try:
            pyperclip.copy(texto)
            if ler_clipboard() == texto.strip():
                return
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.15)
    raise TempoEsgotado("não consegui gravar na área de transferência")


# ---------------------------------------------------------------------------
class SapImagem:
    def __init__(self, cfg: dict, ids: dict, parada: ParadaEmergencia) -> None:
        self.cfg = cfg
        self.im = cfg["imagem"]
        self.parada = parada
        self.pasta = Path(__file__).resolve().parent / self.im.get("pasta", "imagens")
        self.conf = float(self.im.get("confidence", 0.9))
        self.timeout = float(self.im.get("timeout", 15))
        self.transacao = str(cfg["sap"].get("transacao", "ZFLPP005")).upper()
        self.ponto_sem_retorno = False
        self.pag = _pyautogui()
        self.pag.PAUSE = float(self.im.get("pausa_entre_acoes", 0.15))
        self.janela = None
        self.evidencia = None  # função(etapa) que tira o print de registro (main.py liga por O.S.)

    # ------------------------------------------------------------- utilitários
    def _img(self, nome: str) -> Path:
        return self.pasta / f"{nome}.png"

    def _achar(self, nome: str, timeout: float = 0, regiao=None):
        return localizar_imagem(self._img(nome), self.conf, timeout, regiao)

    def _esperar(self, nome: str, timeout: float | None = None, regiao=None) -> tuple[int, int]:
        pos = self._achar(nome, timeout or self.timeout, regiao)
        if pos is None:
            raise TempoEsgotado(f"'{nome}' não apareceu na tela em {timeout or self.timeout:.0f}s")
        return pos

    def _esperar_sumir(self, nome: str, timeout: float | None = None) -> bool:
        try:
            esperar_ate(lambda: self._achar(nome) is None, timeout or self.timeout, intervalo=0.3,
                        descricao=f"'{nome}' sumir")
            return True
        except TempoEsgotado:
            return False

    def _print(self, etapa: str) -> None:
        if self.evidencia is not None:
            self.evidencia(etapa)

    def checar_parada(self) -> None:
        if not self.ponto_sem_retorno:
            self.parada.verificar()

    def _focar(self) -> None:
        if self.janela is not None:
            try:
                if not self.janela.is_active():
                    self.janela.set_focus()
            except Exception:  # noqa: BLE001
                pass

    @staticmethod
    def _tecla_end() -> None:
        """END como tecla ESTENDIDA. O pyautogui manda END sem esse flag e o Windows
        (e o Citrix) entendem como o '1' do teclado numérico."""
        VK_END, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP = 0x23, 0x1, 0x2
        scan = ctypes.windll.user32.MapVirtualKeyW(VK_END, 0)
        ctypes.windll.user32.keybd_event(VK_END, scan, KEYEVENTF_EXTENDEDKEY, 0)
        ctypes.windll.user32.keybd_event(VK_END, scan, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)
        time.sleep(0.05)

    @staticmethod
    def _shift_home() -> None:
        """SHIFT+HOME com HOME estendida (seleciona o texto do campo até o início)."""
        u = ctypes.windll.user32
        VK_SHIFT, VK_HOME, EXT, UP = 0x10, 0x24, 0x1, 0x2
        u.keybd_event(VK_SHIFT, u.MapVirtualKeyW(VK_SHIFT, 0), 0, 0)
        u.keybd_event(VK_HOME, u.MapVirtualKeyW(VK_HOME, 0), EXT, 0)
        u.keybd_event(VK_HOME, u.MapVirtualKeyW(VK_HOME, 0), EXT | UP, 0)
        u.keybd_event(VK_SHIFT, u.MapVirtualKeyW(VK_SHIFT, 0), UP, 0)
        time.sleep(0.05)

    def _digitar(self, valor: Any) -> None:
        """Substitui o conteúdo do campo com foco: vai para o fim, apaga tudo com
        Backspace e digita tecla por tecla.
        Não usamos Ctrl+V: no Citrix a área de transferência chega ao servidor com
        atraso e o SAP colava o valor anterior. '*' e '/' vão pelo teclado numérico,
        que é igual em qualquer layout (ABNT2 ou não)."""
        self._tecla_end()
        self.pag.press("backspace", presses=int(self.im.get("backspaces", 35)), interval=0)
        especiais = {"*": "multiply", "/": "divide"}
        for ch in str(valor):
            if ch in especiais:
                self.pag.press(especiais[ch])
            else:
                self.pag.write(ch)

    def _preencher(self, campo: str, valor: Any) -> None:
        """Clica no campo (rótulo + deslocamento) e digita o valor."""
        c = self.im["campos"][campo]
        x, y = self._esperar(c["imagem"], 5)
        self.pag.click(x + int(c.get("dx", 0)), y + int(c.get("dy", 0)))
        self._digitar(valor)

    def _comando(self, texto: str) -> None:
        x, y = self._esperar("icone_enter", 5)
        self.pag.click(x + int(self.im.get("dx_campo_comando", 93)), y)
        self._digitar(texto)
        self.pag.press("enter")

    # ---- grade ------------------------------------------------------------
    def _regiao_grade(self):
        """Limita a busca dos cabeçalhos à área abaixo do botão Salvar Guia
        (evita confundir 'Serviço' da grade com 'Ordem de Serviço' de outras telas)."""
        x, y = self._esperar("botao_salvar_guia", 5)
        larg, alt = self.pag.size()
        return (0, y, larg, alt - y)

    def _pos_celula(self, coluna: str, linha: int) -> tuple[int, int]:
        g = self.im["grade"]
        pos = self._achar(f"col_{coluna}", 3, self._regiao_grade())
        if pos is None:
            raise TempoEsgotado(f"cabeçalho da coluna '{coluna}' não encontrado (a coluna está visível?)")
        dx = int(g.get("dx_coluna", {}).get(coluna, 0))
        return pos[0] + dx, pos[1] + int(g.get("dy_primeira_linha", 23)) + linha * int(g.get("altura_linha", 23))

    def _ler_celula(self, coluna: str, linha: int) -> str:
        """Clica na célula e copia o valor com Ctrl+C."""
        x, y = self._pos_celula(coluna, linha)
        return self._ler_em(x, y)

    def _ler_em(self, x: int, y: int, editavel: bool = False) -> str:
        """Clica no ponto e copia com Ctrl+C. Em célula editável, seleciona o texto antes."""
        escrever_clipboard("")
        self.pag.click(x, y)
        if editavel:
            self._tecla_end()
            self._shift_home()
        self.pag.hotkey("ctrl", "c")
        try:  # no Citrix o valor copiado demora um pouco para chegar ao computador
            return esperar_ate(ler_clipboard, 4, intervalo=0.15, descricao="área de transferência")
        except TempoEsgotado:
            return ""

    def _imagem_na_celula(self, nome: str, coluna: str, linha: int, timeout: float = 0) -> bool:
        x, y = self._pos_celula(coluna, linha)
        regiao = (max(x - 70, 0), max(y - 14, 0), 140, 28)
        return self._achar(nome, timeout, regiao) is not None

    def _descartar_se_perguntar(self, timeout: float = 3) -> bool:
        """Depois de um ESC o SAP pode perguntar 'Ao voltar, as alterações não salvas
        serão perdidas. Deseja continuar?'. Só confirmamos (Sim = descartar) quando o
        texto é exatamente esse — nunca clicamos 'Sim' em outro tipo de pergunta."""
        if self._achar("confirmar_descartar", timeout) is None:
            return False
        log.info("SAP perguntou se descarta as alterações não salvas: Sim.")
        x, y = self._esperar("botao_sim", 3)
        self.pag.click(x, y)
        self._esperar_sumir("confirmar_descartar", 5)
        return True

    def _erro_na_barra(self) -> bool:
        """Ícone vermelho de erro na barra de status (canto inferior esquerdo)."""
        larg, alt = self.pag.size()
        return self._achar("erro_barra_status", regiao=(0, alt - 160, 400, 160)) is not None

    def _checkbox_desmarcado(self, nome: str, dx: int, cx: int, cy: int) -> bool:
        """Compara só o quadradinho do checkbox na tela com o da imagem de referência
        (que foi capturada DESMARCADA). Diferença pequena = continua desmarcado."""
        from PIL import Image, ImageChops, ImageStat
        ref = Image.open(self._img(nome)).convert("L")
        rx, ry = ref.width // 2 + dx, ref.height // 2
        ref_box = ref.crop((rx - 6, ry - 6, rx + 7, ry + 7))
        tela_box = self.pag.screenshot(region=(cx - 6, cy - 6, 13, 13)).convert("L")
        diff = ImageStat.Stat(ImageChops.difference(ref_box, tela_box)).mean[0]
        log.debug("Checkbox: diferença média %.1f", diff)
        return diff < float(self.im.get("limiar_checkbox", 12))

    # --------------------------------------------------------------- interface
    def _achar_janela_sap(self):
        """Janela da sessão SAP. Funciona com o SAP instalado na máquina
        (classe SAP_FRONTEND_SESSION) e com o SAP publicado no Citrix, cuja janela se
        chama '<título da tela> - \\\\Remote'. A janela 'SAP Logon' é ignorada."""
        from pywinauto import Desktop
        padrao = re.compile(self.im.get("titulo_janela_sap", r"\\Remote$"))
        candidatas = []
        for w in Desktop(backend="win32").windows(visible_only=True):
            try:
                titulo, classe = w.window_text(), w.class_name()
            except Exception:  # noqa: BLE001
                continue
            if titulo.startswith("SAP Logon"):
                continue
            if classe == "SAP_FRONTEND_SESSION" or (titulo and padrao.search(titulo)):
                candidatas.append(w)
        # Prefere a janela que já está na ZFLPP005 ou no Easy Access
        for w in candidatas:
            if re.search(r"Entrada de apontamento|SAP Easy Access", w.window_text(), re.I):
                return w
        return candidatas[0] if candidatas else None

    def conectar(self) -> None:
        janela = self._achar_janela_sap()
        if janela is None:
            exe = self.cfg["sap"].get("saplogon_exe")
            if exe and Path(exe).exists():
                subprocess.Popen([exe])
            log.warning(">>> Abra o SAP (Citrix), faça LOGIN e deixe na tela SAP Easy Access. Aguardando...")
            janela = esperar_ate(self._achar_janela_sap, float(self.cfg["sap"].get("timeout_login", 300)),
                                 intervalo=2, descricao="janela do SAP")
        janela.set_focus()
        if self.im.get("maximizar", True):
            janela.maximize()
        self.janela = janela
        self._esperar("icone_enter", 10)
        log.info("SAP em foco: '%s' (modo imagem).", janela.window_text())

    def na_tela_selecao(self) -> bool:
        return self._achar("tela_selecao") is not None

    def abrir_transacao(self) -> None:
        self.checar_parada()
        self._focar()
        self._comando(f"/n{self.transacao}")
        self._descartar_se_perguntar(2)
        if self._achar("tela_selecao", 10):
            return
        log.warning("/n%s não abriu a tela; tentando o favorito.", self.transacao)
        self._comando("/n")
        clicar_imagem(self._img("favorito_zflpp005"), self.conf, cliques=2, timeout=10)
        self._esperar("tela_selecao", 15)

    def pesquisar_os(self, os_valor: str, data_ini: str, data_fim: str) -> None:
        self.checar_parada()
        self._focar()
        if not self.na_tela_selecao():
            self.abrir_transacao()
        s = self.cfg["selecao"]
        valores = {"ordem_servico": os_valor, "nucleo": s.get("nucleo", "*"), "centro": s.get("centro", "*"),
                   "fornecedor": s.get("fornecedor", ""), "lote_de": s.get("lote_de", "0"),
                   "lote_ate": s.get("lote_ate", "0"), "data_de": data_ini, "data_ate": data_fim,
                   "max_registros": s.get("max_registros", "1000")}
        # Campos que já vêm preenchidos certos no SAP ficam como estão
        campos = [c for c in valores if c in self.im["campos"] and c not in (s.get("nao_preencher") or [])]
        # Ao digitar, o SAP abre logo abaixo do campo uma lista com valores já usados,
        # que pode cobrir o rótulo do campo seguinte. Por isso localizamos todos os
        # rótulos ANTES de digitar e preenchemos de baixo para cima.
        pontos = {}
        for c in campos:
            cf = self.im["campos"][c]
            x, y = self._esperar(cf["imagem"], 5)
            pontos[c] = (x + int(cf.get("dx", 0)), y + int(cf.get("dy", 0)))
        for c in sorted(campos, key=lambda c: (-pontos[c][1], -pontos[c][0])):
            self.pag.click(*pontos[c])
            self._digitar(valores[c])
        time.sleep(float(self.im.get("pausa_antes_f8", 0.8)))  # o Citrix termina de entregar as teclas
        self.pag.press("f8")
        # Resultado: aparece a grade (botão Salvar Guia) ou o ícone vermelho de erro na
        # barra de status (ex.: "Não existem entradas"). O erro só é aceito depois de 2s,
        # para não confundir com uma mensagem antiga que ainda estava na barra.
        inicio = time.monotonic()

        def resultado():
            if self._achar("botao_salvar_guia"):
                return "grade"
            if time.monotonic() - inicio > 2 and self._erro_na_barra():
                return "erro"
            return None
        try:
            r = esperar_ate(resultado, self.timeout, intervalo=0.4, descricao="grade de resultados")
        except TempoEsgotado:
            raise ErroNegocio("OS não encontrada (a grade de resultados não abriu)")
        if r == "erro":
            self._print("erro_pesquisa")
            raise ErroNegocio("OS não encontrada (SAP mostrou erro na barra de status, ex.: 'Não existem entradas')")
        self._print("1_grade")

    def localizar_servico(self, servico: Any) -> int:
        self.checar_parada()
        alvo = normalizar_servico(servico)
        vistos = []
        for i in range(int(self.im["grade"].get("max_linhas", 15))):
            v = self._ler_celula("servico", i)
            if not v or (vistos and v == vistos[-1]):  # área vazia: o Ctrl+C repete a célula anterior
                break
            vistos.append(v)
            if normalizar_servico(v) == alvo:
                log.debug("Serviço %s na linha %d da grade.", v, i)
                return i
        if not vistos:
            if self.im.get("exigir_leitura_servico", True):
                raise ErroNegocio("não consegui ler a coluna Serviço (Ctrl+C retornou vazio)")
            log.warning("Validação do serviço desligada: usando a 1ª linha da grade.")
            return 0
        raise ErroNegocio(f"serviço divergente (SAP={', '.join(vistos)}, planilha={servico})")

    def ja_criado(self, linha: int) -> bool:
        return self._imagem_na_celula("status_criado", "status_reg", linha)

    def apontar(self, linha: int, data_exec: str, quantidade: str, simulacao: bool) -> None:
        self.checar_parada()
        x, y = self._pos_celula("maq_evento", linha)
        self.pag.doubleClick(x, y)
        if self._achar("popup_equipes_eventos", self.timeout) is None:
            raise ErroNegocio("popup 'Equipes e Eventos' não abriu")

        self._preencher("data_execucao", data_exec)
        self._preencher("quantidade_executada", quantidade)

        # Checkbox "Confirmação final": clica se estiver desmarcado e confere que mudou
        c = self.im["campos"]["confirmacao_final"]
        x, y = self._esperar(c["imagem"], 5)
        cx, cy = x + int(c.get("dx", 0)), y + int(c.get("dy", 0))
        if self._checkbox_desmarcado(c["imagem"], int(c.get("dx", 0)), cx, cy):
            self.pag.click(cx, cy)
            time.sleep(0.3)
            if self._checkbox_desmarcado(c["imagem"], int(c.get("dx", 0)), cx, cy):
                raise ErroSAP("não consegui marcar 'Confirmação final'")
        log.debug("Popup preenchido: data=%s qtd=%s confirmação final=ON", data_exec, quantidade)
        self._print("2_popup_preenchido")

        if simulacao:
            log.info("[SIMULAÇÃO] popup preenchido; NÃO clicando no check verde.")
            self.pag.press("esc")
            self._descartar_se_perguntar()
            if not self._esperar_sumir("popup_equipes_eventos", 5):
                raise ErroSAP("popup não fechou com ESC na simulação")
            return

        self.checar_parada()
        self.ponto_sem_retorno = True
        clicar_imagem(self._img("botao_check_verde"), self.conf, timeout=5)
        if not self._esperar_sumir("popup_equipes_eventos"):
            raise ErroSAP("o popup não fechou após o check verde (o SAP recusou os dados?)")
        if self._erro_na_barra():
            raise ErroSAP("SAP mostrou erro na barra de status após o check verde")

    def apontar_insumos(self, linha: int, insumos: list[tuple[str, str]]) -> None:
        """Insumos da O.S. (antes do Salvar Guia).
        Duplo clique na 'Descrição do serviço' abre a grade de materiais. Cada material
        do SAP é casado com o NI da planilha (ignorando zeros à esquerda) e a quantidade
        DAQUELE NI vai na 'Qtd. Cons' da linha do material — nunca pela posição, porque
        a ordem na planilha e no SAP pode ser diferente."""
        self.checar_parada()
        x, y = self._pos_celula("descricao_servico", linha)
        self.pag.doubleClick(x, y)
        cab_mat = self._achar("col_material", self.timeout)
        if cab_mat is None:
            raise ErroSAP("a grade de materiais (insumos) não abriu")
        g = self.im["grade"]
        dy0, alt = int(g.get("dy_primeira_linha", 23)), int(g.get("altura_linha", 23))
        x_mat = cab_mat[0] + int(g.get("dx_coluna", {}).get("material", 30))
        cab_qtd = self._esperar("col_qtd_cons", 5)

        materiais: list[str] = []
        for i in range(int(g.get("max_linhas", 15))):
            v = self._ler_em(x_mat, cab_mat[1] + dy0 + i * alt)
            if not v or (materiais and v == materiais[-1]):
                break
            materiais.append(v)
        if not materiais:
            raise ErroSAP("não consegui ler os materiais da grade de insumos")
        no_sap = {normalizar_servico(m): i for i, m in enumerate(materiais)}
        log.info("Materiais no SAP: %s", ", ".join(materiais))

        faltando = [ni for ni, _ in insumos if normalizar_servico(ni) not in no_sap]
        if faltando:
            raise ErroNegocio(f"insumo(s) da planilha não existem na O.S. no SAP: {', '.join(map(str, faltando))} "
                              f"(SAP tem: {', '.join(materiais)})")
        sobra = set(no_sap) - {normalizar_servico(ni) for ni, _ in insumos}
        if sobra:
            log.warning("Materiais no SAP sem quantidade na planilha (ficam como estão): %s", ", ".join(sorted(sobra)))

        for ni, qtd in insumos:
            i = no_sap[normalizar_servico(ni)]
            yq = cab_qtd[1] + dy0 + i * alt
            for tentativa in range(2):
                self.pag.click(cab_qtd[0], yq)
                self._digitar(qtd)
                self.pag.press("enter")
                time.sleep(0.6)
                lido = self._ler_em(cab_qtd[0], yq, editavel=True)
                try:
                    ok = abs(parse_numero(lido) - parse_numero(qtd)) < 0.0005
                except ValueError:
                    ok = False
                if ok:
                    log.info("Insumo %s: Qtd. Cons = %s", materiais[i], lido)
                    break
                log.warning("Insumo %s: célula mostra %r, esperado %s (tentativa %d)", materiais[i], lido, qtd,
                            tentativa + 1)
            else:
                raise ErroSAP(f"não consegui gravar a quantidade {qtd} do insumo {materiais[i]}")
            self.pag.click(x_mat, yq)  # sai da edição clicando numa célula só de leitura
        time.sleep(0.5)
        if self._erro_na_barra():
            raise ErroSAP("SAP mostrou erro na barra de status ao apontar os insumos")
        self._print("2b_insumos")

    def conferir_apontamento(self, linha: int, servico: Any, quantidade: float) -> int:
        if not self._imagem_na_celula("perc_100", "perc_exec", linha, timeout=self.timeout):
            raise ErroSAP("% Exec. não ficou 100,00 após o apontamento")
        return linha

    def salvar(self, linha: int, servico: Any) -> str:
        clicar_imagem(self._img("botao_salvar_guia"), self.conf, timeout=5)
        timeout = float(self.cfg["sap"].get("timeout_status_criado", 30))
        if not self._imagem_na_celula("status_criado", "status_reg", linha, timeout=timeout):
            extra = " (erro na barra de status)" if self._erro_na_barra() else ""
            raise ErroSAP(f"status não ficou Criado após o Salvar Guia{extra}")
        self._print("3_criado")
        return "Status Reg = Criado"

    def voltar_selecao(self) -> None:
        self._focar()
        for _ in range(2):
            if self.na_tela_selecao():
                return
            self.pag.press("esc")
            self._descartar_se_perguntar(2)
            if self._achar("tela_selecao", 5):
                return
        self.abrir_transacao()

    def recuperar(self) -> None:
        self._focar()
        self.pag.press("esc")
        self.abrir_transacao()

    def listar_ids(self, arquivo: str | Path) -> Path:
        raise ErroConfiguracao("--listar-ids só existe no modo scripting")

    def testar_imagens(self) -> None:
        """Diagnóstico: mostra quais imagens estão visíveis na tela agora."""
        for arq in sorted(self.pasta.glob("*.png")):
            pos = localizar_imagem(arq, self.conf)
            log.info("%-28s %s", arq.stem, f"encontrada em {pos}" if pos else "-")
        if self._achar("botao_salvar_guia"):
            log.info("Grade visível. Serviço lido na linha 1 via Ctrl+C: %r", self._ler_celula("servico", 0))
