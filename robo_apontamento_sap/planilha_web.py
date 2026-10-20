"""
planilha_web.py — Escreve o STATUS na planilha SEM login e SEM Apps Script.

Funciona porque a planilha está compartilhada como "qualquer pessoa com o link pode
editar". O robô abre a planilha num Microsoft Edge invisível (Playwright), vai até a
célula pela Caixa de nome, digita o texto e depois CONFERE pelo CSV público que o
Google gravou mesmo (já vimos digitação se perder). Se não gravou, tenta de novo.

Antes de escrever, procura a linha pela O.S. (e pelo serviço) no CSV — se alguém
ordenou ou inseriu linhas, o STATUS vai para a linha certa mesmo assim.
"""
from __future__ import annotations

import csv
import io
import logging
import time
import urllib.request

from planilha import indice_para_letra
from utils import normalizar_servico, normalizar_texto, texto_inteiro

log = logging.getLogger("robo.planilha_web")


class PlanilhaWeb:
    def __init__(self, planilha_id: str, gid: int = 0, canal: str = "msedge", invisivel: bool = True) -> None:
        self.id = planilha_id
        self.gid = gid
        self.canal = canal
        self.invisivel = invisivel

    # ------------------------------------------------------------- leitura
    def ler(self) -> list[list[str]]:
        url = (f"https://docs.google.com/spreadsheets/d/{self.id}/export?format=csv&gid={self.gid}"
               f"&nocache={time.time():.0f}")
        with urllib.request.urlopen(url, timeout=60) as r:
            return list(csv.reader(io.StringIO(r.read().decode("utf-8"))))

    def localizar(self, os_num: str, servico=None, linha_sugerida: int | None = None) -> tuple[int, int]:
        """(linha, coluna) da célula STATUS da O.S. — base 1, como na planilha."""
        valores = self.ler()
        cab = valores[0] if valores else []
        col = next((i + 1 for i, t in enumerate(cab) if normalizar_texto(t) == "status"), None)
        if col is None:
            raise RuntimeError("coluna STATUS não encontrada no cabeçalho da planilha")

        def bate(n: int) -> bool:
            r = valores[n - 1] if 0 < n <= len(valores) else []
            if not texto_inteiro(os_num):  # linha sem O.S. (ex.: erro "O.S. vazia"): confere pelo serviço
                return n == linha_sugerida and len(r) > 4 and normalizar_servico(r[4]) == normalizar_servico(servico)
            ok = len(r) > 0 and texto_inteiro(r[0]) == texto_inteiro(os_num)
            if ok and servico is not None and len(r) > 4:
                ok = normalizar_servico(r[4]) == normalizar_servico(servico)
            return ok

        if linha_sugerida and bate(linha_sugerida):
            return linha_sugerida, col
        for n in range(2, len(valores) + 1):
            if bate(n):
                return n, col
        raise RuntimeError(f"O.S. {os_num} não encontrada na planilha")

    def valor(self, linha: int, col: int) -> str:
        v = self.ler()
        r = v[linha - 1] if linha - 1 < len(v) else []
        return r[col - 1].strip() if col - 1 < len(r) else ""

    # ------------------------------------------------------------- escrita
    def escrever_status(self, os_num: str, texto: str, servico=None, linha_sugerida: int | None = None) -> str:
        linha, col = self.localizar(os_num, servico, linha_sugerida)
        celula = f"{indice_para_letra(col)}{linha}"
        if self.valor(linha, col) == texto:
            return celula
        for tentativa in range(1, 4):
            self._digitar(celula, texto)
            for _ in range(10):  # o CSV pode demorar alguns segundos para refletir
                if self.valor(linha, col) == texto:
                    log.info("Planilha: %s = %r (O.S. %s).", celula, texto, os_num)
                    return celula
                time.sleep(2)
            log.warning("Planilha: %s ainda não mostra %r (tentativa %d).", celula, texto, tentativa)
        raise RuntimeError(f"não consegui gravar {texto!r} em {celula}")

    def _digitar(self, celula: str, texto: str) -> None:
        from playwright.sync_api import sync_playwright
        url = f"https://docs.google.com/spreadsheets/d/{self.id}/edit#gid={self.gid}"
        with sync_playwright() as p:
            nav = p.chromium.launch(channel=self.canal, headless=self.invisivel)
            try:
                pg = nav.new_page(locale="pt-BR", viewport={"width": 1400, "height": 900})
                pg.goto(url, wait_until="domcontentloaded", timeout=90000)
                caixa = pg.locator("#t-name-box")
                caixa.wait_for(timeout=60000)
                pg.wait_for_timeout(1500)  # deixa a grade terminar de carregar
                caixa.click()
                caixa.fill(celula)
                caixa.press("Enter")
                pg.wait_for_timeout(800)
                pg.keyboard.type(texto, delay=40)
                pg.keyboard.press("Enter")
                # espera o "Salvando..." terminar (o Google grava em segundo plano)
                pg.wait_for_timeout(2500)
                for _ in range(20):
                    if "Salvando" not in pg.content():
                        break
                    pg.wait_for_timeout(500)
                pg.wait_for_timeout(1500)
            finally:
                nav.close()
