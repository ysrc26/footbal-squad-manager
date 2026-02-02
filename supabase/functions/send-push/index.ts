const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SendPushRequest = {
  userIds?: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: SendPushRequest;
  try {
    payload = (await req.json()) as SendPushRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { userIds, title, body, data } = payload;
  if (!title || !body) {
    return new Response(JSON.stringify({ error: "Missing title or body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const appId = Deno.env.get("ONESIGNAL_APP_ID");
  const apiKey = Deno.env.get("ONESIGNAL_REST_API_KEY");

  if (!appId || !apiKey) {
    return new Response(
      JSON.stringify({ error: "Missing OneSignal environment variables" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const basePayload: Record<string, unknown> = {
    app_id: appId,
    headings: { en: title },
    contents: { en: body },
    data: data ?? {},
  };

  if (userIds && userIds.length > 0) {
    basePayload.include_external_user_ids = userIds;
    basePayload.channel_for_external_user_ids = "push";
  } else {
    basePayload.included_segments = ["Total Subscriptions"];
  }

  const response = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify(basePayload),
  });

  const responseBody = await response.json();

  return new Response(JSON.stringify(responseBody), {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
