# Baza — kaj portal pričakuje od Supabase

**To je popis, ne izvorna koda.** Shema, pravila RLS in Edge funkcije živijo samo
v projektu Supabase `anrhtgbckxrccnafcmsz`. Če se ta projekt izgubi ali ga je
treba postaviti na novo (npr. za preizkusno okolje), ga iz te mape **ni mogoče
obnoviti**. Ta datoteka pove, kaj vse bi bilo treba obnoviti.

> **Shema je zdaj izvožena** (`shema.sql`, `shema-app.sql`) — brez podatkov,
> ker je repozitorij javen. Ostaja pa, da 14 od 16 oštevilčenih migracij ni v
> mapi; `shema.sql` je posnetek KONČNEGA stanja, ne zgodovina korakov.
>
> **Pregled pravil je odkril kritično napako** — povišanje lastnih pravic prek
> `profiles`. Popravek je `51_profiles_zascita_pravic.sql`. Glej razdelek 4.

---

## 1. Izvoz sheme (naredi to najprej)

Edge funkcije so **že izvožene** v `supabase/functions/` (vse štiri).
Manjkata še shema in pravila RLS — `supabase db dump` za to potrebuje Docker:

```bash
# možnost A — Docker Desktop, nato dump brez gesla za bazo
brew install --cask docker && open -a Docker
supabase db dump --schema public -f baza/shema.sql
supabase db dump --schema public --data-only --use-copy -f baza/podatki.sql

# možnost B — brez Dockerja, prek pg_dump (rabi geslo baze iz
# Supabase → Project Settings → Database)
brew install libpq
"$(brew --prefix libpq)"/bin/pg_dump --schema-only --schema=public \
  "postgresql://postgres:GESLO@db.anrhtgbckxrccnafcmsz.supabase.co:5432/postgres" \
  > baza/shema.sql
```

