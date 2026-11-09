// Sensoria — delete-account Edge Function.
//
// Used to be an immediate, permanent auth.admin.deleteUser() call. Now
// a REQUEST for deletion, not the deletion itself: marks the account
// (deletion_requested_at = now()), signs out every session everywhere
// (not just this browser — admin.signOut with scope 'global'), and
// emails a real recovery notice. The actual permanent removal happens
// 14 days later, via the separate purge-deleted-accounts function on a
// schedule (see that file) — this keeps the exact same cascading
// delete (profiles/content/purchases/reviews/messages, all via
// `on delete cascade`) that this function used to do directly, just
// deferred.
//
// Logging back in during the 14 days shows a dedicated "Відновити
// акаунт?" screen (RestoreAccountStep.tsx, via
// src/lib/auth.ts's restoreAccount()) instead of the normal dashboard —
// fetchCurrentProfile() deliberately does NOT force a sign-out for a
// pending-deletion account (unlike is_banned) specifically so that
// screen is reachable at all.
//
// DEPLOY (no CLI needed): Supabase Dashboard -> Edge Functions ->
// "delete-account" -> Edit -> replace the whole file with this -> Deploy.
// Reuses the RESEND_API_KEY / RESEND_FROM secrets already set up for
// send-notification-email.

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

const RECOVERY_WINDOW_DAYS = 14;

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
    const userId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("email, name, role")
      .eq("id", userId)
      .single();

    const { error: updateError } = await admin
      .from("profiles")
      .update({ deletion_requested_at: new Date().toISOString() })
      .eq("id", userId);
    if (updateError) return json({ error: updateError.message }, 500);

    // An author leaving: sales stop immediately (published -> archived).
    // Buyers who already paid keep access (see author-exit-migration.sql);
    // nothing is deleted here, and the 14-day restore window still applies.
    if (profile?.role === "author") {
      await admin
        .from("content")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("author_id", userId)
        .in("status", ["published", "review"]);
    }

    // Kills every session on every device right away — not just this
    // browser's local signOut(). Without this, a still-valid refresh
    // token elsewhere would keep working right up until it happened to
    // expire on its own.
    await admin.auth.admin.signOut(userId, "global");

    // Best-effort, same as every other notification email here — a
    // failed send shouldn't undo the deletion request itself. This one
    // deliberately does NOT go through send-notification-email's
    // opt-in check (notification_prefs): it's an account-security
    // notice, not a preference-gated one, same category as the
    // password-change confirmation would be.
    if (resendKey && profile?.email) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: profile.email,
          subject: "Ваш акаунт Sensoria заплановано до видалення",
          text: `Вітаємо${profile.name ? `, ${profile.name}` : ""}.\n\nВи (або хтось із доступом до вашого акаунту) щойно подали запит на видалення акаунту Sensoria.\n\nАкаунт ще НЕ видалено. У вас є ${RECOVERY_WINDOW_DAYS} днів, щоб передумати — просто увійдіть у свій акаунт (email + пароль) протягом цього часу, і побачите кнопку «Відновити акаунт».\n\nЯкщо ви не заходили протягом ${RECOVERY_WINDOW_DAYS} днів, акаунт та всі пов'язані дані (курси, покупки, відгуки, повідомлення) буде видалено остаточно і без можливості відновлення.\n\nЯкщо це не ви подали цей запит — увійдіть у акаунт якнайшвидше і відновіть його, а також змініть пароль.`,
        }),
      }).catch(() => {
        // eslint-disable-next-line no-console
        console.error("Не вдалося надіслати лист про видалення акаунту.");
      });
    }

    return json({ ok: true, recoveryWindowDays: RECOVERY_WINDOW_DAYS });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
