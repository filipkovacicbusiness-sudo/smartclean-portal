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
TERMINAL_SLUG = "pralnica"        # mora se ujemati z att_terminals.slug

# Skrivnost terminala (att_terminals.secret) NE sodi v to datoteko.
# terminal.json poleg skripte:  {"secret": "<64 hex znakov>"}
TERMINAL_POT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terminal.json")

LCD_ADDR = 0x27        # iz `i2cdetect -y 1`, pogosto 0x27 ali 0x3F
LCD_COLS = 16
LCD_ROWS = 2

QUEUE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stemplj_vrsta.jsonl")
FLUSH_INTERVAL = 20        # s — kako pogosto v mirovanju praznimo vrsto
PRIKAZ = 4.0               # s — kako dolgo ostane rezultat na zaslonu
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

    def dve(self, a, b=""):
        a = transliteriraj(str(a))[:LCD_COLS].ljust(LCD_COLS)
        b = transliteriraj(str(b))[:LCD_COLS].ljust(LCD_COLS)
        if self.lcd is None:
            print("[LCD] %s | %s" % (a.strip(), b.strip()))
            return
        try:
            self.lcd.cursor_pos = (0, 0); self.lcd.write_string(a)
            if LCD_ROWS > 1:
                self.lcd.cursor_pos = (1, 0); self.lcd.write_string(b)
        except Exception:
            pass

    def mirovanje(self, cakajocih=0):
        spodaj = time.strftime("  %H:%M   %d.%m.", time.localtime())
        if cakajocih:
            spodaj = ("v vrsti: %d" % cakajocih).ljust(LCD_COLS)
        self.dve("Prisloni karto", spodaj)


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
        odgovor = posli(o["card_token"], secret, ts=o["ts"], nonce=o["nonce"])
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


def prikazi_odgovor(lcd, o):
    if not isinstance(o, dict):
        lcd.dve("Napaka", "neznan odgovor")
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
    lcd.dve("SmartClean", "  zagon...")
    vrsta = nalozi_vrsto()
    if vrsta:
        izprazni_vrsto(vrsta, secret)

    lcd.mirovanje(len(vrsta))
    prikaz_do = 0
    zadnji_flush = time.time()
    zadnja_minuta = -1

    while True:
        try:
            cs = CardRequest(timeout=1, cardType=AnyCardType()).waitforcard()
        except CardRequestTimeoutException:
            now = time.time()
            if vrsta and (now - zadnji_flush) >= FLUSH_INTERVAL:
                izprazni_vrsto(vrsta, secret)
                zadnji_flush = now
            if now >= prikaz_do and int(now) // 60 != zadnja_minuta:
                lcd.mirovanje(len(vrsta))
                zadnja_minuta = int(now) // 60
            continue
        except Exception:
            time.sleep(0.5)
            continue

        # ── kartica je na bralniku ──
        try:
            cs.connection.connect()
            zeton = sc.preberi_zeton(cs.connection, kljuci)
        except sc.NapakaKartice as e:
            lcd.dve("Kartica?", str(e))
            prikaz_do = time.time() + PRIKAZ
            zadnja_minuta = -1
            time.sleep(PRIKAZ)
            continue
        except NoCardException:
            continue
        except Exception as e:
            lcd.dve("Napaka kartice", type(e).__name__)
            prikaz_do = time.time() + PRIKAZ
            zadnja_minuta = -1
            time.sleep(PRIKAZ)
            continue

        ts = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        nonce = secrets.token_hex(16)

        if vrsta:                      # star zaostanek najprej, da ostane zaporedje pravilno
            izprazni_vrsto(vrsta, secret)

        odgovor = posli(zeton, secret, ts=ts, nonce=nonce)
        if odgovor is None:
            vrsta.append({"card_token": zeton, "ts": ts, "nonce": nonce})
            shrani_vrsto(vrsta)
            lcd.dve("Shranjeno offln.", "poslem kasneje")
        else:
            prikazi_odgovor(lcd, odgovor)

        prikaz_do = time.time() + PRIKAZ
        zadnja_minuta = -1
        zadnji_flush = time.time()
        time.sleep(PRIKAZ)             # da en prislon ne šteje dvakrat


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nKonec.")
