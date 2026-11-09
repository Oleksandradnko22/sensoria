// Real persistence for the "Сповіщення" toggles in
// ParticipantProfile.tsx / AuthorSettings.tsx — those switches used to
// be local React state only, resetting on every reload. One jsonb
// column on `profiles`, keyed by whichever notification ids that
// screen defines (participant and author use different id sets; both
// share this same column and helpers). A missing key means "never
// touched" — the caller's own hardcoded defaults fill the gap, so this
// column only needs to store what someone actually changed.

import { supabase } from "./supabaseClient.ts";

export type NotificationPref = { email: boolean };
export type NotificationPrefs = Record<string, NotificationPref>;

export async function fetchNotificationPrefs(
  profileId: string,
  opts: { strict?: boolean } = {}
): Promise<NotificationPrefs> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("id", profileId)
    .single();
  if (error && opts.strict) throw error;
  if (error || !data) return {};
  return (data.notification_prefs as NotificationPrefs) ?? {};
}

// Client-side entry point for every real email trigger (new message,
// review reply, ...) — calls the send-notification-email Edge
// Function, which does the actual opt-in check and send server-side
// (never trust the caller to have already checked prefs; see that
// function's own comments). Fire-and-forget by design, same as
// touchDeviceSession: whatever action triggered this (sending a
// message, replying to a review) already succeeded on its own, the
// email is a best-effort side effect that shouldn't be able to fail
// that action.
//
// `meta` (2026-08-30, security fix): the Edge Function no longer just
// trusts subject/text — for notifIds where forging one would let any
// signed-in user email-impersonate Sensoria to any other user (a
// fabricated "reply"/"newTicket" with attacker-chosen content), it
// independently re-checks that a real, matching row was actually just
// written, using whichever id `meta` supplies (e.g. `{ reviewId }`).
// "message" needs no meta — sender+recipient+recency alone is already
// checkable against the real `messages` table.
export function sendNotificationEmail(
  recipientId: string,
  notifId: string,
  subject: string,
  text: string,
  meta?: Record<string, string>
): void {
  if (!supabase) return;
  supabase.functions
    .invoke("send-notification-email", { body: { recipientId, notifId, subject, text, meta } })
    .then(({ error }) => {
      if (error) {
        // eslint-disable-next-line no-console
        console.error("Не вдалося надіслати сповіщення на email:", error.message);
      }
    });
}

// Resolves true when the preference was really stored, false otherwise
// (never throws) — callers roll the switch back and tell the person.
// Writes ONE key atomically through the `set_notification_pref` function
// (notification-prefs-atomic-migration.sql), so two tabs/devices cannot
// overwrite each other. Until that migration is applied it falls back to a
// read-merge-write that at least starts from the latest stored value.
export async function saveNotificationPref(
  profileId: string,
  notifId: string,
  pref: NotificationPref,
  _currentPrefs?: NotificationPrefs
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.rpc("set_notification_pref", { p_notif_id: notifId, p_email: pref.email });
  if (!error) return true;

  const missing = error.code === "PGRST202" || error.code === "42883" || /could not find the function|does not exist/i.test(error.message);
  if (!missing) {
    // eslint-disable-next-line no-console
    console.error("Не вдалося зберегти налаштування сповіщень:", error.message);
    return false;
  }
  try {
    const latest = await fetchNotificationPrefs(profileId, { strict: true });
    const { error: writeError } = await supabase
      .from("profiles")
      .update({ notification_prefs: { ...latest, [notifId]: pref } })
      .eq("id", profileId);
    return !writeError;
  } catch {
    return false;
  }
}
