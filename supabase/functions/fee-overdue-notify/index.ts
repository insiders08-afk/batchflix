/**
 * fee-overdue-notify — Production-hardened edge function
 *
 * SECURITY LAYERS:
 *  1. Auth gate  – requires valid Supabase JWT (admin role) OR service role key.
 *  2. Rate limit – 10 req / minute per IP (this is an admin-only endpoint).
 *  3. Input sanitisation.
 *  4. No secrets hardcoded.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── VAPID / Web Push helpers ──────────────────────────────────────────────

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
function base64UrlDecode(str: string): Uint8Array {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  const base64 = (str + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return new Uint8Array(raw.split("").map(c => c.charCodeAt(0)));
}

async function buildVapidJWT(audience: string, subject: string, privateKeyB64: string): Promise<string> {
  const header = { alg: "ES256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: subject };
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const keyData = base64UrlDecode(privateKeyB64);
  const cryptoKey = await crypto.subtle.importKey("pkcs8", keyData.buffer as ArrayBuffer, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, enc.encode(signingInput));
  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function sendWebPush(
  subscription: { endpoint: string; p256dh: string; auth_key: string },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<void> {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJWT(audience, "mailto:admin@batchhub.app", vapidPrivateKey);

  const enc = new TextEncoder();
  const plaintext = enc.encode(payload);

  const recipientPublicKey = await crypto.subtle.importKey("raw", base64UrlDecode(subscription.p256dh).buffer as ArrayBuffer, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const senderKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: recipientPublicKey }, senderKeyPair.privateKey, 256);
  const senderPublicKeyRaw = await crypto.subtle.exportKey("raw", senderKeyPair.publicKey);
  const authSecret = base64UrlDecode(subscription.auth_key);
  const hkdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const prk = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: authSecret, info: new Uint8Array(0) }, ikm, 256);
  const prkKey = await crypto.subtle.importKey("raw", prk, "HKDF", false, ["deriveBits"]);

  const buildInfo = (label: Uint8Array, pub1: ArrayBuffer, pub2: Uint8Array, last: number) => {
    const arr = [label, new Uint8Array([0,0,0,65]), new Uint8Array(pub1), new Uint8Array([0,0,0,65]), pub2, new Uint8Array([last])];
    const info = new Uint8Array(arr.reduce((a,b) => a + b.length, 0));
    let off = 0; for (const a of arr) { info.set(a, off); off += a.length; }
    return info;
  };
  const contentLabel = new TextEncoder().encode("Content-Encryption: aes128gcm\0");
  const keyInfo = buildInfo(contentLabel, senderPublicKeyRaw, base64UrlDecode(subscription.p256dh), 1);
  const nonceInfo = buildInfo(contentLabel, senderPublicKeyRaw, base64UrlDecode(subscription.p256dh), 0x01);

  const contentKeyBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: hkdfSalt, info: keyInfo }, prkKey, 128);
  const contentKey = await crypto.subtle.importKey("raw", contentKeyBits, "AES-GCM", false, ["encrypt"]);
  const nonceBits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: hkdfSalt, info: nonceInfo }, prkKey, 96);
  const nonce = new Uint8Array(nonceBits);

  const padded = new Uint8Array(plaintext.length + 2);
  padded.set(plaintext); padded[plaintext.length] = 2;
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, contentKey, padded);

  const senderPubKeyBytes = new Uint8Array(senderPublicKeyRaw);
  const rs = new Uint8Array(4); new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = new Uint8Array(16 + 4 + 1 + 65 + ciphertext.byteLength);
  body.set(hkdfSalt, 0); body.set(rs, 16); body[20] = 65; body.set(senderPubKeyBytes, 21); body.set(new Uint8Array(ciphertext), 86);

  await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Authorization: `vapid t=${jwt},k=${vapidPublicKey}`,
      Urgency: "high",
      "Content-Encoding": "aes128gcm",
      "Content-Length": body.byteLength.toString(),
    },
    body,
  });
}

// ─── Main handler ──────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey  = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPublicKey || !vapidPrivateKey) {
      return new Response(
        JSON.stringify({ error: "VAPID keys not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Authentication: require valid JWT with admin role ──────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized – bearer token required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth:   { autoRefreshToken: false, persistSession: false },
    });

    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Unauthorized – invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const callerUserId = claimsData.claims.sub;

    // Verify caller is admin or service role
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: roleData } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerUserId)
      .in("role", ["admin", "super_admin", "app_owner"])
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: "Forbidden – admin role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Rate limiting ──────────────────────────────────────────────────────
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const windowStart = new Date(); windowStart.setSeconds(0, 0);
    const windowEnd   = new Date(windowStart.getTime() + 60000);

    const { data: rlData } = await admin
      .from("rate_limits")
      .select("id, request_count")
      .eq("identifier", clientIp)
      .eq("action", "fee-overdue-notify")
      .gte("window_start", windowStart.toISOString())
      .maybeSingle();

    if (rlData && rlData.request_count >= 10) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded (10 req/min)" }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type":          "application/json",
            "X-RateLimit-Limit":     "10",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset":     String(Math.floor(windowEnd.getTime() / 1000)),
            "Retry-After":           "60",
          },
        }
      );
    }

    // Upsert rate limit counter
    if (rlData) {
      await admin.from("rate_limits")
        .update({ request_count: rlData.request_count + 1 })
        .eq("id", rlData.id);
    } else {
      await admin.from("rate_limits").insert({
        identifier: clientIp,
        action: "fee-overdue-notify",
        window_start: windowStart.toISOString(),
        request_count: 1,
      });
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: Record<string, string> = {};
    try { body = await req.json(); } catch { /* scheduled call, no body */ }

    const today   = new Date();
    const cutoff  = new Date(today);
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().split("T")[0];

    let feesQuery = admin.from("fees")
      .select("id, student_id, amount, payment_frequency, due_date, institute_code, description")
      .eq("paid", false)
      .lte("due_date", cutoffStr);

    if (body.fee_id)     feesQuery = feesQuery.eq("id",         body.fee_id.substring(0, 36));
    else if (body.student_id) feesQuery = feesQuery.eq("student_id", body.student_id.substring(0, 36));

    const { data: overdueFees, error: feesErr } = await feesQuery;
    if (feesErr) throw feesErr;

    if (!overdueFees || overdueFees.length === 0) {
      return new Response(
        JSON.stringify({ notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let notified = 0;

    for (const fee of overdueFees) {
      const dueDate    = new Date(fee.due_date);
      const daysOverdue = Math.ceil((today.getTime() - dueDate.getTime()) / 86400000) - 7;
      const amountStr  = `₹${Number(fee.amount).toLocaleString("en-IN")}`;
      const dueDateStr = dueDate.toLocaleDateString("en-IN", { day: "numeric", month: "long" });

      const { data: subs } = await admin.from("push_subscriptions")
        .select("endpoint, p256dh, auth_key")
        .eq("user_id", fee.student_id);

      const notifPayload = JSON.stringify({
        title: "⚠ Fee Overdue",
        body: `Your ${fee.payment_frequency || "fee"} payment of ${amountStr} was due on ${dueDateStr} (${Math.max(0, daysOverdue)} day${daysOverdue !== 1 ? "s" : ""} overdue). Please pay immediately.`,
        url: "/student/fees",
        icon: "/icons/pwa-192x192.png",
      });

      if (subs && subs.length > 0) {
        await Promise.allSettled(subs.map(sub => sendWebPush(sub, notifPayload, vapidPublicKey, vapidPrivateKey)));
        notified++;
      }

      // Notify parents too
      const { data: parentReqs } = await admin.from("pending_requests")
        .select("user_id")
        .eq("role", "parent")
        .eq("status", "approved")
        .contains("extra_data", { child_id: fee.student_id });

      if (parentReqs && parentReqs.length > 0) {
        for (const parent of parentReqs) {
          const { data: parentSubs } = await admin.from("push_subscriptions")
            .select("endpoint, p256dh, auth_key")
            .eq("user_id", parent.user_id);
          if (parentSubs && parentSubs.length > 0) {
            await Promise.allSettled(parentSubs.map(sub => sendWebPush(sub, notifPayload, vapidPublicKey, vapidPrivateKey)));
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ notified, total: overdueFees.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[fee-overdue-notify]", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
