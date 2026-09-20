# Baza — kaj portal pričakuje od Supabase

**To je popis, ne izvorna koda.** Shema, pravila RLS in Edge funkcije živijo samo
v projektu Supabase `anrhtgbckxrccnafcmsz`. Če se ta projekt izgubi ali ga je
treba postaviti na novo (npr. za preizkusno okolje), ga iz te mape **ni mogoče
obnoviti**. Ta datoteka pove, kaj vse bi bilo treba obnoviti.

> **Največje tveganje v projektu.** Portal ima 14 migracij, ki jih koda kliče po
> imenu, v mapi pa je samo ena. Ker pravil RLS ni nikjer v repozitoriju, jih tudi
> ni mogoče pregledati — in RLS je edino, kar portal v resnici varuje (glej
> »Pravice« spodaj).

---

## 1. Izvoz sheme (naredi to najprej)

```bash
supabase login
supabase link --project-ref anrhtgbckxrccnafcmsz
supabase db dump --schema public       -f baza/shema.sql   # tabele, pogledi, funkcije
supabase db dump --schema public --data-only --use-copy -f baza/podatki.sql
supabase functions download uporabniki
supabase functions download webauthn
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

Poleg tega sta v mapi dve enkratni opravili, ki nista del sheme:
`cenik_pocisti_nepovezane.sql` in `id_kljuc_migracija.sql`.

---

## 3. Kaj portal uporablja

**Tabele** (iz klicev `sb.from(...)` v `portal.js`):

`articles` · `pricelist` · `documents` · `profiles` · `delivery_notes` · `orgs` ·
`delivery_note_items` · `obvestila` · `dokumenti` · `att_events` · `employees` ·
`memberships` · `app_config` · `article_groups` · `avatars` ·
`webauthn_credentials` · `delivery_note_conflicts` · `audit_log`

**RPC:** `terminal_stamp` (terminal) · `touch_last_login` · `touch_seen` ·
`stranka_kosi` · `shrani_nastavitve` · `posodobi_ime_artikla`

**Edge funkcije:** `uporabniki` (dodajanje/brisanje uporabnikov, gesla) ·
`webauthn` (preverjanje podpisa Face ID / prstnega odtisa)

**Storage:** `avatars` · `dokumenti`

---

## 4. Pravice: RLS je edina prava obramba

V portalu `sme()` in `rolePerm()` (`portal.js`) samo **skrivata gumbe**.
`JE_LASTNIK()` primerja e-naslov z nizom v kodi. Nič od tega ni varnostna meja —
kdorkoli s ključem `sb_publishable_…` (ta je javen) in veljavno prijavo lahko
gre mimo vmesnika naravnost na REST.

Ob pregledu pravil je vredno preveriti predvsem troje:

1. **`app_config`** — portal ga piše iz brskalnika (`upsert` na ključ
   `role_config`). Kdor sme pisati to vrstico, si lahko dodeli pravice.
2. **`profiles`** — portal piše `last_seen`/`last_login` neposredno, kot rezervo
   za RPC. Pravilo mora dovoliti samo *lastno* vrstico in samo ta dva stolpca.
3. **`delivery_notes` / `orgs`** — stranka sme videti le svojo organizacijo.

---

## 5. Zakaj ima koda povsod rezervne poizvedbe

`naloziListe()` ima tri zaporedne različice iste poizvedbe, `start()` dve.
To ni previdnost — to je posledica točke 1: ker ni nikjer zapisano, katere
migracije so bile pognane, mora koda ob vsakem zagonu ugibati. Ko je shema
enkrat izvožena in vodena v repozitoriju, se te rezerve lahko odstranijo.
