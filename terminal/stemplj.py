#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — terminal za štemplanje (Raspberry Pi + HD44780 16x2 I2C LCD + USB RFID/NFC bralnik)

Bralnik tipa "keyboard wedge" (najpogostejši poceni USB RFID bralnik) ob prislonu
kartice "natipka" njeno številko in pritisne Enter. Ta skripta to prebere, pošlje
v portal (Supabase funkcija terminal_stamp) in na LCD izpiše potrditev.

OFFLINE VRSTA (novo): če ob prislonu ni interneta, se žig NE izgubi — shrani se v
lokalno datoteko (QUEUE_FILE) skupaj s časom prislona in se pošlje takoj, ko je
mreža spet na voljo. Ker se pošlje ČAS PRISLONA (parameter p_ts), so ure pravilne.
Za to je potrebna migracija 49_terminal_offline.sql v Supabase.

Zagon za iskanje bralnika:   python3 stemplj.py --list
Navaden zagon:               python3 stemplj.py
"""

import sys, os, json, time, select, tempfile, urllib.request, urllib.error
from datetime import datetime, timezone

# ─────────────────────────── NASTAVITVE ───────────────────────────
SUPABASE_URL = "https://anrhtgbckxrccnafcmsz.supabase.co"
SUPABASE_KEY = "PASTE_PUBLISHABLE_KEY"     # isti sb_publishable_… ključ kot v portalu
TERMINAL_ID  = "pralnica"                   # ime tega terminala (za evidenco)

LCD_ADDR = 0x27        # naslov iz `i2cdetect -y 1` (pogosto 0x27 ali 0x3F)
LCD_COLS = 16
LCD_ROWS = 2

# Pot do bralnika iz `python3 stemplj.py --list`. Pusti "" za samodejno iskanje.
READER_DEVICE = ""

# Datoteka z offline vrsto (žigi brez mreže). Mora biti na zapisljivem, OBSTOJNEM
# mestu (preživi izpad elektrike). Privzeto poleg te skripte.
QUEUE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stemplj_vrsta.jsonl")
FLUSH_INTERVAL = 20    # sekunde: kako pogosto v mirovanju poskusimo poslati vrsto
# ───────────────────────────────────────────────────────────────────

from evdev import InputDevice, categorize, ecodes, list_devices

# preslikava tipk bralnika → znaki
KEYMAP = {}
for _c in "0123456789":
    KEYMAP[ecodes.ecodes["KEY_" + _c]] = _c
for _c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
    KEYMAP[ecodes.ecodes["KEY_" + _c]] = _c
ENTER = {ecodes.KEY_ENTER, ecodes.KEY_KPENTER}


def transliteriraj(s):
    return (s or "").translate(str.maketrans("čšžćđČŠŽĆĐ", "cszcdCSZCD"))


def najdi_bralnik():
    """Vrne prvo napravo, ki zna tipe digitov in Enter (RFID bralnik/tipkovnica)."""
    for path in list_devices():
        try:
            d = InputDevice(path)
            caps = d.capabilities().get(ecodes.EV_KEY, [])
            if ecodes.KEY_ENTER in caps and ecodes.KEY_1 in caps:
                return d
        except Exception:
            pass
    return None


def izpisi_naprave():
    print("Priklopljene vhodne naprave:")
    for path in list_devices():
        try:
            d = InputDevice(path)
            print("  %-20s  %s" % (path, d.name))
        except Exception:
            pass


class Lcd:
    def __init__(self):
        from RPLCD.i2c import CharLCD
        self.lcd = CharLCD("PCF8574", LCD_ADDR, cols=LCD_COLS, rows=LCD_ROWS,
                           auto_linebreaks=False)
        self.lcd.clear()

    def dve(self, a, b=""):
        a = transliteriraj(str(a))[:LCD_COLS].ljust(LCD_COLS)
        b = transliteriraj(str(b))[:LCD_COLS].ljust(LCD_COLS)
        self.lcd.cursor_pos = (0, 0); self.lcd.write_string(a)
        if LCD_ROWS > 1:
            self.lcd.cursor_pos = (1, 0); self.lcd.write_string(b)

    def ura(self, cakajocih=0):
        t = time.localtime()
        spodaj = time.strftime("  %H:%M   %d.%m.", t)
        if cakajocih:
            # namig, da so neposlani žigi v vrsti (brez mreže)
            spodaj = ("v vrsti: %d" % cakajocih).ljust(LCD_COLS)
        self.dve("Prisloni karto", spodaj)


# ─────────────────────────── OFFLINE VRSTA ───────────────────────────
def nalozi_vrsto():
    """Preberi vrsto iz datoteke (vsaka vrstica = JSON {card, ts})."""
    out = []
    try:
        with open(QUEUE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                    if o.get("card") and o.get("ts"):
                        out.append({"card": str(o["card"]), "ts": str(o["ts"])})
                except Exception:
                    pass
    except FileNotFoundError:
        pass
    except Exception:
        pass
    return out


def shrani_vrsto(vrsta):
    """Atomarno zapiši vrsto (temp + rename + fsync) — varno ob izpadu elektrike."""
    try:
        d = os.path.dirname(QUEUE_FILE) or "."
        fd, tmp = tempfile.mkstemp(dir=d, prefix=".vrsta_", suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                for o in vrsta:
                    f.write(json.dumps({"card": o["card"], "ts": o["ts"]}, ensure_ascii=False) + "\n")
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp, QUEUE_FILE)
        finally:
            if os.path.exists(tmp):
                try: os.remove(tmp)
                except Exception: pass
    except Exception as e:
        print("Napaka pri shranjevanju vrste:", e)


def dodaj_v_vrsto(vrsta, card, ts_iso):
    vrsta.append({"card": card, "ts": ts_iso})
    shrani_vrsto(vrsta)


def poslji(card, ts_iso=None):
    """Pošlji žig v portal. Če je ts_iso podan (offline flush), pošlji čas prislona (p_ts)."""
    url = SUPABASE_URL.rstrip("/") + "/rest/v1/rpc/terminal_stamp"
    payload = {"p_card": card, "p_terminal": TERMINAL_ID}
    if ts_iso:
        payload["p_ts"] = ts_iso
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


def flush_vrsto(vrsta):
    """Poskusi poslati vse žige iz vrste (najstarejši najprej). Vrne (poslanih, se_je_kaj_zgodilo).
    Ob prvi mrežni napaki se ustavi in pusti ostanek v vrsti. Strežnik ima dedup → ponovni poskus je varen."""
    poslano = 0
    while vrsta:
        o = vrsta[0]
        try:
            res = poslji(o["card"], o["ts"])
            # uspeh (tudi 'dup' je uspeh — žig je zabeležen); odstrani iz vrste
            vrsta.pop(0)
            poslano += 1
            shrani_vrsto(vrsta)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError):
            break   # še vedno brez mreže → pusti ostanek, poskusimo kasneje
        except Exception:
            # nepričakovana napaka za ta zapis → odstrani, da ne zablokira vrste za vekomaj
            vrsta.pop(0)
            shrani_vrsto(vrsta)
    return poslano


def prikazi_odgovor(lcd, res):
    if not isinstance(res, dict):
        lcd.dve("Napaka", "neznan odgovor"); return
    if res.get("ok"):
        if res.get("dup"):
            lcd.dve("Ze zabelezeno", res.get("ime", "")); return
        vrsta = "PRIHOD" if res.get("type") == "in" else "ODHOD"
        ura = ""
        try:
            ura = res.get("ts", "")[11:16]
        except Exception:
            pass
        lcd.dve(vrsta + ("  " + ura if ura else ""), res.get("ime", ""))
    else:
        r = res.get("reason")
        if r == "unknown":
            lcd.dve("Neznana karta", "ID " + str(res.get("card", ""))[:13])
        elif r == "inactive":
            lcd.dve("Neaktiven", res.get("ime", ""))
        elif r == "empty":
            lcd.dve("Prazna karta", "poskusi znova")
        else:
            lcd.dve("Napaka", str(r))


def main():
    if "--list" in sys.argv:
        izpisi_naprave(); return

    lcd = Lcd()
    lcd.dve("SmartClean", "  zagon...")
    time.sleep(1)

    # naloži morebitne neposlane žige in jih poskusi takoj poslati
    vrsta = nalozi_vrsto()
    if vrsta:
        flush_vrsto(vrsta)

    dev = InputDevice(READER_DEVICE) if READER_DEVICE else najdi_bralnik()
    if dev is None:
        lcd.dve("Ni bralnika", "preveri USB")
        print("Bralnika ne najdem. Zaženi:  python3 stemplj.py --list")
        return
    print("Berem z:", dev.path, dev.name)
    try:
        dev.grab()   # da se koda kartice ne izpiše nikamor drugam
    except Exception:
        pass

    buf = ""
    lcd.ura(len(vrsta))
    zadnja_ura = 0
    prikaz_do = 0          # do kdaj naj ostane rezultat na zaslonu
    zadnji_flush = 0       # kdaj smo nazadnje poskusili poslati vrsto

    while True:
        r, _, _ = select.select([dev.fd], [], [], 1.0)
        now = time.time()

        if r:
            for event in dev.read():
                if event.type != ecodes.EV_KEY or event.value != 1:
                    continue
                code = event.code
                if code in ENTER:
                    card = buf.strip(); buf = ""
                    if not card:
                        continue
                    ts_iso = datetime.now(timezone.utc).isoformat()
                    lcd.dve("Obdelujem...", card[:16])
                    # najprej poskusi izprazniti morebitno staro vrsto (da ostane zaporedje pravilno)
                    if vrsta:
                        flush_vrsto(vrsta)
                    try:
                        res = poslji(card)                 # spletno: strežnik uporabi svoj čas (now())
                        prikazi_odgovor(lcd, res)
                    except (urllib.error.URLError, urllib.error.HTTPError, OSError):
                        # BREZ MREŽE → žig shranimo lokalno s časom prislona (ne izgubi se!)
                        dodaj_v_vrsto(vrsta, card, ts_iso)
                        lcd.dve("Shranjeno offln.", "poslem kasneje")
                    except Exception as e:
                        lcd.dve("Napaka", str(e)[:16])
                    prikaz_do = time.time() + 4.0
                    zadnji_flush = time.time()
                elif code in KEYMAP:
                    buf += KEYMAP[code]
                    if len(buf) > 64:
                        buf = buf[-64:]
        else:
            # v mirovanju: periodično poskusi poslati vrsto (če se je mreža vrnila)
            if vrsta and (now - zadnji_flush) >= FLUSH_INTERVAL:
                flush_vrsto(vrsta)
                zadnji_flush = now
            # če je rezultat potekel, spet kaži uro (osveži enkrat/min ali ob spremembi vrste)
            if now >= prikaz_do:
                if int(now) // 60 != zadnja_ura:
                    lcd.ura(len(vrsta)); zadnja_ura = int(now) // 60


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
