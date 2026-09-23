#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — diagnostika kartice. NIČESAR NE SPREMENI.

Prebere UID, podatke o čipu (GetVersion) in seznam aplikacij. Ne potrebuje
ključev, zato je to prvo, kar poženeš, ko postaviš nov terminal ali ko kaj
ne dela — pove, ali bralnik in kartica sploh govorita.

    ~/stemplj-venv/bin/python preveri_karto.py
"""
import sys
from smartcard.System import readers
from smartcard.CardRequest import CardRequest
from smartcard.CardType import AnyCardType
from smartcard.Exceptions import CardRequestTimeoutException
from smartcard.util import toHexString

# NXP-jeve oznake razlicic strojne opreme. Vmesne vrednosti niso zaporedne —
# EV2 je 0x12 in EV3 je 0x33, ne 0x02 in 0x03.
GENERACIJE = {0x00: "DESFire (D40)", 0x01: "EV1", 0x12: "EV2", 0x33: "EV3"}
POMNILNIK = {0x16: "2 kB", 0x18: "4 kB", 0x1A: "8 kB"}


def h(b):
    return toHexString(list(b))


def main(sekund=60):
    picc = [r for r in readers() if "PICC" in str(r)]
    if not picc:
        print("Brezstičnega bralnika (PICC) ni. Preveri pcscd in USB.")
        return 1
    print("Bralnik:", picc[0])
    print("Prisloni kartico (čakam do %d s) …" % sekund)
    try:
        cs = CardRequest(timeout=sekund, cardType=AnyCardType(), readers=[picc[0]]).waitforcard()
    except CardRequestTimeoutException:
        print("Kartice ni bilo.")
        return 2
    con = cs.connection
    con.connect()
    print("ATR:", h(con.getATR()))

    d, s1, s2 = con.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
    print("UID:", h(d))

    print("\n--- Čip ---")
    d1, s1, s2 = con.transmit([0x90, 0x60, 0x00, 0x00, 0x00])
    if (s1, s2) != (0x91, 0xAF):
        print("GetVersion ni uspel: SW=%02X%02X" % (s1, s2))
        con.disconnect()
        return 3
    d2, _, _ = con.transmit([0x90, 0xAF, 0x00, 0x00, 0x00])
    d3, _, _ = con.transmit([0x90, 0xAF, 0x00, 0x00, 0x00])
    maj = d1[3]
    print("proizvajalec:", "NXP" if d1[0] == 0x04 else hex(d1[0]))
    print("generacija:  ", GENERACIJE.get(maj, "neznana (major=%s)" % hex(maj)))
    print("pomnilnik:   ", POMNILNIK.get(d1[5], hex(d1[5])))
    print("HW/SW:        %d.%d / %d.%d" % (d1[3], d1[4], d2[3], d2[4]))
    if len(d3) >= 14:
        # Teden in leto sta zapisana v BCD: 0x23 pomeni 23, ne 35.
        bcd = lambda b: (b >> 4) * 10 + (b & 0x0F)
        print("izdelana:     teden %d, leto 20%02d" % (bcd(d3[12]), bcd(d3[13])))

    print("\n--- Aplikacije ---")
    d, s1, s2 = con.transmit([0x90, 0x6A, 0x00, 0x00, 0x00])
    if (s1, s2) == (0x91, 0x00):
        if not d:
            print("kartica je prazna")
        for i in range(0, len(d), 3):
            # DESFire vrne AID obrnjeno (little-endian)
            aid = h(d[i:i + 3][::-1]).replace(" ", "")
            print("AID:", aid, "← SmartClean" if aid == "5C0001" else "(tovarniška/tuja)")
    else:
        print("SW=%02X%02X" % (s1, s2))
    con.disconnect()
    return 0


if __name__ == "__main__":
    sys.exit(main(int(sys.argv[1]) if len(sys.argv) > 1 else 60))
