// ═══════════════════════════════════════════════════════════════════
//  registracija — povabila z aktivacijsko kodo in pozabljeno geslo
//
//  Kliče se brez prijave (le javni ključ). Kar potrebuje tajni ključ —
//  ustvarjanje računa, menjava gesla, iskanje po e-naslovu — teče tu.
//  Dejanja: preveri · zacni · znova · potrdi · pozabljeno · ponastavi
//
//  Potek registracije: koda povabila (7 dni, enkrat) → ime, e-naslov in
//  geslo → 6-mestna koda po e-pošti (15 min, 5 poskusov) → račun z vlogo
//  iz povabila. Račun nastane šele ob potrditvi (geslo se ne shrani).
//
//  E-pošta prek Resend: skrivnost RESEND_API_KEY (Supabase → Edge
//  Functions → Secrets). Neobvezno: EMAIL_FROM, EMAIL_REPLY_TO.
// ═══════════════════════════════════════════════════════════════════

import { createClient } from "jsr:@supabase/supabase-js@2";

const PORTAL = "https://portal.smartclean.si";
const LASTNIK = (Deno.env.get("OWNER_EMAIL") ?? "filip@eflitte.si").trim().toLowerCase();
const OD = Deno.env.get("EMAIL_FROM") ?? "SmartClean <portal@smartclean.si>";
const ODGOVOR_NA = Deno.env.get("EMAIL_REPLY_TO") ?? LASTNIK;

