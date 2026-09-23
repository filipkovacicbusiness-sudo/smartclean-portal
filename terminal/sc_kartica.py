#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SmartClean — sloj za kartico MIFARE DESFire EV3 (ACR1252U, PC/SC).

ZAKAJ TAKO
----------
Kartica ne nosi nobene skrivnosti, ki bi jo bilo mogoče prebrati brez ključa.
Žeton (card_token) leži v datoteki, ki je berljiva šele po AES-128 medsebojni
overitvi. Kdor kartico le "prisloni in posluša", ne dobi ničesar uporabnega —
zato klon ne deluje, tudi če nekdo prebere UID s telefonom.

Vsaka kartica ima SVOJ ključ, izpeljan po NXP AN10922 iz osnovnega ključa in
UID kartice. Če nekdo razbije eno kartico, ostale niso ogrožene.

RAZPOREDITEV NA KARTICI
-----------------------
    aplikacija APP_ID
      ključ 0  = glavni ključ aplikacije (izpeljan iz APP_MASTER)
      ključ 1  = bralni ključ            (izpeljan iz READ)
      datoteka FILE_ID  16 B, ENCRYPTED, branje s ključem 1, pisanje s ključem 0
                        vsebina = 16 naključnih bajtov = card_token

KJE SO KLJUČI
-------------
    kljuci.json      {"app_master": "<32 hex>", "read": "<32 hex>"}

    Na RASPBERRY PI naj bo SAMO "read" — terminal več ne potrebuje.
    "app_master" hrani na svojem računalniku, kjer vpisuješ kartice.
    Tako tat Pi-ja ne dobi ključa, s katerim bi kartice prepisoval.

