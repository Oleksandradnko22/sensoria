// Sensoria — notify-new-content Edge Function: the weekly «Нові матеріали» email (docs/consent-legal-spec.md, 4.5).
//
// It never reads the emotional-state tables (assessment results, mood check-ins, notes…): recipients are only
// participants who subscribed themselves — the «Нові матеріали» switch in «Профіль» (= the marketing_email consent).
// Topics, if any, are the ones the participant picked («Мені цікаві теми»).
//
//   POST {contentId}            — the author's client after a first publish: queues the material (no email yet).
//   POST {action:"digest"}      — daily by pg_cron with header x-cron-secret: at most one email per 7 days per person,
//                                 everything new since their last email in one letter.
//   GET  ?action=unsubscribe&u=…&t=… — the «Відписатися» link: switches the email off and withdraws the consent,
//                                 no sign-in needed (t = HMAC of the profile id).
// Deploy with --no-verify-jwt (the unsubscribe link and pg_cron carry no user token; each action checks itself).
// Secrets: RESEND_API_KEY, RESEND_FROM, CRON_SECRET, SITE_URL (optional).
import { createClient } from "npm:@supabase/supabase-js@2";
import { renderBrandEmail } from "../_shared/brandEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const page = (title: string, text: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:linear-gradient(135deg,#1e3a8a,#2563eb,#8b5cf6)">` +
      `<div style="background:#fff;border-radius:24px;padding:32px;max-width:440px;margin:16px;color:#0f172a"><p style="margin:0;font-size:12px;letter-spacing:.2em;font-weight:600;color:#4338ca">SENSORIA</p>` +
      `<h1 style="font-size:22px;margin:8px 0">${title}</h1><p style="margin:0;color:#475569;line-height:1.6">${text}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

const KIND_LABEL: Record<string, string> = { program: "Програма", guide: "Гайд", meditation: "Медитація" };
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_RECIPIENTS = 500;