const cors = {
  "Access-Control-Allow-Origin": PORTAL,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function odgovor(telo: unknown, status = 200) {
  return new Response(JSON.stringify(telo), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  try {
    return await obravnavaj(req);
  } catch (e) {
    console.error("NAPAKA:", e);
    return odgovor({ napaka: "Napaka na strežniku. Poskusite znova." }, 500);
  }
});

// pošiljanje v ozadju (odgovor ne čaka na Resend: enak čas za obstoječe in neobstoječe naslove)
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function vOzadju(p: Promise<unknown>) {
  const varno = p.catch((e) => console.error("ozadje", e));
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(varno); else return varno;
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const VLOGE: Record<string, string> = { admin: "Admin", osebje: "Osebje", zaposleni: "Zaposleni", stranka: "Stranka" };
const normKoda = (k: unknown) => String(k ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const KODA_OK = /^[A-HJ-NP-Z2-9]{10}$/;
const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const emailOk = (e: string) => e.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e);
const MINUTA = 60000;

function gesloNapaka(g: string): string | null {
  if (g.length < 10) return "Geslo naj ima vsaj 10 znakov.";
  if (g.length > 72) return "Geslo je predolgo.";
  if (!/\p{L}/u.test(g) || !/\d/.test(g)) return "Geslo naj vsebuje črke in številke.";
  return null;
}
// napaka strežnika za prijave pri šibkem geslu (pravila projekta so lahko strožja od zgornjih)
function sibkoGeslo(e: { message?: string; code?: string; reasons?: string[] } | null): string | null {
  if (!e) return null;
  const m = String(e.message ?? ""), r = (e as { reasons?: string[] }).reasons ?? [];
  if (e.code !== "weak_password" && !/weak|password should|password is/i.test(m)) return null;
  if (r.includes("pwned") || /pwned|leaked|breach/i.test(m)) return "To geslo je bilo razkrito v znanih vdorih. Izberite drugo.";
  if (r.includes("characters") || /character/i.test(m)) return "Geslo naj vsebuje velike in male črke, številke in simbol.";
  return "Geslo je prešibko. Izberite daljše.";
}

async function zgosti(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function sestMestna() {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return String(b[0] % 1000000).padStart(6, "0");
}

// ── omejitev poskusov (tabela omejitve; stari zapisi se sproti brišejo) ──
async function omejeno(kljuc: string, najvec: number, minut: number) {
  const { count, error } = await admin.from("omejitve").select("kljuc", { count: "exact", head: true })
    .eq("kljuc", kljuc).gte("cas", new Date(Date.now() - minut * MINUTA).toISOString());
  if (error) throw error;
  return (count ?? 0) >= najvec;
}
async function zabelezi(kljuc: string) { const { error } = await admin.from("omejitve").insert({ kljuc }); if (error) throw error; }
async function pocisti() { await admin.from("omejitve").delete().lt("cas", new Date(Date.now() - 24 * 60 * MINUTA).toISOString()); }

async function povabilo(id: { koda?: string; id?: string }) {
  const q = admin.from("povabila").select("id,koda,vloga,org_id,velja_do,porabljeno,preklicano,ustvaril");
  const { data: p, error } = await (id.koda ? q.eq("koda", id.koda) : q.eq("id", id.id!)).maybeSingle();
  if (error) throw error;
  if (!p) return { napaka: "Koda ni veljavna.", status: 404 };
  if (p.porabljeno) return { napaka: "Ta koda je že bila uporabljena.", status: 410 };
  if (p.preklicano) return { napaka: "To povabilo je bilo preklicano.", status: 410 };
  if (new Date(p.velja_do).getTime() < Date.now()) return { napaka: "Povabilo je poteklo. Prosite za novo.", status: 410 };
  return { p };
}
async function imeStranke(org: string | null) {
  if (!org) return null;
  const { data } = await admin.from("orgs").select("name").eq("id", org).maybeSingle();
  return data?.name ?? null;
}

// ── e-pošta ────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const PISAVA = "'Archivo',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

function pismo(o: { naslov: string; uvod: string; koda: string; opomba: string }) {
  return `<!doctype html>
<html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(o.naslov)}</title>
<style>
body{margin:0;padding:0;background:#f3f4f2;-webkit-text-size-adjust:100%}
@media (prefers-color-scheme:dark){
 body,.ozadje{background:#0e100f!important}
 .kartica{background:#171a19!important;border-color:#262b29!important}
 .naslov,.koda{color:#f2f5f3!important}
 .besedilo{color:#a9b2ad!important}
 .okvir{background:#1f2422!important}
 .noga,.noga a{color:#76807a!important}
 .svetlo{display:none!important}
 .temno{display:block!important}
}
@media (max-width:480px){.kartica{padding:30px 22px 28px!important}.koda{font-size:31px!important;letter-spacing:9px!important;padding-left:9px!important}}
</style></head>
<body style="margin:0;padding:0;background:#f3f4f2">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${esc(o.koda)} · ${esc(o.naslov)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ozadje" style="background:#f3f4f2">
<tr><td align="center" style="padding:44px 16px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 6px 24px">
<img class="svetlo" src="${PORTAL}/ikone/eposta-logo.png" width="150" alt="SmartClean" style="display:block;border:0;outline:none;width:150px;height:auto">
<img class="temno" src="${PORTAL}/ikone/eposta-logo-temno.png" width="150" alt="SmartClean" style="display:none;mso-hide:all;border:0;outline:none;width:150px;height:auto">
</td></tr>
<tr><td class="kartica" style="background:#ffffff;border:1px solid #e5e8e6;border-radius:20px;padding:40px 40px 34px">
<h1 class="naslov" style="margin:0 0 12px;font-family:${PISAVA};font-size:22px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:#0d1f17">${esc(o.naslov)}</h1>
<p class="besedilo" style="margin:0 0 26px;font-family:${PISAVA};font-size:15px;line-height:1.6;color:#55605a">${o.uvod}</p>
<div class="okvir" style="background:#f2f4f3;border-radius:14px;padding:24px 12px;text-align:center">
<span class="koda" style="display:inline-block;font-family:${PISAVA};font-size:36px;line-height:1;font-weight:600;letter-spacing:12px;padding-left:12px;color:#0d1f17;font-variant-numeric:tabular-nums">${esc(o.koda)}</span>
</div>
<p class="besedilo" style="margin:22px 0 0;font-family:${PISAVA};font-size:13px;line-height:1.6;color:#7a847e">${esc(o.opomba)}</p>
</td></tr>
<tr><td class="noga" style="padding:22px 6px 0;font-family:${PISAVA};font-size:12px;line-height:1.7;color:#8a928d">SmartClean · Peremo, vi pa blestite.<br><a href="${PORTAL}" style="color:#8a928d;text-decoration:underline">portal.smartclean.si</a></td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function poslji(komu: string, zadeva: string, html: string, besedilo: string): Promise<{ napaka?: string; koda?: string }> {
  const kljuc = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!kljuc) return { napaka: "E-pošta še ni nastavljena. Sporočite skrbniku portala.", koda: "NI_EPOSTE" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + kljuc, "Content-Type": "application/json" },
    body: JSON.stringify({ from: OD, to: [komu], reply_to: ODGOVOR_NA, subject: zadeva, html, text: besedilo }),
  });
  if (!r.ok) {
    console.error("Resend", r.status, await r.text());
    return { napaka: "Sporočila ni bilo mogoče poslati. Poskusite znova čez minuto." };
  }
  return {};
}

function pismoRegistracija(ime: string, otp: string) {
  const naslov = "Potrdite e-poštni naslov";
  const prvo = ime.split(" ")[0];
  return {
    zadeva: `${otp} je vaša koda za SmartClean`,
    html: pismo({ naslov, uvod: `Pozdravljeni, ${esc(prvo)}. Za dokončanje registracije v portal SmartClean vpišite to kodo:`, koda: otp,
      opomba: "Koda velja 15 minut. Če se niste registrirali vi, sporočilo prezrite — brez kode računa ni." }),
    besedilo: `${naslov}\n\nPozdravljeni, ${prvo}. Za dokončanje registracije v portal SmartClean vpišite to kodo:\n\n${otp}\n\nKoda velja 15 minut. Če se niste registrirali vi, sporočilo prezrite.\n\nSmartClean · ${PORTAL}`,
  };
}
function pismoGeslo(otp: string) {
  const naslov = "Nastavite novo geslo";
  return {
    zadeva: `${otp} je vaša koda za novo geslo`,
    html: pismo({ naslov, uvod: "Za nastavitev novega gesla v portalu SmartClean vpišite to kodo:", koda: otp,
      opomba: "Koda velja 15 minut. Če gesla niste želeli spremeniti, sporočilo prezrite — geslo ostane enako." }),
    besedilo: `${naslov}\n\nZa nastavitev novega gesla v portalu SmartClean vpišite to kodo:\n\n${otp}\n\nKoda velja 15 minut. Če gesla niste želeli spremeniti, sporočilo prezrite.\n\nSmartClean · ${PORTAL}`,
  };
}

// ── koda iz e-pošte: preverjanje atomarno v bazi (reg_poskus: zaklep vrstice, 5 poskusov na kodo, 10 napak na naslov v 24 h) ──
async function preveriKodo(email: string, namen: "registracija" | "geslo", otp: string) {
  const hash = /^\d{6}$/.test(otp) ? await zgosti(otp + ":" + email) : "-";
  const { data: r, error } = await admin.rpc("reg_poskus", { p_email: email, p_namen: namen, p_hash: hash });
  if (error) throw error;
  if (r?.ok) return { z: r as { id: string; ime: string | null; povabilo_id: string | null } };
  const n = String(r?.napaka ?? "ni");
  if (n === "koda") return { napaka: "Koda ni pravilna.", status: 400 };
  if (n === "poteklo") return { napaka: "Koda je potekla. Zahtevajte novo.", status: 410 };
  if (n === "poskusi") return { napaka: "Preveč napačnih poskusov. Zahtevajte novo kodo.", status: 429 };
  if (n === "zaklenjeno") return { napaka: "Preveč napačnih poskusov. Poskusite jutri.", status: 429 };
  return { napaka: "Koda ni več veljavna. Zahtevajte novo.", status: 410 };
}

// nova koda (zapis zamenja prejšnjega) in pismo; ob napaki pošiljanja zapis odstrani
async function novaKoda(o: { namen: "registracija" | "geslo"; email: string; ime?: string | null; povabilo_id?: string | null }): Promise<{ napaka?: string; koda?: string }> {
  const otp = sestMestna();
  await admin.from("eposta_kode").delete().eq("email", o.email).eq("namen", o.namen);
  const { data: zap, error } = await admin.from("eposta_kode").insert({
    namen: o.namen, email: o.email, ime: o.ime ?? null, povabilo_id: o.povabilo_id ?? null,
    koda_hash: await zgosti(otp + ":" + o.email), velja_do: new Date(Date.now() + 15 * MINUTA).toISOString(),
  }).select("id").single();
  if (error) throw error;
  const p = o.namen === "registracija" ? pismoRegistracija(o.ime ?? "", otp) : pismoGeslo(otp);
  const r = await poslji(o.email, p.zadeva, p.html, p.besedilo);
  if (r.napaka) { await admin.from("eposta_kode").delete().eq("id", zap.id); return r; }
  return {};
}
// največ 5 kod na uro na naslov in ne pogosteje kot na minuto
async function prepogosto(email: string) {
  if (await omejeno("koda:" + email, 1, 1)) return "Novo kodo lahko zahtevate čez minuto.";
  if (await omejeno("koda:" + email, 5, 60)) return "Na ta naslov smo poslali že več kod. Poskusite čez eno uro.";
  return null;
}

async function obravnavaj(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return odgovor({ napaka: "Napačna metoda." }, 405);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "?";
  let telo: Record<string, unknown>;
  try { telo = await req.json(); } catch { return odgovor({ napaka: "Neveljaven zahtevek." }, 400); }
  const dejanje = String(telo.dejanje ?? "");
  if (Math.random() < 0.05) await pocisti();

  // ── preveri kodo povabila (50 bitov: omejitev po IP je le proti hrupu) ──
  if (dejanje === "preveri") {
    if (await omejeno("koda-napaka:" + ip, 60, 15)) return odgovor({ napaka: "Preveč poskusov. Poskusite čez nekaj minut." }, 429);
    const k = normKoda(telo.koda);
    if (!KODA_OK.test(k)) { await zabelezi("koda-napaka:" + ip); return odgovor({ napaka: "Koda ni veljavna." }, 400); }
    const pv = await povabilo({ koda: k });
    if (!pv.p) { if (pv.status === 404) await zabelezi("koda-napaka:" + ip); return odgovor({ napaka: pv.napaka }, pv.status); }
    return odgovor({ ok: true, vloga: pv.p.vloga, vlogaIme: VLOGE[pv.p.vloga], stranka: await imeStranke(pv.p.org_id), velja_do: pv.p.velja_do });
  }

  // ── začni registracijo: podatki → koda po e-pošti ─────────────────
  if (dejanje === "zacni") {
    const k = normKoda(telo.koda), email = normEmail(telo.email), geslo = String(telo.geslo ?? "");
    const ime = String(telo.ime ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
    if (!KODA_OK.test(k)) return odgovor({ napaka: "Koda ni veljavna." }, 400);
    if (ime.length < 2) return odgovor({ napaka: "Vpišite ime in priimek.", polje: "ime" }, 400);
    if (!emailOk(email)) return odgovor({ napaka: "E-naslov ni veljaven.", polje: "email" }, 400);
    const gn = gesloNapaka(geslo); if (gn) return odgovor({ napaka: gn, polje: "geslo" }, 400);
    if (await omejeno("zacni:" + ip, 20, 60)) return odgovor({ napaka: "Preveč poskusov. Poskusite čez eno uro." }, 429);
    await zabelezi("zacni:" + ip);
    const pv = await povabilo({ koda: k });
    if (!pv.p) return odgovor({ napaka: pv.napaka }, pv.status);
    if (await omejeno("zacni-pov:" + pv.p.id, 10, 60)) return odgovor({ napaka: "Preveč poskusov s tem povabilom. Poskusite čez eno uro." }, 429);
    await zabelezi("zacni-pov:" + pv.p.id);
    const { data: obst, error: oErr } = await admin.rpc("reg_uporabnik", { p_email: email });
    if (oErr) throw oErr;
    if (obst) return odgovor({ napaka: "Račun s tem e-naslovom že obstaja. Prijavite se ali uporabite »Pozabljeno geslo«.", polje: "email" }, 409);
    const pre = await prepogosto(email); if (pre) return odgovor({ napaka: pre }, 429);
    const r = await novaKoda({ namen: "registracija", email, ime, povabilo_id: pv.p.id });
    if (r.napaka) return odgovor(r, r.koda === "NI_EPOSTE" ? 503 : 502);
    await zabelezi("koda:" + email);
    return odgovor({ ok: true });
  }

  // ── nova koda za isto registracijo ────────────────────────────────
  if (dejanje === "znova") {
    const email = normEmail(telo.email);
    const { data: z } = await admin.from("eposta_kode").select("ime,povabilo_id").eq("email", email).eq("namen", "registracija")
      .order("ustvarjeno", { ascending: false }).limit(1).maybeSingle();
    if (!z) return odgovor({ napaka: "Registracija ni več odprta. Začnite znova." }, 410);
    const pv = await povabilo({ id: z.povabilo_id }); if (!pv.p) return odgovor({ napaka: pv.napaka }, pv.status);
    const pre = await prepogosto(email); if (pre) return odgovor({ napaka: pre }, 429);
    const r = await novaKoda({ namen: "registracija", email, ime: z.ime, povabilo_id: z.povabilo_id });
    if (r.napaka) return odgovor(r, r.koda === "NI_EPOSTE" ? 503 : 502);
    await zabelezi("koda:" + email);
    return odgovor({ ok: true });
  }

  // ── potrdi kodo iz e-pošte → račun z vlogo iz povabila ────────────
  // Račun nastane zaklenjen (ban), reg_dokoncaj v eni transakciji porabi povabilo ter nastavi pravice in stranko,
  // šele nato se odklene. Če se klic prekine vmes, ga ponovitev z isto kodo nadaljuje (user_metadata.povabilo).
  if (dejanje === "potrdi") {
    const email = normEmail(telo.email), otp = String(telo.koda ?? "").replace(/\D/g, ""), geslo = String(telo.geslo ?? "");
    const gn = gesloNapaka(geslo); if (gn) return odgovor({ napaka: gn, polje: "geslo" }, 400);
    const pk = await preveriKodo(email, "registracija", otp);
    if (!pk.z) return odgovor({ napaka: pk.napaka }, pk.status);
    const z = pk.z;
    if (!z.povabilo_id) return odgovor({ napaka: "Koda ni več veljavna. Zahtevajte novo." }, 410);
    const pv = await povabilo({ id: z.povabilo_id }); if (!pv.p) return odgovor({ napaka: pv.napaka }, pv.status);

    let uid = "", nov = true;
    const { data: ust, error: nErr } = await admin.auth.admin.createUser({
      email, password: geslo, email_confirm: true, ban_duration: "876000h", user_metadata: { full_name: z.ime, povabilo: z.povabilo_id },
    });
    if (nErr) {
      const sib = sibkoGeslo(nErr as never); if (sib) return odgovor({ napaka: sib, polje: "geslo" }, 400);
      if (!/already|registered|exists/i.test(nErr.message)) throw nErr;
      // že obstaja: nadaljuj le nedokončano registracijo z istim povabilom
      const { data: u0 } = await admin.rpc("reg_uporabnik", { p_email: email });
      const { data: g } = u0?.id ? await admin.auth.admin.getUserById(u0.id) : { data: null };
      const zaklenjen = !!(g?.user as { banned_until?: string } | undefined)?.banned_until;   // nedokončan = še zaklenjen
      if (!g?.user || g.user.user_metadata?.povabilo !== z.povabilo_id || !zaklenjen) {
        return odgovor({ napaka: "Račun s tem e-naslovom že obstaja.", polje: "email" }, 409);
      }
      uid = g.user.id; nov = false;
      const { error: pwErr } = await admin.auth.admin.updateUserById(uid, { password: geslo });
      if (pwErr) { const sib2 = sibkoGeslo(pwErr as never); if (sib2) return odgovor({ napaka: sib2, polje: "geslo" }, 400); throw pwErr; }
    } else uid = ust.user.id;

    const { data: dok, error: dErr } = await admin.rpc("reg_dokoncaj", { p_povabilo: z.povabilo_id, p_user: uid, p_ime: z.ime });
    if (dErr || !dok?.ok) {
      if (nov) { const { error: xErr } = await admin.auth.admin.deleteUser(uid); if (xErr) console.error("brisanje računa", xErr); }
      if (dErr) throw dErr;
      return odgovor({ napaka: dok?.napaka === "ustvarjalec" ? "Povabilo ni več veljavno. Prosite za novo." : "Povabilo ni več veljavno." }, 410);
    }
    const { error: oErr } = await admin.auth.admin.updateUserById(uid, { ban_duration: "none" });
    if (oErr) throw oErr;
    await admin.from("eposta_kode").delete().eq("email", email).eq("namen", "registracija");

    // obvestilo v portalu: kdor je povabil, in lastnik
    try {
      const vloga = String(dok.vloga);
      const stranka = vloga === "stranka" ? await imeStranke(dok.org) : null;
      const { data: lastnik } = await admin.from("profiles").select("id").ilike("email", LASTNIK).maybeSingle();
      const komu = [...new Set([dok.ustvaril, lastnik?.id].filter(Boolean))];
      if (komu.length) {
        await admin.from("obvestila").insert(komu.map((id) => ({
          naslov: "Nov uporabnik", sporocilo: (z.ime ?? email) + " · " + VLOGE[vloga] + (stranka ? " · " + stranka : "") + " — registracija s povabilom.", prejemnik: id, tip: "toast",
        })));
      }
    } catch (e) { console.error("obvestilo", e); }
    return odgovor({ ok: true });
  }

  // ── pozabljeno geslo: koda po e-pošti (ne izdamo, ali račun obstaja) ──
  if (dejanje === "pozabljeno") {
    const email = normEmail(telo.email);
    if (!emailOk(email)) return odgovor({ napaka: "E-naslov ni veljaven." }, 400);
    if (!Deno.env.get("RESEND_API_KEY")) return odgovor({ napaka: "E-pošta še ni nastavljena. Sporočite skrbniku portala.", koda: "NI_EPOSTE" }, 503);
    if (await omejeno("pozabljeno:" + ip, 20, 60)) return odgovor({ napaka: "Preveč poskusov. Poskusite čez eno uro." }, 429);
    await zabelezi("pozabljeno:" + ip);
    // omejitev na naslov velja enako za vse naslove (obstoječe in neobstoječe): odgovor ne izda, ali račun obstaja
    const pre = await prepogosto(email); if (pre) return odgovor({ napaka: pre }, 429);
    await zabelezi("koda:" + email);
    const { data: u, error } = await admin.rpc("reg_uporabnik", { p_email: email });
    if (error) throw error;
    if (u && u.potrjen && u.aktiven) {
      const p = novaKoda({ namen: "geslo", email }).then((r) => { if (r.napaka) console.error("pozabljeno", r.napaka); });
      const caka = vOzadju(p); if (caka) await caka;
    }
    return odgovor({ ok: true });
  }

  // ── novo geslo s kodo ─────────────────────────────────────────────
  if (dejanje === "ponastavi") {
    const email = normEmail(telo.email), otp = String(telo.koda ?? "").replace(/\D/g, ""), geslo = String(telo.geslo ?? "");
    const gn = gesloNapaka(geslo); if (gn) return odgovor({ napaka: gn, polje: "geslo" }, 400);
    const pk = await preveriKodo(email, "geslo", otp);
    if (!pk.z) return odgovor({ napaka: pk.napaka }, pk.status);
    const { data: u, error } = await admin.rpc("reg_uporabnik", { p_email: email });
    if (error) throw error;
    if (!u || !u.aktiven) return odgovor({ napaka: "Račun ni več aktiven." }, 410);
    const { error: gErr } = await admin.auth.admin.updateUserById(u.id, { password: geslo });
    if (gErr) { const sib = sibkoGeslo(gErr as never); if (sib) return odgovor({ napaka: sib, polje: "geslo" }, 400); throw gErr; }
    await admin.from("eposta_kode").delete().eq("email", email).eq("namen", "geslo");
    const { error: sErr } = await admin.rpc("reg_odjavi", { p_user: u.id });   // seje na drugih napravah (tudi napadalčeve) ne veljajo več
    if (sErr) console.error("odjava sej", sErr);
    return odgovor({ ok: true });
  }

  return odgovor({ napaka: "Neznano dejanje." }, 400);
}
