import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

type UpdatePayload = {
  game_id?: string | null;
  user_id?: string | null;
  action?: "checkin_on" | "checkin_off" | "cancel" | "late_set" | "late_clear";
  eta_minutes?: number | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseJsonBody = async (req: Request) => {
  try {
    return (await req.json()) as UpdatePayload;
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

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const jwt = authHeader.replace("Bearer ", "");
  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(jwt);
  if (authError || !authData?.user) {
    return jsonResponse({ error: "Invalid token" }, 401);
  }

  const isAdmin = await fetchAdminStatus(authData.user.id);
  if (!isAdmin) {
    return jsonResponse({ error: "Admin privileges required" }, 403);
  }

  const payload = await parseJsonBody(req);
  if (!payload?.game_id || !payload?.user_id || !payload?.action) {
    return jsonResponse({ error: "game_id, user_id, action are required" }, 400);
  }

  const { data: registration, error: fetchError } = await supabaseAdmin
    .from("registrations")
    .select("id, user_id, status, check_in_status, eta_minutes, queue_position")
    .eq("game_id", payload.game_id)
    .eq("user_id", payload.user_id)
    .maybeSingle();

  if (fetchError) {
    return jsonResponse({ error: fetchError.message }, 500);
  }

  if (!registration) {
    return jsonResponse({ error: "Registration not found" }, 404);
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", registration.user_id)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 500);
  }

  if (!profile?.full_name?.startsWith("TEST_")) {
    return jsonResponse({ error: "Test player not found" }, 404);
  }

  const update: Record<string, unknown> = {};
  const shouldPromote = payload.action === "cancel" && registration.status === "active";

  switch (payload.action) {
    case "checkin_on":
      update.check_in_status = "checked_in";
      break;
    case "checkin_off":
      update.check_in_status = "pending";
      break;
    case "cancel":
      update.status = "cancelled";
      update.check_in_status = "pending";
      update.queue_position = null;
      update.eta_minutes = null;
      break;
    case "late_set":
      if (payload.eta_minutes === null || payload.eta_minutes === undefined) {
        return jsonResponse({ error: "eta_minutes is required for late_set" }, 400);
      }
      update.eta_minutes = payload.eta_minutes;
      update.check_in_status = "pending";
      break;
    case "late_clear":
      update.eta_minutes = null;
      break;
    default:
      return jsonResponse({ error: "Invalid action" }, 400);
  }

  update.updated_at = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("registrations")
    .update(update)
    .eq("id", registration.id)
    .select("id, user_id, status, check_in_status, eta_minutes, queue_position, created_at, updated_at")
    .single();

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
  }

  if (shouldPromote) {
    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .select("deadline_time")
      .eq("id", payload.game_id)
      .maybeSingle();

    if (gameError) {
      return jsonResponse({ error: gameError.message }, 500);
    }

    const deadlineTime = game?.deadline_time ? new Date(game.deadline_time) : null;
    const afterDeadline = deadlineTime ? new Date() >= deadlineTime : false;

    let standbyQuery = supabaseAdmin
      .from("registrations")
      .select("id, user_id")
      .eq("game_id", payload.game_id)
      .eq("status", "standby");

    if (afterDeadline) {
      standbyQuery = standbyQuery.eq("check_in_status", "checked_in");
    }

    const { data: standby, error: standbyError } = await standbyQuery
      .order("queue_position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (standbyError) {
      return jsonResponse({ error: standbyError.message }, 500);
    }

    if (standby) {
      const { error: promoteError } = await supabaseAdmin
        .from("registrations")
        .update({
          status: "active",
          queue_position: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", standby.id);

      if (promoteError) {
        return jsonResponse({ error: promoteError.message }, 500);
      }
    }
  }

  return jsonResponse({ registration: updated });
});
