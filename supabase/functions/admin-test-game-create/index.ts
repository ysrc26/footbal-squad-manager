import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

type AdminCreatePayload = {
  kickoff_time: string;
  deadline_time: string;
  max_players: number;
  max_standby: number;
  active_count: number;
  standby_count: number;
  batch_id: string;
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
    return (await req.json()) as AdminCreatePayload;
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

const validatePayload = (payload: AdminCreatePayload) => {
  const kickoff = new Date(payload.kickoff_time);
  const deadline = new Date(payload.deadline_time);

  if (Number.isNaN(kickoff.getTime()) || Number.isNaN(deadline.getTime())) {
    return "Invalid kickoff/deadline";
  }

  if (kickoff >= deadline) {
    return "kickoff_time must be before deadline_time";
  }

  if (payload.max_players <= 0 || payload.max_standby < 0) {
    return "Invalid max players/standby";
  }

  if (payload.active_count < 0 || payload.standby_count < 0) {
    return "Invalid counts";
  }

  if (payload.active_count > payload.max_players) {
    return "Active count exceeds max players";
  }

  if (payload.standby_count > payload.max_standby) {
    return "Standby count exceeds max standby";
  }

  if (!payload.batch_id || payload.batch_id.trim().length === 0) {
    return "Missing batch_id";
  }

  return null;
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
  if (!payload) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const validationError = validatePayload(payload);
  if (validationError) {
    return jsonResponse({ error: validationError }, 400);
  }

  const kickoffDate = new Date(payload.kickoff_time);
  const deadlineDate = new Date(payload.deadline_time);
  const totalUsers = payload.active_count + payload.standby_count;
  const createdUserIds: string[] = [];

  let gameId: string | null = null;
  let profileIds: string[] = [];
  let step = "init";

  try {
    step = "create_game";
    const { data: game, error: gameError } = await supabaseAdmin
      .from("games")
      .insert({
        date: kickoffDate.toISOString().split("T")[0],
        deadline_time: deadlineDate.toISOString(),
        kickoff_time: kickoffDate.toISOString(),
        status: "open_for_all",
        max_players: payload.max_players,
        max_standby: payload.max_standby,
        is_auto_generated: false,
      })
      .select("id")
      .single();

    if (gameError) throw gameError;
    gameId = game.id as string;

    step = "create_auth_users";
    for (let i = 0; i < totalUsers; i += 1) {
      const email = `test_${payload.batch_id}_${i + 1}@example.com`;
      const password = crypto.randomUUID();
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { test_batch: payload.batch_id },
      });

      if (userError || !userData?.user) {
        throw userError ?? new Error("Failed to create user");
      }

      createdUserIds.push(userData.user.id);
    }

    step = "create_profiles";
    const profiles = createdUserIds.map((id, index) => ({
      id,
      full_name: `TEST_${payload.batch_id}_${index + 1}`,
      phone_number: null,
      avatar_url: null,
      is_resident: false,
    }));

    if (profiles.length > 0) {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .upsert(profiles, { onConflict: "id" });

      if (profileError) throw profileError;
    }

    profileIds = [...createdUserIds];

    step = "create_registrations";
    const registrations: Record<string, unknown>[] = [];
    let currentTimeMs = Date.now();

    const nextGapMs = () => {
      const minSeconds = 2;
      const maxSeconds = 8;
      return (minSeconds + Math.floor(Math.random() * (maxSeconds - minSeconds + 1))) * 1000;
    };

    for (let i = 0; i < payload.active_count; i += 1) {
      const createdAt = new Date(currentTimeMs).toISOString();
      registrations.push({
        game_id: gameId,
        user_id: createdUserIds[i],
        status: "active",
        check_in_status: "pending",
        queue_position: i + 1,
        created_at: createdAt,
        updated_at: createdAt,
      });
      currentTimeMs += nextGapMs();
    }

    for (let i = 0; i < payload.standby_count; i += 1) {
      const createdAt = new Date(currentTimeMs).toISOString();
      registrations.push({
        game_id: gameId,
        user_id: createdUserIds[payload.active_count + i],
        status: "standby",
        check_in_status: "checked_in",
        queue_position: payload.active_count + i + 1,
        created_at: createdAt,
        updated_at: createdAt,
      });
      currentTimeMs += nextGapMs();
    }

    if (registrations.length > 0) {
      const { error: regError } = await supabaseAdmin.from("registrations").insert(registrations);
      if (regError) throw regError;
    }

    return jsonResponse({ game_id: gameId, user_ids: createdUserIds, profile_ids: profileIds });
  } catch (error) {
    console.error("admin-test-game-create failed", { step, error });
    if (gameId) {
      await supabaseAdmin.from("registrations").delete().eq("game_id", gameId);
      await supabaseAdmin.from("games").delete().eq("id", gameId);
    }

    if (profileIds.length > 0) {
      await supabaseAdmin.from("profiles").delete().in("id", profileIds);
    }

    for (const userId of createdUserIds) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
    }

    const message = error instanceof Error ? error.message : "Failed to create test game";
    return jsonResponse({ error: message, step }, 500);
  }
});
