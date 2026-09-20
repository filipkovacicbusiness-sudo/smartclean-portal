// ═══════════════════════════════════════════════════════════════════════════
// Edge Function: punch  — registracija prihoda/odhoda s kartico
// ═══════════════════════════════════════════════════════════════════════════
// Terminal (Raspberry Pi + čitalec ACR1252U) pošlje POST:
//   { terminal_id, card_token, nonce, hmac }
//
//   terminal_id = SLUG terminala (npr. "pralnica-vhod")
//   card_token  = skrivnost, prebrana s kartice (NE UID!)
//   nonce       = naključen niz, unikaten na vsak tap
//   hmac        = lowercase hex HMAC-SHA256
//
//   message = terminal_id + "." + card_token + "." + nonce
//   hmac    = HMAC_SHA256(key = att_terminals.secret, message)
//
// Funkcija:
//   1) poišče terminal po slugu, vzame secret,
//   2) preveri HMAC (ob neujemanju → { ok:false, error:"bad_hmac" }),
//   3) idempotenca: (terminal_id, nonce) že obstaja → { ok:false, error:"duplicate" },
//   4) poišče zaposlenega po employees.card_token → sicer { ok:false, error:"unknown_card" },
//   5) določi type (in/out) iz zadnjega dogodka zaposlenega,
//   6) zapiše att_events s STREŽNIŠKIM časom (ts = now()),
//   7) vse prek service_role (obide RLS).
//
// Uspeh: { ok:true, type:"in", employee_name:"Filip", ts:"2026-08-14T13:10:35Z" }
//
// POMEMBNO ob objavi: objavi z IZKLOPLJENIM "Verify JWT"
// (avtentikacija je prek HMAC, ne prek uporabniškega žetona).
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS — dovolimo apikey in x-client-info (sicer supabase-js ne pošlje zahteve)
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// HMAC-SHA256 → lowercase hex
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Časovno konstantna primerjava (prepreči timing napade)
function enakaVarno(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  // predlet (preflight)
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  // service_role odjemalec (obide RLS)
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // 0) preberi vhod
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }
  const terminal_id = String(body?.terminal_id || "");
  const card_token = String(body?.card_token || "");
  const nonce = String(body?.nonce || "");
  const hmac = String(body?.hmac || "").toLowerCase();
  if (!terminal_id || !card_token || !nonce || !hmac) {
    return json({ ok: false, error: "missing_fields" }, 400);
  }

  // 1) najdi terminal PO SLUGU + vzemi secret
  const t = await sb
    .from("att_terminals")
    .select("id, org_id, secret, active")
    .eq("slug", terminal_id)
    .maybeSingle();
  if (t.error) return json({ ok: false, error: "db_error" }, 500);
  if (!t.data || !t.data.active) return json({ ok: false, error: "unknown_terminal" }, 200);

  // 2) preveri HMAC:  message = terminal_id + "." + card_token + "." + nonce
  const pricakovan = await hmacHex(t.data.secret, `${terminal_id}.${card_token}.${nonce}`);
  if (!enakaVarno(pricakovan, hmac)) return json({ ok: false, error: "bad_hmac" }, 200);

  // 3) idempotenca — isti (terminal_id, nonce) že obstaja?
  const obstoj = await sb
    .from("att_events")
    .select("id")
    .eq("terminal_id", t.data.id)
    .eq("nonce", nonce)
    .maybeSingle();
  if (obstoj.error) return json({ ok: false, error: "db_error" }, 500);
  if (obstoj.data) return json({ ok: false, error: "duplicate" }, 200);

  // 4) najdi zaposlenega po card_token (mora biti v istem org-u kot terminal)
  const emp = await sb
    .from("employees")
    .select("id, org_id, ime, active")
    .eq("card_token", card_token)
    .maybeSingle();
  if (emp.error) return json({ ok: false, error: "db_error" }, 500);
  if (!emp.data || !emp.data.active || emp.data.org_id !== t.data.org_id) {
    return json({ ok: false, error: "unknown_card" }, 200);
  }

  // 5) določi type (in/out) iz zadnjega dogodka zaposlenega
  const zadnji = await sb
    .from("att_events")
    .select("type, ts")
    .eq("employee_id", emp.data.id)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 5a) varovalka: če je ista oseba tapnila pred manj kot 60 s, NE beleži
  //     (prepreči nehoteno prihod+odhod ob dvojnem prislonu iste kartice)
  const COOLDOWN_SEK = 60;
  if (zadnji.data && zadnji.data.ts) {
    const razmik = (Date.now() - new Date(zadnji.data.ts).getTime()) / 1000;
    if (razmik < COOLDOWN_SEK) {
      return json({
        ok: false,
        error: "too_soon",
        employee_name: emp.data.ime,
        last_type: zadnji.data.type,
      }, 200);
    }
  }

  const type = zadnji.data && zadnji.data.type === "in" ? "out" : "in";

  // 6) zapiši dogodek s STREŽNIŠKIM časom (ts privzeto now())
  const ins = await sb
    .from("att_events")
    .insert({
      org_id: t.data.org_id,
      employee_id: emp.data.id,
      terminal_id: t.data.id,
      type,
      source: "terminal",
      nonce,
    })
    .select("id, type, ts")
    .single();

  // dvojni tap v isti trenutek (unikatni indeks) → obravnavaj kot ponovitev
  if (ins.error) {
    if (String(ins.error.code) === "23505") return json({ ok: false, error: "duplicate" }, 200);
    return json({ ok: false, error: "insert_failed" }, 500);
  }

  return json({
    ok: true,
    type: ins.data.type,
    employee_name: emp.data.ime,
    ts: ins.data.ts,
  });
});
