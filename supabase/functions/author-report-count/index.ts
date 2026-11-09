// Sensoria — author-report-count Edge Function.
//
// Lets a signed-in account learn ONE fact about complaints filed
// against them: how many exist. Nothing else — not who filed them, not
// the reason, not the details, not even individual dates. RLS on
// message_reports deliberately has no policy letting reported_id read
// their own rows (see schema.sql) precisely so this stays impossible
// to get around from the client — the only path to this number is
// through here, via the service-role key, which returns a bare count
// and nothing else. This preserves reporter anonymity while still
// letting Sasha's "the author should be notified" requirement be met
// honestly.
//
// DEPLOY (no CLI needed): Supabase Dashboard -> Edge Functions -> "Deploy a
// new function" -> "Via Editor" -> name it exactly "author-report-count" ->
// paste this whole file -> Deploy.

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Не авторизовано." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Не авторизовано." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Count only — the whole point of this function is to never let
    // reporter_id, reason, details, or content_id leave the server for
    // this call, regardless of what the client asks for.
    const { count, error } = await admin
      .from("message_reports")
      .select("id", { count: "exact", head: true })
      .eq("reported_id", userData.user.id);
    if (error) return json({ error: error.message }, 500);

    return json({ count: count ?? 0 });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
