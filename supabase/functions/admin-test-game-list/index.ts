import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

type ListPayload = {
  game_id?: string | null;
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
    return (await req.json()) as ListPayload;
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
  if (!payload?.game_id) {
    return jsonResponse({ error: "game_id is required" }, 400);
  }

  const { data, error } = await supabaseAdmin
    .from("registrations")
    .select(
      "id, user_id, status, check_in_status, eta_minutes, queue_position, created_at, updated_at, profiles:profiles!inner(full_name)"
    )
    .eq("game_id", payload.game_id)
    .like("profiles.full_name", "TEST_%")
    .order("created_at", { ascending: true });

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const registrations = (data ?? []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    full_name: row.profiles?.full_name ?? null,
    status: row.status,
    check_in_status: row.check_in_status,
    eta_minutes: row.eta_minutes,
    queue_position: row.queue_position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return jsonResponse({ registrations });
});