Pravil RLS `db dump` ne zajame vedno v berljivi obliki; izpiši jih še posebej:

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;
```

---

## 2. Migracije, ki jih koda kliče po imenu

Vsaka se pojavi v sporočilu o napaki v `portal.js` — torej portal brez nje
določenega razdelka ne odpre. **Kljukica = datoteka je v tej mapi.**

| # | Datoteka | Za kaj | Tu? |
|---|---|---|---|
| 13 | `13_skupine.sql` | skupine artiklov (`article_groups`) | ✗ |
| 19 | `19_dokumenti.sql` | tabela `dokumenti` (skenirani računi) | ✗ |
| 26 | `26_obvestila_prejemnik.sql` | prejemnik obvestila | ✗ |
| 27 | `27_super_admin.sql` | `profiles.super_admin` | ✗ |
| 28 | `28_zaposleni.sql` | `profiles.zaposleni` | ✗ |
| 29 | `29_app_config.sql` | `app_config` — vloge in potisnjena osvežitev | ✗ |
| 30 | `30_obvestila_tip.sql` | tip obvestila | ✗ |
| 31 | `31_dokumenti_fs.sql` | mape in datoteke v Dokumentih | ✗ |
| 33 | `33_audit_log.sql` | `audit_log` — dnevnik sprememb | ✗ |
| 34 | `34_dokumenti_zaklep.sql` | zaklepanje dokumentov | ✗ |
| 41 | `41_terminal_stamp.sql` | RPC `terminal_stamp` (RFID terminal) | ✗ |
| 45 | `45_skrij_neuporabljene.sql` | skrij neuporabljene artikle + sprožilec | **✓** |
| 46 | `46_app_pin.sql` | PIN za aplikacijo | ✗ |
| 48 | `48_zaposleni_uporabnik.sql` | povezava zaposleni ↔ uporabnik | ✗ |
| 49 | `49_terminal_offline.sql` | parameter `p_ts` — žigi brez povezave | ✗ |
| 50 | *(brez imena v kodi)* | `deleted_at` na `delivery_notes` in `documents` | ✗ |
| 55 | `55_gorivo.sql` | `fuel_logs` + bucket `gorivo` (razdelek Gorivo) | **✓** |

Poleg tega sta v mapi dve enkratni opravili, ki nista del sheme:
`cenik_pocisti_nepovezane.sql` in `id_kljuc_migracija.sql`.

---

## 3. Kaj portal uporablja

**Tabele** (iz klicev `sb.from(...)` v `portal.js`):

`articles` · `pricelist` · `documents` · `profiles` · `delivery_notes` · `orgs` ·
`delivery_note_items` · `obvestila` · `dokumenti` · `att_events` · `employees` ·
`memberships` · `app_config` · `article_groups` · `avatars` ·
`webauthn_credentials` · `delivery_note_conflicts` · `audit_log`

**RPC:** `terminal_stamp` (star terminal) · `odprte_izmene` · `touch_last_login` ·
`touch_seen` · `stranka_kosi` · `shrani_nastavitve` · `posodobi_ime_artikla`

> `terminal/stemplj.py` v tem repozitoriju kliče **star** `terminal_stamp`
> s številko kartice in javnim ključem. Objavljena funkcija `punch` je novejša
> (žeton s kartice + HMAC + nonce). Skripta na Raspberry Pi je torej eno
> generacijo zadaj — preveri, katera od obeh v resnici teče.

**Edge funkcije** — štiri, ne dve (izvožene v `supabase/functions/`):

| Funkcija | Verify JWT | Kako se zaščiti |
|---|---|---|
| `uporabniki` | da | žeton + `is_staff` + **`super_admin`** (glej opozorilo spodaj) |
| `webauthn` | da | žeton; preveri podpis passkeya |
| `punch` | **ne** | HMAC-SHA256 s skrivnostjo terminala + nonce |
| `odprte-izmene` | **ne** | skupna skrivnost v glavi `x-report-secret` |

`punch` in `odprte-izmene` sta namenoma brez preverjanja žetona — kliče ju
terminal oziroma razporejeno opravilo, ne prijavljen uporabnik.

> **Opozorilo (odpravljeno v izvorni kodi, NEOBJAVLJENO):** `uporabniki` je
> zahtevala samo `is_staff`, vmesnik pa razdelek Uporabniki pokaže le vlogama
> super in admin. Vsak račun osebja je lahko mimo vmesnika ustvarjal in brisal
> račune ter menjal gesla — tudi lastniku. Popravek je v
> `supabase/functions/uporabniki/index.ts`, objaviti ga je treba z
> `supabase functions deploy uporabniki`.

> **Skrivnost v kodi:** `odprte-izmene` je imela `REPORT_SECRET` zapisan v
> komentarju. V izvozu je zamenjan z opozorilom. Ker je repozitorij javen,
> skrivnost zamenjaj (Supabase → Edge Functions → Secrets) in popravi
> razporejeno opravilo, ki funkcijo kliče.

**Storage:** `avatars` · `dokumenti`

---

## 4. Pravice: RLS je edina prava obramba

V portalu `sme()` in `rolePerm()` (`portal.js`) samo **skrivata gumbe**.
`JE_LASTNIK()` primerja e-naslov z nizom v kodi. Nič od tega ni varnostna meja —
kdorkoli s ključem `sb_publishable_…` (ta je javen) in veljavno prijavo lahko
gre mimo vmesnika naravnost na REST.

Pravila so zdaj izvožena (`shema.sql`, 62 pravil na 23 tabelah) in pregledana:

| Kaj | Ugotovitev |
|---|---|
| `app_config` | **V redu.** Pisanje omejeno na `auth.jwt() ->> 'email' = 'filip@eflitte.si'`. Vloge si nihče ne more dodeliti sam. |
| `orgs` / `delivery_notes` | **V redu.** Stranka vidi svoje prek `app.my_org_ids()` (membership + `active`). |
| `profiles` | **KRITIČNO — glej spodaj.** |

### Povišanje lastnih pravic prek `profiles`

Trije dejavniki skupaj:

1. `profiles_self_update` dovoli UPDATE lastne vrstice (`id = auth.uid()`),
2. `GRANT ALL ON TABLE profiles TO authenticated` — **brez omejitve stolpcev**,
3. na `profiles` ni nobenega sprožilca.

`is_staff`, `super_admin` in `zaposleni` so navadni stolpci te iste vrstice.
Zato je vsak prijavljen uporabnik — tudi navadna stranka — lahko naredil:

```js
await sb.from('profiles').update({ is_staff: true, super_admin: true }).eq('id', mojUid);
```

`app.is_staff()` bere prav ta stolpec, zato se za tem odpre pravilo
`staff_all_profiles` in za njim vse, kar je vezano na osebje: vse stranke,
spremni listi, fakture, dokumenti, uporabniki.

**Popravek:** `51_profiles_zascita_pravic.sql` (preizkušen na Postgres 17 —
stranka in osebje ne moreta povišati sebe, osebje ne more tujih pravic,
lastnik in service_role delujeta naprej).

---

## 5. Zakaj ima koda povsod rezervne poizvedbe

`naloziListe()` ima tri zaporedne različice iste poizvedbe, `start()` dve.
To ni previdnost — to je posledica točke 1: ker ni nikjer zapisano, katere
migracije so bile pognane, mora koda ob vsakem zagonu ugibati. Ko je shema
enkrat izvožena in vodena v repozitoriju, se te rezerve lahko odstranijo.
