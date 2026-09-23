#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — vpis več kartic zapored. Teče na RAČUNALNIKU z bralnikom
(ne na Raspberry Pi), ker potrebuje ključ app_master.

    ~/sc-kartice-venv/bin/python vpisi_vec.py

Za vsako kartico:
  1. vpišeš ime z nalepke,
  2. prisloniš kartico,
  3. žeton gre v odložišče (nikjer se ne izpiše),
  4. v portalu: Prisotnost → pri tej osebi »Dodeli kartico« → ⌘V → Shrani.

Prazno ime + Enter konča.

Varovalke:
  - Po prvi kartici čaka samo na NOVO prisloljeno kartico. Če kartico pustiš
    na bralniku in vpišeš naslednje ime, je ne bo prepisal pod napačnim imenom.
  - Če je kartica že vpisana (bere se z našim ključem), vpraša, preden jo
    vpiše znova — sicer bi tiho razveljavil žeton, ki je že v portalu.
  - V vpisane_kartice.csv zapiše ime, UID in čas — NE žetona. Po UID-u
    pozneje najdeš, čigava je fizična kartica. Datoteka ni v repozitoriju.
"""

import csv
import datetime
import os
import subprocess
import sys

from smartcard.CardRequest import CardRequest
from smartcard.CardType import AnyCardType
from smartcard.Exceptions import CardRequestTimeoutException

import sc_kartica as sc

DNEVNIK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vpisane_kartice.csv")


def v_odlozisce(besedilo: str) -> None:
    subprocess.run(["pbcopy"], input=besedilo.encode(), check=True)


def zapisi_v_dnevnik(ime: str, uid: str) -> None:
    nova = not os.path.exists(DNEVNIK)
    with open(DNEVNIK, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if nova:
            w.writerow(["cas", "ime", "uid"])
        w.writerow([datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), ime, uid])
    os.chmod(DNEVNIK, 0o600)


def ze_nasa(connection, kljuci) -> bool:
    """Ali se kartica prebere z našim bralnim ključem — torej je že vpisana."""
    try:
        sc.preberi_zeton(connection, kljuci)
        return True
    except Exception:
        return False


def main() -> None:
    try:
        kljuci = sc.nalozi_kljuce(zahtevaj_app_master=True)
    except sc.NapakaKartice as e:
        print("Napaka: %s" % e)
        sys.exit(1)

    print("Vpis kartic. Prazno ime + Enter konča.\n")
    vpisani = []
    prva = True

    while True:
        ime = input("Ime z nalepke: ").strip()
        if not ime:
            break

        if prva:
            print("Prisloni kartico …")
        else:
            print("Prisloni NOVO kartico (prejšnjo dvigni z bralnika) …")
        try:
            cs = CardRequest(timeout=90, cardType=AnyCardType(), newcardonly=not prva).waitforcard()
        except CardRequestTimeoutException:
            print("  Kartice ni bilo — preskočeno.\n")
            continue
        prva = False

        con = cs.connection   # cs mora ostati živ — njegov __del__ prekine povezavo
        try:
            con.connect()
            uid = sc.to_hex_string(sc.uid_iz_bralnika(con)).replace(" ", "")

            if ze_nasa(con, kljuci):
                odg = input("  Ta kartica (UID %s) je ŽE vpisana. Vpišem jo na novo za %s?\n"
                            "  Njen dosedanji žeton bo prenehal delovati. [d/N] " % (uid, ime))
                if odg.strip().lower() not in ("d", "da", "y", "yes"):
                    print("  Preskočeno.\n")
                    continue

            zeton = sc.vpisi_karto(con, kljuci, ponovno=True)
        except sc.NapakaKartice as e:
            print("  Napaka: %s\n" % e)
            continue
        except Exception as e:  # noqa: BLE001 — zanka naj teče naprej
            print("  Nepričakovana napaka: %s: %s\n" % (type(e).__name__, e))
            continue
        finally:
            try:
                con.disconnect()
            except Exception:
                pass

        v_odlozisce(zeton)
        zapisi_v_dnevnik(ime, uid)
        vpisani.append(ime)
        print("  ✓ Kartica za %s je vpisana. Žeton je v odložišču." % ime)
        print("    Portal → Prisotnost → %s → Dodeli kartico → ⌘V → Shrani" % ime)
        input("    Ko shraniš v portalu, pritisni Enter za naslednjo … ")
        print()

    if vpisani:
        print("\nVpisanih v tej seji: %d" % len(vpisani))
        for i in vpisani:
            print("  -", i)
        print("\nDnevnik (ime, UID, čas): %s" % DNEVNIK)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nPrekinjeno.")
