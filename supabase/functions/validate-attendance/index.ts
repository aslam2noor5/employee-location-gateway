// @ts-self-types="./types.d.ts"

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

// ============================================================
// Employee Location Gateway - Edge Function
// validate-attendance
//
// Receives:  token, latitude, longitude, accuracy, client_timestamp
// Validates server-side, computes distance (Haversine), stores the
// attendance record, and returns a safe result. A successful check-in
// consumes the link (single-use). Failed checks (low accuracy /
// outside when disallowed / invalid token) do NOT consume the link so
// the employee can retry with better GPS or a valid location.
// The original_url only ever comes from the database.
// ============================================================

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

// In-memory rate limiting: token -> timestamps[], ip -> attempts[]
const attemptsMap = new Map<string, number[]>();
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS_PER_WINDOW = 5;

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const list = (attemptsMap.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  attemptsMap.set(key, list);
  return list.length > MAX_ATTEMPTS_PER_WINDOW;
}

function recordTokenAttempt(tokenHash: string): void {
  const now = Date.now();
  const list = (attemptsMap.get(`token:${tokenHash}`) ?? []).filter(
    (t) => now - t < WINDOW_MS * 10,
  );
  list.push(now);
  attemptsMap.set(`token:${tokenHash}`, list);
}

interface ValidateBody {
  token?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
  client_timestamp?: unknown;
}

