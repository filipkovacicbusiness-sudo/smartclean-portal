#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Test glavne zanke terminala brez strojne opreme in brez strežnika.

Bralnik, kartice, strežnik in ČAS so ponarejeni, zato se preizkusi, ki bi v
resnici trajali več minut, izvedejo v trenutku — in ne pustijo žigov v bazi.

    ~/sc-kartice-venv/bin/python test_zanka.py
"""
import sys, types, os, faulthandler
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# Če se zanka kje zatakne, po 20 s izpiše sklad in konča — test ne sme viseti.
faulthandler.dump_traceback_later(20, exit=True)

import stemplj
import sc_kartica as sc
from smartcard.Exceptions import CardRequestTimeoutException


class Konec(BaseException):
    """BaseException, ker zanka terminala ujame vsak Exception in teče naprej."""


class Okolje:
    """Ponarejen svet: ura, bralnik, strežnik z enakim pravilom 60 s kot punch."""

    def __init__(self, stanja, splet=True):
        self.t = 1_000_000.0
        self.stanja = list(stanja)        # zaporedje: UID na bralniku ali None
        self.trenutni = None
        self.poslano = []                 # (žeton, čas) vsak klic strežnika
        self.zadnji = {}                  # žeton → (čas, tip) na »strežniku«
        self.lcd = []
        self.splet = splet
        self.piski = 0
        self.poslani_ts = []
        self.luc = []          # zaporedje barv

    # ── čas ──
    def time(self): return self.t
    def sleep(self, s): self.t += s

    # ── bralnik ──
    def card_request(self, *a, **k):
        okolje = self
        class CR:
            def waitforcard(self_inner):
                if not okolje.stanja:
                    raise Konec()
                uid = okolje.stanja.pop(0)
                if uid is None:
                    okolje.t += 1.0       # timeout=1
                    raise CardRequestTimeoutException()
                okolje.trenutni = uid
                con = types.SimpleNamespace(connect=lambda: None)
                return types.SimpleNamespace(connection=con)
        return CR()

    # ── strežnik ──
    def posli(self, zeton, secret, ts=None, nonce=None):
        self.poslano.append((zeton, self.t))
        self.poslani_ts.append(ts)
        if not self.splet:
            return None
        prej = self.zadnji.get(zeton)
        if prej and self.t - prej[0] < 60:
            return {"ok": False, "error": "too_soon", "employee_name": "Ana", "last_type": prej[1]}
        tip = "out" if prej and prej[1] == "in" else "in"
        self.zadnji[zeton] = (self.t, tip)
        return {"ok": True, "type": tip, "employee_name": "Ana", "ts": "2026-09-23T07:00:00Z"}


def pozeni(stanja, splet=True):
    o = Okolje(stanja, splet)
    stemplj.time = types.SimpleNamespace(time=o.time, sleep=o.sleep, monotonic=o.time,
                                         strftime=lambda f, *a: "07:00 23.09.2026", localtime=lambda *a: None)
    stemplj.CardRequest = o.card_request
    stemplj.posli = o.posli
    stemplj.nalozi_secret = lambda: "s"
    stemplj.nalozi_vrsto = lambda: []
    stemplj.shrani_vrsto = lambda v: None
    sc.nalozi_kljuce = lambda *a, **k: {}
    sc.uid_iz_bralnika = lambda con: [o.trenutni]
    sc.preberi_zeton = lambda con, k: "ZETON_" + str(o.trenutni)
    class Lcd:
        def __init__(self, navidezen=False): pass
        def dve(self, a, b="", v_dnevnik=True): o.lcd.append((a, b))
        def mirovanje(self, n=0): pass
    stemplj.Lcd = Lcd
    class Ind:
        def priprava(self): o.luc.append("rdeca"); return True
        def rdeca(self, con=None): o.luc.append("rdeca")
        def zabelezeno(self, con=None): o.luc.append("zelena"); o.piski += 1
    stemplj.Indikator = Ind
    stemplj.ura_usklajena = lambda: True
    stemplj.boot_id = lambda: "boot-1"
    sys.argv = ["stemplj.py"]
    try:
        stemplj.main()
    except Konec:
        pass
    return o


ok = napake = 0
def t(ime, pogoj, dobljeno=None):
    global ok, napake
    if pogoj: ok += 1; print("  ok   " + ime)
    else: napake += 1; print("  FAIL " + ime + ("  -> %r" % (dobljeno,) if dobljeno is not None else ""))


# 1) Kartica obleži na bralniku 3 minute — zabeleži se natanko en žig.
#    Prej: prvo minuto too_soon vsakih nekaj sekund, po minuti ODHOD.
o = pozeni(["A"] * 400)
t("kartica, ki obleži, pošlje en sam žig", len(o.poslano) == 1, len(o.poslano))
zigi = [z for z, _ in o.lcd if z.startswith(("PRIHOD", "ODHOD"))]
t("…in to je prihod", zigi == [zigi[0]] and zigi[0].startswith("PRIHOD"), zigi)
t("…v treh minutah nobenega samodejnega odhoda", not any(z.startswith("ODHOD") for z in zigi), zigi)

# 2) Odmaknjena in prislonjena znova po ~10 s — lokalno zavrnjena, strežnik ni klican.
o = pozeni(["A"] + [None] * 10 + ["A"])
t("ponoven prislon v minuti ne kliče strežnika", len(o.poslano) == 1, len(o.poslano))
t("…pokaže »Prihod že vpisan« z imenom", o.lcd[-1] == ("Prihod že vpisan", "Ana"), o.lcd[-1])

# 3) Odmaknjena in prislonjena znova po več kot minuti — zabeleži se odhod.
o = pozeni(["A"] + [None] * 70 + ["A"])
t("po minuti se zabeleži drugi žig", len(o.poslano) == 2, len(o.poslano))
t("…in to je odhod", o.lcd[-1][0].startswith("ODHOD"), o.lcd[-1])

# 4) Dve različni kartici zapored — lokalno pravilo velja za kartico, ne za terminal.
o = pozeni(["A", None, "B"])
t("druga kartica takoj za prvo gre skozi", len(o.poslano) == 2, len(o.poslano))

# 5) Brez mreže: dvojni prislon v minuti gre v vrsto samo enkrat.
o = pozeni(["A"] + [None] * 10 + ["A"], splet=False)
t("brez mreže dvojni prislon ne gre v vrsto dvakrat", len(o.poslano) == 1, len(o.poslano))
t("…drugi pokaže »Že zabeleženo« / »počakaj minuto«", o.lcd[-1] == ("Že zabeleženo", "počakaj minuto"), o.lcd[-1])

# 5a) Lučka in pisk
o = pozeni(["A"] * 400)
t("kartica, ki obleži: natanko EN pisk", o.piski == 1, o.piski)
t("…zelena se prižge in vrne v rdečo", o.luc[:3] == ["rdeca", "zelena", "rdeca"], o.luc[:3])
t("…in ostane rdeča", o.luc[-1] == "rdeca", o.luc[-1])

o = pozeni(["A"] + [None] * 10 + ["A"])
t("»že vpisan« v minuti: brez piska", o.piski == 1, o.piski)

o = pozeni(["A"] + [None] * 70 + ["A"])
t("drugi žig po minuti: drugi pisk", o.piski == 2, o.piski)

o = pozeni(["A"] + [None] * 10 + ["A"], splet=False)
t("brez mreže: prvi prislon pisk (shranjen), drugi ne", o.piski == 1, o.piski)

o = pozeni(["A"] * 3)
t("ob zagonu je lučka rdeča", o.luc[0] == "rdeca", o.luc[:1])

# 5b) Ura: z mrežo terminal svojega časa ne pošlje — velja strežnikov
o = pozeni(["A"] + [None] * 70 + ["A"])
t("z mrežo se čas terminala ne pošilja", o.poslani_ts == [None, None], o.poslani_ts)

# 5c) Popravek časa za žige iz vrste (čista funkcija)
cz = stemplj.cas_za_poslati
t("ura je bila prava → pošlje shranjeni čas",
  cz({"ts": "X", "ura_ok": True}, False, "b", 0, 0) == ("X", True))
t("star zapis brez oznake → pošlje shranjeni čas",
  cz({"ts": "X"}, False, "b", 0, 0) == ("X", True))
t("ura ni bila prava in še ni → počakaj",
  cz({"ts": "X", "ura_ok": False, "mono": 100, "boot": "b"}, False, "b", 500, 0) == (None, False))
# prislon ob monotonem 100 s; zdaj je monotono 400 s in prava ura 1_800_000_000
ts, ok_ = cz({"ts": "X", "ura_ok": False, "mono": 100, "boot": "b"}, True, "b", 400, 1_800_000_000)
from datetime import datetime, timezone
pricakovano = datetime.fromtimestamp(1_800_000_000 - 300, timezone.utc).isoformat().replace("+00:00", "Z")
t("ura se je uskladila → čas izračunan iz monotonega", (ts, ok_) == (pricakovano, True), (ts, pricakovano))
t("vmes ponoven zagon → shranjeni čas (boljšega ni)",
  cz({"ts": "X", "ura_ok": False, "mono": 100, "boot": "star"}, True, "nov", 5, 0) == ("X", True))

# 5d) izprazni_vrsto ne pošlje, dokler ura ni usklajena
poslano = []
stemplj.posli = lambda z, s, ts=None, nonce=None: poslano.append(ts) or {"ok": True}
stemplj.shrani_vrsto = lambda v: None
stemplj.boot_id = lambda: "b"
stemplj.time = types.SimpleNamespace(time=lambda: 1_800_000_000, monotonic=lambda: 400)
v = [{"card_token": "T", "ts": "NAPACEN", "nonce": "n", "ura_ok": False, "mono": 100, "boot": "b"}]
stemplj.ura_usklajena = lambda: False
stemplj.izprazni_vrsto(v, "s")
t("neusklajena ura: žig ostane v vrsti", len(v) == 1 and poslano == [], (len(v), poslano))
stemplj.ura_usklajena = lambda: True
stemplj.izprazni_vrsto(v, "s")
t("po uskladitvi: poslan s popravljenim časom", v == [] and poslano == [pricakovano], (v, poslano))

# 6) Strežnik vrne too_soon (npr. drug terminal) — ni več »Ni uspelo | too_soon«.
t("too_soon z last_type=in", stemplj.ze_vpisan("in") == "Prihod že vpisan")
t("too_soon z last_type=out", stemplj.ze_vpisan("out") == "Odhod že vpisan")
t("neznan tip", stemplj.ze_vpisan(None) == "Že zabeleženo")

# 7) Vsa sporočila se izidejo v 16 znakov (po pretvorbi šumnikov).
for s in ("Prihod že vpisan", "Odhod že vpisan", "Že zabeleženo", "počakaj minuto", "Prisloni kartico"):
    d = len(stemplj.transliteriraj(s))
    t("%r ima %d znakov" % (s, d), d <= 16, d)

print("\n  %d ok, %d fail" % (ok, napake))
sys.exit(1 if napake else 0)
