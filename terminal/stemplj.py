#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — terminal za štemplanje (Raspberry Pi + HD44780 16x2 I2C LCD + USB RFID/NFC bralnik)

Bralnik tipa "keyboard wedge" (najpogostejši poceni USB RFID bralnik) ob prislonu
kartice "natipka" njeno številko in pritisne Enter. Ta skripta to prebere, pošlje
v portal (Supabase funkcija terminal_stamp) in na LCD izpiše potrditev.

Zagon za iskanje bralnika:   python3 stemplj.py --list
Navaden zagon:               python3 stemplj.py
"""

import sys, os, json, time, select, urllib.request, urllib.error

# ─────────────────────────── NASTAVITVE ───────────────────────────
SUPABASE_URL = "https://anrhtgbckxrccnafcmsz.supabase.co"
SUPABASE_KEY = "PASTE_PUBLISHABLE_KEY"     # isti sb_publishable_… ključ kot v portalu
TERMINAL_ID  = "pralnica"                   # ime tega terminala (za evidenco)

LCD_ADDR = 0x27        # naslov iz `i2cdetect -y 1` (pogosto 0x27 ali 0x3F)
LCD_COLS = 16
LCD_ROWS = 2

# Pot do bralnika iz `python3 stemplj.py --list`. Pusti "" za samodejno iskanje.
READER_DEVICE = ""
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

    def ura(self):
        t = time.localtime()
        self.dve("Prisloni karto", time.strftime("  %H:%M   %d.%m.", t))


def poslji(card):
    url = SUPABASE_URL.rstrip("/") + "/rest/v1/rpc/terminal_stamp"
    body = json.dumps({"p_card": card, "p_terminal": TERMINAL_ID}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode("utf-8"))


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
    lcd.ura()
    zadnja_ura = 0
    prikaz_do = 0     # do kdaj naj ostane rezultat na zaslonu

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
                    lcd.dve("Obdelujem...", card[:16])
                    try:
                        res = poslji(card)
                        prikazi_odgovor(lcd, res)
                    except (urllib.error.URLError, urllib.error.HTTPError, OSError):
                        lcd.dve("Napaka mreze", "poskusi znova")
                    except Exception as e:
                        lcd.dve("Napaka", str(e)[:16])
                    prikaz_do = time.time() + 4.0
                elif code in KEYMAP:
                    buf += KEYMAP[code]
                    if len(buf) > 64:
                        buf = buf[-64:]
        else:
            # v mirovanju: če je rezultat potekel, spet kaži uro (osveži enkrat/min)
            if now >= prikaz_do:
                if int(now) // 60 != zadnja_ura:
                    lcd.ura(); zadnja_ura = int(now) // 60


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
