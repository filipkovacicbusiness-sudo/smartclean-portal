// ═══════════════════════════════════════════════════════════════════
//  uporabniki — strežniška funkcija za upravljanje računov
//
//  Zakaj obstaja: ustvarjanje in brisanje računov zahteva tajni ključ
//  projekta. Ta ne sme nikoli v brskalnik, ker obide vsa varnostna
//  pravila. Funkcija ga hrani pri sebi, preverja, da klic prihaja od
//  osebja, in šele nato opravi delo.
//
//  Objava: Supabase → Edge Functions → Deploy a new function → Via Editor
//  Ime funkcije mora biti:  uporabniki
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const PORTAL = "https://portal.smartclean.si";

const cors = {
  "Access-Control-Allow-Origin": PORTAL,
  // supabase-js pošlje tudi apikey in x-client-info; če jih ne navedemo,
  // brskalnik zahtevka sploh ne pošlje in klic pade z FunctionsFetchError
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function odgovor(telo: unknown, status = 200) {
  return new Response(JSON.stringify(telo), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Geslo, ki ga ni treba izmišljati in je dovolj močno.
function geslo(): string {
  const znaki = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const posebni = "!?#%*+-=";
  const b = new Uint32Array(16);
  crypto.getRandomValues(b);
  let g = "";
  for (let i = 0; i < 14; i++) g += znaki[b[i % 16] % znaki.length];
  return g + posebni[b[15] % posebni.length] + (b[0] % 10);
}

Deno.serve(async (req) => {
  try {
    return await obravnavaj(req);
  } catch (e) {
    // Brez tega bi Supabase vrnil 500 brez glav CORS in brskalnik
    // bi odgovor zavrgel — uporabnik bi videl samo "strežnik ne odgovarja".
    console.error("NAPAKA:", e);
    return odgovor({ napaka: "Napaka na strežniku: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});

// Lastnik = isti e-naslov kot JE_LASTNIK() v portal.js. Po želji prepiši
// s skrivnostjo OWNER_EMAIL v Supabase → Edge Functions → Secrets.
const LASTNIK = (Deno.env.get("OWNER_EMAIL") ?? "filip@eflitte.si").trim().toLowerCase();

async function obravnavaj(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odgovor({ napaka: "Napačna metoda." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const tajni = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, tajni, { auth: { persistSession: false } });

  // ── 1. kdo kliče ─────────────────────────────────────────────────
  const glava = req.headers.get("Authorization") ?? "";
  const zeton = glava.replace(/^Bearer\s+/i, "");
  if (!zeton) return odgovor({ napaka: "Niste prijavljeni." }, 401);

  const { data: { user }, error: napakaZetona } = await admin.auth.getUser(zeton);
  if (napakaZetona || !user) return odgovor({ napaka: "Seja je potekla. Prijavite se znova." }, 401);

  const { data: klicatelj, error: napakaProfila } = await admin
    .from("profiles").select("is_staff,active,super_admin").eq("id", user.id).maybeSingle();

  // Napake ne požiramo: doslej je vsaka težava z branjem profila izpadla
  // kot "nimate pravic", kar je zavajajoče in se ne da odpraviti.
  if (napakaProfila) {
    return odgovor({
      napaka: "Profila ni bilo mogoče prebrati: " + napakaProfila.message,
    }, 500);
  }
  if (!klicatelj) {
    return odgovor({
      napaka: "Za vaš račun (" + user.email + ") ni profila v bazi.",
    }, 403);
  }
  if (!klicatelj.is_staff) {
    return odgovor({ napaka: "Vaš račun ni označen kot osebje." }, 403);
  }
  if (!klicatelj.active) {
    return odgovor({ napaka: "Vaš račun je izklopljen." }, 403);
  }

  // ── 1b. SME spreminjati račune? ──────────────────────────────────
  // Vmesnik razdelek »Uporabniki« pokaže samo vlogama super in admin
  // (ADMIN_PRIVZ v portal.js: osebje → uporabniki r=0 w=0 x=0 d=0).
  // Strežnik je doslej zahteval le is_staff, zato je lahko VSAK račun
  // osebja mimo vmesnika ustvarjal, brisal in menjal gesla — tudi
  // lastniku. Tu vmesnik in strežnik uskladimo.
  const jeLastnik = (user.email ?? "").trim().toLowerCase() === LASTNIK;
  const jeSuper = jeLastnik || klicatelj.super_admin === true;

  // Ali tarča (id) pripada lastniku? Lastnika sme spreminjati samo lastnik sam.
  async function tarcaJeLastnik(id: string): Promise<boolean> {
    try {
      const { data } = await admin.auth.admin.getUserById(id);
      return (data?.user?.email ?? "").trim().toLowerCase() === LASTNIK;
    } catch { return false; }
  }

  // ── 2. kaj želi ──────────────────────────────────────────────────
  let telo: Record<string, unknown>;
  try { telo = await req.json(); }
  catch { return odgovor({ napaka: "Neveljaven zahtevek." }, 400); }

  const dejanje = String(telo.dejanje ?? "");

  // ── ustvari račun ────────────────────────────────────────────────
  if (dejanje === "ustvari") {
    if (!jeSuper) return odgovor({ napaka: "Za ustvarjanje računov nimate pravic." }, 403);
    const email = String(telo.email ?? "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return odgovor({ napaka: "E-naslov ni veljaven." }, 400);
    }
    const novo = geslo();

    const { data: ustvarjen, error } = await admin.auth.admin.createUser({
      email,
      password: novo,
      email_confirm: true,          // brez tega se oseba ne more prijaviti
    });
    if (error) {
      const zaseden = /already|registered|exists/i.test(error.message);
      return odgovor({
        napaka: zaseden ? "Račun s tem e-naslovom že obstaja." : error.message,
      }, 400);
    }

    const id = ustvarjen.user.id;
    const osebje = telo.osebje === true;
    const orgId = telo.orgId ? String(telo.orgId) : null;

    // sprožilec je profil že ustvaril; dopolnimo vlogo
    await admin.from("profiles")
      .update({ is_staff: osebje, active: true }).eq("id", id);

    if (!osebje && orgId) {
      const { error: nClan } = await admin.from("memberships")
        .insert({ user_id: id, org_id: orgId, role: "owner" });
      if (nClan) return odgovor({ napaka: "Račun je nastal, vezava na stranko pa ne: " + nClan.message }, 500);
    }

    return odgovor({ ok: true, email, geslo: novo, id });
  }

  // ── ponastavi geslo ──────────────────────────────────────────────
  if (dejanje === "geslo") {
    if (!jeSuper) return odgovor({ napaka: "Za menjavo gesel nimate pravic." }, 403);
    const id = String(telo.id ?? "");
    if (!id) return odgovor({ napaka: "Manjka račun." }, 400);
    if (!jeLastnik && await tarcaJeLastnik(id)) {
      return odgovor({ napaka: "Gesla lastnika ne morete spremeniti." }, 403);
    }
    const novo = geslo();
    const { error } = await admin.auth.admin.updateUserById(id, { password: novo });
    if (error) return odgovor({ napaka: error.message }, 400);
    return odgovor({ ok: true, geslo: novo });
  }

  // ── izbriši račun ────────────────────────────────────────────────
  if (dejanje === "test") {
    return odgovor({ ok: true, kdo: user.email, osebje: klicatelj.is_staff });
  }

  if (dejanje === "izbrisi") {
    if (!jeSuper) return odgovor({ napaka: "Za brisanje računov nimate pravic." }, 403);
    const id = String(telo.id ?? "");
    if (!id) return odgovor({ napaka: "Manjka račun." }, 400);

    if (id === user.id) {
      return odgovor({ napaka: "Lastnega računa ne morete izbrisati." }, 400);
    }
    if (!jeLastnik && await tarcaJeLastnik(id)) {
      return odgovor({ napaka: "Računa lastnika ne morete izbrisati." }, 403);
    }

    // ne dovolimo, da ostane sistem brez osebja
    const { data: tarca } = await admin
      .from("profiles").select("is_staff").eq("id", id).maybeSingle();
    if (tarca?.is_staff) {
      const { count } = await admin
        .from("profiles").select("id", { count: "exact", head: true })
        .eq("is_staff", true).eq("active", true);
      if ((count ?? 0) <= 2) {
        return odgovor({
          napaka: "To je eden zadnjih dveh računov osebja. Najprej dodajte drugega.",
        }, 400);
      }
    }

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return odgovor({ napaka: error.message }, 400);
    return odgovor({ ok: true });
  }

  return odgovor({ napaka: "Neznano dejanje." }, 400);
}
