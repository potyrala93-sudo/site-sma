"""
planilha.py — Leitura das linhas a apontar e gravação da coluna STATUS.

Dois modos (config.yaml → planilha.modo):
- "api": gspread + conta de serviço (credentials.json). Lê e ESCREVE o STATUS.
- "csv": baixa a aba como CSV (só funciona se a planilha for pública).
         Somente leitura: o STATUS fica apenas no relatório.
"""
from __future__ import annotations

import csv
import io
import logging
import time
import urllib.request
from dataclasses import dataclass
from typing import Any

from utils import ErroConfiguracao, normalizar_texto, vazio

log = logging.getLogger("robo.planilha")


def letra_para_indice(letra: str) -> int:
    """'A' -> 1, 'E' -> 5, 'AA' -> 27."""
    letra = str(letra).strip().upper()
    if not letra.isalpha():
        raise ErroConfiguracao(f"coluna inválida no config: {letra!r} (use letras, ex.: 'E')")
    n = 0
    for c in letra:
        n = n * 26 + (ord(c) - 64)
    return n


def indice_para_letra(n: int) -> str:
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


@dataclass
class LinhaPlanilha:
    numero: int            # nº da linha na planilha (1 = cabeçalho)
    os: Any
    servico: Any
    quantidade: Any
    data: Any
    insumo: Any
    status: str
    possui_insumo: bool
    insumos: list = None   # [(NI, quantidade, nome), ...]: NI/quantidade em I/J, L/M, O/P, R/S e nome em H, K, N, Q

    def vazia(self) -> bool:
        return all(vazio(v) for v in (self.os, self.servico, self.quantidade, self.data))


