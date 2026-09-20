// ═══════════════════════════════════════════════════════════════════════════
// Edge Function: odprte-izmene
// Vrne seznam zaposlenih, ki so še „prijavljeni" (zadnji dogodek = prihod).
// Zaščiteno s skrivnostjo (header x-report-secret) — kliče jo razporejeno
// opravilo ob 23h za obvestilo o pozabljenih odjavah.
//
// Objavi z IZKLOPLJENIM "Verify JWT". V nastavitvah funkcije (Secrets) dodaj:
//   REPORT_SECRET = <nastavi v Supabase → Edge Functions → Secrets>
//   (prava vrednost NE sodi v izvorno kodo — repozitorij je javen)
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-report-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = req.headers.get("x-report-secret") || "";
  const pricakovan = Deno.env.get("REPORT_SECRET") || "";
  if (!pricakovan || secret !== pricakovan) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data, error } = await sb.rpc("odprte_izmene");
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true, odprte: data || [] });
});
