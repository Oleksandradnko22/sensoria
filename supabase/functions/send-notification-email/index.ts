// Sensoria — send-notification-email Edge Function.
//
// Generic single-recipient email sender for the real "Сповіщення" email
// toggles (src/lib/notificationPrefs.ts) — used by the "нове
// повідомлення від автора" and "відповідь автора на відгук" triggers so
// far (see send-message/index.ts and src/lib/reviews.ts's
// replyToReview() for the call sites). Deliberately generic (takes an
// already-composed subject/text, not a template id) so new trigger
// points don't need a new Edge Function each time — they only need to
// know what to say, this function is the one place that knows whether
// it's actually allowed to say it and where to.
//
// Three things this function is the ONLY place responsible for, on
// purpose — never trust a client to have already checked any of them:
//   1. The recipient's real email address (looked up server-side via
//      the service-role key, never client-supplied).
//   2. The recipient's notification_prefs — if they've turned this
//      notifId's email off, this silently no-ops rather than sending
//      anyway just because some other client called it.
//   3. (2026-08-30 security fix) That the notifId/subject/text being
//      sent actually correspond to something real. Before this fix,
//      any signed-in user could call this function directly (it only
//      checked "is the caller logged in", not "does the caller have
//      any real reason to send THIS email to THIS person") and send
//      Sensoria-branded email, with fully attacker-chosen subject/
//      text, to any other user's real address — an open phishing/spam
//      relay under a trusted domain. notifId is now a closed
//      allowlist, and each one independently re-checks a matching row
//      really exists (a real message just sent to this recipient, a
//      real authored reply on a review addressed to this recipient, a
//      real support ticket this caller just filed) before any send
//      happens — see verifyClaim() below. This doesn't change what any
//      legitimate call site sees; it only closes what a devtools/raw-
//      fetch call could do.
//
// DEPLOY (no CLI needed): Supabase Dashboard -> Edge Functions -> "Deploy a
// new function" -> "Via Editor" -> name it exactly "send-notification-email"
// -> paste this whole file -> Deploy. Then add ONE secret: Edge Functions ->
// send-notification-email -> Secrets -> RESEND_API_KEY (from resend.com/api-keys).
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already provided
// automatically, same as every other function here.

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

// Mirrors the hardcoded defaults in ParticipantProfile.tsx/
// AuthorSettings.tsx's `initialNotifications` — a notifId with no entry
// in `profiles.notification_prefs` yet (nobody has touched that
// specific switch) falls back to this, not to "on" or "off" blindly.
// Kept in sync by hand, same convention as send-message's moderation
// pipeline being a deliberate duplicate rather than a shared import
// (each Edge Function here is a single file pasted via the dashboard
// editor).
const DEFAULT_EMAIL_PREF: Record<string, boolean> = {
  progress: true,
  reply: true,
  message: true,
  review: true,
  newContent: false,
};

// Closed set — anything else is rejected outright before it can even
// reach the opt-in check below. "progress"/"newContent" have no real
// call site invoking THIS function today (newContent broadcasts go
// through the separate notify-new-content function, which does its
// own server-side targeting) — left out here rather than allowlisted
// for something nothing actually sends yet.
const KNOWN_NOTIF_IDS = new Set(["message", "reply", "review", "newTicket"]);

