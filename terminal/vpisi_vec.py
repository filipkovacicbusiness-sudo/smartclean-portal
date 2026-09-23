#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — vpis več kartic zapored. Teče na RAČUNALNIKU z bralnikom
(ne na Raspberry Pi), ker potrebuje ključ app_master.

    ~/sc-kartice-venv/bin/python vpisi_vec.py

Ob zagonu se prijaviš z istim računom kot v portal. Geslo vpišeš v terminal;
gre naravnost v Supabase, nikjer se ne izpiše in se ne shrani.

Nato za vsako kartico:
  1. izbereš zaposlenega s seznama iz portala (številka),
  2. prisloniš kartico,
  3. skripta kartico vpiše IN žeton sama zapiše k zaposlenemu.

Žeton se nikjer ne izpiše. Prazen vnos + Enter konča.

Varovalke:
  - Po prvi kartici čaka samo na NOVO prisloljeno kartico. Kartica, ki je
    ostala na bralniku, ne dobi žetona naslednje osebe.
  - Če je kartica že vpisana ali ima zaposleni že kartico, vpraša — oboje bi
    tiho razveljavilo kartico, ki že dela.
  - Zapis v bazo se preveri: če se vrstica ne vrne, je to napaka, ne »uspeh«.
  - V vpisane_kartice.csv gre ime, UID in čas — NE žetona. Ni v repozitoriju.
