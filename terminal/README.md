# Terminal za štemplanje — Raspberry Pi 5 + HD44780 16×2 (I2C) + RFID kartice

## Kaj imaš in kako deluje

Zaslon je **znakovni LCD (16×2)**, ne zaslon za brskalnik. Zato na Pi-ju ne teče
Chromium, ampak majhna Python skripta:

1. zaposleni prisloni kartico k USB bralniku,
2. skripta pošlje številko kartice v portal (funkcija `terminal_stamp`),
3. portal sam ugotovi, ali je to **prihod** ali **odhod**, zapiše dogodek in vrne ime,
4. LCD izpiše npr. `PRIHOD  07:32` / `Brigita`.

Vse ostalo (pregled »Trenutno prisotni«, ure, popravki, PDF) je že v portalu pod **Prisotnost**.

---

## 1) Priklop LCD na Pi 5

Štiri žice na 40-pinski konektor Pi-ja:

| LCD (I2C backpack) | Pi pin |
|---|---|
| GND | pin 6 |
| SDA | pin 3 (GPIO2) |
| SCL | pin 5 (GPIO3) |
| VCC | pin 2 (5V) |

**Pomembno glede napetosti:** backpack ima pull-up upore na VCC. Če je VCC = 5V, gresta
SDA/SCL na 5V, Pi pa prenese le 3,3V. Možnosti:

- **Najbolje:** vmes daj majhen **I2C level shifter** (VCC backpacka 5V, logika prek shifterja).
- **Brez dodatkov, varno:** VCC na **3,3V (pin 1)**. LCD bo morda malce medel — kontrast
  nastaviš z **modrim potenciometrom** zadaj na backpacku.
- (Direktno 5V na Pi GPIO marsikomu dela leta, a je uradno izven specifikacije.)

---

## 2) Prvi zagon — omogoči I2C in poišči naslov LCD

```bash
sudo raspi-config          # Interface Options → I2C → Enable → reboot
sudo apt update
sudo apt install -y i2c-tools python3-evdev python3-smbus python3-venv
i2cdetect -y 1             # zapomni si naslov, ponavadi 0x27 ali 0x3F
```

Če `i2cdetect` ne pokaže ničesar → preveri žice (SDA/SCL zamenjana je najpogostejša napaka).

---

## 3) Namesti skripto

```bash
mkdir -p ~/terminal
# skopiraj vanj stemplj.py  (iz repozitorija: terminal/stemplj.py)
python3 -m venv --system-site-packages ~/stemplj-venv
~/stemplj-venv/bin/pip install RPLCD smbus2
```

---

## 4) Nastavi skripto

Odpri `~/terminal/stemplj.py` in na vrhu popravi:

- `SUPABASE_KEY` → isti **`sb_publishable_…`** ključ, kot ga uporabljaš v portalu.
- `LCD_ADDR`   → naslov iz koraka 2 (npr. `0x27`).
- `TERMINAL_ID`→ poljubno ime terminala (npr. `pralnica`).

`SUPABASE_URL` je že pravilen.

---

## 5) Poišči bralnik

```bash
~/stemplj-venv/bin/python ~/terminal/stemplj.py --list
```

Večina poceni USB RFID bralnikov se obnaša kot tipkovnica in jih skripta najde sama —
takrat pusti `READER_DEVICE = ""`. Če imaš priklopljeno tudi navadno tipkovnico, v seznamu
poišči vrstico bralnika (npr. `/dev/input/event3  HID 1234:5678`) in jo vpiši v
`READER_DEVICE`.

---

## 6) Zaženi SQL v Supabase (enkrat)

V Supabase SQL editorju zaženi **`41_terminal_stamp.sql`**. Ta ustvari funkcijo
`terminal_stamp`, ki jo kliče terminal. (Varno za ponoven zagon.)

---

## 7) Dodeli kartice zaposlenim (v portalu)

Najlažje: **USB bralnik priklopi v računalnik**, kjer imaš odprt portal.

Portal → **Prisotnost** → pri zaposlenem klikni **Dodeli kartico** → **prisloni kartico**
(številka se vpiše sama v polje) → **Shrani**. Ponovi za vsakega. Nato bralnik prestavi na Pi.

> Če bralnika nimaš pri portalu: prisloni novo kartico na terminalu — LCD pokaže
> `Neznana karta` + njen ID; to številko vpiši v portalu ročno.

---

## 8) Test

```bash
~/stemplj-venv/bin/python ~/terminal/stemplj.py
```

Prisloni dodeljeno kartico → na LCD se izpiše `PRIHOD` + ime; še enkrat → `ODHOD`.
V portalu pod **Prisotnost → Trenutno prisotni** se mora pojaviti isto. Ustavi z `Ctrl+C`.

---

## 9) Samodejni zagon ob prižigu (systemd)

```bash
sudo cp ~/terminal/stemplj.service /etc/systemd/system/stemplj.service
# če tvoj uporabnik ni "pi", popravi poti v datoteki (/home/<user>/…)
sudo systemctl daemon-reload
sudo systemctl enable --now stemplj.service
systemctl status stemplj.service          # mora pisati "active (running)"
journalctl -u stemplj.service -f          # živ dnevnik (za odpravo napak)
```

Odslej se terminal zažene sam ob vsakem vklopu Pi-ja.

---

## Opombe

- **Šumniki:** HD44780 nima č/š/ž — skripta jih samodejno pretvori v c/s/z (npr. »Špela« → »Spela«).
- **Ime predolgo:** LCD ima 16 znakov na vrstico; daljša imena se odrežejo.
- **Kontrast:** če je zaslon prazen a osvetljen, zavrti modri potenciometer zadaj.
- **Varnost:** klic `terminal_stamp` je anonimen, a zmore izključno obračanje prihod/odhod
  za veljavno kartico — kartic ali drugih podatkov ne bere in ne vrača. Za majhno pralnico
  je to primerno; če boš kdaj želel strožje, se da dodati skrivni ključ terminala.
- **En terminal, WiFi:** poskrbi za stabilen WiFi; ob izpadu omrežja LCD pokaže
  `Napaka mreze` in štempljanje takrat ne gre (dogodek se ne izgubi — samo počakaj in ponovi).
