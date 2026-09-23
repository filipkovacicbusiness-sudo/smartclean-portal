#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — terminal za štemplanje
Raspberry Pi + ACR1252U (PC/SC) + MIFARE DESFire EV3 + HD44780 16x2 I2C LCD

POTEK OB PRISLONU
    1. kartica se overi z AES-128; ključ je izpeljan iz njenega UID (sc_kartica.py)
    2. iz šifrirane datoteke na kartici preberemo žeton
    3. žeton podpišemo s skrivnostjo terminala (HMAC-SHA256) in pošljemo
       Edge funkciji »punch«
    4. strežnik sam ugotovi prihod/odhod in vrne ime
    5. LCD izpiše npr.  PRIHOD  07:32 / Brigita

Klon kartice tu odpove: UID se da prepisati, bralnega ključa pa ne — brez
njega žetona ni mogoče dobiti.

BREZ POVEZAVE
    Žig se shrani v vrsto (QUEUE_FILE) s časom prislona in se pošlje, ko je
    mreža spet na voljo. Čas je DEL PODPISA, zato ga ni mogoče ponarediti.
    Zahteva različico funkcije punch, ki pozna parameter ts (migracija te
    funkcije je v supabase/functions/punch).

ZAGON
    python3 stemplj.py                # normalno
    python3 stemplj.py --preizkus     # brez LCD, izpis na zaslon
    python3 stemplj.py --preberi      # samo prisloni karto in pokaži žeton