"""

import csv
import datetime
import getpass
import json
import logging
import os
import sys
import urllib.error
import urllib.request

from smartcard.CardRequest import CardRequest
from smartcard.CardType import AnyCardType
from smartcard.Exceptions import CardRequestTimeoutException

import sc_kartica as sc

# Enako kot v stemplj.py. Ključ je javni (publishable) — sme biti tu.
SUPABASE_URL = "https://anrhtgbckxrccnafcmsz.supabase.co"
SUPABASE_KEY = "sb_publishable_LYMbUOYW2IFz4NxgvjXLOg_PJ2-qpS4"
PRIVZETI_EMAIL = "filip@eflitte.si"

DNEVNIK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vpisane_kartice.csv")

# Knjižnica vsak odgovor kartice z napako izpiše na zaslon — tudi pričakovane,
# npr. ST_AppNotFound, ko preverimo, ali je sveža kartica že naša. To je med
# vpisom samo zavajalo. Prave napake javi skripta sama.
logging.getLogger("desfire").setLevel(logging.CRITICAL)


class NapakaPortala(Exception):
    pass


def _zahteva(metoda, pot, telo=None, zeton=None, glave=None):
    h = {"apikey": SUPABASE_KEY, "Content-Type": "application/json"}
    if zeton:
        h["Authorization"] = "Bearer " + zeton
    if glave:
        h.update(glave)
    podatki = json.dumps(telo).encode() if telo is not None else None
    req = urllib.request.Request(SUPABASE_URL + pot, data=podatki, headers=h, method=metoda)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            vsebina = r.read().decode() or "null"
            return json.loads(vsebina)
    except urllib.error.HTTPError as e:
        try:
            sporocilo = json.loads(e.read().decode())
            sporocilo = sporocilo.get("msg") or sporocilo.get("message") or sporocilo.get("error_description") or str(sporocilo)
        except Exception:
            sporocilo = "HTTP %d" % e.code
        raise NapakaPortala(sporocilo)
    except urllib.error.URLError as e:
        raise NapakaPortala("ni povezave: %s" % e.reason)


def prijava():
    email = input("E-pošta za portal [%s]: " % PRIVZETI_EMAIL).strip() or PRIVZETI_EMAIL
    geslo = getpass.getpass("Geslo (se ne izpisuje): ")
    try:
        odg = _zahteva("POST", "/auth/v1/token?grant_type=password", {"email": email, "password": geslo})
    finally:
        del geslo
    zeton = (odg or {}).get("access_token")
    if not zeton:
        raise NapakaPortala("prijava ni uspela")
    return zeton


def zaposleni(zeton):
    # list_employees vrne samo, ali kartica obstaja — žetoni ne zapustijo baze.
    # Za neosebje vrne prazen seznam (migracija 52).
    return _zahteva("POST", "/rest/v1/rpc/list_employees", {}, zeton) or []


def zapisi_zeton(zeton_seje, emp_id, card_token):
    vrstice = _zahteva(
        "PATCH", "/rest/v1/employees?id=eq.%s&select=id,ime" % emp_id,
        {"card_token": card_token}, zeton_seje, {"Prefer": "return=representation"},
    )
    # RLS vrstico, ki je ne smeš spreminjati, SKRIJE — popravek ne javi napake,
    # le popravi nič. Zato je prazen odgovor napaka.
    if not vrstice:
        raise NapakaPortala("zapis ni zadel nobene vrstice — za ta račun ni pravic")
    return vrstice[0]["ime"]


def zapisi_v_dnevnik(ime, uid):
    nova = not os.path.exists(DNEVNIK)
    with open(DNEVNIK, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if nova:
            w.writerow(["cas", "ime", "uid"])
        w.writerow([datetime.datetime.now().strftime("%Y-%m-%d %H:%M"), ime, uid])
    os.chmod(DNEVNIK, 0o600)


def ze_nasa(connection, kljuci):
    try:
        sc.preberi_zeton(connection, kljuci)
        return True
    except Exception:
        return False


def pokazi_seznam(ljudje):
    print()
    for i, z in enumerate(ljudje, 1):
        oznaka = "  ✓ ima kartico" if z.get("ima_karto") else ""
        print("  %2d  %s%s" % (i, z["ime"], oznaka))
    print()


def main():
    try:
        kljuci = sc.nalozi_kljuce(zahtevaj_app_master=True)
    except sc.NapakaKartice as e:
        print("Napaka: %s" % e)
        sys.exit(1)

    try:
        seja = prijava()
        ljudje = [z for z in zaposleni(seja) if z.get("aktiven", True)]
    except NapakaPortala as e:
        print("Portal: %s" % e)
        sys.exit(1)
    if not ljudje:
        print("Seznam zaposlenih je prazen — račun najbrž nima pravic osebja.")
        sys.exit(1)

    vpisani = []
    prva = True
    while True:
        pokazi_seznam(ljudje)
        izbira = input("Številka zaposlenega (prazno = konec): ").strip()
        if not izbira:
            break
        if not izbira.isdigit() or not (1 <= int(izbira) <= len(ljudje)):
            print("  Ni take številke.")
            continue
        z = ljudje[int(izbira) - 1]

        if z.get("ima_karto"):
            odg = input("  %s že ima kartico. Nova jo bo razveljavila. Nadaljujem? [d/N] " % z["ime"])
            if odg.strip().lower() not in ("d", "da"):
                continue

        print("  Prisloni kartico za %s%s …" % (z["ime"], "" if prva else " (prejšnjo dvigni z bralnika)"))
        try:
            cs = CardRequest(timeout=90, cardType=AnyCardType(), newcardonly=not prva).waitforcard()
        except CardRequestTimeoutException:
            print("  Kartice ni bilo — preskočeno.")
            continue
        prva = False

        con = cs.connection   # cs mora ostati živ — njegov __del__ prekine povezavo
        try:
            con.connect()
            uid = sc.to_hex_string(sc.uid_iz_bralnika(con)).replace(" ", "")
            if ze_nasa(con, kljuci):
                odg = input("  Ta kartica (UID %s) je že vpisana — morda od nekoga drugega.\n"
                            "  Vpišem jo na novo za %s? [d/N] " % (uid, z["ime"]))
                if odg.strip().lower() not in ("d", "da"):
                    print("  Preskočeno.")
                    continue
            card_token = sc.vpisi_karto(con, kljuci, ponovno=True)
        except sc.NapakaKartice as e:
            print("  Kartica: %s" % e)
            continue
        except Exception as e:  # noqa: BLE001
            print("  Nepričakovana napaka: %s: %s" % (type(e).__name__, e))
            continue
        finally:
            try:
                con.disconnect()
            except Exception:
                pass

        try:
            ime = zapisi_zeton(seja, z["id"], card_token)
        except NapakaPortala as e:
            print("  ✗ Kartica je vpisana, žeton pa NI shranjen v portal: %s" % e)
            print("    Kartico prisloni znova za isto osebo.")
            continue
        finally:
            del card_token

        z["ima_karto"] = True
        zapisi_v_dnevnik(ime, uid)
        vpisani.append(ime)
        print("  ✓ %s — kartica vpisana in shranjena v portal." % ime)

    if vpisani:
        print("\nVpisanih v tej seji: %d" % len(vpisani))
        for i in vpisani:
            print("  -", i)
        print("Dnevnik (ime, UID, čas): %s" % DNEVNIK)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nPrekinjeno.")
