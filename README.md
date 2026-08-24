# SmartClean – smartclean.si

Statična stran, brez build koraka. Vsebino urejaš neposredno, commitaš in
GitHub Pages postreže.

**Predogled lokalno:** v tej mapi poženi `python3 -m http.server 8000` in odpri
`http://localhost:8000`. Dvoklik na `index.html` tudi deluje, samo navigacija
ne, ker so povezave absolutne (`/o-nas/`) – kar je pravilno za živo stran.

```
index.html              domača stran            →  /
o-nas/index.html        O nas                   →  /o-nas/
panoge/index.html       Panoge                  →  /panoge/
faq/index.html          Pogosta vprašanja       →  /faq/
zaposlitev/index.html   Zaposlitev              →  /zaposlitev/
kontakt/index.html      Kontakt                 →  /kontakt/

assets/style.css        ves CSS
assets/app.js           ves JS
assets/og.png           slika za predoglede (1200×630)

robots.txt              dovoli indeksiranje, kaže na sitemap
sitemap.xml             6 URL-jev za Google Search Console
CNAME                   smartclean.si
.nojekyll               izklopi Jekyll na GitHub Pages
```

Pomembno: mapa `assets/` mora biti commitana. Če stran v živo izgleda kot gol
besedilni dokument, je skoraj zagotovo ta mapa manjkala v pushu.

---

## Prenova videza – avgust 2026

Videz je v celoti prevzet z **eflitte.si** (backup V13). Besedila, vseh 6
URL-jev in SEO so nespremenjeni; zamenjana sta oblikovni sloj in HTML struktura.

### Pisave

Identičen nabor in identičen Google Fonts URL kot eflitte:

```
Instrument Sans  400;500;600      telo in vmesnik  (--ff)
Archivo          300..700         veliki naslovi   (--display)
Inter            300..700         navigacija in gumbi
Geist Mono       400;500          številke, oznake (--mono)
Playfair Display 700;900          samo logotip     (--wm)
```

### Kaj se je spremenilo

**Mreže namesto kartic.** `grid-2`, `grid-3`, `steps`, `principles` gredo od
roba do roba, celice ločuje 1px črta. Brez zaobljenih kartic, brez razmikov,
brez senčnih dvigov.

**Tipografija.** Naslovi so Archivo teže 400–450 z negativnim spacingom
(prej 700). Velikosti so v px po eflitte lestvici, ne v rem.

**Glava.** Prosojna; ozadje in spodnja meja se zvezno pojavita glede na
drsenje (`--nav-p` = `scrollY/72`). Pod povezavami drseči poudarek.

**Mobilni meni.** Celozaslonski drawer (`body.menu-open`) namesto padajočega
seznama. Burger 46×46 px, črtice 11×1 px.

**Hero.** Centriran, z badgeom, `clamp(36px,5.6vw,64px)`, vstop z blur-up
animacijo (`.hero-enter`, zamik prek `--ed`). Podstrani imajo levo poravnano
različico (`.page-hero`).

**Števila.** Pas z mrežastim ozadjem (80×80 px, radialna vinjeta) in tremi
animiranimi švigi. Števke se navpično zavrtijo na mesto (odometer).

**FAQ.** Polne vrstice z `+`, ki se ob odprtju zavrti v `×`. Iskalnik in
kategorije filtrirajo v živo.

**Kontakt.** Centriran naslov nad zaobljeno kartico obrazca (radij 18 px).
Obrazca pošiljata prek `fetch` na web3forms – brez preusmeritve na drugo stran.

**Noga.** 3-stolpčna mreža, naslovi stolpcev v Geist Mono 11px/.1em.

### Teme

Privzeta je **svetla** (eflitte je temen). Izbira se hrani v `localStorage`
pod ključem `smartclean-theme`. V `<head>` je majhen skript, ki temo nastavi
pred izrisom, sicer bi ob vsakem nalaganju blisnila svetla tema.

Logotip ostaja SmartClean wordmark v Playfair Display, „Smart“ + zelena
„Clean“ (`#1a6644` svetla, `#6ed3a1` temna) – edini ostanek prejšnje palete.

### Preverjeno

- Vseh 6 strani × svetla/temna tema: brez JS napak, brez vodoravnega drsenja,
  tema se pravilno prebere iz `localStorage`.
- Mobilno 390×844: vseh 6 strani brez vodoravnega drsenja; drawer in FAQ
  preverjena s klikom.
- Vse notranje povezave razrešene na obstoječe datoteke.

---

## Za urediti

1. **Obrazec na domači strani.** Domača se konča s kontaktnim pasom (podatki
   + gumb), ne s celim obrazcem. eflitte ima obrazec tudi na domači – če ga
   hočeš, ga je treba dodati.
2. **Zdravstvo.** Kartica »Zdravstvo & sociala« na Panogah obljublja
   bolnišnično perilo, medicinske uniforme in dokumentacijo za revizije.
   Če tega ne pokrivaš, jo je treba odstraniti enako kot farmacijo.
3. **Fotografije.** Stran nima nobene prave slike pralnice, ekipe ali perila.
   Nov, čist videz to še bolj izpostavi.
4. **Google Search Console** – dodaj domeno in oddaj `sitemap.xml`.
