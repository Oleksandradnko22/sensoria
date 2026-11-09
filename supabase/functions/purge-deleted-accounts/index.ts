// Sensoria — purge-deleted-accounts Edge Function.
//
// The other half of the 14-day account-deletion recovery window (see
// delete-account/index.ts) — runs on a schedule (pg_cron, set up once
// by Sasha in the SQL Editor, see the deploy instructions given
// alongside this file), not per-request. Finds every profile whose
// deletion_requested_at is more than 14 days old and permanently
// deletes it via the same auth.admin.deleteUser() call (authors with sold material and
// participants with completed purchases are closed instead — see below); the old
// immediate-delete flow used — `profiles.id references auth.users(id)
// on delete cascade` still does the real work (content, purchases,
// reviews, messages, everything, gone).
//
// Not user-invocable — there's no legitimate reason a browser should
// ever call this. Authenticated with a shared secret (CRON_SECRET)
// instead of a user JWT, since pg_cron has no user session to send.
//
// DEPLOY (no CLI needed): Supabase Dashboard -> Edge Functions -> "Deploy a
// new function" -> "Via Editor" -> name it exactly "purge-deleted-accounts"
// -> paste this whole file -> Deploy. Then: Secrets -> add CRON_SECRET
// (any long random string you make up — not from anywhere else). See the
// pg_cron setup instructions given alongside this file for how the schedule
// itself gets created.

import { createClient } from "npm:@supabase/supabase-js@2";

const RECOVERY_WINDOW_DAYS = 14;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return json({ error: "Не авторизовано." }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey);

    const cutoff = new Date(
      Date.now() - RECOVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // left_platform_at is null: authors already closed below are not picked up again.
    const { data: due, error } = await admin
      .from("profiles")
      .select("id, role")
      .not("deletion_requested_at", "is", null)
      .is("left_platform_at", null)
      .lt("deletion_requested_at", cutoff);
    if (error) return json({ error: error.message }, 500);

    let purged = 0;
    const failures: string[] = [];
    let closed = 0;
    for (const row of due ?? []) {
      // An author whose materials have buyers is CLOSED, not deleted: the
      // content stays (archived) so buyers keep access; the account can no
      // longer sign in. See supabase/author-exit-migration.sql.
      if (row.role === "author") {
        const { data: owned } = await admin.from("content").select("id").eq("author_id", row.id);
        const ids = (owned ?? []).map((c) => c.id as string);
        let sold = 0;
        if (ids.length) {
          const { count } = await admin
            .from("purchases")
            .select("id", { count: "exact", head: true })
            .in("content_id", ids);
          sold = count ?? 0;
        }
        if (sold > 0) {
          const { error: closeError } = await admin.rpc("close_author_account", { p_author: row.id });
          if (closeError) {
            failures.push(`${row.id}: ${closeError.message}`);
            continue;
          }
          // no more sign-ins; the auth row stays so the content/purchases stay linked
          await admin.auth.admin.updateUserById(row.id, {
            ban_duration: "876000h",
            email: `closed-${row.id}@deleted.invalid`,
          });
          closed += 1;
          continue;
        }
      }
      // A participant with completed purchases is CLOSED too: the purchase records
      // stay (access can be restored into a new account by the admin), personal
      // and learning data is deleted, sign-in is closed.
      if (row.role === "participant") {
        const { count: bought } = await admin
          .from("purchases")
          .select("id", { count: "exact", head: true })
          .eq("participant_id", row.id)
          .eq("status", "completed");
        if ((bought ?? 0) > 0) {
          const { data: prof } = await admin.from("profiles").select("email").eq("id", row.id).maybeSingle();
          const hash = await sha256Hex(String(prof?.email ?? "").trim().toLowerCase());
          const { error: closeError } = await admin.rpc("close_participant_account", { p_profile: row.id, p_email_hash: hash });
          if (closeError) {
            failures.push(`${row.id}: ${closeError.message}`);
            continue;
          }
          await admin.auth.admin.updateUserById(row.id, {
            ban_duration: "876000h",
            email: `closed-${row.id}@deleted.invalid`,
          });
          closed += 1;
          continue;
        }
      }
      const { error: deleteError } = await admin.auth.admin.deleteUser(row.id);
      if (deleteError) {
        failures.push(`${row.id}: ${deleteError.message}`);
      } else {
        purged += 1;
      }
    }

    return json({ purged, closed, failures });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