class Planilha:
    def __init__(self, cfg: dict, escrever: bool = True, nuvem=None) -> None:
        p = cfg["planilha"]
        self.modo = str(p.get("modo", "api")).lower()
        self.id = p["id"]
        self.gid = int(p.get("gid", 0))
        self.credenciais = p.get("credenciais", "credentials.json")
        self.renderizacao = p.get("renderizacao", "FORMATTED_VALUE")
        self.linha_cabecalho = int(p.get("linha_cabecalho", 1))
        self.colunas = p["colunas"]
        self.valores_insumo = {normalizar_texto(x) for x in p.get("valores_com_insumo", [])}
        # true = qualquer valor preenchido na coluna de insumo conta como "tem insumo"
        self.insumo_qualquer_valor = bool(p.get("insumo_qualquer_valor", True))
        self.escrever = escrever
        self.nuvem = nuvem  # modo csv: STATUS gravado pelo Apps Script (nuvem.py)
        self.ws = None
        self.col_status: int | None = None
        self._criar_cabecalho_status = False

    # ------------------------------------------------------------------ leitura
    def carregar(self) -> list[LinhaPlanilha]:
        if self.modo == "api":
            valores = self._ler_api()
        elif self.modo == "csv":
            valores = self._ler_csv()
        else:
            raise ErroConfiguracao(f"planilha.modo inválido: {self.modo}")

        cabecalho = valores[self.linha_cabecalho - 1] if len(valores) >= self.linha_cabecalho else []
        self._resolver_coluna_status(cabecalho)

        c = {k: (letra_para_indice(v) if v and str(v).lower() != "auto" else None)
             for k, v in self.colunas.items() if k not in ("status", "insumo", "insumos")}
        # Insumo: uma letra ou uma lista (ex.: INS1..INS4 = H, K, N, Q)
        ins = self.colunas.get("insumo") or []
        cols_insumo = [letra_para_indice(x) for x in (ins if isinstance(ins, list) else [ins])]
        for obrig in ("os", "servico", "quantidade", "data"):
            if not c.get(obrig):
                raise ErroConfiguracao(f"planilha.colunas.{obrig} não configurada")
        if not cols_insumo:
            log.warning("Coluna de insumo não configurada: todas as linhas serão tratadas como SEM insumo.")

        pares = [(letra_para_indice(ni), letra_para_indice(q)) for ni, q in (self.colunas.get("insumos") or [])]

        linhas = []
        for num, row in enumerate(valores[self.linha_cabecalho:], start=self.linha_cabecalho + 1):
            def cel(idx: int | None) -> Any:
                return row[idx - 1] if idx and idx - 1 < len(row) else ""
            insumo = [cel(i) for i in cols_insumo]
            linhas.append(LinhaPlanilha(
                numero=num, os=cel(c["os"]), servico=cel(c["servico"]),
                quantidade=cel(c["quantidade"]), data=cel(c["data"]), insumo=insumo,
                status=str(cel(self.col_status) or "").strip(),
                possui_insumo=self._tem_insumo(insumo),
                insumos=[(cel(ni), cel(q), cel(cols_insumo[k]) if k < len(cols_insumo) else "")
                         for k, (ni, q) in enumerate(pares) if not vazio(cel(ni)) or not vazio(cel(q))],
            ))
        log.info("Planilha carregada: %d linhas de dados (modo %s).", len(linhas), self.modo)
        return linhas

    def _ler_api(self) -> list[list[Any]]:
        try:
            import gspread
        except ImportError as e:
            raise ErroConfiguracao("gspread não instalado (pip install -r requirements.txt)") from e
        gc = gspread.service_account(filename=self.credenciais)
        sh = gc.open_by_key(self.id)
        self.ws = sh.get_worksheet_by_id(self.gid)
        return self.ws.get_values(value_render_option=self.renderizacao)

    def _ler_csv(self) -> list[list[Any]]:
        url = f"https://docs.google.com/spreadsheets/d/{self.id}/export?format=csv&gid={self.gid}"
        with urllib.request.urlopen(url, timeout=60) as r:
            texto = r.read().decode("utf-8")
        if texto.lstrip().startswith("<"):
            raise ErroConfiguracao("A planilha não é pública: use planilha.modo = api.")
        return list(csv.reader(io.StringIO(texto)))

    def _tem_insumo(self, v: Any) -> bool:
        if isinstance(v, list):
            return any(self._tem_insumo(x) for x in v)
        if self.insumo_qualquer_valor and not vazio(v):
            return True
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return v != 0
        return normalizar_texto(v) in self.valores_insumo

    def _resolver_coluna_status(self, cabecalho: list[Any]) -> None:
        cfg = str(self.colunas.get("status") or "auto")
        if cfg.lower() != "auto":
            self.col_status = letra_para_indice(cfg)
            return
        for i, titulo in enumerate(cabecalho, start=1):
            if normalizar_texto(titulo) == "status":
                self.col_status = i
                return
        # Não existe: cria logo após a última coluna com cabeçalho preenchido
        ultima = max((i for i, t in enumerate(cabecalho, start=1) if not vazio(t)), default=0)
        self.col_status = ultima + 1
        self._criar_cabecalho_status = True
        log.info("Coluna STATUS não existe; será criada na coluna %s.", indice_para_letra(self.col_status))

    # ----------------------------------------------------------------- escrita
    def atualizar_status(self, linha: int, texto: str, os_num: str | None = None, servico=None) -> None:
        if not self.escrever:
            return
        if self.ws is None:  # modo csv: grava pelo Apps Script
            if self.nuvem is not None:
                self.nuvem.status(linha, texto, os_num, servico)
            return
        texto = texto[:250]
        for tentativa in range(1, 4):
            try:
                if self.col_status > self.ws.col_count:
                    self.ws.add_cols(self.col_status - self.ws.col_count)
                if self._criar_cabecalho_status:
                    self.ws.update_cell(self.linha_cabecalho, self.col_status, "STATUS")
                    self._criar_cabecalho_status = False
                self.ws.update_cell(linha, self.col_status, texto)
                return
            except Exception as e:  # noqa: BLE001 — APIError 429 (cota) e falhas de rede
                log.warning("Falha ao gravar STATUS na linha %d (tentativa %d): %s", linha, tentativa, e)
                time.sleep(2 ** tentativa)
        log.error("STATUS da linha %d NÃO foi gravado na planilha (está no relatório).", linha)
