// Sensoria — log-content-access Edge Function.
// Records WHO opened/downloaded paid content, WHEN and from WHICH IP — the
// evidence a bank or acquirer asks for in an unjustified chargeback. The IP is read from
// the request here (never from the client body), and the table
// content_access_log has no client policies at all.
//
// DEPLOY: Dashboard -> Edge Functions -> new function "log-content-access" ->
// paste this file -> Deploy (JWT verification ON). Needs payments-migration.sql.
//
// Body: { contentId: string, action: "open" | "download" }
// Only users who own the content (an active purchase) or its author are logged
// as buyer actions; for anyone else the call is accepted but nothing is stored
// (free content has no chargeback risk).

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request): string | null {
  const h = req.headers;
  const direct = h.get("cf-connecting-ip") || h.get("x-real-ip");
  if (direct) return direct.trim();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim(); // first hop = the original client
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: { contentId?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const contentId = body.contentId;
  const action = body.action;
  if (!contentId || (action !== "open" && action !== "download")) {
    return json({ error: "bad_request" }, 400);
  }
  // Catalog items without a database row (static guides/meditations) have non-uuid ids.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(contentId)) {
    return json({ logged: false, reason: "not_a_paid_item" });
  }

  const admin = createClient(url, serviceKey);

  // The caller's own completed purchase of this content (RLS-independent lookup).
  const { data: purchase } = await admin
    .from("purchases")
    .select("id")
    .eq("participant_id", user.id)
    .eq("content_id", contentId)
    .eq("status", "completed")
    .order("purchased_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!purchase) return json({ logged: false, reason: "no_purchase" });

  const { error } = await admin.from("content_access_log").insert({
    user_id: user.id,
    content_id: contentId,
    purchase_id: purchase.id,
    action,
    ip: clientIp(req),
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400),
  });
  if (error) return json({ error: "log_failed", message: error.message }, 500);
  return json({ logged: true });
});
