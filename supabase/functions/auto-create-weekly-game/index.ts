import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

type HebcalItem = {
  title: string;
  category: string;
  date: string;
};

type HebcalResponse = {
  items: HebcalItem[];
};

type ShabbatTimes = {
  date: string;
  candleLighting: Date;
  havdalah: Date;
};

type GameTimes = {
  wave1Opens: Date;
  wave2Opens: Date;
  deadline: Date;
  kickoff: Date;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const INTERNAL_PUSH_SECRET = Deno.env.get("INTERNAL_PUSH_SECRET") ?? "";

const DEFAULT_MAX_PLAYERS = 15;
const DEFAULT_MAX_STANDBY = 10;
const NAHALIM_GEONAME_ID = 294093;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const roundUpToHalfHour = (date: Date): Date => {
  const result = new Date(date);
  const minutes = result.getMinutes();

  if (minutes === 0 || minutes === 30) {
    return result;
  }

  if (minutes < 30) {
    result.setMinutes(30, 0, 0);
  } else {
    result.setMinutes(0, 0, 0);
    result.setHours(result.getHours() + 1);
  }

  return result;
};

const calculateGameTimes = (shabbatTimes: ShabbatTimes): GameTimes => {
  const wave1Opens = new Date(shabbatTimes.date);
  wave1Opens.setDate(wave1Opens.getDate() - 1);
  wave1Opens.setHours(12, 0, 0, 0);

  const wave2Opens = new Date(shabbatTimes.candleLighting);
  wave2Opens.setMinutes(wave2Opens.getMinutes() - 60);

  const rawDeadline = new Date(shabbatTimes.havdalah);
  rawDeadline.setMinutes(rawDeadline.getMinutes() + 60);
  const deadline = roundUpToHalfHour(rawDeadline);

  const kickoff = new Date(deadline);
  kickoff.setMinutes(kickoff.getMinutes() - 15);

  return {
    wave1Opens,
    wave2Opens,
    deadline,
    kickoff,
  };
};

const getNextShabbatTimes = async (): Promise<ShabbatTimes> => {
  const url = new URL("https://www.hebcal.com/shabbat");
  url.searchParams.set("cfg", "json");
  url.searchParams.set("geonameid", NAHALIM_GEONAME_ID.toString());
  url.searchParams.set("M", "on");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Hebcal API error: ${response.status}`);
  }

  const data = (await response.json()) as HebcalResponse;

  let candleLighting: Date | null = null;
  let havdalah: Date | null = null;
  let shabbatDate: string | null = null;

  for (const item of data.items) {
    if (item.category === "candles") {
      candleLighting = new Date(item.date);
      const saturday = new Date(candleLighting);
      saturday.setDate(saturday.getDate() + 1);
      shabbatDate = saturday.toISOString().split("T")[0];
    } else if (item.category === "havdalah") {
      havdalah = new Date(item.date);
    }
  }

  if (!candleLighting || !havdalah || !shabbatDate) {
    throw new Error("Could not find Shabbat times in Hebcal response");
  }

  return {
    date: shabbatDate,
    candleLighting,
    havdalah,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Missing Supabase environment variables" }, 500);
  }

  if (!INTERNAL_PUSH_SECRET) {
    return jsonResponse({ error: "Missing INTERNAL_PUSH_SECRET" }, 500);
  }

  const internalSecret = req.headers.get("x-internal-secret") || "";
  if (internalSecret !== INTERNAL_PUSH_SECRET) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const shabbatTimes = await getNextShabbatTimes();
    const times = calculateGameTimes(shabbatTimes);

    const { data: existing, error: existsError } = await supabaseAdmin
      .from("games")
      .select("id")
      .eq("date", shabbatTimes.date)
      .maybeSingle();

    if (existsError) throw existsError;

    if (existing?.id) {
      return jsonResponse({
        success: false,
        message: `Game already exists for ${shabbatTimes.date}`,
        game_id: existing.id,
      });
    }

    const { data, error } = await supabaseAdmin
      .from("games")
      .insert({
        date: shabbatTimes.date,
        kickoff_time: times.kickoff.toISOString(),
        deadline_time: times.deadline.toISOString(),
        candle_lighting: shabbatTimes.candleLighting.toISOString(),
        shabbat_end: shabbatTimes.havdalah.toISOString(),
        wave1_registration_opens_at: times.wave1Opens.toISOString(),
        registration_opens_at: times.wave2Opens.toISOString(),
        status: "scheduled",
        is_auto_generated: true,
        max_players: DEFAULT_MAX_PLAYERS,
        max_standby: DEFAULT_MAX_STANDBY,
      })
      .select("id")
      .single();

    if (error) throw error;

    return jsonResponse({
      success: true,
      message: `Game created for ${shabbatTimes.date}`,
      game_id: data.id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ success: false, error: message }, 500);
  }
});
