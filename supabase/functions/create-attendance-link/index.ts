// @ts-self-types="./types.d.ts"

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ============================================================
// create-attendance-link
// Admin-only edge function that creates the intermediate link.
// The raw token is generated on the server, only its SHA-256
// hash is searchable in the DB, and the raw value is stored
// AES-256-GCM encrypted with LINKS_TOKEN_KEY (a Supabase Secret)
// so the dashboard can later decrypt it for Copy / QR features.
// ============================================================

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

export function isValidOriginalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function generateToken(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join("");
}

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`elg:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function b64encode(data: ArrayBuffer | Uint8Array): string {
  let binary = "";
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function b64decode(s: string): Uint8Array {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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
    ["encrypt", "decrypt"],
  );
}

export async function encryptToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getAesKey();
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(token),
  );
  return `${b64encode(iv)}.${b64encode(cipher)}`;
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

function durationToExpiry(duration: string): string | null {
  const now = Date.now();
  switch (duration) {
    case "1h": return new Date(now + 60 * 60 * 1000).toISOString();
    case "1d": return new Date(now + 24 * 60 * 60 * 1000).toISOString();
    case "3d": return new Date(now + 3 * 24 * 60 * 60 * 1000).toISOString();
    case "1w": return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    case "never": return null;
    default: return null;
  }
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

  let body: {
    employee_id?: unknown;
    workplace_id?: unknown;
    original_url?: unknown;
    link_type?: unknown;
    duration?: unknown;
    max_usage_count?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const employeeId = typeof body.employee_id === "string" ? body.employee_id : "";
  const workplaceId = typeof body.workplace_id === "string" ? body.workplace_id : "";
  const originalUrl = typeof body.original_url === "string" ? body.original_url.trim() : "";
  const linkType = body.link_type === "multi_use" ? "multi_use" : "single_use";
  const duration = typeof body.duration === "string" ? body.duration : "1d";
  const maxUsage =
    typeof body.max_usage_count === "number" && body.max_usage_count > 0
      ? Math.floor(body.max_usage_count)
      : null;

  if (!employeeId || !workplaceId) {
    return json({ error: "missing_fields" }, 400);
  }
  if (!isValidOriginalUrl(originalUrl)) {
    return json({ error: "invalid_original_url", message: "الرابط الأصلي يجب أن يكون HTTPS صالحًا." }, 400);
  }

  const token = generateToken();
  const tokenHash = await hashToken(token);
  let encrypted: string;
  try {
    encrypted = await encryptToken(token);
  } catch (err) {
    console.error("encryption failed", err);
    return json({ error: "encryption_failed" }, 500);
  }

  const { data, error } = await supabase
    .from("attendance_links")
    .insert({
      employee_id: employeeId,
      workplace_id: workplaceId,
      token_hash: tokenHash,
      token_value_encrypted: encrypted,
      original_url: originalUrl,
      link_type: linkType,
      expires_at: durationToExpiry(duration),
      usage_count: 0,
      max_usage_count: maxUsage,
      status: "active",
    })
    .select("id, token_hash, original_url, link_type, expires_at, usage_count, max_usage_count, status")
    .single();

  if (error) {
    console.error("insert link error", error);
    return json({ error: "insert_failed" }, 500);
  }

  return json({ token, id: data.id }, 200);
});