import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

type VerifyPayload = {
  phone: string;
  token: string;
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
    return (await req.json()) as VerifyPayload;
  } catch {
    return null;
  }
};

const TEST_PHONE = "+972547667009";
const TEST_OTP = "168516";

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

  const payload = await parseJsonBody(req);
  if (!payload) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (payload.phone !== TEST_PHONE || payload.token !== TEST_OTP) {
    return jsonResponse({ error: "Invalid test credentials" }, 400);
  }

  const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
    authData.user.id,
    {
      phone: payload.phone,
      phone_confirm: true,
    }
  );

  if (updateAuthError) {
    return jsonResponse({ error: updateAuthError.message }, 500);
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({ phone_number: payload.phone })
    .eq("id", authData.user.id);

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 500);
  }

  return jsonResponse({ ok: true });
});
