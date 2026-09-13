// @ts-self-types="./types.d.ts"

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ============================================================
// get-link-token
// Admin-only. Decrypts the raw token for a link so the dashboard
// can offer "نسخ الرابط" and QR Code features. The raw token is
// never exposed outside an authenticated admin request.
// ============================================================

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function b64decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64encode(data: ArrayBuffer | Uint8Array): string {
  let binary = "";
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

async function getAesKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("LINKS_TOKEN_KEY") ?? "";
  if (!secret) throw new Error("LINKS_TOKEN_KEY is not set");
  const keyBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`elg-key:${secret}`),
  );
  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt", "encrypt"],
  );
}

export async function decryptToken(blob: string): Promise<string> {
  const key = await getAesKey();
  const [ivB64, cipherB64] = blob.split(".");
  if (!ivB64 || !cipherB64) throw new Error("invalid_encrypted_blob");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) },
    key,
    b64decode(cipherB64),
  );
  return new TextDecoder().decode(plain);
}

async function isAdminUser(authHeader: string | null): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const jwt = authHeader.slice(7);
  const { data } = await supabase.auth.getUser(jwt);
  if (!data.user) return false;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();
  return profile?.role === "admin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (!(await isAdminUser(req.headers.get("authorization")))) {
    return json({ error: "unauthorized" }, 403);
  }

  let body: { link_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const linkId = typeof body.link_id === "string" ? body.link_id : "";
  if (!linkId) return json({ error: "missing_link_id" }, 400);

  const { data, error } = await supabase
    .from("attendance_links")
    .select("id, token_value_encrypted, token_hash")
    .eq("id", linkId)
    .maybeSingle();

  if (error) {
    console.error("get-link-token lookup error", error);
    return json({ error: "lookup_failed" }, 500);
  }
  if (!data || !data.token_value_encrypted) {
    return json({ error: "not_found" }, 404);
  }

  try {
    const token = await decryptToken(data.token_value_encrypted);
    return json({ token }, 200);
  } catch (err) {
    console.error("decrypt failed", err);
    return json({ error: "decrypt_failed" }, 500);
  }
});