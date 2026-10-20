"""
apontador.pyw — Tela de abertura do robô "Apontador Florestal".

Pede a Data planejada (de / até) e o modo (simulação ou real), mostra o que vai ser
feito e roda o fluxo completo do main.py. Durante a execução a janela se esconde (o robô
usa a tela e o mouse); no fim ela volta com o resumo de cada O.S.

Abrir: duplo clique no atalho "Apontador Florestal" da Área de Trabalho, ou
    .venv\\Scripts\\pythonw.exe apontador.pyw
"""
from __future__ import annotations

import ctypes
import os
import sys
import threading

# Python 3.13 dentro de venv não acha o Tcl/Tk sozinho: aponta para a instalação base
for _var, _pasta in (("TCL_LIBRARY", "tcl8.6"), ("TK_LIBRARY", "tk8.6")):
    _p = os.path.join(sys.base_prefix, "tcl", _pasta)
    if not os.environ.get(_var) and os.path.isdir(_p):
        os.environ[_var] = _p

import tkinter as tk
from datetime import date, datetime, timedelta
from pathlib import Path
from tkinter import messagebox, ttk

BASE = Path(__file__).resolve().parent
os.chdir(BASE)
sys.path.insert(0, str(BASE))
if sys.stdout is None:  # pythonw não tem console
    sys.stdout = sys.stderr = open(os.devnull, "w", encoding="utf-8")

try:  # nitidez com escala 125% e ícone próprio na barra de tarefas
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("Suzano.ApontadorFlorestal")
except Exception:  # noqa: BLE001
    pass

NOME = "Apontador Florestal"
SUBTITULO = "Apontamento automático de O.S.  ·  ZFLPP005  ·  SAP Suzano"

# Paleta
VERDE_ESCURO = "#123F2A"
VERDE = "#1E7A46"
VERDE_HOVER = "#17633A"
VERDE_CLARO = "#E7F3EA"
FUNDO = "#F5F7F4"
CARTAO = "#FFFFFF"
TEXTO = "#1F2A24"
TEXTO_SUAVE = "#5C6B62"
BORDA = "#D9E2DB"
LARANJA = "#F2A900"
VERMELHO = "#C0392B"


