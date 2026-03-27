// One-time utility: generates a VAPID key pair and returns them as base64url strings.
// Call this once, copy the output, add as secrets, then delete this function.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64UrlEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Generate P-256 ECDSA key pair for VAPID
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const privateKeyPkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

  const publicKeyB64 = base64UrlEncode(new Uint8Array(publicKeyRaw));
  const privateKeyB64 = base64UrlEncode(new Uint8Array(privateKeyPkcs8));

  return new Response(
    JSON.stringify({
      VAPID_PUBLIC_KEY: publicKeyB64,
      VAPID_PRIVATE_KEY: privateKeyB64,
      note: "Add these as secrets: VAPID_PUBLIC_KEY (also as VITE_VAPID_PUBLIC_KEY) and VAPID_PRIVATE_KEY",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
