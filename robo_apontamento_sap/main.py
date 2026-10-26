"""
main.py — Robô de apontamento de Ordens de Serviço na ZFLPP005 (SAP Suzano).

Exemplos:
    python main.py                          # usa config.yaml (simulacao: true por padrão)
    python main.py --linhas 2-10            # só as linhas 2 a 10 da planilha
    python main.py --real                   # grava de verdade no SAP
    python main.py --listar-ids             # grava os IDs da tela SAP atual em ids_tela.txt

Status gravados na planilha/relatório:
    OK                  apontado e Status Reg = Criado (na planilha: "Apontado")
    ERRO: <motivo>      não gravou nada no SAP; pode ser reprocessado
    VERIFICAR: <motivo> falhou DEPOIS do check verde → conferir manualmente no SAP
    PULADO: <motivo>    não processado (insumo, já criado...)
    SIMULACAO: ...      modo dry-run (não vai para a planilha, por padrão)
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from datetime import date, datetime
from pathlib import Path

from nuvem import Nuvem
from planilha import LinhaPlanilha, Planilha
from utils import (ErroConfiguracao, ErroNegocio, ParadaEmergencia, ParadaSolicitada, Relatorio,
                   carregar_yaml, configurar_logging, converter_data, formatar_quantidade,
                   normalizar_servico, parse_numero, primeiro_ultimo_dia, texto_inteiro, vazio)

BASE = Path(__file__).resolve().parent
log = logging.getLogger("robo")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Robô de apontamento ZFLPP005")
    p.add_argument("--config", default=str(BASE / "config.yaml"))
    p.add_argument("--ids", default=str(BASE / "sap_ids.yaml"))
    modo = p.add_mutually_exclusive_group()
    modo.add_argument("--simular", action="store_true", help="força modo simulação (dry-run)")
    modo.add_argument("--real", action="store_true", help="força modo real (grava no SAP)")
    p.add_argument("--linhas", help="intervalo de linhas da planilha, ex.: 2-10 ou 5")
    p.add_argument("--data-inicial", help="Data planejada DE (DD/MM/AAAA); usa junto com --data-final")
    p.add_argument("--data-final", help="Data planejada ATÉ (DD/MM/AAAA)")
    p.add_argument("--modo", choices=["scripting", "imagem", "auto"], help="sobrepõe o modo do config")
    p.add_argument("--listar-ids", action="store_true", help="grava os IDs da tela atual do SAP e sai")
    p.add_argument("--refazer", metavar="OS1,OS2",
                   help="aponta de novo estas O.S. mesmo que já constem como apontadas (use só depois de "
                        "estornar o apontamento no SAP)")
    p.add_argument("--ignorar-historico", action="store_true",
                   help="aponta mesmo O.S. que já constam em apontados.json (cuidado: duplica)")
    p.add_argument("--testar-imagens", action="store_true",
                   help="modo imagem: mostra quais imagens estão visíveis na tela agora e sai")
    return p.parse_args(argv)


def criar_robo(cfg: dict, ids: dict, parada: ParadaEmergencia):
    modo = str(cfg.get("modo", "scripting")).lower()
    if modo in ("scripting", "auto"):
        from sap_client import SapClient, ScriptingDesabilitado
        robo = SapClient(cfg, ids, parada)
        try:
            robo.conectar()
            return robo
        except ScriptingDesabilitado:
            if modo != "auto":
                raise
            log.warning("GUI Scripting indisponível → usando o plano B (imagem).")
    from sap_imagem import SapImagem
    robo = SapImagem(cfg, ids, parada)
    robo.conectar()
    return robo


def periodo(cfg: dict, data_exec: date) -> tuple[str, str]:
    """Data planejada (de/até) da tela de seleção."""
    s = cfg["selecao"]
    p = s.get("periodo", {})
    fmt = s.get("formato_data", "%d.%m.%Y")
    modo = str(p.get("modo", "mes_atual"))
    if modo == "fixo":
        return (converter_data(p["data_inicial"]).strftime(fmt),
                converter_data(p["data_final"]).strftime(fmt))
    ref = data_exec if modo == "mes_da_execucao" else date.today()
    ini, fim = primeiro_ultimo_dia(ref)
    return ini.strftime(fmt), fim.strftime(fmt)


def preparar_dados(linha: LinhaPlanilha, cfg: dict) -> dict:
    """Valida e converte os dados da linha ANTES de tocar no SAP."""
    ap = cfg.get("apontamento", {})
    problemas = []
    os_ = texto_inteiro(linha.os)
    if not os_:
        problemas.append("O.S. vazia")
    if vazio(linha.servico):
        problemas.append("serviço vazio")
    try:
        qtd = parse_numero(linha.quantidade)
        if qtd <= 0:
            problemas.append(f"quantidade <= 0 ({linha.quantidade})")
    except ValueError:
        qtd = 0.0
        problemas.append(f"quantidade inválida ({linha.quantidade!r})")
    try:
        data_exec = converter_data(linha.data)
        if data_exec > date.today():
            problemas.append(f"data de execução no futuro ({data_exec:%d/%m/%Y})")
    except ValueError:
        data_exec = None
        problemas.append(f"data inválida ({linha.data!r})")
    # Insumos: cada NI precisa de uma quantidade (e vice-versa)
    casas = int(ap.get("casas_decimais", 3))
    insumos = []
    for ni, q in (linha.insumos or []):
        ni_txt = texto_inteiro(ni)
        if not ni_txt:
            problemas.append(f"quantidade de insumo {q!r} sem NI")
            continue
        try:
            if parse_numero(q) <= 0:
                raise ValueError
            insumos.append((ni_txt, formatar_quantidade(q, casas)))
        except ValueError:
            problemas.append(f"insumo {ni_txt} sem quantidade válida ({q!r})")
    nis = [n for n, _ in insumos]
    if len(set(nis)) != len(nis):
        problemas.append("NI de insumo repetido na linha")
    if linha.possui_insumo and not insumos and not problemas:
        problemas.append("coluna de insumo preenchida mas sem NI/quantidade")
    if problemas:
        raise ErroNegocio("dado inválido na planilha: " + "; ".join(problemas))
    return {
        "insumos": insumos,
        "os": os_,
        "servico": linha.servico,
        "quantidade": qtd,
        "quantidade_sap": formatar_quantidade(qtd, int(ap.get("casas_decimais", 3))),
        "data": data_exec,
        "data_sap": data_exec.strftime(ap.get("formato_data_execucao", "%d%m%Y")),
    }


def processar_linha(robo, linha: LinhaPlanilha, d: dict, cfg: dict, simulacao: bool) -> tuple[str, str]:
    """Fluxo 3.3 → 3.6 para uma linha. Retorna (status, mensagem)."""
    ex = cfg.get("execucao", {})

    # REGRA_INSUMO: "apontar" (padrão) faz a etapa de insumos antes do Salvar Guia;
    # "pular" deixa a linha como PULADO sem tocar no SAP.
    if d["insumos"] and str(ex.get("regra_insumo", "apontar")) == "pular":
        return "PULADO", "possui insumo (regra_insumo: pular)"

    robo.ponto_sem_retorno = False
    data_ini, data_fim = periodo(cfg, d["data"])
    robo.pesquisar_os(d["os"], data_ini, data_fim)                       # 3.3
    idx = robo.localizar_servico(d["servico"])                            # 3.4
    if ex.get("pular_se_ja_criado", True) and robo.ja_criado(idx):
        # Já está apontada no SAP: não aponta de novo (no modo real, registra como apontada)
        if simulacao:
            return "PULADO", "já consta 'Criado' no SAP"
        return "OK", "já constava 'Criado' no SAP (não apontado de novo)"
    robo.apontar(idx, d["data_sap"], d["quantidade_sap"], simulacao)      # 3.5
    # 3.5b insumos. Em simulação o popup é cancelado e o SAP só abre a grade de materiais
    # depois de a operação ser confirmada ("Antes de preencher o material, preencher a
    # operação"), então a etapa de insumos só roda no modo real.
    if d["insumos"] and not simulacao:
        robo.apontar_insumos(idx, d["insumos"])
    if simulacao:
        ins = ("; insumos da planilha " + ", ".join(f"{n}={q}" for n, q in d["insumos"])
               + " (não testados: o SAP só abre a grade de insumos após confirmar a operação)") if d["insumos"] else ""
        return "SIMULACAO", (f"popup preenchido (data {d['data_sap']}, qtd {d['quantidade_sap']}) e cancelado"
                             f"{ins}; nada salvo")
    idx = robo.conferir_apontamento(idx, d["servico"], d["quantidade"])   # 3.6
    msg = robo.salvar(idx, d["servico"])
    return "OK", msg or "Status Reg = Criado"


class Historico:
    """Registro local (apontados.json) de tudo que este robô já levou a 'Criado'.

    Necessário porque, depois de salvo, a ZFLPP005 volta a mostrar a linha como
    pendente (Status Reg vazio, 0,00) quando a O.S. é pesquisada de novo — então o SAP
    sozinho não impede um segundo apontamento. Também protege enquanto o "Apontado"
    ainda não chegou na planilha."""

    def __init__(self, arquivo: Path) -> None:
        self.arquivo = arquivo
        try:
            self.dados = json.loads(arquivo.read_text(encoding="utf-8"))
        except (FileNotFoundError, ValueError):
            self.dados = {}

    @staticmethod
    def chave(os_num: str, servico) -> str:
        return f"{texto_inteiro(os_num)}|{normalizar_servico(servico)}"

    def get(self, os_num: str, servico):
        return self.dados.get(self.chave(os_num, servico))

    def registrar(self, os_num: str, servico, **info) -> None:
        self.dados[self.chave(os_num, servico)] = {"data_hora": datetime.now().strftime("%d/%m/%Y %H:%M:%S"), **info}
        self.arquivo.write_text(json.dumps(self.dados, ensure_ascii=False, indent=1), encoding="utf-8")


def filtrar_intervalo(linhas: list[LinhaPlanilha], texto: str | None, cfg: dict) -> list[LinhaPlanilha]:
    ex = cfg.get("execucao", {})
    ini, fim = ex.get("linha_inicial"), ex.get("linha_final")
    if texto:
        partes = texto.split("-")
        ini = int(partes[0])
        fim = int(partes[1]) if len(partes) > 1 and partes[1] else (ini if len(partes) == 1 else None)
    return [l for l in linhas if (ini is None or l.numero >= int(ini)) and (fim is None or l.numero <= int(fim))]


# Resultado da última execução (lido pela tela do apontador.pyw)
ULTIMO: dict = {}


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    cfg = carregar_yaml(args.config)
    if args.data_inicial or args.data_final:
        if not (args.data_inicial and args.data_final):
            raise SystemExit("informe --data-inicial e --data-final juntas")
        cfg["selecao"]["periodo"] = {"modo": "fixo", "data_inicial": args.data_inicial,
                                     "data_final": args.data_final}
    ids = carregar_yaml(args.ids)
    if args.modo:
        cfg["modo"] = args.modo
    simulacao = bool(cfg.get("simulacao", True))
    if args.simular:
        simulacao = True
    if args.real:
        simulacao = False

    arq_log = configurar_logging(BASE / cfg.get("logs", {}).get("pasta", "logs"),
                                 cfg.get("logs", {}).get("nivel", "INFO"))
    log.info("=" * 70)
    log.info("Robô ZFLPP005 — modo %s — %s", cfg.get("modo", "scripting"),
             "SIMULAÇÃO (nada será gravado no SAP)" if simulacao else "REAL (vai gravar no SAP!)")
    log.info("Log: %s", arq_log)
    if str(cfg["selecao"].get("periodo", {}).get("modo")) == "fixo":
        log.info("Data planejada: %s até %s", *periodo(cfg, date.today()))

    parada = ParadaEmergencia()
    parada.iniciar()

    try:
        robo = criar_robo(cfg, ids, parada)
    except Exception as e:  # noqa: BLE001
        log.error("Não foi possível conectar ao SAP: %s", e)
        return 1

    if args.listar_ids:
        arq = robo.listar_ids(BASE / "ids_tela.txt")
        log.info("IDs da tela atual gravados em %s", arq)
        return 0
    if args.testar_imagens:
        if not hasattr(robo, "testar_imagens"):
            log.error("--testar-imagens só funciona com modo: imagem")
            return 1
        robo.testar_imagens()
        return 0

    ex = cfg.get("execucao", {})
    escrever = (not simulacao) or bool(ex.get("atualizar_planilha_em_simulacao", False))
    nuvem = Nuvem(cfg, BASE)
    nuvem.processar_fila()  # reenvia o que ficou pendente de execuções anteriores
    planilha = Planilha(cfg, escrever=escrever, nuvem=nuvem)
    texto_ok = str(ex.get("texto_status_ok", "Apontado"))
    historico = Historico(BASE / "apontados.json")
    try:
        linhas = filtrar_intervalo(planilha.carregar(), args.linhas, cfg)
    except Exception as e:  # noqa: BLE001
        log.error("Falha ao ler a planilha: %s", e)
        return 1

    ignorar = [str(s).upper() for s in ex.get("ignorar_status", ["OK", "APONTADO", "VERIFICAR"])]
    refazer = {texto_inteiro(x) for x in (args.refazer or "").split(",") if x.strip()}
    if refazer:
        log.warning("--refazer: as O.S. %s serão apontadas de novo (histórico e STATUS ignorados).",
                    ", ".join(sorted(refazer)))
    tentativas_max = max(1, int(ex.get("tentativas", 2)))
    pausa = float(ex.get("pausa_entre_tentativas", 3))
    relatorio = Relatorio(BASE / cfg.get("relatorio", {}).get("pasta", "relatorios"), simulacao)
    codigo = 0

    try:
        robo.abrir_transacao()                                         # 3.2
        for linha in linhas:
            if linha.vazia():
                continue
            liberada = texto_inteiro(linha.os) in refazer
            if not liberada and any(linha.status.upper().startswith(s) for s in ignorar):
                log.info("Linha %d já processada (%s) — ignorando.", linha.numero, linha.status)
                relatorio.registrar(linha=linha.numero, os=texto_inteiro(linha.os),
                                    servico=texto_inteiro(linha.servico), quantidade=linha.quantidade,
                                    data_execucao=linha.data, status="PULADO",
                                    mensagem=f"STATUS na planilha já é '{linha.status}'")
                continue
            ja = historico.get(texto_inteiro(linha.os), linha.servico)
            if ja and not args.ignorar_historico and not liberada:
                log.info("Linha %d: O.S. %s já foi apontada por este robô em %s — não aponta de novo.",
                         linha.numero, texto_inteiro(linha.os), ja["data_hora"])
                relatorio.registrar(linha=linha.numero, os=texto_inteiro(linha.os),
                                    servico=texto_inteiro(linha.servico), quantidade=linha.quantidade,
                                    data_execucao=linha.data, status="PULADO",
                                    mensagem=f"já apontada por este robô em {ja['data_hora']} "
                                             "(se foi estornada, use 'Refazer O.S. estornadas')")
                if not simulacao:
                    if linha.status.strip().upper() != texto_ok.upper():  # garante o "Apontado" na planilha
                        planilha.atualizar_status(linha.numero, texto_ok, texto_inteiro(linha.os), linha.servico)
                continue
            parada.verificar()
            log.info("-" * 70)
            log.info("Linha %d: OS=%s serviço=%s qtd=%s data=%s insumo=%s", linha.numero, linha.os,
                     linha.servico, linha.quantidade, linha.data, "sim" if linha.possui_insumo else "não")

            status, msg, tentativa, dados = "ERRO", "", 0, {}
            os_num = texto_inteiro(linha.os)
            # Prints de registro: prints/<OS>/ e, no modo real, pasta da O.S. no Drive
            robo.evidencia = (lambda etapa, _os=os_num: nuvem.print_tela(_os, etapa, enviar=not simulacao))
            try:
                dados = preparar_dados(linha, cfg)
            except ErroNegocio as e:
                msg = str(e)
            else:
                for tentativa in range(1, tentativas_max + 1):     # retentativa só p/ falha transitória
                    try:
                        status, msg = processar_linha(robo, linha, dados, cfg, simulacao)
                        break
                    except ParadaSolicitada:
                        raise
                    except ErroConfiguracao:
                        raise
                    except ErroNegocio as e:
                        status, msg = "ERRO", str(e)
                        break
                    except Exception as e:  # noqa: BLE001 — COM, timeout, elemento ausente...
                        status, msg = "ERRO", f"{type(e).__name__}: {e}"
                        log.exception("Falha na linha %d (tentativa %d/%d)", linha.numero, tentativa, tentativas_max)
                        if robo.ponto_sem_retorno or tentativa == tentativas_max:
                            break
                        time.sleep(pausa)
                        try:
                            robo.recuperar()
                        except Exception as e2:  # noqa: BLE001
                            log.error("Recuperação falhou: %s", e2)
                # Falhou depois do check verde: o SAP pode ter gravado → conferência manual
                if status == "ERRO" and robo.ponto_sem_retorno:
                    status = "VERIFICAR"
                if status in ("ERRO", "VERIFICAR"):
                    robo.evidencia("erro")

            if status == "OK" and not simulacao:
                historico.registrar(os_num, linha.servico, linha=linha.numero,
                                    quantidade=dados.get("quantidade_sap"), mensagem=msg)
            texto_status = texto_ok if status == "OK" else f"{status}: {msg}"
            (log.info if status in ("OK", "SIMULACAO", "PULADO") else log.error)(
                "Linha %d → %s", linha.numero, texto_status)
            relatorio.registrar(linha=linha.numero, os=texto_inteiro(linha.os), servico=texto_inteiro(linha.servico),
                                quantidade=dados.get("quantidade_sap", linha.quantidade),
                                data_execucao=dados["data"].strftime("%d/%m/%Y") if dados.get("data") else linha.data,
                                status=status, mensagem=msg, tentativas=tentativa)
            if status != "SIMULACAO" or escrever:
                planilha.atualizar_status(linha.numero, texto_status, os_num, linha.servico)

            try:                                                          # 3.7
                robo.ponto_sem_retorno = False
                robo.voltar_selecao()
            except ParadaSolicitada:
                raise
            except Exception as e:  # noqa: BLE001
                log.error("Não consegui voltar à tela de seleção: %s — tentando reabrir.", e)
                robo.recuperar()

    except ParadaSolicitada as e:
        log.warning("%s. Encerrando com segurança.", e)
        codigo = 2
    except ErroConfiguracao as e:
        log.error("Erro de configuração — robô interrompido: %s", e)
        codigo = 1
    except Exception:  # noqa: BLE001
        log.exception("Erro inesperado — robô interrompido.")
        codigo = 1
    finally:
        pendentes = nuvem.processar_fila()
        if pendentes:
            log.warning("%d envio(s) para planilha/Drive ficaram na fila (pendentes.json); "
                        "serão reenviados na próxima execução.", pendentes)
        xlsx = relatorio.salvar_excel()
        log.info("=" * 70)
        log.info("Resumo: %s", relatorio.resumo() or "nenhuma linha processada")
        log.info("Relatório: %s", xlsx or relatorio.csv)
        ULTIMO.update(resumo=relatorio.resumo(), relatorio=str(xlsx or relatorio.csv), log=str(arq_log),
                      registros=list(relatorio.registros), codigo=codigo)
        log.info("Fim: %s", datetime.now().strftime("%d/%m/%Y %H:%M:%S"))
    return codigo


if __name__ == "__main__":
    sys.exit(main())