def mes(ref: date) -> tuple[date, date]:
    ini = ref.replace(day=1)
    fim = (ini + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return ini, fim


def ler_data(txt: str) -> date:
    return datetime.strptime(txt.strip(), "%d/%m/%Y").date()


class Botao(tk.Label):
    """Botão plano com hover (o ttk do Windows não deixa colorir botões)."""

    def __init__(self, mae, texto, comando, cor=VERDE, hover=VERDE_HOVER, fg="white", fonte=None, **kw):
        super().__init__(mae, text=texto, bg=cor, fg=fg, cursor="hand2", font=fonte, **kw)
        self._cor, self._hover, self._cmd = cor, hover, comando
        self.bind("<Enter>", lambda e: self.config(bg=self._hover))
        self.bind("<Leave>", lambda e: self.config(bg=self._cor))
        self.bind("<Button-1>", lambda e: self._cmd())


class App:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title(NOME)
        self.root.configure(bg=FUNDO)
        self.root.resizable(False, False)
        try:
            self.root.iconbitmap(str(BASE / "assets" / "icone.ico"))
        except tk.TclError:
            pass
        self.esc = self.root.winfo_fpixels("1i") / 96  # fator da escala do Windows
        self.f = lambda tam, peso="normal": ("Segoe UI", tam, peso)
        self.modo = tk.StringVar(value="simulacao")
        self._montar()
        self._centralizar()

    def px(self, v: float) -> int:
        return int(v * self.esc)

    # ------------------------------------------------------------------ tela
    def _montar(self) -> None:
        r = self.root
        # Cabeçalho
        cab = tk.Frame(r, bg=VERDE_ESCURO)
        cab.pack(fill="x")
        try:
            from PIL import Image, ImageTk
            img = Image.open(BASE / "assets" / "icone.png").resize((self.px(64), self.px(64)), Image.LANCZOS)
            self._icone = ImageTk.PhotoImage(img)
            tk.Label(cab, image=self._icone, bg=VERDE_ESCURO).pack(side="left", padx=(self.px(22), self.px(14)),
                                                                   pady=self.px(18))
        except Exception:  # noqa: BLE001
            pass
        txt = tk.Frame(cab, bg=VERDE_ESCURO)
        txt.pack(side="left", pady=self.px(18))
        tk.Label(txt, text=NOME, bg=VERDE_ESCURO, fg="white", font=self.f(20, "bold")).pack(anchor="w")
        tk.Label(txt, text=SUBTITULO, bg=VERDE_ESCURO, fg="#B9D8C4", font=self.f(9)).pack(anchor="w")
        tk.Frame(r, bg=LARANJA, height=self.px(4)).pack(fill="x")

        corpo = tk.Frame(r, bg=FUNDO)
        corpo.pack(fill="both", expand=True, padx=self.px(22), pady=self.px(18))

        # Cartão: Data planejada
        c1 = self._cartao(corpo, "Data planejada", "Período usado no campo \"Data planejada\" da tela de seleção.")
        linha = tk.Frame(c1, bg=CARTAO)
        linha.pack(fill="x", pady=(self.px(6), 0))
        ini, fim = mes(date.today())
        self.de = self._campo_data(linha, "De", ini)
        tk.Label(linha, text="até", bg=CARTAO, fg=TEXTO_SUAVE, font=self.f(10)).pack(side="left",
                                                                                     padx=self.px(10), pady=(self.px(18), 0))
        self.ate = self._campo_data(linha, "Até", fim)
        atalhos = tk.Frame(c1, bg=CARTAO)
        atalhos.pack(anchor="w", pady=(self.px(10), 0))
        for rotulo, ref in (("Mês atual", date.today()), ("Mês anterior", date.today().replace(day=1) - timedelta(days=1))):
            Botao(atalhos, rotulo, lambda ref=ref: self._usar_mes(ref), cor=VERDE_CLARO, hover="#D3EADA",
                  fg=VERDE, fonte=self.f(9, "bold"), padx=self.px(10), pady=self.px(3)).pack(side="left",
                                                                                           padx=(0, self.px(8)))

        # Cartão: Modo
        c2 = self._cartao(corpo, "Modo", "Comece pela simulação: preenche tudo, mas não clica no check verde nem no Salvar Guia.")
        modos = tk.Frame(c2, bg=CARTAO)
        modos.pack(fill="x", pady=(self.px(6), 0))
        self.bt_sim = self._opcao(modos, "Simulação", "não grava nada", "simulacao")
        self.bt_real = self._opcao(modos, "Real", "grava no SAP", "real")
        self._pintar_modos()

        # Cartão: Opções
        c3 = self._cartao(corpo, "Opções (opcional)", None)
        g = tk.Frame(c3, bg=CARTAO)
        g.pack(fill="x")
        self.linhas = self._campo_texto(g, "Linhas da planilha", "ex.: 2-10  (vazio = todas)", 0)
        self.refazer = self._campo_texto(g, "Refazer O.S. estornadas", "ex.: 2095998, 2096005", 1)

        # Aviso
        av = tk.Frame(corpo, bg="#FFF6DD", highlightthickness=1, highlightbackground="#F0D98C")
        av.pack(fill="x", pady=(self.px(4), self.px(14)))
        tk.Label(av, text="Durante a execução não use o mouse nem o teclado.  Para parar: Ctrl+Shift+Q.",
                 bg="#FFF6DD", fg="#6B5300", font=self.f(9), wraplength=self.px(470), justify="left").pack(
            anchor="w", padx=self.px(12), pady=self.px(8))

        self.bt_ir = Botao(corpo, "Iniciar apontamentos", self._iniciar, fonte=self.f(12, "bold"),
                           pady=self.px(11))
        self.bt_ir.pack(fill="x")
        self.rodape = tk.Label(corpo, text="", bg=FUNDO, fg=TEXTO_SUAVE, font=self.f(8))
        self.rodape.pack(pady=(self.px(8), 0))
        self._atualizar_rodape()

    def _cartao(self, mae, titulo, descricao):
        c = tk.Frame(mae, bg=CARTAO, highlightthickness=1, highlightbackground=BORDA)
        c.pack(fill="x", pady=(0, self.px(12)))
        dentro = tk.Frame(c, bg=CARTAO)
        dentro.pack(fill="x", padx=self.px(16), pady=self.px(12))
        tk.Label(dentro, text=titulo, bg=CARTAO, fg=TEXTO, font=self.f(11, "bold")).pack(anchor="w")
        if descricao:
            tk.Label(dentro, text=descricao, bg=CARTAO, fg=TEXTO_SUAVE, font=self.f(9), wraplength=self.px(460),
                     justify="left").pack(anchor="w")
        return dentro

    def _campo_data(self, mae, rotulo, valor: date) -> tk.Entry:
        f = tk.Frame(mae, bg=CARTAO)
        f.pack(side="left")
        tk.Label(f, text=rotulo, bg=CARTAO, fg=TEXTO_SUAVE, font=self.f(8, "bold")).pack(anchor="w")
        e = tk.Entry(f, width=12, font=self.f(12), relief="flat", bg="#F1F5F2", fg=TEXTO,
                     highlightthickness=1, highlightbackground=BORDA, highlightcolor=VERDE, justify="center")
        e.insert(0, valor.strftime("%d/%m/%Y"))
        e.pack(ipady=self.px(5))
        e.bind("<KeyRelease>", lambda ev: self._atualizar_rodape())
        return e

    def _campo_texto(self, mae, rotulo, dica, col) -> tk.Entry:
        f = tk.Frame(mae, bg=CARTAO)
        f.grid(row=0, column=col, sticky="w", padx=(0 if col == 0 else self.px(14), 0), pady=(self.px(6), 0))
        tk.Label(f, text=rotulo, bg=CARTAO, fg=TEXTO_SUAVE, font=self.f(8, "bold")).pack(anchor="w")
        e = tk.Entry(f, width=22, font=self.f(10), relief="flat", bg="#F1F5F2", fg=TEXTO,
                     highlightthickness=1, highlightbackground=BORDA, highlightcolor=VERDE)
        e.pack(ipady=self.px(4))
        tk.Label(f, text=dica, bg=CARTAO, fg="#8A988F", font=self.f(8)).pack(anchor="w")
        return e

    def _opcao(self, mae, titulo, sub, valor):
        f = tk.Frame(mae, bg=CARTAO, highlightthickness=2, cursor="hand2")
        f.pack(side="left", expand=True, fill="x", padx=(0, self.px(8)))
        a = tk.Label(f, text=titulo, font=self.f(11, "bold"), cursor="hand2")
        b = tk.Label(f, text=sub, font=self.f(8), cursor="hand2")
        a.pack(anchor="w", padx=self.px(12), pady=(self.px(8), 0))
        b.pack(anchor="w", padx=self.px(12), pady=(0, self.px(8)))
        for w in (f, a, b):
            w.bind("<Button-1>", lambda e, v=valor: (self.modo.set(v), self._pintar_modos(), self._atualizar_rodape()))
        f._partes = (a, b)
        return f

    def _pintar_modos(self) -> None:
        for bt, v in ((self.bt_sim, "simulacao"), (self.bt_real, "real")):
            ativo = self.modo.get() == v
            cor_borda = (VERMELHO if v == "real" else VERDE) if ativo else BORDA
            fundo = ("#FDECEA" if v == "real" else VERDE_CLARO) if ativo else CARTAO
            bt.config(highlightbackground=cor_borda, highlightcolor=cor_borda, bg=fundo)
            bt._partes[0].config(bg=fundo, fg=(VERMELHO if v == "real" else VERDE) if ativo else TEXTO)
            bt._partes[1].config(bg=fundo, fg=TEXTO_SUAVE)

    def _usar_mes(self, ref: date) -> None:
        ini, fim = mes(ref)
        for e, d in ((self.de, ini), (self.ate, fim)):
            e.delete(0, "end")
            e.insert(0, d.strftime("%d/%m/%Y"))
        self._atualizar_rodape()

    def _atualizar_rodape(self) -> None:
        try:
            de, ate = ler_data(self.de.get()), ler_data(self.ate.get())
            txt = f"Data planejada {de:%d.%m.%Y} até {ate:%d.%m.%Y}  ·  "
        except ValueError:
            txt = "Data inválida (use DD/MM/AAAA)  ·  "
        txt += "SIMULAÇÃO" if self.modo.get() == "simulacao" else "REAL — vai gravar no SAP"
        self.rodape.config(text=txt, fg=VERMELHO if self.modo.get() == "real" else TEXTO_SUAVE)

    def _centralizar(self) -> None:
        self.root.update_idletasks()
        w, h = self.root.winfo_reqwidth(), self.root.winfo_reqheight()
        x = (self.root.winfo_screenwidth() - w) // 2
        y = max((self.root.winfo_screenheight() - h) // 2 - self.px(20), 0)
        self.root.geometry(f"+{x}+{y}")

    # ------------------------------------------------------------- execução
    def _argumentos(self) -> list[str] | None:
        try:
            de, ate = ler_data(self.de.get()), ler_data(self.ate.get())
        except ValueError:
            messagebox.showerror(NOME, "Preencha as datas no formato DD/MM/AAAA.")
            return None
        if de > ate:
            messagebox.showerror(NOME, "A data inicial é maior que a final.")
            return None
        args = ["--data-inicial", f"{de:%d/%m/%Y}", "--data-final", f"{ate:%d/%m/%Y}",
                "--simular" if self.modo.get() == "simulacao" else "--real"]
        if self.linhas.get().strip():
            args += ["--linhas", self.linhas.get().strip().replace(" ", "")]
        refazer = ",".join(x.strip() for x in self.refazer.get().replace(";", ",").split(",") if x.strip())
        if refazer:
            args += ["--refazer", refazer]
        return args

    def _iniciar(self) -> None:
        args = self._argumentos()
        if args is None:
            return
        if "--real" in args:
            msg = (f"Vai GRAVAR no SAP as O.S. pendentes da planilha.\n\n"
                   f"Data planejada: {self.de.get()} até {self.ate.get()}")
            if "--refazer" in args:
                msg += f"\nRefazer (estornadas): {args[args.index('--refazer') + 1]}"
            if not messagebox.askyesno(NOME, msg + "\n\nConfirmar?", icon="warning"):
                return
        self.root.withdraw()  # o robô precisa da tela livre
        self.erro = None
        self.thread = threading.Thread(target=self._rodar, args=(args,), daemon=True)
        self.thread.start()
        self.root.after(500, self._acompanhar)

    def _rodar(self, args: list[str]) -> None:
        try:
            import main
            main.ULTIMO.clear()
            main.main(args)
            self.resultado = dict(main.ULTIMO)
        except BaseException as e:  # noqa: BLE001
            self.erro = e
            self.resultado = {}

    def _acompanhar(self) -> None:
        if self.thread.is_alive():
            self.root.after(500, self._acompanhar)
            return
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.root.after(300, lambda: self.root.attributes("-topmost", False))
        self._mostrar_resultado()

    def _mostrar_resultado(self) -> None:
        res = self.resultado or {}
        janela = tk.Toplevel(self.root, bg=FUNDO)
        janela.title(f"{NOME} — resultado")
        try:
            janela.iconbitmap(str(BASE / "assets" / "icone.ico"))
        except tk.TclError:
            pass
        topo = tk.Frame(janela, bg=VERDE_ESCURO)
        topo.pack(fill="x")
        titulo = "Execução concluída" if not self.erro and res.get("codigo", 1) == 0 else "Execução interrompida"
        tk.Label(topo, text=titulo, bg=VERDE_ESCURO, fg="white", font=self.f(14, "bold")).pack(
            anchor="w", padx=self.px(18), pady=(self.px(12), 0))
        resumo = res.get("resumo") or {}
        txt = "   ".join(f"{k}: {v}" for k, v in resumo.items()) or "nenhuma linha processada"
        if self.erro:
            txt = f"Erro: {self.erro}"
        tk.Label(topo, text=txt, bg=VERDE_ESCURO, fg="#B9D8C4", font=self.f(9)).pack(
            anchor="w", padx=self.px(18), pady=(0, self.px(12)))
        tk.Frame(janela, bg=LARANJA, height=self.px(3)).pack(fill="x")

        corpo = tk.Frame(janela, bg=FUNDO)
        corpo.pack(fill="both", expand=True, padx=self.px(16), pady=self.px(14))
        estilo = ttk.Style(janela)
        estilo.configure("R.Treeview", font=self.f(9), rowheight=self.px(26))
        estilo.configure("R.Treeview.Heading", font=self.f(9, "bold"))
        cols = ("linha", "os", "status", "mensagem")
        tv = ttk.Treeview(corpo, columns=cols, show="headings", height=8, style="R.Treeview")
        for c, w, t in zip(cols, (50, 90, 110, 520), ("Linha", "O.S.", "Status", "Mensagem")):
            tv.heading(c, text=t)
            tv.column(c, width=self.px(w), anchor="w")
        cores = {"OK": "#E3F4E8", "ERRO": "#FBE3E0", "VERIFICAR": "#FBE3E0", "PULADO": "#FFF4D6",
                 "SIMULACAO": "#E6EEF9"}
        for k, cor in cores.items():
            tv.tag_configure(k, background=cor)
        for reg in res.get("registros", []):
            st = str(reg.get("status", ""))
            tv.insert("", "end", values=(reg.get("linha"), reg.get("os"), "Apontado" if st == "OK" else st,
                                         reg.get("mensagem")), tags=(st.split(":")[0],))
        tv.pack(fill="both", expand=True)

        bts = tk.Frame(corpo, bg=FUNDO)
        bts.pack(fill="x", pady=(self.px(12), 0))
        if res.get("relatorio"):
            Botao(bts, "Abrir relatório", lambda: os.startfile(res["relatorio"]), fonte=self.f(10, "bold"),
                  padx=self.px(14), pady=self.px(7)).pack(side="left")
        Botao(bts, "Pasta de prints", lambda: os.startfile(str(BASE / "prints")) if (BASE / "prints").exists() else None,
              cor=VERDE_CLARO, hover="#D3EADA", fg=VERDE, fonte=self.f(10, "bold"), padx=self.px(14),
              pady=self.px(7)).pack(side="left", padx=self.px(8))
        if res.get("log"):
            Botao(bts, "Log", lambda: os.startfile(res["log"]), cor=VERDE_CLARO, hover="#D3EADA", fg=VERDE,
                  fonte=self.f(10, "bold"), padx=self.px(14), pady=self.px(7)).pack(side="left")
        Botao(bts, "Fechar", janela.destroy, cor="#E4E8E5", hover="#D5DBD7", fg=TEXTO, fonte=self.f(10, "bold"),
              padx=self.px(14), pady=self.px(7)).pack(side="right")

    def executar(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    App().executar()