interface ValidateResult {
  success: boolean;
  message: string;
  status?: string;
  original_url?: string;
  attendance?: {
    id: string;
    distance_meters: number | null;
    attendance_status: string;
    verification_level: string | null;
    server_timestamp: string;
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Haversine distance in meters between two lat/lng points.
 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function verificationLevelFor(accuracy: number): "high" | "medium" | "low" {
  if (accuracy < 30) return "high";
  if (accuracy <= 100) return "medium";
  return "low";
}

function scrubRiskFlags(flags: string[]): string[] {
  const safe = new Set([
    "high_accuracy_uncertainty",
    "client_server_time_skew",
    "excessive_attempts_same_token",
    "repeated_failed_attempts",
    "invalid_token_attempt",
    "abnormally_fast_repeat",
    "outside_radius",
  ]);
  return flags.filter((f) => typeof f === "string" && safe.has(f));
}

/** Validate an https URL against dangerous protocols. */
export function isValidOriginalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

/** SHA-256 hex digest of the raw token (same as the client/DB). */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`elg:${token}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function handle(request: Request): Promise<Response> {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Lightweight rate limiting per token+IP using an in-memory sliding window.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  let body: ValidateBody;
  try {
    body = (await request.json()) as ValidateBody;
  } catch {
    return json({ success: false, message: "بيانات غير صالحة.", status: "error" }, 400);
  }

  if (isRateLimited(ip)) {
    return json({
      success: false,
      message: "محاولات كثيرة. يرجى المحاولة لاحقًا.",
      status: "error",
    }, 429);
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token || token.length < 8 || token.length > 128) {
    return json({ error: "invalid_token" }, 400);
  }

  const latitude = body.latitude;
  const longitude = body.longitude;
  const accuracy = body.accuracy;
  const clientTimestamp = typeof body.client_timestamp === "string" ? body.client_timestamp : null;

  const tokenHash = await hashToken(token);
  recordTokenAttempt(tokenHash);

  // ---- 1. Fetch the link by hashed token ------------------------------
  const { data: link, error: linkError } = await supabase
    .from("attendance_links")
    .select(
      "id, employee_id, workplace_id, token_hash, original_url, link_type, expires_at, usage_count, max_usage_count, status",
    )
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkError) {
    console.error("link lookup error", linkError);
    return json({ success: false, message: "حدث خطأ أثناء تسجيل البيانات.", status: "error" }, 500);
  }

  if (!link) {
    // Record invalid-token attempt (best effort, keep it out of the happy path).
    await supabase.from("attendance_records").insert({
      attendance_status: "invalid_link",
      ip_address: ip,
      risk_flags: ["invalid_token_attempt"],
    });
    return json(
      { success: false, message: "هذا الرابط غير صالح أو انتهت صلاحيته.", status: "invalid_link" },
      200,
    );
  }

  // ---- 2. Validate link status ----------------------------------------
  if (link.status === "disabled") {
    await logAttempt(link, null, "disabled_link", ip, request, ["invalid_token_attempt"], "medium");
    return json({ success: false, message: "الرابط معطل.", status: "disabled_link" }, 200);
  }

  if (link.status === "used") {
    await logAttempt(link, null, "already_used", ip, request, [], "high");
    return json({ success: false, message: "تم استخدام رابط التسجيل مسبقًا.", status: "already_used" }, 200);
  }

  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    await supabase
      .from("attendance_links")
      .update({ status: "expired" })
      .eq("id", link.id);
    await logAttempt(link, null, "expired_link", ip, request, [], "high");
    return json({ success: false, message: "انتهت صلاحية رابط التسجيل.", status: "expired_link" }, 200);
  }

  if (
    link.max_usage_count !== null &&
    link.usage_count >= link.max_usage_count
  ) {
    await logAttempt(link, null, "already_used", ip, request, [], "high");
    return json({ success: false, message: "تم استخدام رابط التسجيل مسبقًا.", status: "already_used" }, 200);
  }

  // ---- 3. Validate employee -------------------------------------------
  const { data: employee, error: employeeError } = await supabase
    .from("employees")
    .select("id, name, status")
    .eq("id", link.employee_id)
    .maybeSingle();

  if (employeeError) {
    console.error("employee lookup error", employeeError);
    return json({ success: false, message: "حدث خطأ أثناء تسجيل البيانات.", status: "error" }, 500);
  }

  if (!employee || employee.status !== "active") {
    await logAttempt(link, null, "disabled_link", ip, request, [], "high");
    return json({ success: false, message: "الحساب غير نشط.", status: "disabled_link" }, 200);
  }

  // ---- 3. Fetch workplace + settings ----------------------------------
  const { data: workplace, error: workplaceError } = await supabase
    .from("workplaces")
    .select("id, name, latitude, longitude, allowed_radius, min_accuracy, status")
    .eq("id", link.workplace_id)
    .maybeSingle();

  if (workplaceError) {
    console.error("workplace lookup error", workplaceError);
    return json({ success: false, message: "حدث خطأ أثناء تسجيل البيانات.", status: "error" }, 500);
  }

  if (!workplace || workplace.status !== "active") {
    const result: ValidateResult = {
      success: false,
      message: "مقر العمل غير نشط.",
      status: "error",
    };
    return json(result, 200);
  }

  const { data: settingsRows } = await supabase
    .from("app_settings")
    .select("key, value");

  const settings: Record<string, boolean> = {};
  if (settingsRows) {
    for (const row of settingsRows) settings[row.key] = row.value;
  }
  const allowOutsideRedirect = settings.allow_outside_redirect === true;
  const globalMinAccuracy =
    typeof settings.global_min_accuracy === "number"
      ? settings.global_min_accuracy
      : 100;

  // ---- 4. Validate incoming coordinates -------------------------------
  const riskFlags: string[] = [];

  // Repeated attempts on the same token → risk indicator.
  const attemptsForKey = attemptsMap.get(`token:${tokenHash}`) ?? [];
  if (attemptsForKey.length >= 3) riskFlags.push("excessive_attempts_same_token");
  if (attemptsForKey.length >= 2) riskFlags.push("repeated_failed_attempts");

  if (
    !isNumber(latitude) ||
    !isNumber(longitude) ||
    latitude < -90 || latitude > 90 ||
    longitude < -180 || longitude > 180
  ) {
    await logAttempt(link, null, "error", ip, request, ["invalid_token_attempt"], "low");
    return json({ success: false, message: "بيانات الموقع غير صالحة.", status: "error" }, 400);
  }

  const providedAccuracy = isNumber(accuracy) && accuracy >= 0 ? accuracy : NaN;

  if (Number.isNaN(providedAccuracy)) {
    await logAttempt(link, null, "error", ip, request, ["invalid_token_attempt"], "low");
    return json({ success: false, message: "بيانات الموقع غير صالحة.", status: "error" }, 400);
  }

  const minAccuracy = workplace.min_accuracy ?? globalMinAccuracy;

  // ---- 5. Client/server time skew (risk indicator only) ---------------
  const parsedClient = clientTimestamp ? new Date(clientTimestamp).getTime() : null;
  if (parsedClient && Number.isFinite(parsedClient)) {
    const skewMinutes = Math.abs(Date.now() - parsedClient) / 60000;
    if (skewMinutes > 15) riskFlags.push("client_server_time_skew");
  }

  // ---- 6. Distance -----------------------------------------------
  const distanceMeters = haversine(
    workplace.latitude,
    workplace.longitude,
    latitude,
    longitude,
  );

  const statusByAccuracy =
    providedAccuracy > minAccuracy ? "low_accuracy" : null;
  const statusByDistance =
    statusByAccuracy === null
      ? distanceMeters <= workplace.allowed_radius
        ? "inside"
        : "outside"
      : null;

  const finalStatus: "inside" | "outside" | "low_accuracy" =
    statusByAccuracy ?? statusByDistance ?? "outside";

  if (finalStatus === "outside") riskFlags.push("outside_radius");
  if (providedAccuracy > 300) riskFlags.push("high_accuracy_uncertainty");

  const verification =
    finalStatus === "inside" && providedAccuracy > minAccuracy
      ? null
      : verificationLevelFor(providedAccuracy);

  // ---- 7. Save attendance record ----------------------------------
  const serverNow = new Date();

  const { data: record, error: insertError } = await supabase
    .from("attendance_records")
    .insert({
      employee_id: link.employee_id,
      link_id: link.id,
      workplace_id: link.workplace_id,
      latitude,
      longitude,
      accuracy: providedAccuracy,
      distance_meters: distanceMeters,
      attendance_status: finalStatus,
      verification_level: verification,
      client_timestamp: parsedClient ? new Date(parsedClient).toISOString() : null,
      server_timestamp: serverNow.toISOString(),
      ip_address: ip,
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
      risk_flags: scrubRiskFlags(riskFlags),
    })
    .select("id, attendance_status, verification_level, distance_meters, server_timestamp")
    .single();

  if (insertError) {
    console.error("attendance insert error", insertError);
    return json({ success: false, message: "حدث خطأ أثناء تسجيل البيانات.", status: "error" }, 500);
  }

  // ---- 8. Decide whether the employee may proceed ------------------
  //
  // Consumption rule: a link is consumed (usage_count++ / marked used)
  // ONLY on an actual successful check-in (inside, or outside when
  // the admin has enabled allow_outside_redirect). Failed checks leave
  // the link usable so the employee can retry.
  const isInside = finalStatus === "inside";

  if (finalStatus === "low_accuracy") {
    return json({
      success: false,
      message: "دقة الموقع منخفضة. يرجى تشغيل GPS والمحاولة مرة أخرى.",
      status: "low_accuracy",
      attendance: {
        id: record.id,
        distance_meters: distanceMeters,
        attendance_status: record.attendance_status,
        verification_level: record.verification_level,
        server_timestamp: record.server_timestamp,
      },
    }, 200);
  }

  if (finalStatus === "outside" && !allowOutsideRedirect) {
    return json({
      success: false,
      message: "أنت خارج نطاق مقر العمل ولا يمكن إكمال التسجيل.",
      status: "outside",
      attendance: {
        id: record.id,
        distance_meters: distanceMeters,
        attendance_status: record.attendance_status,
        verification_level: record.verification_level,
        server_timestamp: record.server_timestamp,
      },
    }, 200);
  }

  // ---- 9. Successful check-in → consume the link ------------------
  const newUsageCount = link.usage_count + 1;
  const wasSingleUse = link.link_type === "single_use";
  const reachedMax =
    link.max_usage_count !== null && newUsageCount >= link.max_usage_count;

  if (wasSingleUse || reachedMax) {
    await supabase
      .from("attendance_links")
      .update({
        usage_count: newUsageCount,
        status: "used",
      })
      .eq("id", link.id);
  } else {
    await supabase
      .from("attendance_links")
      .update({ usage_count: newUsageCount })
      .eq("id", link.id);
  }

  // ---- 10. Return the ORIGINAL URL from the DB ------------------
  if (!isValidOriginalUrl(link.original_url)) {
    return json({ success: false, message: "الرابط الأصلي غير صالح.", status: "error" }, 200);
  }

  return json({
    success: true,
    message: "تم التسجيل بنجاح.",
    status: isInside ? "inside" : "outside",
    original_url: link.original_url,
    attendance: {
      id: record.id,
      distance_meters: distanceMeters,
      attendance_status: record.attendance_status,
      verification_level: record.verification_level,
      server_timestamp: record.server_timestamp,
    },
  }, 200);
}

/** Best-effort logging for non-geolocation failures. */
async function logAttempt(
  link: { id: string; employee_id: string; workplace_id: string | null },
  _coords: { latitude: number; longitude: number } | null,
  status: string,
  ip: string,
  request: Request,
  flags: string[],
  level: "high" | "medium" | "low" | null,
): Promise<void> {
  await supabase.from("attendance_records").insert({
    employee_id: link.employee_id,
    link_id: link.id,
    workplace_id: link.workplace_id,
    attendance_status: status,
    verification_level: level,
    ip_address: ip,
    user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    risk_flags: scrubRiskFlags(flags),
  }).then((r) => {
    if (r.error) console.error("failed to log attempt", r.error);
  });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (err) {
    console.error("unexpected error", err);
    return json({ success: false, message: "حدث خطأ أثناء تسجيل البيانات.", status: "error" }, 500);
  }
});