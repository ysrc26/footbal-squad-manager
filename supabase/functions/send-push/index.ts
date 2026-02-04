import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

type Audience = "user" | "all" | "admins" | "game_active" | "game_standby";

type EventType = "promotion" | "game_open" | "game_cancelled" | "manual" | "reminder";

interface PushRequestBody {
  event_type: EventType;
  audience: Audience;
  user_ids?: string[];
  game_id?: string | null;
  title: string;
  body: string;
  url?: string | null;
  data?: Record<string, unknown> | null;
  dedupe_key?: string | null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ONESIGNAL_APP_ID = Deno.env.get("ONESIGNAL_APP_ID") ?? "";
const ONESIGNAL_REST_API_KEY = Deno.env.get("ONESIGNAL_REST_API_KEY") ?? "";
const INTERNAL_PUSH_SECRET = Deno.env.get("INTERNAL_PUSH_SECRET") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const audienceRequiringAdmin = new Set<Audience>([
  "all",
  "admins",
  "game_active",
  "game_standby",
]);

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJsonBody = async (req: Request) => {
  try {
    return (await req.json()) as PushRequestBody;
  } catch {
    return null;
  }
};

const fetchAdminStatus = async (userId: string) => {
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });

  if (!error && typeof data === "boolean") {
    return data;
  }

  const { data: fallbackData } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin")
    .eq("user_id", userId)
    .maybeSingle();

  return Boolean(fallbackData);
};

const filterPushEnabled = async (userIds: string[]) => {
  if (userIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, push_enabled")
    .in("id", userIds);

  if (error || !data) {
    return userIds;
  }

  return data
    .filter((row) => row.push_enabled === true)
    .map((row) => row.id as string);
};

const fetchAllPushEnabledUsers = async () => {
  const pageSize = 1000;
  let from = 0;
  const ids: string[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, push_enabled")
      .range(from, from + pageSize - 1);

    if (error || !data || data.length === 0) {
      break;
    }

    ids.push(...data.filter((row) => row.push_enabled === true).map((row) => row.id as string));

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return ids;
};

const fetchAdminUserIds = async () => {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (error || !data) return [];

  const adminIds = data.map((row) => row.user_id as string);
  return await filterPushEnabled(adminIds);
};

const fetchGameUserIds = async (gameId: string, status: "active" | "standby") => {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select("user_id")
    .eq("game_id", gameId)
    .eq("status", status);

  if (error || !data) return [];

  const userIds = data.map((row) => row.user_id as string);
  const filtered = await filterPushEnabled(userIds);
  return Array.from(new Set(filtered));
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing Supabase environment variables" }, 500);
  }

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
    return jsonResponse({ error: "Missing OneSignal environment variables" }, 500);
  }

  const body = await parseJsonBody(req);
  if (!body) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const {
    event_type,
    audience,
    user_ids = [],
    game_id,
    title,
    body: messageBody,
    url,
    data,
    dedupe_key,
  } = body;

  if (!event_type || !audience || !title || !messageBody) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  if (audience === "user" && user_ids.length === 0) {
    return jsonResponse({ error: "user_ids is required for audience=user" }, 400);
  }

  if ((audience === "game_active" || audience === "game_standby") && !game_id) {
    return jsonResponse({ error: "game_id is required for game audience" }, 400);
  }

  const internalSecret = req.headers.get("x-internal-secret");
  const isInternal = Boolean(INTERNAL_PUSH_SECRET) && internalSecret === INTERNAL_PUSH_SECRET;

  let authUserId: string | null = null;
  let isAdmin = false;

  if (!isInternal) {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: authData, error: authError } = await supabaseAuth.auth.getUser(jwt);
    if (authError || !authData?.user) {
      return jsonResponse({ error: "Invalid token" }, 401);
    }

    authUserId = authData.user.id;
    isAdmin = await fetchAdminStatus(authUserId);

    const requiresAdmin = event_type === "manual" || audienceRequiringAdmin.has(audience);

    if (requiresAdmin && !isAdmin) {
      return jsonResponse({ error: "Admin privileges required" }, 403);
    }

    if (audience === "user" && !isAdmin) {
      const normalizedIds = user_ids.filter(Boolean);
      if (normalizedIds.length !== 1 || normalizedIds[0] !== authUserId) {
        return jsonResponse({ error: "User can only send to self" }, 403);
      }
    }
  }

  if (dedupe_key) {
    const { data: existing } = await supabaseAdmin
      .from("push_notifications_log")
      .select("id")
      .eq("dedupe_key", dedupe_key)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ skipped: true, reason: "dedupe" });
    }
  }

  let recipients: string[] = [];

  switch (audience) {
    case "user":
      recipients = user_ids;
      break;
    case "admins":
      recipients = await fetchAdminUserIds();
      break;
    case "all":
      recipients = await fetchAllPushEnabledUsers();
      break;
    case "game_active":
      recipients = await fetchGameUserIds(game_id as string, "active");
      break;
    case "game_standby":
      recipients = await fetchGameUserIds(game_id as string, "standby");
      break;
    default:
      recipients = [];
  }

  recipients = recipients.filter(Boolean);

  if (recipients.length === 0) {
    return jsonResponse({ skipped: true, reason: "no_recipients" });
  }

  const oneSignalPayload: Record<string, unknown> = {
    app_id: ONESIGNAL_APP_ID,
    include_external_user_ids: recipients,
    headings: { en: title },
    contents: { en: messageBody },
  };

  if (url) {
    oneSignalPayload.url = url;
  }

  if (data) {
    oneSignalPayload.data = data;
  }

  let onesignalResponse: unknown = null;
  let errorMessage: string | null = null;
  let status = 200;

  try {
    const response = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${ONESIGNAL_REST_API_KEY}`,
      },
      body: JSON.stringify(oneSignalPayload),
    });

    const responseText = await response.text();
    try {
      onesignalResponse = JSON.parse(responseText);
    } catch {
      onesignalResponse = { raw: responseText };
    }

    if (!response.ok) {
      errorMessage = `OneSignal error (${response.status})`;
      status = 502;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "OneSignal request failed";
    status = 502;
  }

  await supabaseAdmin.from("push_notifications_log").insert({
    event_type,
    audience,
    user_ids: recipients,
    game_id: game_id ?? null,
    title,
    body: messageBody,
    url: url ?? null,
    data: data ?? null,
    dedupe_key: dedupe_key ?? null,
    onesignal_response: onesignalResponse,
    error: errorMessage,
  });

  if (errorMessage) {
    return jsonResponse({ error: errorMessage, onesignal: onesignalResponse }, status);
  }

  return jsonResponse({ ok: true, recipients: recipients.length, onesignal: onesignalResponse });
});
