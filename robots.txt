# Portal v živo — na GitHub Pages

Cilj: `portal.smartclean.si`. Isti postopek kot pri spletni strani,
isti GitHub račun. Vercela ne rabiš.

---

## 1. Nov repozitorij

Prijavljen kot **filipkovacicbusiness-sudo** (isti račun kot smartclean.si):

1. github.com → **+** zgoraj desno → *New repository*
2. Ime: `portal.smartclean.si`
3. **Public** — GitHub Pages na brezplačnem paketu zahteva javni repozitorij
4. *Create repository* → **uploading an existing file**
5. Povleci **vsebino** te mape (ne mape same):
   `index.html`, `config.js`, `robots.txt`, `CNAME`, `.nojekyll`,
   mapi `assets` in `vendor`
6. *Commit changes*

`.nojekyll` in `CNAME` sta na Macu skrita — prikažeš ju s `Cmd+Shift+.`

`vercel.json` in `OBJAVA.md` pusti doma, na GitHub Pages nimata učinka.

> Repozitorij je javen, torej bo `config.js` s ključem viden. To je v redu:
> preverjeno je, da ta ključ sam po sebi vrne 401 na vsaki tabeli. Odpre
> se šele po prijavi, ko Supabase preklopi na vlogo `authenticated`.

---

## 2. Vklopi Pages

Repozitorij → **Settings** → levo **Pages**:

- Source: *Deploy from a branch*
- Branch: `main`, mapa `/ (root)` → **Save**

Pod *Custom domain* se mora sam pojaviti `portal.smartclean.si`
(prebere ga iz datoteke `CNAME`). Če se ne, ga vpiši ročno.

Ko DNS steče, obkljukaj še **Enforce HTTPS**.

---

## 3. DNS na domenca.si

Dodaj **en nov zapis**. Obstoječih se ne dotikaj — spletna stran mora
delati naprej.

```
Tip:      CNAME
Ime:      portal
Vrednost: filipkovacicbusiness-sudo.github.io
TTL:      privzeti
```

Obstoječi zapisi, ki ostanejo nespremenjeni:
- `smartclean.si` → A na 185.199.108–111.153
- `www` → CNAME na filipkovacicbusiness-sudo.github.io

Razširjanje traja nekaj minut do ure. Certifikat GitHub uredi sam,
lahko pa traja še dodatnih deset minut.

---

## 4. Povej Supabase, kje portal živi

Supabase → **Authentication** → **URL Configuration**:

- **Site URL:** `https://portal.smartclean.si`
- **Redirect URLs:** dodaj `https://portal.smartclean.si/**`

Brez tega povezava za ponastavitev gesla vodi v prazno. To odkriješ
šele takrat, ko geslo pozabiš — torej v najslabšem možnem trenutku.

---

## 5. Zavaruj svoj račun

Prijavna stran bo od zdaj dosegljiva vsakomur na svetu.

Supabase → **Authentication**:
- **Attack Protection** → vklopi omejevanje poskusov prijave
- **Multi-Factor** → dodaj drugi faktor za `filip@eflitte.si`

Tvoj račun je edini z `is_staff = true` in vidi vseh 51 strank.

---

## Kaj je in kaj ni zavarovano

Portal je razdeljen na `index.html`, `assets/portal.css` in
`assets/portal.js`. Ker v HTML ni nobene vgrajene skripte, sme varnostna
politika prepovedati vse skripte razen tistih z lastnega strežnika.
Ta politika je v `<meta>` oznaki, ker GitHub Pages ne zna pošiljati
HTTP glav. Preverjeno: nobene kršitve.

Česar meta oznaka **ne** zmore, ker je brskalniki tam ne upoštevajo:

- `frame-ancestors` — zaščita pred tem, da bi kdo portal vgradil v svojo
  stran in prevaral uporabnika v klik
- `Strict-Transport-Security` — vsiljena raba HTTPS

Za tvojo lastno rabo je to sprejemljivo. **Preden povabiš prvo stranko**,
gre portal na gostovanje, ki zna pošiljati glave — takrat velja tudi
`vercel.json`, ki je že napisan in te glave vsebuje. Takrat je čas tudi
za sejo v piškotku namesto v brskalnikovi shrambi in za samodejni
odklop po nedejavnosti.