GLAVNI KLJUČ KARTICE (PICC master) NAMENOMA PUSTIMO PRIVZET
-----------------------------------------------------------
Tako je kartico vedno mogoče formatirati in vpisati znova. Če bi ga zamenjali
in ključ izgubili, bi bila kartica trajno neuporabna — DESFire nima obnovitve.
Cena te odločitve: nekdo lahko kartico formatira (torej pokvari), ne more pa
se izdajati za zaposlenega, ker žetona brez bralnega ključa ne dobi.
"""

import json
import os
import secrets

from desfire import DESFire, DESFireKey, PCSCDevice, diversify_key, get_list, to_hex_string
from desfire.enums import (
    DESFireCommunicationMode,
    DESFireFileType,
    DESFireKeySettings,
    DESFireKeyType,
)
from desfire.schemas import FilePermissions, FileSettings, KeySettings

# ─────────────────────────── NASTAVITVE ───────────────────────────
APP_ID = "5C0001"        # 3 bajti — aplikacija SmartClean
SYS_ID = "5C4C41"        # 3 bajti — sistemska oznaka za izpeljavo ključev
FILE_ID = 0x01           # datoteka z žetonom
TOKEN_BYTES = 16         # dolžina žetona
KEY_APP_MASTER = 0x00    # ključ 0 v aplikaciji
KEY_READ = 0x01          # ključ 1 v aplikaciji

KLJUCI_POT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kljuci.json")
# ───────────────────────────────────────────────────────────────────


class NapakaKartice(Exception):
    """Karkoli je šlo narobe s kartico — sporočilo je v slovenščini."""


def nalozi_kljuce(zahtevaj_app_master: bool = False) -> dict:
    """Prebere kljuci.json. Terminal rabi le 'read', vpisovanje tudi 'app_master'."""
    if not os.path.exists(KLJUCI_POT):
        raise NapakaKartice(
            "Ni datoteke s ključi (%s). Ustvari jo z:  python3 vpisi_karto.py --nov-kljucnik"
            % KLJUCI_POT
        )
    # Ključi ne smejo biti berljivi za vse.
    nacin = os.stat(KLJUCI_POT).st_mode & 0o077
    if nacin:
        raise NapakaKartice(
            "kljuci.json je berljiv za druge uporabnike. Popravi s:  chmod 600 %s" % KLJUCI_POT
        )
    with open(KLJUCI_POT, encoding="utf-8") as f:
        k = json.load(f)
    if "read" not in k:
        raise NapakaKartice("V kljuci.json manjka 'read'.")
    if zahtevaj_app_master and "app_master" not in k:
        raise NapakaKartice(
            "V kljuci.json manjka 'app_master'. Ta ključ je namenoma samo na "
            "računalniku, kjer vpisuješ kartice, ne na Raspberry Pi."
        )
    return k


def uid_iz_bralnika(connection) -> list[int]:
    """
    UID prebere BRALNIK (APDU FF CA 00 00 00), ne kartica.

    Ukaz GetCardUID na kartici zahteva overitev, ključ za overitev pa je izpeljan
    iz UID — zato bi se pes lovil za rep. UID iz protokola proti trkom je za
    izpeljavo dovolj: sam po sebi ni skrivnost in ga ščiti šele AES overitev.

    POZOR: kartica ne sme imeti vklopljenega naključnega UID (Random ID). Na
    EV3 je privzeto izklopljen; mi ga ne vklapljamo.
    """
    data, sw1, sw2 = connection.transmit([0xFF, 0xCA, 0x00, 0x00, 0x00])
    if (sw1, sw2) != (0x90, 0x00) or not data:
        raise NapakaKartice("UID kartice ni bilo mogoče prebrati (bralnik je vrnil %02X%02X)." % (sw1, sw2))
    return list(data)


def _aes(key_bytes) -> DESFireKey:
    """
    Nov objekt ključa za VSAKO overitev.

    Knjižnica med overitvijo v objekt zapiše sejne podatke in s tem prepiše
    ključ, zato ponovna uporaba istega objekta tiho odpove (tako je tudi v
    uradnem primeru personalize.py).
    """
    return DESFireKey(KeySettings(key_type=DESFireKeyType.DF_KEY_AES), key_bytes)


def izpeljan_kljuc(osnovni_hex: str, uid: list[int]) -> list[int]:
    """Ključ te kartice po NXP AN10922: AES-CMAC(osnovni, 0x01 || UID || AID || SysID)."""
    podatki = [0x01] + uid + get_list(APP_ID) + get_list(SYS_ID)
    return diversify_key(get_list(osnovni_hex), podatki, pad_to_32=False)


class OvitBralnik(PCSCDevice):
    """
    PC/SC naprava, ki ukaze ovije v ISO 7816-4.

    Knjižnica pošilja SUROVE DESFire ukaze (npr. [0x45]) in računa, da jih
    naprava posreduje takšne, kakršni so. ACR1252 — in PC/SC na macOS sploh —
    to zavrne z »Invalid parameter given«, ker enobajtni okvir ni veljaven APDU.
    Kartice, ki dela brez ovoja, na tem bralniku ni.

    Preslikava je določena:
        brez podatkov  [CMD]            →  90 CMD 00 00 00
        s podatki      [CMD, podatki…]  →  90 CMD 00 00 Lc <podatki> 00
        odgovor        <podatki…> 91 ST →  [ST, podatki…]

    Pri ukazu brez podatkov se Lc NE pošlje — zadnji bajt je Le. Če pošlješ
    »90 45 00 00 00 00«, bralnik odgovori s »Transaction failed«.

    Drugo obliko knjižnica pričakuje v _communicate(): resp[0] je status,
    ostalo so podatki, in 0xAF pomeni »še sledi«.
    """

    def transceive(self, bytes: list[int]) -> list[int]:
        ukaz = list(bytes)
        cmd, podatki = ukaz[0], ukaz[1:]
        if len(podatki) > 255:
            raise NapakaKartice("Ukaz je predolg za en okvir APDU (%d bajtov)." % len(podatki))
        if podatki:
            apdu = [0x90, cmd, 0x00, 0x00, len(podatki)] + podatki + [0x00]
        else:
            apdu = [0x90, cmd, 0x00, 0x00, 0x00]
        odgovor = super().transceive(apdu)
        if len(odgovor) < 2 or odgovor[-2] != 0x91:
            raise NapakaKartice(
                "Bralnik je vrnil nepričakovan odgovor: %s" % to_hex_string(list(odgovor))
            )
        return [odgovor[-1]] + list(odgovor[:-2])


def poveži(connection) -> DESFire:
    """Ovije PC/SC povezavo v objekt DESFire (z ovojem ISO 7816)."""
    return DESFire(OvitBralnik(connection.component))


# ══════════════════════════ BRANJE (terminal) ══════════════════════════
def preberi_zeton(connection, kljuci: dict) -> str:
    """
    Prisloljena kartica → card_token kot hex niz.

    Vrne žeton samo, če se kartica uspešno overi z BRALNIM ključem te kartice.
    Klon z enakim UID, a brez ključa, tu odpove.
    """
    uid = uid_iz_bralnika(connection)
    d = poveži(connection)
    try:
        d.select_application(APP_ID)
    except Exception:
        raise NapakaKartice("To ni SmartClean kartica (aplikacije ni).")

    try:
        d.authenticate(KEY_READ, _aes(izpeljan_kljuc(kljuci["read"], uid)))
    except Exception:
        raise NapakaKartice("Kartica se ni overila — ponarejena ali ni naša.")

    try:
        nastavitve = d.get_file_settings(FILE_ID)
        podatki = d.read_file_data(FILE_ID, nastavitve)
    except Exception:
        raise NapakaKartice("Žetona na kartici ni bilo mogoče prebrati.")

    return to_hex_string(list(podatki)[:TOKEN_BYTES]).replace(" ", "").upper()


# ══════════════════════════ VPIS (računalnik) ══════════════════════════
def vpisi_karto(connection, kljuci: dict, ponovno: bool = False) -> str:
    """
    Pripravi novo kartico in vrne njen žeton (hex).

    Koraki sledijo uradnemu primeru personalize.py:
      1. overitev na kartici s privzetim DES ključem
      2. privzeti ključ za nove aplikacije nastavimo na AES nič
      3. ustvarimo aplikacijo z dvema ključema
      4. ključ 0 → izpeljan iz app_master, ključ 1 → izpeljan iz read
      5. šifrirana datoteka s 16 naključnimi bajti (žeton)

    Glavnega ključa kartice NE spreminjamo — glej opombo na vrhu datoteke.
    """
    uid = uid_iz_bralnika(connection)
    d = poveži(connection)

    # 1) glavni ključ kartice je tovarniško DES 00…00
    try:
        d.select_application("000000")
        d.authenticate(0x00, DESFireKey(d.get_key_setting(), "00" * 8))
    except Exception:
        raise NapakaKartice(
            "Overitev s tovarniškim ključem ni uspela. Kartica je najbrž že "
            "spremenjena — če je naša, jo najprej počisti z --pocisti."
        )

    if ponovno:
        # Brišemo SAMO, če aplikacija obstaja. Pri DESFire vsak ukaz, ki vrne
        # napako, razveljavi overitev — neuspel delete (ST_AppNotFound) bi
        # pustil kartico neoverjeno in že naslednji ukaz bi padel s
        # ST_AuthentError. GetApplicationIDs napake ne vrne.
        if get_list(APP_ID) in [list(a) for a in d.get_application_ids()]:
            d.delete_application(APP_ID)

    nic = _aes("00" * 16)
    d.change_default_key(nic, 0x00)

    d.create_application(
        APP_ID,
        KeySettings(
            settings=[
                DESFireKeySettings.KS_ALLOW_CHANGE_MK,
                # Brez te zastavice GetFileSettings in GetFileIDs zahtevata ključ 0
                # (app master). Terminal ima samo bralni ključ, zato bi branje
                # žetona odpovedalo ob vsakem prislonu s »ST_AuthentError«.
                # Metapodatki (velikost, način šifriranja) niso skrivnost —
                # vsebina datoteke ostane zaščitena z bralnim ključem in šifrirana.
                DESFireKeySettings.KS_LISTING_WITHOUT_MK,
                DESFireKeySettings.KS_CONFIGURATION_CHANGEABLE,
            ],
            key_type=DESFireKeyType.DF_KEY_AES,
        ),
        2,  # ključa 0 in 1
    )

    d.select_application(APP_ID)
    d.authenticate(KEY_APP_MASTER, _aes("00" * 16))

    app_mk = izpeljan_kljuc(kljuci["app_master"], uid)
    d.change_key(KEY_APP_MASTER, _aes("00" * 16), _aes(app_mk), 0x01)
    d.authenticate(KEY_APP_MASTER, _aes(app_mk))

    bralni = izpeljan_kljuc(kljuci["read"], uid)
    d.change_key(KEY_READ, _aes("00" * 16), _aes(bralni), 0x01)

    zeton = list(secrets.token_bytes(TOKEN_BYTES))
    d.create_standard_file(
        FILE_ID,
        FileSettings(
            file_size=TOKEN_BYTES,
            encryption=DESFireCommunicationMode.ENCRYPTED,
            permissions=FilePermissions(read_key=KEY_READ, write_key=KEY_APP_MASTER),
            file_type=DESFireFileType.MDFT_STANDARD_DATA_FILE,
        ),
    )
    nastavitve = d.get_file_settings(FILE_ID)
    d.write_file_data(FILE_ID, 0x00, nastavitve.encryption, zeton)

    # Takoj preberemo nazaj z BRALNIM ključem — tako je vpis res preverjen.
    d.authenticate(KEY_READ, _aes(bralni))
    nazaj = list(d.read_file_data(FILE_ID, d.get_file_settings(FILE_ID)))[:TOKEN_BYTES]
    if nazaj != zeton:
        raise NapakaKartice("Zapis na kartico ni bil pravilen — poskusi znova.")

    return to_hex_string(zeton).replace(" ", "").upper()


def pocisti_karto(connection) -> None:
    """Pobriše aplikacijo SmartClean (kartica ostane uporabna za ponoven vpis)."""
    d = poveži(connection)
    d.select_application("000000")
    d.authenticate(0x00, DESFireKey(d.get_key_setting(), "00" * 8))
    try:
        d.delete_application(APP_ID)
    except Exception:
        raise NapakaKartice("Aplikacije SmartClean na tej kartici ni.")


def nov_kljucnik() -> dict:
    """Dva sveža 128-bitna osnovna ključa."""
    return {"app_master": secrets.token_hex(16).upper(), "read": secrets.token_hex(16).upper()}
