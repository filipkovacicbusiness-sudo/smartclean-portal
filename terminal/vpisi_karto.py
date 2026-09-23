#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — vpis kartice DESFire EV3 za zaposlenega.

Ta program teče na TVOJEM RAČUNALNIKU (ne na Raspberry Pi), ker potrebuje
ključ app_master. Na Pi-ju naj bo v kljuci.json samo "read".

UPORABA
    python3 vpisi_karto.py --nov-kljucnik     # enkrat, na začetku
    python3 vpisi_karto.py                    # prisloni kartico → izpiše žeton
    python3 vpisi_karto.py --ponovno          # kartica je že naša, vpiši na novo
    python3 vpisi_karto.py --pocisti          # pobriši SmartClean s kartice
    python3 vpisi_karto.py --preberi          # samo preveri, kaj je na kartici

Program žetona NE vpisuje v bazo sam — izpiše SQL, ki ga prilepiš v
Supabase → SQL Editor. Tako ti ni treba nikamor vnašati gesla.
"""

import argparse
import json
import os
import sys

from smartcard.CardRequest import CardRequest
from smartcard.CardType import AnyCardType
from smartcard.Exceptions import CardRequestTimeoutException

import sc_kartica as sc


def cakaj_na_karto(sekund: int = 30):
    """
    Počaka na kartico in vrne CardService — NE gole povezave.

    CardService ima __del__, ki povezavo prekine. Če bi vrnili samo
    cs.connection, bi cs ob vrnitvi iz funkcije šel v smeti in že prvi naslednji
    ukaz bi padel s »Card not connected«. Klicatelj naj cs drži do konca.
    """
    print("Prisloni kartico na bralnik …")
    try:
        cs = CardRequest(timeout=sekund, cardType=AnyCardType()).waitforcard()
    except CardRequestTimeoutException:
        print("Kartice ni bilo. Konec.")
        sys.exit(1)
    cs.connection.connect()
    return cs


def main() -> None:
    p = argparse.ArgumentParser(description="Vpis kartice DESFire EV3 za SmartClean")
    p.add_argument("--nov-kljucnik", action="store_true", help="ustvari kljuci.json z novima ključema")
    p.add_argument("--ponovno", action="store_true", help="kartica je že naša — vpiši jo na novo")
    p.add_argument("--pocisti", action="store_true", help="pobriši aplikacijo SmartClean s kartice")
    p.add_argument("--preberi", action="store_true", help="samo preberi žeton, ničesar ne spremeni")
    p.add_argument("--ime", help="ime zaposlenega (samo za izpis SQL)")
    a = p.parse_args()

    # ── nov ključnik ──────────────────────────────────────────────────
    if a.nov_kljucnik:
        if os.path.exists(sc.KLJUCI_POT):
            print("kljuci.json že obstaja. NE prepisujem — s tem bi razveljavil vse vpisane kartice.")
            sys.exit(1)
        k = sc.nov_kljucnik()
        with open(sc.KLJUCI_POT, "w", encoding="utf-8") as f:
            json.dump(k, f, indent=2)
        os.chmod(sc.KLJUCI_POT, 0o600)
        print("Ustvarjeno: %s\n" % sc.KLJUCI_POT)
        print("  app_master : %s" % k["app_master"])
        print("  read       : %s\n" % k["read"])
        print("SHRANI OBA KLJUČA NA VARNO (upravitelj gesel).")
        print("Brez njiju kartic ni mogoče niti brati niti vpisovati znova.")
        print("Na Raspberry Pi prenesi kljuci.json, v katerem je SAMO \"read\".")
        return

    try:
        kljuci = sc.nalozi_kljuce(zahtevaj_app_master=not (a.preberi or a.pocisti))
    except sc.NapakaKartice as e:
        print("Napaka: %s" % e)
        sys.exit(1)

    cs = cakaj_na_karto()
    con = cs.connection   # cs mora ostati živ do konca — glej cakaj_na_karto
    try:
        if a.pocisti:
            sc.pocisti_karto(con)
            print("Kartica počiščena. Zdaj jo lahko vpišeš na novo.")
            return

        if a.preberi:
            zeton = sc.preberi_zeton(con, kljuci)
            print("Žeton: %s" % zeton)
            return

        zeton = sc.vpisi_karto(con, kljuci, ponovno=a.ponovno)
    except sc.NapakaKartice as e:
        print("\nNapaka: %s" % e)
        sys.exit(1)
    except Exception as e:  # noqa: BLE001 — na koncu hočemo razumljivo sporočilo
        print("\nNepričakovana napaka: %s: %s" % (type(e).__name__, e))
        print("Če je kartica že bila vpisana, poskusi z --ponovno.")
        sys.exit(1)

    ime = a.ime or "<ime zaposlenega>"
    print("\nKartica je vpisana.\n")
    print("  žeton: %s\n" % zeton)
    print("Poveži jo z zaposlenim — prilepi v Supabase → SQL Editor:\n")
    print("    update public.employees")
    print("       set card_token = '%s'" % zeton)
    print("     where ime = '%s';" % ime)
    print("\n(ali v portalu, ko bo vpis kartic dodan v razdelek Prisotnost)")


if __name__ == "__main__":
    main()