async function hmac(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`unsubscribe:${text}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

  try {
    const url = new URL(req.url);

    // ── «Відписатися» from the email ──
    if (req.method === "GET" && url.searchParams.get("action") === "unsubscribe") {
      const u = url.searchParams.get("u") ?? "";
      const t = url.searchParams.get("t") ?? "";
      if (!cronSecret || !/^[0-9a-f-]{36}$/i.test(u) || t !== (await hmac(cronSecret, u))) {
        return page("Посилання недійсне", "Відписатися можна також у кабінеті: «Профіль» → «Сповіщення».", 400);
      }
      const { data: p } = await admin.from("profiles").select("notification_prefs").eq("id", u).maybeSingle();
      if (p) {
        const prefs = { ...((p.notification_prefs ?? {}) as Record<string, unknown>), newContent: { email: false } };
        await admin.from("profiles").update({ notification_prefs: prefs }).eq("id", u);
        await admin.from("legal_consents").update({ withdrawn_at: new Date().toISOString() })
          .eq("user_id", u).eq("document", "marketing_email").is("withdrawn_at", null);
      }
      return page("Ви відписалися", "Листів про нові матеріали більше не буде. Увімкнути їх знову можна в кабінеті: «Профіль» → «Сповіщення».");
    }

    const payload = await req.json().catch(() => ({}));

    // ── daily digest (pg_cron) ──
    if (payload?.action === "digest") {
      if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "forbidden" }, 403);
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) return json({ sent: 0, reason: "email_not_configured" });
      const from = Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>";
      const site = (Deno.env.get("SITE_URL") ?? "https://sensoria.courses").replace(/\/+$/, "");
      const now = Date.now();

      // what was published in the last 7 days (and is still published)
      const { data: queue } = await admin.from("new_content_queue").select("content_id, queued_at")
        .gte("queued_at", new Date(now - WEEK_MS).toISOString());
      const ids = (queue ?? []).map((q) => q.content_id as string);
      if (ids.length === 0) return json({ sent: 0, reason: "nothing_new" });
      const { data: contents } = await admin.from("content").select("id, kind, title, tags, status").in("id", ids).eq("status", "published");
      const queuedAt = new Map((queue ?? []).map((q) => [q.content_id as string, Date.parse(q.queued_at as string)]));
      const items = (contents ?? []).map((c) => ({ ...c, at: queuedAt.get(c.id as string) ?? 0 }));
      if (items.length === 0) return json({ sent: 0, reason: "nothing_published" });

      // subscribers: the switch is on AND the marketing_email consent is active — nothing else is read about them
      const { data: profiles } = await admin.from("profiles").select("id, email, notification_prefs")
        .eq("role", "participant").eq("notification_prefs->newContent->>email", "true").limit(MAX_RECIPIENTS);
      const pids = (profiles ?? []).map((p) => p.id as string);
      if (pids.length === 0) return json({ sent: 0, reason: "no_subscribers" });
      const { data: consents } = await admin.from("legal_consents").select("user_id")
        .eq("document", "marketing_email").is("withdrawn_at", null).in("user_id", pids);
      const consented = new Set((consents ?? []).map((c) => c.user_id as string));
      const { data: logs } = await admin.from("new_content_digest_log").select("profile_id, last_sent_at").in("profile_id", pids);
      const lastSent = new Map((logs ?? []).map((l) => [l.profile_id as string, Date.parse(l.last_sent_at as string)]));

      let sent = 0;
      for (const p of profiles ?? []) {
        const pid = p.id as string;
        if (!p.email || !consented.has(pid)) continue;
        const last = lastSent.get(pid) ?? 0;
        if (now - last < WEEK_MS) continue; // at most one letter a week
        const topics = (((p.notification_prefs ?? {}) as { topics?: string[] }).topics ?? []).filter(Boolean);
        const mine = items
          .filter((c) => c.at > last)
          .filter((c) => topics.length === 0 || ((c.tags as string[] | null) ?? []).some((t) => topics.includes(t)));
        if (mine.length === 0) continue;
        const unsub = `${supabaseUrl}/functions/v1/notify-new-content?action=unsubscribe&u=${pid}&t=${await hmac(cronSecret, pid)}`;
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from,
            to: p.email,
            subject: mine.length === 1 ? `Новий матеріал на Sensoria: ${mine[0].title}` : `Нові матеріали на Sensoria за тиждень: ${mine.length}`,
            ...renderBrandEmail({
              preheader: mine.length === 1 ? `«${mine[0].title}» — новий матеріал, який може бути вам цікавим.` : `${mine.length} нових матеріалів за тиждень.`,
              heading: mine.length === 1 ? "Новий матеріал для вас" : "Нові матеріали за тиждень",
              blocks: [
                { type: "text", text: "На Sensoria з’явилися матеріали, які можуть бути вам цікаві:" },
                { type: "details", rows: mine.map((c) => ({ label: KIND_LABEL[c.kind as string] ?? "Матеріал", value: `«${c.title}»` })) },
                { type: "button", label: "Переглянути в каталозі", url: `${site}/programs` },
                { type: "note", text: `Не хочете отримувати такі листи? Відписатися: ${unsub}` },
              ],
              reason: "Ви отримали цей лист, бо ввімкнули «Нові матеріали» в профілі.",
            }),
            headers: { "List-Unsubscribe": `<${unsub}>` },
          }),
        });
        if (res.ok) {
          sent += 1;
          await admin.from("new_content_digest_log").upsert({ profile_id: pid, last_sent_at: new Date().toISOString() });
        }
      }
      // the queue only needs the last week
      await admin.from("new_content_queue").delete().lt("queued_at", new Date(now - 2 * WEEK_MS).toISOString());
      return json({ sent });
    }

    // ── author's first publish: queue only ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Не авторизовано." }, 401);
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "Не авторизовано." }, 401);
    const contentId = typeof payload?.contentId === "string" ? payload.contentId : "";
    if (!contentId) return json({ error: "Некоректний запит." }, 400);
    const { data: c } = await admin.from("content").select("id, author_id, status").eq("id", contentId).maybeSingle();
    if (!c) return json({ error: "Контент не знайдено." }, 404);
    if (c.author_id !== userData.user.id) return json({ error: "Немає доступу." }, 403);
    if (c.status !== "published") return json({ queued: false, reason: "not_published" });
    await admin.from("new_content_queue").upsert({ content_id: c.id }, { onConflict: "content_id", ignoreDuplicates: true });
    return json({ queued: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