"""

import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys
import tempfile
import time
from datetime import datetime, timezone
import urllib.error
import urllib.request

from smartcard.CardRequest import CardRequest
from smartcard.CardType import AnyCardType
from smartcard.Exceptions import CardRequestTimeoutException, NoCardException

import sc_kartica as sc

# ─────────────────────────── NASTAVITVE ───────────────────────────
SUPABASE_URL = "https://anrhtgbckxrccnafcmsz.supabase.co"
SUPABASE_KEY = "sb_publishable_LYMbUOYW2IFz4NxgvjXLOg_PJ2-qpS4"   # javni ključ — sme biti tu
TERMINAL_SLUG = "pralnica-vhod"   # mora se ujemati z att_terminals.slug

# Skrivnost terminala (att_terminals.secret) NE sodi v to datoteko.
# terminal.json poleg skripte:  {"secret": "<64 hex znakov>"}
TERMINAL_POT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terminal.json")

LCD_ADDR = 0x27        # iz `i2cdetect -y 1`, pogosto 0x27 ali 0x3F
LCD_COLS = 16
LCD_ROWS = 2

QUEUE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stemplj_vrsta.jsonl")
FLUSH_INTERVAL = 20        # s — kako pogosto v mirovanju praznimo vrsto
PRIKAZ = 4.0               # s — kako dolgo ostane rezultat na zaslonu
POCAKAJ = 60               # s — najmanjši razmik med žigoma iste kartice (= COOLDOWN_SEK v punch)
# ───────────────────────────────────────────────────────────────────


def transliteriraj(s):
    return (s or "").translate(str.maketrans("čšžćđČŠŽĆĐ", "cszcdCSZCD"))


# ════════════════════════════ LCD ════════════════════════════
class Lcd:
    def __init__(self, navidezen=False):
        self.lcd = None
        if navidezen:
            return
        try:
            from RPLCD.i2c import CharLCD
            self.lcd = CharLCD("PCF8574", LCD_ADDR, cols=LCD_COLS, rows=LCD_ROWS, auto_linebreaks=False)
            self.lcd.clear()
        except Exception as e:
            print("LCD ni na voljo (%s) — nadaljujem z izpisom na zaslon." % e)

    def dve(self, a, b="", v_dnevnik=True):
        a = transliteriraj(str(a))[:LCD_COLS].ljust(LCD_COLS)
        b = transliteriraj(str(b))[:LCD_COLS].ljust(LCD_COLS)
        # Vsako sporočilo tudi v dnevnik (journalctl -u stemplj). Brez tega
        # v pralnici ni mogoče ugotoviti, zakaj nekomu kartica ni delala.
        # Minutni mirovalni zaslon ne gre v dnevnik — bil bi šum.
        if v_dnevnik or self.lcd is None:
            print("[LCD] %s | %s" % (a.strip(), b.strip()), flush=True)
        if self.lcd is None:
            return
        try:
            self.lcd.cursor_pos = (0, 0); self.lcd.write_string(a)
            if LCD_ROWS > 1:
                self.lcd.cursor_pos = (1, 0); self.lcd.write_string(b)
        except Exception:
            pass

    def mirovanje(self, cakajocih=0):
        # Obe vrstici imata natanko 16 znakov in sta poravnani levo.
        # Za »Prisloni kartico...« ni prostora — pike bi se odrezale.
        # Sekunde prav tako ne gredo: »21:09:45 23.09.2026« je 19 znakov.
        spodaj = time.strftime("%H:%M %d.%m.%Y", time.localtime())
        if cakajocih:
            # Brez mreže je vrsta pomembnejša od ure — pove, da se žigi še niso poslali.
            spodaj = "v vrsti: %d" % cakajocih
        self.dve("Prisloni kartico", spodaj, v_dnevnik=False)


# ════════════════ LUČKA IN PISK NA BRALNIKU (ACR1252U) ════════════════
# To so ukazi BRALNIKU (escape), ne kartici. Gonilnik CCID jih prepusti samo, če
# je v /etc/libccid_Info.plist  ifdDriverOptions = 0x0001  (glej README).
# Preverjeno na ACR1252U_V117.0: 0x01 rdeča, 0x02 zelena — lučka je ena,
# dvobarvna, zato obeh hkrati ni.
#
# Vse napake se tiho pogoltnejo: lučka in pisk sta okras in terminala nikoli ne
# smeta ustaviti. Brez njiju štemplanje dela naprej.
LUC_RDECA = 0x01
LUC_ZELENA = 0x02
PISK_MS = 400              # en daljši pisk = žig je zabeležen, kartico lahko umakneš
_IOCTL_ESCAPE = None


class Indikator:
    def __init__(self):
        self.javljeno = False

    def _ukaz(self, ukaz, con=None):
        global _IOCTL_ESCAPE
        try:
            from smartcard.scard import (SCardControl, SCardEstablishContext, SCardListReaders,
                                         SCardConnect, SCardDisconnect, SCardReleaseContext,
                                         SCARD_SCOPE_USER, SCARD_SHARE_DIRECT, SCARD_LEAVE_CARD,
                                         SCARD_CTL_CODE)
            if _IOCTL_ESCAPE is None:
                _IOCTL_ESCAPE = SCARD_CTL_CODE(1)
            # Kartica je povezana → ukaz gre po isti povezavi.
            hcard = getattr(getattr(con, "component", None), "hcard", None) if con is not None else None
            if hcard:
                hr, odg = SCardControl(hcard, _IOCTL_ESCAPE, ukaz)
                if hr == 0:
                    return list(odg)
            # Brez kartice → neposredna povezava z bralnikom, samo za ta ukaz.
            hr, ctx = SCardEstablishContext(SCARD_SCOPE_USER)
            try:
                hr, bralniki = SCardListReaders(ctx, [])
                picc = [r for r in (bralniki or []) if "PICC" in r]
                if not picc:
                    return None
                hr, h, _ = SCardConnect(ctx, picc[0], SCARD_SHARE_DIRECT, 0)
                if hr:
                    return None
                try:
                    hr, odg = SCardControl(h, _IOCTL_ESCAPE, ukaz)
                    return list(odg) if hr == 0 else None
                finally:
                    SCardDisconnect(h, SCARD_LEAVE_CARD)
            finally:
                SCardReleaseContext(ctx)
        except Exception as e:
            if not self.javljeno:        # v dnevnik samo enkrat, ne ob vsakem prislonu
                print("Lučka/pisk ne delata (%s) — štemplanje teče naprej." % e, flush=True)
                self.javljeno = True
            return None

    def priprava(self):
        """
        Izklopi samodejne signale bralnika in prižge rdečo. Vrne True ob uspehu.

        Bralnik ima privzeto vklopljene samodejne signale (0x7F): ob vsaki zaznavi
        kartice sam zapiska in pomežikne — z našim piskom bi bila dva.

        Kliče se ob zagonu in nato vsako minuto v mirovanju, ker se bralnik lahko
        pojavi šele po storitvi ali ga kdo prevtakne. Nastavitev signalov se
        najprej PREBERE in zapiše samo, če se razlikuje: najbrž gre v trajni
        pomnilnik bralnika, ki bi ga pisanje vsako minuto obrabilo.
        """
        odg = self._ukaz([0xE0, 0x00, 0x00, 0x21, 0x00])
        if not odg:
            return False
        if odg[-1] != 0x00:
            if self._ukaz([0xE0, 0x00, 0x00, 0x21, 0x01, 0x00]) is None:
                return False
        return self._ukaz([0xE0, 0x00, 0x00, 0x29, 0x01, LUC_RDECA]) is not None

    def rdeca(self, con=None):
        self._ukaz([0xE0, 0x00, 0x00, 0x29, 0x01, LUC_RDECA], con)

    def zabelezeno(self, con=None):
        self._ukaz([0xE0, 0x00, 0x00, 0x29, 0x01, LUC_ZELENA], con)
        self._ukaz([0xE0, 0x00, 0x00, 0x28, 0x01, PISK_MS // 10], con)


# ════════════════ URA ════════════════
# Pi 5 brez baterije za RTC ob izklopu izgubi čas; ob vklopu nadaljuje od
# zadnjega shranjenega (/var/lib/systemd/timesync/clock), dokler ga NTP ne
# popravi. Žig, poslan s tako uro, bi strežnik sprejel (do 14 dni nazaj) in
# prihod ob 7:00 bi bil tiho zabeležen kot »sinoči ob 21:30«.
#
# Zato: z mrežo časa NE pošiljamo — velja strežnikov. Brez mreže in z
# neusklajeno uro pa si zapomnimo MONOTONI čas prislona (ta ob uskladitvi ure
# ne skoči) in pravi čas izračunamo, ko se ura uskladi.

def ura_usklajena():
    return os.path.exists("/run/systemd/timesync/synchronized")


def boot_id():
    try:
        with open("/proc/sys/kernel/random/boot_id") as f:
            return f.read().strip()
    except Exception:
        return ""


def _iso(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat().replace("+00:00", "Z")


def cas_za_poslati(o, ura_ok_zdaj, boot_zdaj, mono_zdaj, zdaj):
    """
    Čas žiga iz vrste, pripravljen za pošiljanje: (ts, pripravljen).
    pripravljen=False pomeni »še počakaj« — ura še ni usklajena.
    """
    if o.get("ura_ok", True):               # ura je bila ob prislonu prava (ali star zapis)
        return o["ts"], True
    if o.get("boot") == boot_zdaj:
        if not ura_ok_zdaj:
            return None, False
        return _iso(zdaj - (mono_zdaj - o["mono"])), True
    # Vmes je bil ponoven zagon, monotoni čas se je ponastavil — boljšega ni.
    print("Žig iz vrste s časom pred uskladitvijo ure in ponovnim zagonom — pošiljam, kar imam.", flush=True)
    return o["ts"], True


# ════════════════ VRSTA BREZ MREŽE (atomaren zapis) ════════════════
def nalozi_vrsto():
    out = []
    try:
        with open(QUEUE_FILE, encoding="utf-8") as f:
            for v in f:
                v = v.strip()
                if not v:
                    continue
                try:
                    o = json.loads(v)
                    if o.get("card_token") and o.get("ts") and o.get("nonce"):
                        out.append(o)
                except Exception:
                    pass
    except FileNotFoundError:
        pass
    except Exception:
        pass
    return out


def shrani_vrsto(vrsta):
    """Temp + rename + fsync — vrsta preživi izpad elektrike sredi zapisa."""
    try:
        d = os.path.dirname(QUEUE_FILE) or "."
        fd, tmp = tempfile.mkstemp(dir=d, prefix=".vrsta_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                for o in vrsta:
                    f.write(json.dumps(o, ensure_ascii=False) + "\n")
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, QUEUE_FILE)
        finally:
            if os.path.exists(tmp):
                try:
                    os.remove(tmp)
                except Exception:
                    pass
    except Exception as e:
        print("Napaka pri shranjevanju vrste:", e)


def izprazni_vrsto(vrsta, secret):
    """
    Pošlje najstarejše najprej. Ob prvi mrežni napaki se ustavi in ostanek pusti.
    Nonce se prenese nespremenjen, zato strežnik ponoven poskus prepozna kot
    podvojen in ur ne šteje dvakrat.
    """
    while vrsta:
        o = vrsta[0]
        ts, pripravljen = cas_za_poslati(o, ura_usklajena(), boot_id(), time.monotonic(), time.time())
        if not pripravljen:
            break                      # ura še ni usklajena — pošljemo, ko bo
        odgovor = posli(o["card_token"], secret, ts=ts, nonce=o["nonce"])
        if odgovor is None:
            break                      # še vedno brez mreže
        vrsta.pop(0)                   # strežnik je odgovoril (tudi z napako) → ne ponavljamo
        shrani_vrsto(vrsta)
    return len(vrsta)


# ════════════════════════════ STREŽNIK ════════════════════════════
def podpis(secret, terminal, card_token, nonce, ts):
    sporocilo = "%s.%s.%s" % (terminal, card_token, nonce)
    if ts:
        sporocilo += "." + ts
    return hmac.new(secret.encode(), sporocilo.encode(), hashlib.sha256).hexdigest()


def posli(card_token, secret, ts=None, nonce=None):
    """Vrne odgovor strežnika kot slovar, ali None, če ni povezave."""
    nonce = nonce or secrets.token_hex(16)
    telo = {
        "terminal_id": TERMINAL_SLUG,
        "card_token": card_token,
        "nonce": nonce,
        "hmac": podpis(secret, TERMINAL_SLUG, card_token, nonce, ts),
    }
    if ts:
        telo["ts"] = ts

    zahteva = urllib.request.Request(
        SUPABASE_URL.rstrip("/") + "/functions/v1/punch",
        data=json.dumps(telo).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "apikey": SUPABASE_KEY},
    )
    try:
        with urllib.request.urlopen(zahteva, timeout=10) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "error": "http_%s" % e.code}
    except Exception:
        return None            # ni mreže


SPOROCILA = {
    "unknown_card": "Kartica ni vpisana",
    "unknown_terminal": "Terminal ni vpisan",
    "bad_hmac": "Napacen podpis",
    "duplicate": "Ze zabelezeno",
    "stale_ts": "Cas je prestar",
    "db_error": "Napaka baze",
    "missing_fields": "Nepopoln zahtevek",
}


def ze_vpisan(tip):
    """Zgornja vrstica, ko je ista kartica prislonjena prehitro."""
    if tip == "in":
        return "Prihod že vpisan"
    if tip == "out":
        return "Odhod že vpisan"
    return "Že zabeleženo"


def prikazi_odgovor(lcd, o):
    if not isinstance(o, dict):
        lcd.dve("Napaka", "neznan odgovor")
        return
    # Druga kartica v isti minuti ni napaka — prvi žig je bil sprejet. Prej se
    # je izpisalo »Ni uspelo | too_soon«, kar je zvenelo, kot da ni šlo skozi.
    if o.get("error") == "too_soon":
        lcd.dve(ze_vpisan(o.get("last_type")), o.get("employee_name", ""))
        return
    if o.get("ok"):
        vrsta = "PRIHOD" if o.get("type") == "in" else "ODHOD"
        try:
            ura = datetime.fromisoformat(str(o.get("ts", "")).replace("Z", "+00:00")).astimezone().strftime("%H:%M")
        except Exception:
            ura = time.strftime("%H:%M")
        lcd.dve("%s  %s" % (vrsta, ura), o.get("employee_name", ""))
    else:
        koda = o.get("error", "")
        lcd.dve("Ni uspelo", SPOROCILA.get(koda, str(koda)))


# ════════════════════════════ GLAVNO ════════════════════════════
def nalozi_secret():
    if not os.path.exists(TERMINAL_POT):
        print("Ni datoteke %s\nUstvari jo z vsebino:  {\"secret\": \"<att_terminals.secret>\"}" % TERMINAL_POT)
        sys.exit(1)
    if os.stat(TERMINAL_POT).st_mode & 0o077:
        print("terminal.json je berljiv za druge. Popravi:  chmod 600 %s" % TERMINAL_POT)
        sys.exit(1)
    with open(TERMINAL_POT, encoding="utf-8") as f:
        s = (json.load(f) or {}).get("secret", "")
    if not s:
        print("V terminal.json manjka \"secret\".")
        sys.exit(1)
    return s


def main():
    p = argparse.ArgumentParser(description="SmartClean terminal za štemplanje")
    p.add_argument("--preizkus", action="store_true", help="brez LCD, izpis na zaslon")
    p.add_argument("--preberi", action="store_true", help="samo prisloni karto in pokaži žeton")
    a = p.parse_args()

    lcd = Lcd(navidezen=a.preizkus)

    try:
        kljuci = sc.nalozi_kljuce()
    except sc.NapakaKartice as e:
        lcd.dve("Ni kljucev", "")
        print("Napaka: %s" % e)
        sys.exit(1)

    if a.preberi:
        try:
            cs = CardRequest(timeout=30, cardType=AnyCardType()).waitforcard()
        except CardRequestTimeoutException:
            print("Kartice ni bilo.")
            sys.exit(1)
        cs.connection.connect()
        print("Žeton: %s" % sc.preberi_zeton(cs.connection, kljuci))
        return

    secret = nalozi_secret()
    lcd.dve("SmartClean", "zagon...")
    ind = Indikator()
    ind_ok = ind.priprava()
    vrsta = nalozi_vrsto()
    if vrsta:
        izprazni_vrsto(vrsta, secret)

    lcd.mirovanje(len(vrsta))
    prikaz_do = 0
    zadnji_flush = time.time()
    zadnja_minuta = -1

    # UID kartice, ki od zadnje obdelave še NI bila odmaknjena z bralnika.
    # Kartica, ki obleži na terminalu, se je prej brala vsakih nekaj sekund:
    # prvo minuto jo je strežnik zavračal, po minuti pa bi jo sprejel in
    # zabeležil odhod — kdor bi kartico odložil na terminal, bi bil čez
    # minuto samodejno odjavljen. Zdaj mora biti kartica odmaknjena, preden
    # se jo sploh znova prebere.
    na_bralniku = None

    # žeton → (čas, tip, ime) zadnjega sprejetega žiga, samo v pomnilniku.
    # Strežnik pravilo 60 s uveljavlja sam; tu ga ponovimo, da brez mreže
    # dvojni prislon ne pristane v vrsti dvakrat in da oseba dobi odgovor takoj.
    zadnji_zigi = {}

    def mirovanje_opravila(prazen=True):
        nonlocal zadnji_flush, zadnja_minuta, ind_ok
        now = time.time()
        if vrsta and (now - zadnji_flush) >= FLUSH_INTERVAL:
            izprazni_vrsto(vrsta, secret)
            zadnji_flush = now
        nova_minuta = now >= prikaz_do and int(now) // 60 != zadnja_minuta
        if nova_minuta:
            lcd.mirovanje(len(vrsta))
            zadnja_minuta = int(now) // 60
        # Lučko samo pri praznem bralniku — neposredna povezava bi se sicer
        # skregala s povezavo do kartice. Dokler ne uspe, vsakič; potem na minuto.
        if prazen and (not ind_ok or nova_minuta):
            ind_ok = ind.priprava()

    def pokazi(zgoraj, spodaj):
        nonlocal prikaz_do, zadnja_minuta
        lcd.dve(zgoraj, spodaj)
        prikaz_do = time.time() + PRIKAZ
        zadnja_minuta = -1

    while True:
        try:
            cs = CardRequest(timeout=1, cardType=AnyCardType()).waitforcard()
        except CardRequestTimeoutException:
            na_bralniku = None         # bralnik je prazen — kartica je bila odmaknjena
            mirovanje_opravila()
            continue
        except Exception:
            time.sleep(0.5)
            continue

        # ── kartica je na bralniku ──
        try:
            cs.connection.connect()
            uid = sc.uid_iz_bralnika(cs.connection)
        except Exception:
            time.sleep(0.3)            # kartica je odšla med branjem — poskusi znova
            continue

        if uid == na_bralniku:         # ista kartica še leži na bralniku
            mirovanje_opravila(prazen=False)
            time.sleep(0.3)
            continue
        na_bralniku = uid

        try:
            zeton = sc.preberi_zeton(cs.connection, kljuci)
        except sc.NapakaKartice as e:
            pokazi("Kartica?", str(e))
            time.sleep(PRIKAZ)
            continue
        except NoCardException:
            na_bralniku = None         # odmaknjena sredi branja — naj se prebere znova
            continue
        except Exception as e:
            pokazi("Napaka kartice", type(e).__name__)
            time.sleep(PRIKAZ)
            continue

        prej = zadnji_zigi.get(zeton)
        if prej and time.monotonic() - prej[0] < POCAKAJ:
            pokazi(ze_vpisan(prej[1]), prej[2] or "počakaj minuto")
            time.sleep(PRIKAZ)
            continue

        ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        nonce = secrets.token_hex(16)

        if vrsta:                      # star zaostanek najprej, da ostane zaporedje pravilno
            izprazni_vrsto(vrsta, secret)

        # Z mrežo brez našega časa — strežnikov je vedno pravi (glej URA).
        odgovor = posli(zeton, secret, nonce=nonce)
        zabelezeno = False
        if odgovor is None:
            vrsta.append({"card_token": zeton, "ts": ts, "nonce": nonce,
                          "ura_ok": ura_usklajena(), "mono": time.monotonic(), "boot": boot_id()})
            shrani_vrsto(vrsta)
            zadnji_zigi[zeton] = (time.monotonic(), None, None)
            pokazi("Shranjeno offln.", "poslem kasneje")
            zabelezeno = True          # varno shranjeno na disku, poslalo se bo samo
        else:
            prikazi_odgovor(lcd, odgovor)
            prikaz_do = time.time() + PRIKAZ
            zadnja_minuta = -1
            if isinstance(odgovor, dict) and odgovor.get("ok"):
                zadnji_zigi[zeton] = (time.monotonic(), odgovor.get("type"), odgovor.get("employee_name"))
                zabelezeno = True

        # Zelena in en daljši pisk SAMO, ko je žig res zabeležen — to je znak, da
        # lahko kartico umakneš. Ob »že vpisan« ali napaki ostane rdeča, brez piska.
        if zabelezeno:
            ind.zabelezeno(cs.connection)

        zadnji_flush = time.time()
        time.sleep(PRIKAZ)
        if zabelezeno:
            ind.rdeca(cs.connection)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nKonec.")
