// ════════════════════════════════════════════════════════════════════════
//  Supabase Edge Function: webauthn
//  Pravi strežniški WebAuthn / passkey (registracija + prijava).
//  Podpis preveri STREŽNIK; ob uspešni prijavi izda Supabase sejo (magiclink
//  token_hash), ki jo odjemalec unovči z verifyOtp. Neodvisno od localStorage.
//
//  Deploy:
//    supabase functions deploy webauthn --no-verify-jwt
//    (RLS/tabele: najprej poženi 47_webauthn.sql)
//  Okoljske spremenljivke (samodejno na voljo v Edge Functions):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ════════════════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "https://esm.sh/@simplewebauthn/server@9.0.3";
import { isoBase64URL } from "https://esm.sh/@simplewebauthn/server@9.0.3/helpers";

const RP_ID = "portal.smartclean.si";
const ORIGIN = "https://portal.smartclean.si";
const RP_NAME = "SmartClean";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
function rndHandle() { return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""); }

// Uporabnik iz Authorization JWT (za registracijo — oseba je prijavljena z geslom)
async function userFromReq(req: Request) {
  const authz = req.headers.get("Authorization") || "";
  const jwt = authz.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  return data?.user || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode as string;

    // ── REGISTRACIJA (oseba je prijavljena) ──────────────────────────────
    if (mode === "reg-begin") {
      const user = await userFromReq(req);
      if (!user) return json({ error: "Ni prijave." }, 401);
      const { data: obst } = await admin.from("webauthn_credentials").select("credential_id,transports").eq("user_id", user.id);
      const opts = await generateRegistrationOptions({
        rpName: RP_NAME, rpID: RP_ID,
        userID: user.id, userName: user.email || user.id, userDisplayName: user.email || "Uporabnik",
        attestationType: "none",
        excludeCredentials: (obst || []).map((c: any) => ({ id: isoBase64URL.toBuffer(c.credential_id), type: "public-key", transports: c.transports || undefined })),
        authenticatorSelection: { residentKey: "required", userVerification: "required" },
      });
      const handle = rndHandle();
      await admin.from("webauthn_challenges").insert({ handle, user_id: user.id, challenge: opts.challenge, purpose: "register" });
      return json({ options: opts, handle });
    }

    if (mode === "reg-finish") {
      const user = await userFromReq(req);
      if (!user) return json({ error: "Ni prijave." }, 401);
      const { handle, response, label } = body;
      const { data: ch } = await admin.from("webauthn_challenges").select("*").eq("handle", handle).maybeSingle();
      if (!ch || ch.user_id !== user.id || ch.purpose !== "register") return json({ error: "Neveljaven izziv." }, 400);
      const ver = await verifyRegistrationResponse({
        response, expectedChallenge: ch.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
      });
      await admin.from("webauthn_challenges").delete().eq("handle", handle);
      if (!ver.verified || !ver.registrationInfo) return json({ error: "Registracija ni uspela." }, 400);
      const info = ver.registrationInfo;
      await admin.from("webauthn_credentials").upsert({
        credential_id: isoBase64URL.fromBuffer(info.credentialID),
        user_id: user.id,
        public_key: isoBase64URL.fromBuffer(info.credentialPublicKey),
        counter: info.counter,
        transports: (response.response?.transports) || null,
        device_label: label || null,
        last_used_at: new Date().toISOString(),
      });
      return json({ ok: true });
    }

    // ── PRIJAVA (oseba NI prijavljena) ───────────────────────────────────
    if (mode === "auth-begin") {
      // Če odjemalec pove e-naslov (tapnjen profil), ponudi SAMO passkeye tega
      // uporabnika (allowCredentials). Tako brskalnik/iCloud ne ponudi napačnega
      // (starega) passkeyja — kar je bil vzrok za »podpis zavrnjen« po Touch ID.
      const email = (body.email || "").toString().trim().toLowerCase();
      let allowCredentials: any = undefined;
      let ubID: string | null = null;
      if (email) {
        const { data: prof } = await admin.from("profiles").select("id").eq("email", email).maybeSingle();
        if (prof?.id) {
          ubID = prof.id;
          const { data: creds } = await admin.from("webauthn_credentials").select("credential_id,transports").eq("user_id", prof.id);
          if (creds && creds.length) {
            allowCredentials = creds.map((c: any) => ({ id: isoBase64URL.toBuffer(c.credential_id), type: "public-key", transports: c.transports || undefined }));
          }
        }
      }
      const opts = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "required", allowCredentials });
      const handle = rndHandle();
      await admin.from("webauthn_challenges").insert({ handle, user_id: ubID, challenge: opts.challenge, purpose: "auth" });
      return json({ options: opts, handle });
    }

    if (mode === "auth-finish") {
      const { handle, response } = body;
      const { data: ch } = await admin.from("webauthn_challenges").select("*").eq("handle", handle).maybeSingle();
      if (!ch || ch.purpose !== "auth") return json({ error: "Neveljaven izziv." }, 400);
      const { data: cred } = await admin.from("webauthn_credentials").select("*").eq("credential_id", response.id).maybeSingle();
      if (!cred) { await admin.from("webauthn_challenges").delete().eq("handle", handle); return json({ error: "Passkey ni znan." }, 400); }
      const ver = await verifyAuthenticationResponse({
        response, expectedChallenge: ch.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true,
        authenticator: {
          credentialID: isoBase64URL.toBuffer(cred.credential_id),
          credentialPublicKey: isoBase64URL.toBuffer(cred.public_key),
          counter: Number(cred.counter) || 0,
        },
      });
      await admin.from("webauthn_challenges").delete().eq("handle", handle);
      if (!ver.verified) return json({ error: "Podpis ni veljaven." }, 400);
      await admin.from("webauthn_credentials").update({ counter: ver.authenticationInfo.newCounter, last_used_at: new Date().toISOString() }).eq("credential_id", cred.credential_id);
      // Izdaj sejo: pridobi e-naslov uporabnika in ustvari magiclink token_hash.
      const { data: u } = await admin.auth.admin.getUserById(cred.user_id);
      const email = u?.user?.email;
      if (!email) return json({ error: "Uporabnik nima e-naslova." }, 400);
      const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
      if (lerr || !link?.properties?.hashed_token) return json({ error: "Seje ni bilo mogoče izdati." }, 500);
      return json({ token_hash: link.properties.hashed_token, email });
    }

    return json({ error: "Neznan način." }, 400);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
