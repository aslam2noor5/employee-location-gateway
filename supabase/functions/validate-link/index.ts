// @ts-self-types="./types.d.ts"

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ============================================================
// validate-link
// Lightweight token pre-check used by the public /check/:token
// page BEFORE requesting geolocation. Returns only whether the
// link is usable; never returns the original_url.
// ============================================================

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`elg:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length < 8 || token.length > 128) {
    return json({ valid: false, reason: "invalid_link" }, 200);
  }

  const tokenHash = await hashToken(token);

  const { data: link, error } = await supabase
    .from("attendance_links")
    .select(
      "id, employee_id, workplace_id, link_type, expires_at, usage_count, max_usage_count, status",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    console.error("validate-link lookup error", error);
    return json({ valid: false, reason: "error" }, 500);
  }

  if (!link) {
    return json({ valid: false, reason: "invalid_link" }, 200);
  }

  if (link.status === "disabled") {
    return json({ valid: false, reason: "disabled_link" }, 200);
  }

  if (link.status === "used") {
    return json({ valid: false, reason: "already_used" }, 200);
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return json({ valid: false, reason: "expired_link" }, 200);
  }

  if (
    link.max_usage_count !== null &&
    link.usage_count >= link.max_usage_count
  ) {
    return json({ valid: false, reason: "already_used" }, 200);
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, name, status")
    .eq("id", link.employee_id)
    .maybeSingle();

  if (!employee || employee.status !== "active") {
    return json({ valid: false, reason: "disabled_link" }, 200);
  }

  const { data: workplace } = await supabase
    .from("workplaces")
    .select("id, status")
    .eq("id", link.workplace_id)
    .maybeSingle();

  if (!workplace || workplace.status !== "active") {
    return json({ valid: false, reason: "disabled_link" }, 200);
  }

  return json({
    valid: true,
    message: "الرابط صالح",
    employee_name: employee.name,
    workplace_id: link.workplace_id,
    link_type: link.link_type,
    usage_count: link.usage_count,
  }, 200);
});