// Independently confirms a real, matching event actually just
// happened server-side — the client's subject/text are cosmetic past
// this point, not the source of truth for whether to send at all.
// Returns true only if the caller (callerId, from their verified JWT)
// genuinely has standing to trigger this notifId toward this
// recipientId right now.
async function verifyClaim(
  admin: ReturnType<typeof createClient>,
  notifId: string,
  callerId: string,
  recipientId: string,
  meta: Record<string, string>
): Promise<boolean> {
  const recentCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  if (notifId === "message") {
    // A real, already-moderated message from caller to this exact
    // recipient, sent in the last 10 minutes (send-message/index.ts is
    // the only path that can ever create one of these rows).
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", callerId)
      .eq("recipient_id", recipientId)
      .gte("created_at", recentCutoff);
    return (count ?? 0) > 0;
  }

  if (notifId === "review") {
    // A participant just reviewed this author (author_reviews): the review must be
    // theirs (caller), about this recipient, and really just written.
    const authorReviewId = meta.authorReviewId;
    if (!authorReviewId) return false;
    const { count } = await admin
      .from("author_reviews")
      .select("id", { count: "exact", head: true })
      .eq("id", authorReviewId)
      .eq("participant_id", callerId)
      .eq("author_id", recipientId)
      .gte("created_at", recentCutoff);
    return (count ?? 0) > 0;
  }

  if (notifId === "reply" && meta.authorReviewId) {
    // The AUTHOR answered a review about themselves (author_reviews): the review must be
    // addressed to this recipient, about the caller, carry a reply that was just written.
    const { count } = await admin
      .from("author_reviews")
      .select("id", { count: "exact", head: true })
      .eq("id", meta.authorReviewId)
      .eq("participant_id", recipientId)
      .eq("author_id", callerId)
      .not("author_reply", "is", null)
      .gte("author_replied_at", recentCutoff);
    return (count ?? 0) > 0;
  }

  if (notifId === "reply") {
    const reviewId = meta.reviewId;
    if (!reviewId) return false;
    // The review must genuinely be addressed to this recipient, have
    // a reply on it already, and — critically — sit on a piece of
    // content this caller actually authors (reviews.ts's own RLS
    // "authors reply to reviews on their own content" already
    // enforces this for the write itself; this just re-confirms it
    // for the notification path).
    const { data: review } = await admin
      .from("reviews")
      .select("id, participant_id, author_reply, content:content_id (author_id)")
      .eq("id", reviewId)
      .eq("participant_id", recipientId)
      .single();
    const contentAuthorId = (review?.content as { author_id?: string } | null)?.author_id;
    return !!review?.author_reply && contentAuthorId === callerId;
  }

  if (notifId === "newTicket") {
    const ticketId = meta.ticketId;
    if (!ticketId) return false;
    // The recipient must be a real admin, and the ticket must really
    // have just been filed by this caller.
    const [{ data: recipientProfile }, { data: ticket }] = await Promise.all([
      admin.from("profiles").select("is_admin").eq("id", recipientId).single(),
      admin
        .from("support_tickets")
        .select("id")
        .eq("id", ticketId)
        .eq("user_id", callerId)
        .gte("created_at", recentCutoff)
        .single(),
    ]);
    return !!recipientProfile?.is_admin && !!ticket;
  }

  return false;
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
    const resendKey = Deno.env.get("RESEND_API_KEY");
    // onboarding@resend.dev works out of the box but — per Resend's own
    // sandbox rules — can only actually deliver to the email address
    // the Resend account itself was signed up with, until a real domain
    // is verified at resend.com/domains. Fine for confirming the wiring
    // works; not fine for real participants until that's done. See the
    // deploy instructions this function's author gave Sasha alongside
    // this file.
    const fromAddress = Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>";

    // An authentication gate — confirms who's really calling — but NOT
    // by itself sufficient to send anything (2026-08-30 security fix):
    // verifyClaim() below still has to confirm this caller has a real
    // reason to trigger this specific notifId toward this recipient.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Не авторизовано." }, 401);
    }
    const callerId = userData.user.id;

    const payload = await req.json().catch(() => null);
    const recipientId = payload?.recipientId as string | undefined;
    const notifId = payload?.notifId as string | undefined;
    const subject = payload?.subject as string | undefined;
    const text = payload?.text as string | undefined;
    const meta = (payload?.meta ?? {}) as Record<string, string>;

    if (!recipientId || !notifId || !subject || !text) {
      return json({ error: "Некоректний запит." }, 400);
    }
    // Closed allowlist (2026-08-30) — an unrecognized notifId used to
    // fall through DEFAULT_EMAIL_PREF's `?? true` and send anyway;
    // now it's rejected before anything else runs.
    if (!KNOWN_NOTIF_IDS.has(notifId)) {
      return json({ error: "Некоректний запит." }, 400);
    }
    // A generous but real cap — nothing legitimate here is anywhere
    // close to this long; this just keeps the function from being
    // usable as a bulk-content relay even toward a verified recipient.
    if (subject.length > 300 || text.length > 4000) {
      return json({ error: "Некоректний запит." }, 400);
    }

    if (!resendKey) {
      // Not configured yet — no-op rather than error, so triggers that
      // call this before Sasha has set up Resend don't break the
      // action they're attached to (sending a message still works even
      // if the email side isn't live yet).
      return json({ sent: false, reason: "email_not_configured" });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // The core fix: independently re-derive whether this send is
    // legitimate from real rows, never from the caller's say-so.
    const claimIsReal = await verifyClaim(admin, notifId, callerId, recipientId, meta);
    if (!claimIsReal) {
      return json({ sent: false, reason: "unverified" });
    }

    const { data: recipient, error: recipientError } = await admin
      .from("profiles")
      .select("email, notification_prefs")
      .eq("id", recipientId)
      .single();
    if (recipientError || !recipient?.email) {
      return json({ sent: false, reason: "recipient_not_found" });
    }

    const prefs = (recipient.notification_prefs ?? {}) as Record<string, { email?: boolean }>;
    const emailEnabled = prefs[notifId]?.email ?? DEFAULT_EMAIL_PREF[notifId] ?? true;
    if (!emailEnabled) {
      return json({ sent: false, reason: "opted_out" });
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipient.email,
        subject,
        text,
      }),
    });

    if (!resendResponse.ok) {
      const detail = await resendResponse.text().catch(() => "");
      return json({ sent: false, reason: "resend_error", detail }, 200);
    }

    return json({ sent: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
