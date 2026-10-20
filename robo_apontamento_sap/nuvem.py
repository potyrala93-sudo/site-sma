"""
nuvem.py — Registro do resultado no Google: STATUS na planilha e prints no Drive.

Usa um Apps Script publicado como "App da Web" (apps_script/Codigo.gs), que roda com a
SUA conta Google. Assim não precisa de conta de serviço, que hoje não consegue gravar
arquivos no Drive pessoal.

Nada se perde se a internet cair ou se o Apps Script ainda não estiver publicado: cada
envio entra numa fila local (pendentes.json) e é reenviado na próxima execução.

Prints: sempre salvos também em prints/<O.S.>/ na pasta do robô.
"""
from __future__ import annotations

import base64
import json
import logging
import threading
from datetime import datetime
from pathlib import Path

log = logging.getLogger("robo.nuvem")


class Nuvem:
    def __init__(self, cfg: dict, base: Path) -> None:
        n = cfg.get("nuvem", {}) or {}
        self.url = (n.get("apps_script_url") or "").strip()
        self.token = n.get("token", "")
        self.pasta_drive = n.get("pasta_drive", "APONTAMENTO SAP")
        self.planilha_id = cfg["planilha"]["id"]
        self.gid = int(cfg["planilha"].get("gid", 0))
        self.pasta_local = base / n.get("pasta_prints", "prints")
        self.arq_fila = base / "pendentes.json"
        self._trava = threading.Lock()
        self.web = None
        if not self.url:
            # Sem Apps Script: STATUS vai direto na planilha (edição pelo link, Edge invisível);
            # prints ficam só na pasta local (o Drive exige login).
            from planilha_web import PlanilhaWeb
            self.web = PlanilhaWeb(self.planilha_id, self.gid, canal=n.get("navegador", "msedge"))
            log.info("STATUS será gravado direto na planilha (sem Apps Script). Prints: só na pasta local.")

    # ------------------------------------------------------------------ fila
    def _ler_fila(self) -> list[dict]:
        try:
            return json.loads(self.arq_fila.read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            return []

    def _gravar_fila(self, fila: list[dict]) -> None:
        if fila:
            self.arq_fila.write_text(json.dumps(fila, ensure_ascii=False, indent=1), encoding="utf-8")
        elif self.arq_fila.exists():
            self.arq_fila.unlink()

    def _enfileirar(self, tarefa: dict) -> None:
        with self._trava:
            fila = self._ler_fila()
            fila.append(tarefa)
            self._gravar_fila(fila)
        self.processar_fila()

    def processar_fila(self) -> int:
        """Envia o que estiver pendente. Retorna quantas tarefas ainda faltam."""
        with self._trava:
            fila = self._ler_fila()
            restantes = []
            for t in fila:
                if t["acao"] == "print" and not self.url:
                    restantes.append(t)  # aguardam o Apps Script (Drive exige login)
                    continue
                try:
                    self._enviar(t)
                except Exception as e:  # noqa: BLE001 — rede, cota, script fora do ar
                    log.warning("Envio adiado (%s): %s", t.get("acao"), e)
                    restantes.append(t)
            self._gravar_fila(restantes)
        if fila and not restantes:
            log.info("Fila da nuvem enviada (%d itens).", len(fila))
        return len(restantes)

    def _enviar(self, t: dict) -> None:
        if t["acao"] == "status" and not self.url:
            self.web.escrever_status(t.get("os") or "", t["texto"], t.get("servico"), t.get("linha"))
            return
        import requests
        dados = {"token": self.token, "planilha": self.planilha_id, "gid": self.gid,
                 "pasta": self.pasta_drive, **t}
        if t["acao"] == "print":
            dados["conteudo"] = base64.b64encode(Path(t["arquivo"]).read_bytes()).decode()
        r = requests.post(self.url, data=json.dumps(dados), timeout=60,
                          headers={"Content-Type": "text/plain;charset=utf-8"})
        r.raise_for_status()
        try:
            resp = r.json()
        except ValueError:
            raise RuntimeError("o Apps Script não respondeu JSON (URL certa? publicado para 'Qualquer pessoa'?)")
        if not resp.get("ok"):
            raise RuntimeError(resp.get("erro", "erro desconhecido no Apps Script"))

    # ------------------------------------------------------------ interface
    def status(self, linha: int, texto: str, os_num: str | None = None, servico=None) -> None:
        self._enfileirar({"acao": "status", "linha": linha, "texto": texto[:250],
                          "os": os_num, "servico": None if servico is None else str(servico)})

    def print_tela(self, os_num: str, etapa: str, enviar: bool = True) -> Path | None:
        """Tira o print da tela inteira, salva em prints/<OS>/ e (se enviar) manda para o Drive."""
        try:
            import pyautogui
            pasta = self.pasta_local / os_num
            pasta.mkdir(parents=True, exist_ok=True)
            arq = pasta / f"{os_num}_{datetime.now():%Y%m%d_%H%M%S}_{etapa}.png"
            pyautogui.screenshot(str(arq))
        except Exception as e:  # noqa: BLE001 — print nunca derruba o apontamento
            log.warning("Não consegui tirar o print '%s': %s", etapa, e)
            return None
        log.info("Print salvo: %s", arq.name)
        if not enviar or not self.url:
            return arq
        self._enfileirar({"acao": "print", "os": os_num, "nome": arq.name, "arquivo": str(arq)})
        return arq
