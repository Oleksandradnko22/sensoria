// Sensoria — notify-new-content Edge Function.
//
// Broadcasts a "нові матеріали" email when an author publishes content
// for the first time (AuthorCourseEditor.tsx's "Опублікувати" button —
// see src/lib/content.ts's notifyNewContent(), called right after a
// genuine draft/review -> published transition, not on every re-save
// of already-published content).
//
// This has to be its own Edge Function, not a client call, because
// targeting means reading OTHER people's assessment_results and
// notification_prefs — RLS correctly blocks a participant's own client
// from doing that for anyone but themselves, so only the service-role
// key can look this up. Targeting itself is deliberately simple:
// content.tags uses the same six-value vocabulary as
// assessment_results.primary_state/secondary_state (src/store/funnelStore.ts's
// PrimaryStateId) — a participant matches if their primary or
// secondary state is among the content's tags. No tags on the content
// = no targeting signal = nobody gets emailed, rather than guessing
// and blasting everyone.
//
// DEPLOY (no CLI needed): Supabase Dashboard -> Edge Functions -> "Deploy a
// new function" -> "Via Editor" -> name it exactly "notify-new-content" ->
// paste this whole file -> Deploy. Reuses the same RESEND_API_KEY secret as
// send-notification-email (set it once, both functions read it) — Edge
// Functions -> notify-new-content -> Secrets -> RESEND_API_KEY.

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

const KIND_LABEL: Record<string, string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};

// Defensive cap — this is a broadcast, not a single send. Real
// audiences here are tiny for now (few participants have both an
// assessment result and this specific email toggle on), but the cap
// stays regardless of how that grows.
const MAX_RECIPIENTS = 200;

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
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>";

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Не авторизовано." }, 401);
    }

    const payload = await req.json().catch(() => null);
    const contentId = payload?.contentId as string | undefined;
    if (!contentId) return json({ error: "Некоректний запит." }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: contentRow, error: contentError } = await admin
      .from("content")
      .select("id, author_id, kind, title, tags")
      .eq("id", contentId)
      .single();
    if (contentError || !contentRow) {
      return json({ error: "Контент не знайдено." }, 404);
    }
    // Only the actual author of this content can trigger a broadcast
    // about it.
    if (contentRow.author_id !== userData.user.id) {
      return json({ error: "Немає доступу." }, 403);
    }

    if (!resendKey) {
      return json({ notified: 0, reason: "email_not_configured" });
    }

    const tags: string[] = contentRow.tags ?? [];
    if (tags.length === 0) {
      return json({ notified: 0, reason: "no_tags" });
    }

    // Matching participants — primary or secondary emotional state
    // overlaps this content's tags.
    const { data: matches } = await admin
      .from("assessment_results")
      .select("profile_id")
      .or(
        `primary_state.in.(${tags.join(",")}),secondary_state.in.(${tags.join(",")})`
      )
      .limit(MAX_RECIPIENTS);

    const profileIds = Array.from(new Set((matches ?? []).map((m) => m.profile_id)));
    if (profileIds.length === 0) {
      return json({ notified: 0, reason: "no_matches" });
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("id, email, role, notification_prefs")
      .in("id", profileIds)
      .eq("role", "participant");

    const kindLabel = KIND_LABEL[contentRow.kind] ?? "Матеріал";
    const subject = `Новий матеріал на Sensoria: ${contentRow.title}`;
    const text = `На Sensoria з'явився новий матеріал, який може бути вам цікавий:\n\n${kindLabel} · «${contentRow.title}»\n\nПереглянути можна в каталозі на сайті.`;

    let notified = 0;
    for (const p of profiles ?? []) {
      if (!p.email) continue;
      const prefs = (p.notification_prefs ?? {}) as Record<string, { email?: boolean }>;
      // Default false (see DEFAULT_EMAIL_PREF in
      // send-notification-email/index.ts) — someone who's never
      // touched this toggle does NOT get emailed by default.
      const emailEnabled = prefs.newContent?.email ?? false;
      if (!emailEnabled) continue;

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: fromAddress, to: p.email, subject, text }),
      });
      if (resendResponse.ok) notified += 1;
    }

    return json({ notified });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
