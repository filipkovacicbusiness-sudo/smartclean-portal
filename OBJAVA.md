# Kako spraviti portal v živo

Cilj: `portal.smartclean.si`. Vse skozi brskalnik, brez ukazne vrstice.
Računaj kakih dvajset minut, od tega polovica čakanja na DNS.

---

## 1. Nov repozitorij na GitHubu

1. Na **github.com** klikni **+** zgoraj desno → *New repository*
2. Ime: `smartclean-portal`
3. **Private** — portal ni javna koda
4. *Create repository*
5. Na naslednji strani klikni **uploading an existing file**
6. Povleci vanj **vsebino mape** `portal-web` (ne mape same):
   `index.html`, `config.js`, `vercel.json`, `robots.txt`,
   mapi `assets` in `vendor`
7. Spodaj *Commit changes*

---

## 2. Vercel

1. Na **vercel.com** se prijavi z istim GitHub računom
2. *Add New…* → *Project*
3. Poišči `smartclean-portal` → **Import**
4. Framework Preset naj ostane *Other*, ničesar ne spreminjaj
5. **Deploy**

Čez minuto dobiš naslov v slogu `smartclean-portal-xyz.vercel.app`.
Odpri ga in preveri, da se prijava naloži.

---

## 3. Domena

**V Vercelu:** projekt → *Settings* → *Domains* → vpiši
`portal.smartclean.si` → *Add*. Vercel ti izpiše, kateri DNS zapis dodati.

**Pri ponudniku domene** (tam, kjer imaš smartclean.si) dodaj zapis:

```
Tip:      CNAME
Ime:      portal
Vrednost: cname.vercel-dns.com
TTL:      privzeti
```

Pomembno: **nobenega zapisa za `smartclean.si` ne spreminjaj.** Dodajaš
samo novega za `portal`. Obstoječa spletna stran ostane nedotaknjena.

DNS se razširi v nekaj minutah do ure. Vercel potem sam uredi
varnostni certifikat.

---

## 4. Povej Supabase, kje portal živi

To je korak, ki se ga zlahka pozabi in se maščuje šele pri prvi
pozabljeni gesli.

Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** `https://portal.smartclean.si`
- **Redirect URLs:** dodaj `https://portal.smartclean.si/**`

Brez tega bi povezava za ponastavitev gesla vodila v prazno.

---

## 5. Preveri, da drži

Odpri `https://portal.smartclean.si` in se prijavi.

Nato v Chromu `Cmd+Option+I` → zavihek **Console**. Če je prazna, so
varnostne glave v redu. Če vidiš rdeče vrstice s *Content Security
Policy*, mi jih pošlji.

---

## Kaj je vgrajeno

Portal je razdeljen na `index.html`, `assets/portal.css` in
`assets/portal.js`. To ni kozmetika: ker v HTML ni nobene vgrajene
skripte, sme varnostna politika prepovedati **vse** skripte razen tistih
z lastnega strežnika. Če bi kdaj kdo uspel podtakniti kodo v vsebino, je
brskalnik ne bo izvedel.

`vercel.json` nastavi:

| glava | kaj naredi |
|---|---|
| Content-Security-Policy | skripte samo z lastnega strežnika, povezave samo na tvoj Supabase |
| Strict-Transport-Security | vedno HTTPS, nikoli navaden HTTP |
| X-Frame-Options: DENY | portala ni mogoče vgraditi v tuj okvir |
| Referrer-Policy: no-referrer | naslovi tvojih strani ne uhajajo tujim stranem |
| X-Robots-Tag: noindex | Google portala ne indeksira |

Zraven je `robots.txt`, ki iskalnikom pove isto.

---

## Takoj po objavi

**Ne pošiljaj še povezave strankam.** Spremnih listov v bazi ni, zato bi
stranka videla prazen pregled. Objava zdaj je zato, da se postavitev in
domena uredita, dokler je vseeno, če kaj ne gre — ne zato, da se portal
razglasi.

Dvoje pa uredi kmalu, ker je prijavna stran odslej dosegljiva vsem na
internetu:

1. **Supabase → Authentication → Attack Protection** — vklopi omejevanje
   poskusov prijave
2. **Dvofaktorska prijava za tvoj račun** — Authentication → Multi-Factor.
   Tvoj račun vidi vseh 51 strank; geslo samo zanj ni dovolj.
