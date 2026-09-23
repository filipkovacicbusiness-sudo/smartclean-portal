// ═══════════════════════════════════════════════════════════════════════════
//  cene-goriva — uradne cene NMB-95 in dizla z gov.si v tabelo fuel_prices
// ═══════════════════════════════════════════════════════════════════════════
//  Vlada objavlja najvišjo dovoljeno maloprodajno ceno za bencinske servise
//  zunaj avtocest, po tednih, v navadni HTML tabeli:
//      https://www.gov.si/teme/cene-naftnih-derivatov/
//  Cene so Z DDV. Tabela nosi vso zgodovino (ob pisanju 125 obdobij, od
//  junija 2022), zato en klic napolni vse; nadaljnji klici dodajo le novo.
//
//  Klic sme opraviti samo lastnik ali admin (enako kot razdelek Gorivo).
//  Piše s service_role, ker fuel_prices nima pravila za pisanje.
//
//  Portal jo pokliče sam, ko odpreš Gorivo in je najnovejša cena starejša od
//  dveh dni — urnika ni treba nastavljati.
//
//  Odgovor: { ok:true, najdenih, zapisanih, najnovejsa:{...} }
//
//  Objava: Supabase → Edge Functions → Deploy → ime mora biti  cene-goriva
//  (Verify JWT naj OSTANE vklopljen — kliče ga prijavljen uporabnik.)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const PORTAL = "https://portal.smartclean.si";
const VIR = "https://www.gov.si/teme/cene-naftnih-derivatov/";

const cors = {
  "Access-Control-Allow-Origin": PORTAL,
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

type Cena = { velja_od: string; velja_do: string; dizel: number; nmb95: number | null };

// Razčleni uradno tabelo. Ista koda je pokrita s test/ceneGoriva.test.js nad
// shranjenim posnetkom strani, da se sprememba oblike opazi pred objavo.
export function razclenimoCene(html: string): Cena[] {
  const tabela = (html.match(/<table[^>]*>[\s\S]*?<\/table>/g) || [])
    .find((t) => /Datum\s*veljavnosti/i.test(t));
  if (!tabela) throw new Error("tabele s cenami ni bilo mogoce najti");

  const besedilo = (s: string) =>
    s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
      .replace(/\s+/g, " ").trim();
  const dvo = (n: string | number) => String(n).padStart(2, "0");
  const iso = (d: string, m: string, l: string) => `${l}-${dvo(m)}-${dvo(d)}`;
  const stev = (s: string) => {
    const x = (s.match(/\d+[,.]\d+/) || [])[0];
    return x ? parseFloat(x.replace(",", ".")) : null;
  };

  const out: Cena[] = [];
  for (const vr of tabela.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const celice = (vr.match(/<t[dh][\s\S]*?<\/t[dh]>/g) || []).map(besedilo);
    if (celice.length < 3) continue;
    const m = celice[0].match(
      /od\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?\s*do\s+(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/i,
    );
    if (!m) continue;
    // Leto je praviloma zapisano samo enkrat, na koncu. Kadar obdobje prestopi
    // novo leto (»od 20. 12. do 3. 1. 2023«), je zapisano leto KONCA, začetek
    // pa je leto prej — sicer dobimo obdobje, ki se konča pred začetkom.
    const letoDo = m[6];
    const letoOd = m[3] ||
      (Number(m[2]) > Number(m[5]) ? String(Number(letoDo) - 1) : letoDo);
    const dizel = stev(celice[2]);
    if (dizel == null) continue;
    out.push({
      velja_od: iso(m[1], m[2], letoOd),
      velja_do: iso(m[4], m[5], letoDo),
      dizel,
      nmb95: stev(celice[1]),
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odgovor({ ok: false, error: "method" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── kdo kliče ──────────────────────────────────────────────────────────
  const avt = req.headers.get("Authorization") || "";
  if (!avt.startsWith("Bearer ")) return odgovor({ ok: false, error: "no_auth" }, 401);
  const kot = createClient(url, anon, { global: { headers: { Authorization: avt } } });
  const { data: u } = await kot.auth.getUser();
  if (!u || !u.user) return odgovor({ ok: false, error: "no_auth" }, 401);

  const admin = createClient(url, service);
  const { data: prof } = await admin.from("profiles")
    .select("email, super_admin").eq("id", u.user.id).maybeSingle();
  const email = String((prof && prof.email) || u.user.email || "").toLowerCase();
  const sme = email === "filip@eflitte.si" || !!(prof && prof.super_admin);
  if (!sme) return odgovor({ ok: false, error: "forbidden" }, 403);

  // ── vir ────────────────────────────────────────────────────────────────
  let html: string;
  try {
    const r = await fetch(VIR, { headers: { "User-Agent": "SmartClean portal" } });
    if (!r.ok) return odgovor({ ok: false, error: "vir_" + r.status }, 502);
    html = await r.text();
  } catch (e) {
    return odgovor({ ok: false, error: "vir_nedosegljiv", detail: String(e) }, 502);
  }

  let cene: Cena[];
  try {
    cene = razclenimoCene(html);
  } catch (e) {
    return odgovor({ ok: false, error: "oblika_strani", detail: String(e) }, 502);
  }
  // Prazen rezultat pomeni, da se je oblika strani spremenila. Takrat NE
  // pišemo ničesar — tiho prazna tabela bi bila slabša od jasne napake.
  if (!cene.length) return odgovor({ ok: false, error: "oblika_strani" }, 502);

  const { error } = await admin.from("fuel_prices").upsert(
    cene.map((c) => ({ ...c, vir: "gov.si", osvezeno_at: new Date().toISOString() })),
    { onConflict: "velja_od" },
  );
  if (error) return odgovor({ ok: false, error: "zapis", detail: error.message }, 500);

  const najnovejsa = cene.slice().sort((a, b) => (a.velja_od < b.velja_od ? 1 : -1))[0];
  return odgovor({ ok: true, najdenih: cene.length, zapisanih: cene.length, najnovejsa });
});
