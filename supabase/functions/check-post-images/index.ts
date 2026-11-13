// Sensoria — check-post-images Edge Function.
// The second line of defence for photos in «Публікації». Photos are first checked for free in the uploader's browser
// (src/utils/imageSafety.ts). That can be bypassed, so when someone REPORTS a post with photos, the app calls this
// function and the photos are checked once more on the server by Sightengine (paid per image, so only after a report,
// and only once per post). Explicit or violent photos hide the post until moderation looks at it.
//
// Secrets (Supabase → Edge Functions → Secrets): SIGHTENGINE_USER, SIGHTENGINE_SECRET. Without them the function does
// nothing and says so.
// Monthly cap: never more than SIGHTENGINE_MONTHLY_LIMIT images per calendar month (default 1800, under the free 2000).
// When the cap is reached the check simply switches off until the 1st of next month — nothing is ever bought; reports and
// hiding after 3 reports keep working. SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

type Scores = { nudity?: Record<string, number | Record<string, number>>; gore?: { prob?: number }; offensive?: { prob?: number } };

// explicit nudity, sexual display, gore or strongly offensive symbols → unsafe
function unsafe(r: Scores): boolean {
  const n = r.nudity ?? {};
  const num = (k: string) => (typeof n[k] === "number" ? (n[k] as number) : 0);
  return num("sexual_activity") > 0.5 || num("sexual_display") > 0.5 || num("erotica") > 0.6
    || (r.gore?.prob ?? 0) > 0.6 || (r.offensive?.prob ?? 0) > 0.8;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "not signed in" }, 401);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "not signed in" }, 401);
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { postId } = await req.json().catch(() => ({}));
    if (typeof postId !== "string" || !/^[0-9a-f-]{36}$/i.test(postId)) return json({ error: "bad post" }, 400);

    // only someone who really reported this post can start the (paid) check
    const { data: report } = await admin.from("entity_reports").select("id").eq("target_type", "post").eq("target_id", postId).eq("reporter_id", userData.user.id).limit(1).maybeSingle();
    if (!report) return json({ error: "no report" }, 403);

    // once per post
    const { data: done } = await admin.from("post_image_checks").select("unsafe").eq("post_id", postId).maybeSingle();
    if (done) return json({ checked: true, unsafe: done.unsafe, cached: true });

    const { data: post } = await admin.from("author_posts").select("id, images").eq("id", postId).maybeSingle();
    const images: string[] = (post?.images ?? []).filter((u: string) => /^https:\/\//.test(u)).slice(0, 4);
    if (!post || images.length === 0) return json({ checked: false, reason: "no photos" });

    const user = Deno.env.get("SIGHTENGINE_USER"), secret = Deno.env.get("SIGHTENGINE_SECRET");
    if (!user || !secret) return json({ checked: false, reason: "Sightengine is not configured" });

    // the monthly cap: count the images already checked this month
    const limit = Number(Deno.env.get("SIGHTENGINE_MONTHLY_LIMIT") ?? "1800") || 1800;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: month } = await admin.from("post_image_checks").select("images_checked").gte("checked_at", monthStart.toISOString());
    const used = (month ?? []).reduce((sum: number, r: { images_checked: number | null }) => sum + (r.images_checked ?? 0), 0);
    if (used + images.length > limit) return json({ checked: false, reason: "monthly limit reached", used, limit });

    const results: Scores[] = [];
    for (const url of images) {
      const q = new URLSearchParams({ url, models: "nudity-2.1,gore-2.0,offensive-2.0", api_user: user, api_secret: secret });
      const res = await fetch(`https://api.sightengine.com/1.0/check.json?${q}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.status !== "success") return json({ checked: false, reason: "Sightengine error" }, 502);
      results.push(body as Scores);
    }
    const bad = results.some(unsafe);
    await admin.from("post_image_checks").insert({ post_id: postId, unsafe: bad, images_checked: images.length, result: results });
    if (bad) await admin.from("author_posts").update({ hidden_at: new Date().toISOString(), hidden_reason: "image_check" }).eq("id", postId).is("hidden_at", null);
    return json({ checked: true, unsafe: bad });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
