// Sensoria — admin-data Edge Function.
//
// Backs the admin panel (src/pages/AdminDashboardPage.tsx / src/lib/admin.ts).
// Everything an admin needs to see — every profile, the full moderation
// log, cross-author content counts — is deliberately NOT exposed through
// normal RLS-governed client queries (that would mean any authenticated
// user could read it too). This function checks the caller is really an
// admin (profiles.is_admin, looked up server-side, never trusted from the
// client) and only then uses the service-role key to read/write on their
// behalf. Same shape as send-message's authorization pattern.
//
// DEPLOY (no CLI needed): Supabase Dashboard -> Edge Functions -> "Deploy a
// new function" -> "Via Editor" -> name it exactly "admin-data" -> paste
// this whole file -> Deploy.

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
    // Only used by resolveTicket's "your ticket got a reply" email —
    // same Resend account as send-notification-email, but sent
    // directly from here rather than by invoking that function,
    // because that function authenticates the CALLER as a real user
    // (authClient.auth.getUser()) and a service-role key isn't one —
    // it would fail that check. Same env var names, so if Sasha has
    // already added them under send-notification-email's secrets,
    // Supabase project-wide secrets mean they're already visible here
    // too; if not, add RESEND_API_KEY under admin-data's own secrets.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromAddress = Deno.env.get("RESEND_FROM") ?? "Sensoria <onboarding@resend.dev>";

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData.user) {
      return json({ error: "Не авторизовано." }, 401);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Best-effort audit trail of admin actions (table admin_actions, see
    // admin-actions-migration.sql). A failure here must never fail the
    // action itself, so errors are swallowed.
    let actionReason: string | null = null; // set from the request below
    const logAction = async (action: string, targetId?: string, details?: Record<string, unknown>) => {
      try {
        await admin.from("admin_actions").insert({
          actor_id: userData.user.id,
          action,
          target_id: targetId ?? null,
          details: details ?? null,
          reason: actionReason,
        });
      } catch {
        /* ignore */
      }
    };

    // Never trust a client-supplied "I'm an admin" flag — look it up
    // server-side from the caller's own verified id every single call.
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("is_admin, admin_role")
      .eq("id", userData.user.id)
      .single();
    if (!callerProfile?.is_admin) {
      return json({ error: "Доступ лише для команди Sensoria." }, 403);
    }
    // is_admin without an explicit role counts as the owner (back-compat).
    const adminRole: "owner" | "support" = callerProfile.admin_role === "support" ? "support" : "owner";

    // Second factor: the session must have passed 2FA (aal2). The token was
    // just verified by getUser() above, so its claims can be read.
    // Escape hatch for the very first setup: secret ADMIN_REQUIRE_2FA=false.
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    let aal = "aal1";
    try {
      const b64 = bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      aal = JSON.parse(atob(b64)).aal ?? "aal1";
    } catch {
      /* keep aal1 */
    }
    const mfaOk = Deno.env.get("ADMIN_REQUIRE_2FA") === "false" || aal === "aal2";

    const payload = await req.json().catch(() => null);
    const action = payload?.action as string | undefined;
    const reasonRaw = typeof payload?.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
    actionReason = reasonRaw || null;

    // Who am I: always answered (so the panel can explain a 2FA refusal).
    if (action === "me") {
      return json({ role: adminRole, mfaOk });
    }
    if (!mfaOk) {
      return json({
        error: "Для адмін-панелі потрібна двофакторна автентифікація. Увімкніть її в налаштуваннях кабінету, вийдіть і увійдіть знову з кодом.",
      }, 403);
    }

    // Least privilege: support sees and handles requests, can pause a sale;
    // everything that changes accounts, money-adjacent state or content for
    // good is owner-only.
    const SUPPORT_ACTIONS = new Set([
      "stats", "analytics", "users", "userDetail", "refundRequests", "markRefundReviewed",
      "contentReports", "markContentReportReviewed", "reports", "markReportReviewed",
      "supportTickets", "resolveTicket", "materials",
    ]);
    const SUPPORT_ACTS = new Set(["suspend_sale"]);
    if (adminRole === "support") {
      const ok =
        (action && SUPPORT_ACTIONS.has(action)) ||
        ((action === "reportAction" || action === "materialAction") && SUPPORT_ACTS.has(String(payload?.act)));
      if (!ok) return json({ error: "Ця дія доступна лише власнику платформи." }, 403);
    }
    // Sensitive actions must say why (kept in the audit log).
    const NEEDS_REASON = new Set(["send_back", "unpublish_content", "restore_sale", "suspend_sale", "restrict_access", "restore_access", "delete_material", "unlist", "restore", "suspend"]);
    if ((action === "reportAction" || action === "materialAction") && NEEDS_REASON.has(String(payload?.act)) && reasonRaw.length < 3) {
      return json({ error: "Вкажіть причину дії (хоча б кілька слів)." }, 400);
    }
    if (action === "setBanned" && payload?.banned === true && reasonRaw.length < 3) {
      return json({ error: "Вкажіть причину блокування." }, 400);
    }

    // Every complaint in one shape (used by "reports", "users" and "userDetail").
    const collectReports = async () => {
        const LIM = 200;
        const REASON: Record<string, string> = {
          inappropriate_content: "Неприйнятний контент",
          incorrect_claims: "Некоректні твердження",
          requests_contact_info: "Просить особисті контакти",
          offers_off_platform_payment: "Пропонує оплату поза Sensoria",
          inappropriate_behavior: "Некоректна поведінка",
          harassment: "Образи, агресія, цькування",
          spam_or_ads: "Спам або реклама",
          misleading: "Введення в оману / шахрайство",
          impersonation: "Видає себе за іншу людину",
          other: "Інше",
        };
        const reasonText = (r: string) => REASON[r] ?? r;
        const clip = (t: string | null | undefined, n = 240) =>
          t ? (t.length > n ? t.slice(0, n).trimEnd() + "…" : t) : null;

        const [msg, content, lesson, postC, ent] = await Promise.all([
          admin.from("message_reports").select("id, reporter_id, reported_id, reason, details, status, created_at").order("created_at", { ascending: false }).limit(LIM),
          admin.from("content_reports").select("id, reporter_id, content_item_id, content_kind, content_title, reason, details, status, created_at").order("created_at", { ascending: false }).limit(LIM),
          admin.from("content_comment_reports").select("id, reporter_id, comment_id, reason, status, created_at").order("created_at", { ascending: false }).limit(LIM),
          admin.from("author_post_comment_reports").select("id, reporter_id, comment_id, reason, status, created_at").order("created_at", { ascending: false }).limit(LIM),
          admin.from("entity_reports").select("id, reporter_id, target_type, target_id, target_owner_id, target_label, reason, details, status, created_at").order("created_at", { ascending: false }).limit(LIM),
        ]);
        // A missing table (migration not applied yet) must not break the rest.
        const rows = <T,>(r: { data: T[] | null; error: unknown }) => (r.error ? [] : r.data ?? []);
        const msgRows = rows(msg), contentRows = rows(content), lessonRows = rows(lesson), postCRows = rows(postC), entRows = rows(ent);

        const lessonIds = lessonRows.map((r) => r.comment_id);
        const postCIds = postCRows.map((r) => r.comment_id);
        const { data: lessonComments } = lessonIds.length
          ? await admin.from("content_comments").select("id, user_id, body").in("id", lessonIds)
          : { data: [] as { id: string; user_id: string; body: string }[] };
        const { data: postComments } = postCIds.length
          ? await admin.from("author_post_comments").select("id, user_id, body").in("id", postCIds)
          : { data: [] as { id: string; user_id: string; body: string }[] };
        const lessonById = new Map((lessonComments ?? []).map((c) => [c.id, c]));
        const postCById = new Map((postComments ?? []).map((c) => [c.id, c]));

        const postTargetIds = entRows.filter((r) => r.target_type === "post").map((r) => r.target_id);
        const { data: posts } = postTargetIds.length
          ? await admin.from("author_posts").select("id, body").in("id", postTargetIds)
          : { data: [] as { id: string; body: string }[] };
        const postById = new Map((posts ?? []).map((p) => [p.id, p]));

        const personIds = new Set<string>();
        const add = (v: string | null | undefined) => { if (v) personIds.add(v); };
        msgRows.forEach((r) => { add(r.reporter_id); add(r.reported_id); });
        contentRows.forEach((r) => add(r.reporter_id));
        lessonRows.forEach((r) => { add(r.reporter_id); add(lessonById.get(r.comment_id)?.user_id); });
        postCRows.forEach((r) => { add(r.reporter_id); add(postCById.get(r.comment_id)?.user_id); });
        entRows.forEach((r) => { add(r.reporter_id); add(r.target_owner_id); });
        const { data: people } = personIds.size
          ? await admin.from("profiles").select("id, name, email").in("id", Array.from(personIds))
          : { data: [] as { id: string; name: string; email: string }[] };
        const who = new Map((people ?? []).map((p) => [p.id, p]));
        const person = (id: string | null | undefined) => {
          const p = id ? who.get(id) : undefined;
          return { name: p?.name ?? null, email: p?.email ?? null };
        };

        type Out = Record<string, unknown> & { createdAt: string };
        const out: Out[] = [];
        msgRows.forEach((r) => out.push({
          id: r.id, source: "message", targetType: "person", targetId: r.reported_id, ownerId: r.reported_id,
          targetLabel: "Користувач у чаті", snippet: null,
          reporterName: person(r.reporter_id).name, reporterEmail: person(r.reporter_id).email,
          ownerName: person(r.reported_id).name, ownerEmail: person(r.reported_id).email,
          reason: reasonText(r.reason), details: r.details, status: r.status, createdAt: r.created_at,
        }));
        contentRows.forEach((r) => out.push({
          id: r.id, source: "content", targetType: r.content_kind, targetId: r.content_item_id, ownerId: null,
          targetLabel: r.content_title, snippet: null,
          reporterName: person(r.reporter_id).name, reporterEmail: person(r.reporter_id).email,
          ownerName: null, ownerEmail: null,
          reason: reasonText(r.reason), details: r.details, status: r.status, createdAt: r.created_at,
        }));
        lessonRows.forEach((r) => {
          const c = lessonById.get(r.comment_id);
          out.push({
            id: r.id, source: "lesson_comment", targetType: "comment", targetId: r.comment_id, ownerId: c?.user_id ?? null,
            targetLabel: "Коментар до уроку", snippet: c ? clip(c.body) : "Коментар уже видалено",
            reporterName: person(r.reporter_id).name, reporterEmail: person(r.reporter_id).email,
            ownerName: person(c?.user_id).name, ownerEmail: person(c?.user_id).email,
            reason: r.reason, details: null, status: r.status, createdAt: r.created_at,
          });
        });
        postCRows.forEach((r) => {
          const c = postCById.get(r.comment_id);
          out.push({
            id: r.id, source: "post_comment", targetType: "comment", targetId: r.comment_id, ownerId: c?.user_id ?? null,
            targetLabel: "Коментар до публікації автора", snippet: c ? clip(c.body) : "Коментар уже видалено",
            reporterName: person(r.reporter_id).name, reporterEmail: person(r.reporter_id).email,
            ownerName: person(c?.user_id).name, ownerEmail: person(c?.user_id).email,
            reason: r.reason, details: null, status: r.status, createdAt: r.created_at,
          });
        });
        entRows.forEach((r) => out.push({
          id: r.id, source: "entity", targetType: r.target_type, targetId: r.target_id, ownerId: r.target_owner_id,
          targetLabel: r.target_label ?? "—",
          snippet: r.target_type === "post" ? clip(postById.get(r.target_id)?.body) ?? "Публікацію вже видалено" : null,
          reporterName: person(r.reporter_id).name, reporterEmail: person(r.reporter_id).email,
          ownerName: person(r.target_owner_id).name, ownerEmail: person(r.target_owner_id).email,
          reason: reasonText(r.reason), details: r.details, status: r.status, createdAt: r.created_at,
        }));
        out.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        return out;
    };

    switch (action) {
      case "stats": {
        const [
          { count: authorCount },
          { count: participantCount },
          { count: publishedCount },
          { count: draftCount },
          { count: reviewCount },
          { count: blockCount30d },
          { count: warnCount30d },
        ] = await Promise.all([
          admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "author"),
          admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "participant"),
          admin.from("content").select("id", { count: "exact", head: true }).eq("status", "published"),
          admin.from("content").select("id", { count: "exact", head: true }).eq("status", "draft"),
          admin.from("content").select("id", { count: "exact", head: true }).eq("status", "review"),
          admin
            .from("message_moderation_log")
            .select("id", { count: "exact", head: true })
            .eq("action", "BLOCK")
            .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
          admin
            .from("message_moderation_log")
            .select("id", { count: "exact", head: true })
            .eq("action", "WARN")
            .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        ]);
        return json({
          authorCount: authorCount ?? 0,
          participantCount: participantCount ?? 0,
          publishedCount: publishedCount ?? 0,
          draftCount: draftCount ?? 0,
          reviewCount: reviewCount ?? 0,
          blockCount30d: blockCount30d ?? 0,
          warnCount30d: warnCount30d ?? 0,
        });
      }

      // Analytics page (period-aware). `days` = 7 | 30 | 90, or 0 for
      // "всі часи". Windows are rolling ([now-days, now]) and the
      // comparison window is the equal-length one right before it —
      // the client buckets the returned timestamps with the same
      // boundaries (generatedAt), so charts and counters agree.
      case "analytics": {
        const days = Number(payload?.days);
        if (![0, 7, 30, 90].includes(days)) return json({ error: "Некоректний період." }, 400);

        const now = Date.now();
        const DAY = 24 * 60 * 60 * 1000;
        const fromMs = days > 0 ? now - days * DAY : null;
        const prevFromMs = days > 0 ? now - 2 * days * DAY : null;
        const iso = (ms: number) => new Date(ms).toISOString();
        const SERIES_LIMIT = 5000;

        const countProfiles = (role: string, gte?: number | null, lt?: number | null) => {
          let q = admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", role);
          if (gte != null) q = q.gte("created_at", iso(gte));
          if (lt != null) q = q.lt("created_at", iso(lt));
          return q;
        };
        const countModeration = (action: string, gte?: number | null, lt?: number | null) => {
          let q = admin
            .from("message_moderation_log")
            .select("id", { count: "exact", head: true })
            .eq("action", action);
          if (gte != null) q = q.gte("created_at", iso(gte));
          if (lt != null) q = q.lt("created_at", iso(lt));
          return q;
        };
        const countContent = (status: string, kind?: string) => {
          let q = admin.from("content").select("id", { count: "exact", head: true }).eq("status", status);
          if (kind) q = q.eq("kind", kind);
          return q;
        };

        let regQ = admin
          .from("profiles")
          .select("created_at")
          .eq("role", "participant")
          .order("created_at", { ascending: false })
          .limit(SERIES_LIMIT);
        let contentQ = admin
          .from("content")
          .select("created_at")
          .order("created_at", { ascending: false })
          .limit(SERIES_LIMIT);
        if (fromMs != null) {
          regQ = regQ.gte("created_at", iso(fromMs));
          contentQ = contentQ.gte("created_at", iso(fromMs));
        }

        const results = await Promise.all([
          countProfiles("author"),
          countProfiles("participant"),
          countContent("published"),
          countContent("draft"),
          countContent("review"),
          countContent("published", "program"),
          countContent("published", "guide"),
          countContent("published", "meditation"),
          countModeration("BLOCK", fromMs),
          countModeration("WARN", fromMs),
          fromMs != null ? countModeration("BLOCK", prevFromMs, fromMs) : Promise.resolve(null),
          fromMs != null ? countModeration("WARN", prevFromMs, fromMs) : Promise.resolve(null),
          countProfiles("participant", fromMs),
          fromMs != null ? countProfiles("participant", prevFromMs, fromMs) : Promise.resolve(null),
          regQ,
          contentQ,
          admin
            .from("profiles")
            .select("id, name, email, is_banned, created_at")
            .eq("role", "participant")
            .order("created_at", { ascending: false })
            .limit(5),
          admin
            .from("content")
            .select("id, author_id, kind, title, cover_url, updated_at")
            .eq("status", "published")
            .order("updated_at", { ascending: false })
            .limit(5),
        ]);

        // Never turn a failed query into a zero — fail the whole call so
        // the page can show an error + retry instead of fake numbers.
        for (const r of results) {
          if (r && (r as { error?: { message: string } }).error) {
            return json({ error: (r as { error: { message: string } }).error.message }, 500);
          }
        }
        // People whose chat is banned right now. Optional: if the chat-ban
        // columns don't exist yet (migration not run) this is just null.
        const { count: chatBannedCount, error: chatBannedError } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .or(`chat_ban_permanent.eq.true,chat_banned_until.gt.${iso(now)}`);
        const chatBanned = chatBannedError ? null : chatBannedCount ?? 0;

        const c = (i: number) => (results[i] as { count: number | null } | null)?.count ?? null;
        const rows = (i: number) => ((results[i] as { data: unknown[] | null }).data ?? []) as Record<string, unknown>[];

        const recentContentRows = rows(17);
        const authorIds = Array.from(new Set(recentContentRows.map((r) => r.author_id as string)));
        const { data: authorProfiles } = authorIds.length
          ? await admin.from("profiles").select("id, name").in("id", authorIds)
          : { data: [] as { id: string; name: string }[] };
        const authorName = new Map((authorProfiles ?? []).map((p) => [p.id, p.name]));

        return json({
          generatedAt: iso(now),
          days,
          totals: {
            authors: c(0),
            participants: c(1),
            published: c(2),
            drafts: c(3),
            review: c(4),
            publishedByKind: { program: c(5), guide: c(6), meditation: c(7) },
            chatBanned,
          },
          period: {
            block: c(8),
            warn: c(9),
            prevBlock: c(10),
            prevWarn: c(11),
            newParticipants: c(12),
            prevNewParticipants: c(13),
          },
          series: {
            registrations: rows(14).map((r) => r.created_at as string),
            content: rows(15).map((r) => r.created_at as string),
            registrationsTruncated: rows(14).length >= SERIES_LIMIT,
            contentTruncated: rows(15).length >= SERIES_LIMIT,
          },
          recentParticipants: rows(16).map((p) => ({
            id: p.id,
            name: p.name,
            email: p.email,
            isBanned: p.is_banned,
            createdAt: p.created_at,
          })),
          recentContent: recentContentRows.map((r) => ({
            id: r.id,
            title: r.title,
            kind: r.kind,
            coverUrl: r.cover_url,
            authorName: authorName.get(r.author_id as string) ?? "—",
            updatedAt: r.updated_at,
          })),
        });
      }

      // Moderation page: only the decisions that need a human look
      // (WARN / BLOCK, newest first, up to 500). ALLOW rows are not
      // returned — just a count, so the page can say "N passed fine".
      case "moderationLog": {
        const { data: rows, error } = await admin
          .from("message_moderation_log")
          .select("id, sender_id, recipient_id, content_id, action, risk_score, categories, detectors_triggered, created_at")
          .in("action", ["WARN", "BLOCK"])
          .order("created_at", { ascending: false })
          .limit(500);
        if (error) return json({ error: error.message }, 500);

        // Exact number of WARN/BLOCK rows — so the page can say honestly
        // when it only shows the latest 500 of them.
        const { count: flaggedTotal, error: flaggedError } = await admin
          .from("message_moderation_log")
          .select("id", { count: "exact", head: true })
          .in("action", ["WARN", "BLOCK"]);
        if (flaggedError) return json({ error: flaggedError.message }, 500);

        const { count: allowedCount, error: allowedError } = await admin
          .from("message_moderation_log")
          .select("id", { count: "exact", head: true })
          .eq("action", "ALLOW");
        if (allowedError) return json({ error: allowedError.message }, 500);

        const senderIds = Array.from(new Set((rows ?? []).map((r) => r.sender_id)));
        const { data: profiles } = senderIds.length
          ? await admin.from("profiles").select("id, name, email, is_banned, chat_banned_until, chat_ban_permanent, chat_ban_count").in("id", senderIds)
          : { data: [] as { id: string; name: string; email: string; is_banned: boolean; chat_banned_until: string | null; chat_ban_permanent: boolean; chat_ban_count: number }[] };
        const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

        return json({
          allowedCount: allowedCount ?? 0,
          flaggedTotal: flaggedTotal ?? 0,
          entries: (rows ?? []).map((r) => ({
            id: r.id,
            senderId: r.sender_id,
            senderName: byId.get(r.sender_id)?.name ?? "—",
            senderEmail: byId.get(r.sender_id)?.email ?? "—",
            senderAccountBanned: byId.get(r.sender_id)?.is_banned ?? false,
            senderChatBan: {
              permanent: byId.get(r.sender_id)?.chat_ban_permanent ?? false,
              until: byId.get(r.sender_id)?.chat_banned_until ?? null,
              count: byId.get(r.sender_id)?.chat_ban_count ?? 0,
            },
            action: r.action,
            riskScore: r.risk_score,
            categories: r.categories,
            detectorsTriggered: r.detectors_triggered,
            createdAt: r.created_at,
          })),
        });
      }

      case "adminActions": {
        const { data: rows, error } = await admin
          .from("admin_actions")
          .select("id, actor_id, action, target_id, reason, details, created_at")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) return json({ error: error.message }, 500);
        const ids = Array.from(
          new Set((rows ?? []).flatMap((r) => [r.actor_id, r.target_id]).filter(Boolean) as string[])
        );
        const { data: people } = ids.length
          ? await admin.from("profiles").select("id, name, email").in("id", ids)
          : { data: [] as { id: string; name: string; email: string }[] };
        const byId = new Map((people ?? []).map((p) => [p.id, p]));
        return json({
          actions: (rows ?? []).map((r) => ({
            id: r.id,
            action: r.action,
            actorName: byId.get(r.actor_id)?.name ?? "—",
            targetName: r.target_id ? byId.get(r.target_id)?.name ?? null : null,
            targetEmail: r.target_id ? byId.get(r.target_id)?.email ?? null : null,
            reason: r.reason ?? null,
            materialTitle: (r.details as { title?: string } | null)?.title ?? null,
            createdAt: r.created_at,
          })),
        });
      }

      case "users": {
        // Searchable + paged (PAGE per call) so account #201 can be found.
        const PAGE = 100;
        const offset = Math.max(0, Number(payload?.offset) || 0);
        // Strip characters that would break the PostgREST or() filter / wildcards.
        const q = String(payload?.query ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 80);
        let query = admin
          .from("profiles")
          .select("id, role, name, email, is_admin, is_banned, chat_banned_until, chat_ban_permanent, chat_ban_count, created_at", { count: "exact" })
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%`);
        const { data: profiles, count, error } = await query;
        if (error) return json({ error: error.message }, 500);

        const authorIds = (profiles ?? []).filter((p) => p.role === "author").map((p) => p.id);
        const { data: details } = authorIds.length
          ? await admin.from("author_details").select("profile_id, verified, education_verified").in("profile_id", authorIds)
          : { data: [] as { profile_id: string; verified: boolean; education_verified?: boolean }[] };
        const verifiedById = new Map((details ?? []).map((d) => [d.profile_id, d.verified]));
        const educationById = new Map((details ?? []).map((d) => [d.profile_id, !!d.education_verified]));

        // All-time complaint count per ACCOUNT across every kind of report
        // (chat, comments, posts, reviews, author) — only a tally leaves here.
        const reportCountById = new Map<string, number>();
        (await collectReports()).forEach((r) => {
          const o = r.ownerId as string | null;
          if (o) reportCountById.set(o, (reportCountById.get(o) ?? 0) + 1);
        });

        return json({
          total: count ?? null,
          users: (profiles ?? []).map((p) => ({
            id: p.id,
            role: p.role,
            name: p.name,
            email: p.email,
            isAdmin: p.is_admin,
            isBanned: p.is_banned,
            chatBan: {
              permanent: p.chat_ban_permanent ?? false,
              until: p.chat_banned_until ?? null,
              count: p.chat_ban_count ?? 0,
            },
            createdAt: p.created_at,
            verified: p.role === "author" ? verifiedById.get(p.id) ?? false : null,
            educationVerified: p.role === "author" ? educationById.get(p.id) ?? false : null,
            reportCount: reportCountById.get(p.id) ?? 0,
          })),
        });
      }

      // Everything about one person for the detail card.
      case "userDetail": {
        const profileId = payload?.profileId as string | undefined;
        if (!profileId) return json({ error: "Некоректний запит." }, 400);
        const reports = (await collectReports()).filter((r) => r.ownerId === profileId);
        const { data: acts } = await admin
          .from("admin_actions")
          .select("id, action, actor_id, created_at, details")
          .eq("target_id", profileId)
          .order("created_at", { ascending: false })
          .limit(30);
        const { data: reqs } = await admin
          .from("author_verification_requests")
          .select("id, status, reject_reason, created_at, reviewed_at")
          .eq("author_id", profileId)
          .order("created_at", { ascending: false })
          .limit(10);
        const { count: contentCount } = await admin
          .from("content")
          .select("id", { count: "exact", head: true })
          .eq("author_id", profileId);
        const { data: warns } = await admin
          .from("message_moderation_log")
          .select("action")
          .eq("sender_id", profileId)
          .in("action", ["WARN", "BLOCK"])
          .limit(1000);
        return json({
          reports,
          actions: (acts ?? []).map((a) => ({ id: a.id, action: a.action, createdAt: a.created_at })),
          verificationRequests: (reqs ?? []).map((r) => ({
            id: r.id, status: r.status, rejectReason: r.reject_reason, createdAt: r.created_at, reviewedAt: r.reviewed_at,
          })),
          contentCount: contentCount ?? 0,
          warnCount: (warns ?? []).filter((w) => w.action === "WARN").length,
          blockCount: (warns ?? []).filter((w) => w.action === "BLOCK").length,
        });
      }

      case "verifyAuthor": {
        const profileId = payload?.profileId as string | undefined;
        const verified = payload?.verified as boolean | undefined;
        if (!profileId || typeof verified !== "boolean") {
          return json({ error: "Некоректний запит." }, 400);
        }
        const { error } = await admin
          .from("author_details")
          .update({ verified })
          .eq("profile_id", profileId);
        if (error) return json({ error: error.message }, 500);
        await logAction(verified ? "verify_author" : "unverify_author", profileId);
        return json({ ok: true });
      }

      // Education documents reviewed («Фахівець») — set or taken back by the owner.
      case "setEducationVerified": {
        const profileId = payload?.profileId as string | undefined;
        const value = payload?.verified as boolean | undefined;
        if (!profileId || typeof value !== "boolean") return json({ error: "Некоректний запит." }, 400);
        if (!value && reasonRaw.length < 3) return json({ error: "Вкажіть причину зняття статусу." }, 400);
        const { error } = await admin.from("author_details").update({ education_verified: value }).eq("profile_id", profileId);
        if (error) return json({ error: error.message }, 500);
        await logAction(value ? "education_confirmed" : "education_revoked", profileId);
        return json({ ok: true });
      }

      // Restore a closed participant's purchases into a new account (owner only).
      case "restoreAccess": {
        const oldEmail = String(payload?.oldEmail ?? "").trim().toLowerCase();
        const newEmail = String(payload?.newEmail ?? "").trim().toLowerCase();
        if (!oldEmail || !newEmail) return json({ error: "Вкажіть обидві електронні адреси." }, 400);
        if (reasonRaw.length < 3) return json({ error: "Вкажіть причину (як ви переконалися, що це та сама людина)." }, 400);
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(oldEmail));
        const hash = Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
        const { data: closedRows } = await admin
          .from("closed_participants")
          .select("profile_id")
          .eq("email_hash", hash)
          .is("restored_to", null);
        if (!closedRows?.length) return json({ error: "Закритого акаунта з такою поштою не знайдено." }, 404);
        const { data: target } = await admin
          .from("profiles")
          .select("id, role, left_platform_at")
          .ilike("email", newEmail)
          .maybeSingle();
        if (!target || target.role !== "participant" || target.left_platform_at) {
          return json({ error: "Нового акаунта учасника з такою поштою не знайдено. Людина має спершу зареєструватися." }, 404);
        }
        let moved = 0;
        for (const r of closedRows) {
          const { data: n, error } = await admin.rpc("transfer_purchases", { p_from: r.profile_id, p_to: target.id });
          if (error) return json({ error: error.message }, 500);
          moved += Number(n) || 0;
        }
        await logAction("restore_purchases", target.id, { moved });
        return json({ ok: true, moved });
      }

      case "refundRequests": {
        const { data: rows, error } = await admin
          .from("refund_requests")
          .select(
            "id, participant_id, content_title, content_kind, amount, purchased_at, full_name, email, phone, reason, status, created_at"
          )
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return json({ error: error.message }, 500);
        return json({
          requests: (rows ?? []).map((r) => ({
            id: r.id,
            participantId: r.participant_id,
            contentTitle: r.content_title,
            contentKind: r.content_kind,
            amount: r.amount,
            purchasedAt: r.purchased_at,
            fullName: r.full_name,
            email: r.email,
            phone: r.phone,
            reason: r.reason,
            status: r.status,
            createdAt: r.created_at,
          })),
        });
      }

      case "markRefundReviewed": {
        const requestId = payload?.requestId as string | undefined;
        if (!requestId) return json({ error: "Некоректний запит." }, 400);
        const { error } = await admin
          .from("refund_requests")
          .update({ status: "reviewed" })
          .eq("id", requestId);
        if (error) return json({ error: error.message }, 500);
        await logAction("refund_reviewed", requestId);
        return json({ ok: true });
      }

      case "contentReports": {
        // "•••" → "Поскаржитися" on a meditation (2026-08-30, per
        // Sasha's explicit call). Same shape as refundRequests above —
        // content_title/content_kind are already a snapshot on the row
        // itself (content_reports-migration.sql), only the reporter's
        // name/email needs a join.
        const { data: rows, error } = await admin
          .from("content_reports")
          .select("id, reporter_id, content_item_id, content_kind, content_title, reason, details, status, created_at")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return json({ error: error.message }, 500);

        const reporterIds = Array.from(new Set((rows ?? []).map((r) => r.reporter_id)));
        const { data: profiles } = reporterIds.length
          ? await admin.from("profiles").select("id, name, email").in("id", reporterIds)
          : { data: [] as { id: string; name: string; email: string }[] };
        const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

        return json({
          reports: (rows ?? []).map((r) => ({
            id: r.id,
            reporterName: byId.get(r.reporter_id)?.name ?? "—",
            reporterEmail: byId.get(r.reporter_id)?.email ?? "—",
            contentItemId: r.content_item_id,
            contentKind: r.content_kind,
            contentTitle: r.content_title,
            reason: r.reason,
            details: r.details,
            status: r.status,
            createdAt: r.created_at,
          })),
        });
      }

      case "markContentReportReviewed": {
        const reportId = payload?.reportId as string | undefined;
        if (!reportId) return json({ error: "Некоректний запит." }, 400);
        const { error } = await admin
          .from("content_reports")
          .update({ status: "reviewed" })
          .eq("id", reportId);
        if (error) return json({ error: error.message }, 500);
        await logAction("content_report_reviewed", reportId);
        return json({ ok: true });
      }

      case "reports": {
        const all = await collectReports();
        return json({ reports: all.slice(0, 400) });
      }

      case "markReportReviewed": {
        const reportId = payload?.reportId as string | undefined;
        const source = payload?.source as string | undefined;
        const TABLE: Record<string, string> = {
          message: "message_reports",
          content: "content_reports",
          lesson_comment: "content_comment_reports",
          post_comment: "author_post_comment_reports",
          entity: "entity_reports",
        };
        const table = source ? TABLE[source] : undefined;
        if (!reportId || !table) return json({ error: "Некоректний запит." }, 400);
        const { error } = await admin.from(table).update({ status: "reviewed" }).eq("id", reportId);
        if (error) return json({ error: error.message }, 500);
        await logAction("report_reviewed", reportId, { source });
        return json({ ok: true });
      }

      case "supportTickets": {
        const { data: rows, error } = await admin
          .from("support_tickets")
          .select("id, user_id, category, description, status, admin_response, created_at, resolved_at")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return json({ error: error.message }, 500);

        const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
        const { data: profiles } = userIds.length
          ? await admin.from("profiles").select("id, role, name, email").in("id", userIds)
          : { data: [] as { id: string; role: string; name: string; email: string }[] };
        const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

        return json({
          tickets: (rows ?? []).map((r) => ({
            id: r.id,
            userId: r.user_id,
            userName: byId.get(r.user_id)?.name ?? "—",
            userEmail: byId.get(r.user_id)?.email ?? "—",
            userRole: byId.get(r.user_id)?.role ?? null,
            category: r.category,
            description: r.description,
            status: r.status,
            adminResponse: r.admin_response,
            createdAt: r.created_at,
            resolvedAt: r.resolved_at,
          })),
        });
      }

      case "resolveTicket": {
        const ticketId = payload?.ticketId as string | undefined;
        const adminResponse = payload?.adminResponse as string | undefined;
        if (!ticketId) return json({ error: "Некоректний запит." }, 400);
        const { data: updated, error } = await admin
          .from("support_tickets")
          .update({
            status: "resolved",
            admin_response: adminResponse?.trim() || null,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", ticketId)
          .select("user_id, category")
          .single();
        if (error) return json({ error: error.message }, 500);

        // Best-effort "your ticket got a reply" email — a failed send
        // here shouldn't turn "Вирішено" into an error for the admin,
        // the status change itself already succeeded above.
        if (resendKey && updated?.user_id) {
          const { data: recipient } = await admin
            .from("profiles")
            .select("email, notification_prefs")
            .eq("id", updated.user_id)
            .single();
          const prefs = (recipient?.notification_prefs ?? {}) as Record<
            string,
            { email?: boolean }
          >;
          // No opt-out toggle exists for this in the UI (unlike
          // "reply"/"message"/"newContent"), so — same as
          // notifyAdminsOfNewTicket on the client — default to sending
          // unless somehow explicitly turned off.
          const emailEnabled = prefs["ticketResolved"]?.email ?? true;
          if (recipient?.email && emailEnabled) {
            const categoryLabels: Record<string, string> = {
              content: "Проблема з контентом",
              payment: "Проблема з оплатою",
              author: "Проблема з автором",
              rule_violation: "Порушення правил",
              technical: "Технічна проблема",
              other: "Інше",
            };
            const label = categoryLabels[updated.category] ?? updated.category;
            const text = adminResponse?.trim()
              ? `Ваше звернення («${label}») розглянуто.\n\nВідповідь команди:\n${adminResponse.trim()}`
              : `Ваше звернення («${label}») розглянуто. Деталі — у розділі «Допомога» → «Ваші звернення».`;
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromAddress,
                to: recipient.email,
                subject: "Ваше звернення в підтримку Sensoria розглянуто",
                text,
              }),
            }).catch(() => {});
          }
        }

        await logAction("ticket_resolved", ticketId);
        return json({ ok: true });
      }

      // Lift a chat ban (a misunderstanding): ends the ban now, takes one
      // step off the ladder (so the next ban is as long as this one was)
      // and restarts the BLOCK count from this moment.
      case "liftChatBan": {
        const profileId = payload?.profileId as string | undefined;
        if (!profileId) return json({ error: "Некоректний запит." }, 400);
        const { data: cur, error: readError } = await admin
          .from("profiles")
          .select("chat_ban_count")
          .eq("id", profileId)
          .single();
        if (readError) return json({ error: readError.message }, 500);
        const { error } = await admin
          .from("profiles")
          .update({
            chat_banned_until: null,
            chat_ban_permanent: false,
            chat_ban_count: Math.max(0, (cur?.chat_ban_count ?? 0) - 1),
            chat_ban_since: new Date().toISOString(),
          })
          .eq("id", profileId);
        if (error) return json({ error: error.message }, 500);
        // Best-effort "your chat is unblocked" email — never fails the action.
        if (resendKey) {
          const { data: who } = await admin.from("profiles").select("email").eq("id", profileId).maybeSingle();
          if (who?.email) {
            await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                from: fromAddress,
                to: who.email,
                subject: "Чат на Sensoria знову доступний",
                text: "Блокування вашого чату на Sensoria знято — ви знову можете надсилати повідомлення. Просимо дотримуватись правил спілкування на платформі.",
              }),
            }).catch(() => {});
          }
        }
        await logAction("lift_chat_ban", profileId);
        return json({ ok: true });
      }

      case "setBanned": {
        const profileId = payload?.profileId as string | undefined;
        const banned = payload?.banned as boolean | undefined;
        if (!profileId || typeof banned !== "boolean") {
          return json({ error: "Некоректний запит." }, 400);
        }
        // Can't ban yourself out of the panel by mistake.
        if (profileId === userData.user.id) {
          return json({ error: "Не можна заблокувати самого себе." }, 400);
        }
        // Nor another admin (the panel hides the button, the server enforces it).
        const { data: target } = await admin.from("profiles").select("is_admin").eq("id", profileId).maybeSingle();
        if (target?.is_admin) {
          return json({ error: "Не можна заблокувати адміністратора." }, 400);
        }
        const { error } = await admin.from("profiles").update({ is_banned: banned }).eq("id", profileId);
        if (error) return json({ error: error.message }, 500);
        // The profile flag only signs the person out in the app. Also ban the
        // auth user so a still-open session can't refresh its token and a new
        // sign-in is refused (best effort: the flag above is the source of truth).
        try {
          await admin.auth.admin.updateUserById(profileId, { ban_duration: banned ? "876000h" : "none" });
        } catch {
          /* ignore */
        }
        await logAction(banned ? "ban_account" : "unban_account", profileId);
        return json({ ok: true });
      }

      // An admin acts on the thing a complaint is about. The target is looked
      // up from the report row itself — never trusted from the client.
      case "reportAction": {
        const source = payload?.source as string | undefined;
        const reportId = payload?.reportId as string | undefined;
        const act = payload?.act as string | undefined;
        if (!source || !reportId || !act) return json({ error: "Некоректний запит." }, 400);
        const isUuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

        let removedFrom = "";
        let targetKey: { table: string; col: string; val: string } | null = null;
        if ((source === "lesson_comment" || source === "post_comment") && act === "delete_comment") {
          const repTable = source === "lesson_comment" ? "content_comment_reports" : "author_post_comment_reports";
          const { data: rep } = await admin.from(repTable).select("comment_id").eq("id", reportId).maybeSingle();
          if (!rep) return json({ error: "Скаргу не знайдено." }, 404);
          removedFrom = source === "lesson_comment" ? "content_comments" : "author_post_comments";
          // Deleting the comment cascades to its reports, so log before.
          await logAction("delete_comment", rep.comment_id, { source });
          const { error } = await admin.from(removedFrom).delete().eq("id", rep.comment_id);
          if (error) return json({ error: error.message }, 500);
          return json({ ok: true });
        }
        if (source === "entity" && (act === "delete_post" || act === "delete_review")) {
          const { data: rep } = await admin.from("entity_reports").select("target_type, target_id").eq("id", reportId).maybeSingle();
          if (!rep) return json({ error: "Скаргу не знайдено." }, 404);
          if (act === "delete_post" && rep.target_type !== "post") return json({ error: "Некоректна дія." }, 400);
          if (act === "delete_review" && rep.target_type !== "review") return json({ error: "Некоректна дія." }, 400);
          if (!isUuid(rep.target_id)) return json({ error: "Некоректний об'єкт." }, 400);
          const table = act === "delete_post" ? "author_posts" : "author_reviews";
          const { error } = await admin.from(table).delete().eq("id", rep.target_id);
          if (error) return json({ error: error.message }, 500);
          targetKey = { table: "entity_reports", col: "target_id", val: rep.target_id };
          await logAction(act, rep.target_id, { source });
        } else if (source === "content" && act === "unpublish_content") {
          const { data: rep } = await admin.from("content_reports").select("content_item_id").eq("id", reportId).maybeSingle();
          if (!rep) return json({ error: "Скаргу не знайдено." }, 404);
          if (!isUuid(rep.content_item_id)) {
            return json({ error: "Цей матеріал не в базі авторів (каталожний) — зняти з публікації тут не можна." }, 400);
          }
          // Permanently off sale (sale_status), the author's own status is left
          // alone; buyers keep access (RLS: has_active_purchase).
          const { data: upd, error } = await admin
            .from("content")
            .update({ sale_status: "unlisted" })
            .eq("id", rep.content_item_id)
            .select("id");
          if (error) return json({ error: error.message }, 500);
          if (!upd?.length) return json({ error: "Матеріал не знайдено." }, 404);
          targetKey = { table: "content_reports", col: "content_item_id", val: rep.content_item_id };
          await logAction("unpublish_content", rep.content_item_id, { source });
          await admin.from("content_events").insert({
            content_id: rep.content_item_id, event: "unlisted", actor_id: userData.user.id, actor_kind: "admin", details: { report_id: reportId },
          });
        } else if (source === "content" && act === "suspend_sale") {
          const { data: rep } = await admin.from("content_reports").select("content_item_id").eq("id", reportId).maybeSingle();
          if (!rep) return json({ error: "Скаргу не знайдено." }, 404);
          if (!isUuid(rep.content_item_id)) {
            return json({ error: "Цей матеріал не в базі авторів (каталожний)." }, 400);
          }
          const { data: upd, error } = await admin
            .from("content")
            .update({ sale_status: "complaint_pending" })
            .eq("id", rep.content_item_id)
            .select("id");
          if (error) return json({ error: error.message }, 500);
          if (!upd?.length) return json({ error: "Матеріал не знайдено." }, 404);
          await logAction("suspend_sale", rep.content_item_id, { source });
          await admin.from("content_events").insert({
            content_id: rep.content_item_id, event: "delisted_by_admin", actor_id: userData.user.id, actor_kind: "admin", details: { report_id: reportId },
          });
          // the complaint stays open: it is still being looked into
          return json({ ok: true });
        } else if (source === "content" && act === "restore_sale") {
          const { data: rep } = await admin.from("content_reports").select("content_item_id").eq("id", reportId).maybeSingle();
          if (!rep) return json({ error: "Скаргу не знайдено." }, 404);
          if (!isUuid(rep.content_item_id)) {
            return json({ error: "Цей матеріал не в базі авторів (каталожний)." }, 400);
          }
          const { data: upd, error } = await admin
            .from("content")
            .update({ sale_status: "restored" })
            .eq("id", rep.content_item_id)
            .select("id");
          if (error) return json({ error: error.message }, 500);
          if (!upd?.length) return json({ error: "Матеріал не знайдено." }, 404);
          targetKey = { table: "content_reports", col: "content_item_id", val: rep.content_item_id };
          await logAction("restore_sale", rep.content_item_id, { source });
          await admin.from("content_events").insert({
            content_id: rep.content_item_id, event: "sale_restored", actor_id: userData.user.id, actor_kind: "admin", details: { report_id: reportId },
          });
        } else {
          return json({ error: "Некоректна дія." }, 400);
        }
        // Close this report and every other open one about the same target.
        await admin.from(source === "entity" ? "entity_reports" : "content_reports").update({ status: "reviewed" }).eq("id", reportId);
        if (targetKey) {
          await admin.from(targetKey.table).update({ status: "reviewed" }).eq(targetKey.col, targetKey.val).eq("status", "open");
        }
        return json({ ok: true });
      }

      // ── MATERIALS ─────────────────────────────────────────────────────
      case "materials": {
        const q = typeof payload?.query === "string" ? payload.query.trim() : "";
        let query = admin
          .from("content")
          .select("id, kind, title, status, sale_status, access_restricted_at, access_restricted_reason, author_id, price, updated_at, risk_topics")
          .order("updated_at", { ascending: false })
          .limit(200);
        if (q) query = query.ilike("title", `%${q.replace(/[%,]/g, " ")}%`);
        const { data: rows, error } = await query;
        if (error) return json({ error: error.message }, 500);
        const ids = (rows ?? []).map((r) => r.id as string);
        const authorIds = Array.from(new Set((rows ?? []).map((r) => r.author_id as string)));
        const [{ data: authors }, { data: buys }, { data: reps }] = await Promise.all([
          authorIds.length ? admin.from("profiles").select("id, name, email").in("id", authorIds) : Promise.resolve({ data: [] as { id: string; name: string; email: string }[] }),
          ids.length ? admin.from("purchases").select("content_id").in("content_id", ids).eq("status", "completed") : Promise.resolve({ data: [] as { content_id: string }[] }),
          ids.length ? admin.from("content_reports").select("content_item_id").in("content_item_id", ids).eq("status", "open") : Promise.resolve({ data: [] as { content_item_id: string }[] }),
        ]);
        const aById = new Map((authors ?? []).map((a) => [a.id, a]));
        const count = (list: Record<string, unknown>[] | null, key: string) => {
          const m = new Map<string, number>();
          for (const x of list ?? []) m.set(x[key] as string, (m.get(x[key] as string) ?? 0) + 1);
          return m;
        };
        const buyers = count(buys as Record<string, unknown>[] | null, "content_id");
        const openReports = count(reps as Record<string, unknown>[] | null, "content_item_id");
        return json({
          materials: (rows ?? []).map((r) => ({
            id: r.id,
            kind: r.kind,
            title: r.title,
            status: r.status,
            saleStatus: r.sale_status,
            accessRestricted: !!r.access_restricted_at,
            accessRestrictedReason: r.access_restricted_reason ?? null,
            price: Number(r.price) || 0,
            riskTopics: (r.risk_topics as string[] | null) ?? [],
            authorId: r.author_id,
            authorName: aById.get(r.author_id as string)?.name ?? "—",
            authorEmail: aById.get(r.author_id as string)?.email ?? null,
            buyers: buyers.get(r.id as string) ?? 0,
            openReports: openReports.get(r.id as string) ?? 0,
            updatedAt: r.updated_at,
          })),
        });
      }

      case "materialAction": {
        const contentId = payload?.contentId as string | undefined;
        const act = payload?.act as string | undefined;
        if (!contentId || !act) return json({ error: "Некоректний запит." }, 400);
        const { data: item } = await admin.from("content").select("id, title").eq("id", contentId).maybeSingle();
        if (!item) return json({ error: "Матеріал не знайдено." }, 404);

        const event = async (name: string) => {
          await admin.from("content_events").insert({
            content_id: contentId, event: name, actor_id: userData.user.id, actor_kind: "admin",
            details: { reason: actionReason },
          });
        };
        const done = async (logName: string, patch: Record<string, unknown>, eventName: string) => {
          const { error } = await admin.from("content").update(patch).eq("id", contentId);
          if (error) return json({ error: error.message }, 500);
          await logAction(logName, contentId, { title: item.title });
          await event(eventName);
          return json({ ok: true });
        };

        switch (act) {
          case "approve": {
            // The author's first material: reviewed by hand, then the author is trusted.
            const { data: cur } = await admin.from("content").select("author_id, status").eq("id", contentId).maybeSingle();
            if (!cur || cur.status !== "review") return json({ error: "Матеріал не на перевірці." }, 400);
            await admin.from("author_details").update({ approved_to_publish: true }).eq("profile_id", cur.author_id);
            return done("approve_material", { status: "published" }, "approved");
          }
          case "send_back":
            return done("send_back_material", { status: "draft" }, "sent_back");
          case "suspend_sale":
            return done("suspend_sale", { sale_status: "complaint_pending" }, "delisted_by_admin");
          case "unlist":
            return done("unpublish_content", { sale_status: "unlisted" }, "unlisted");
          case "restore_sale":
            return done("restore_sale", { sale_status: "restored" }, "sale_restored");
          case "restrict_access":
            // Serious risk / law / third-party rights: buyers lose access too.
            return done("restrict_access", { access_restricted_at: new Date().toISOString(), access_restricted_reason: actionReason, sale_status: "unlisted" }, "access_restricted");
          case "restore_access":
            return done("restore_access", { access_restricted_at: null, access_restricted_reason: null }, "access_restored");
          case "delete_material": {
            const { count } = await admin.from("purchases").select("id", { count: "exact", head: true }).eq("content_id", contentId);
            if ((count ?? 0) > 0) {
              return json({ error: "У матеріалу є покупці — видалити його не можна. Зніміть його з продажу або обмежте доступ." }, 400);
            }
            // free materials have no purchases: people who added it to their cabinet or started it keep it too
            const { data: slugRow } = await admin.from("content").select("slug").eq("id", contentId).maybeSingle();
            const keys = [contentId, slugRow?.slug].filter(Boolean) as string[];
            const [{ count: added }, { count: started }] = await Promise.all([
              admin.from("acquired_content").select("user_id", { count: "exact", head: true }).in("content_id", keys),
              admin.from("content_progress").select("user_id", { count: "exact", head: true }).eq("content_id", contentId),
            ]);
            if ((added ?? 0) > 0 || (started ?? 0) > 0) {
              return json({ error: "Матеріал уже є в кабінетах учасників — видалити його не можна. Зніміть його з продажу або обмежте доступ." }, 400);
            }
            await logAction("delete_material", contentId, { title: item.title });
            await event("deleted");
            const { error } = await admin.from("content").delete().eq("id", contentId);
            if (error) return json({ error: error.message }, 500);
            return json({ ok: true });
          }
          default:
            return json({ error: "Некоректна дія." }, 400);
        }
      }

      case "verificationRequests": {
        const { data: pending } = await admin
          .from("author_verification_requests")
          .select("id, author_id, kind, status, document_paths, note, reject_reason, created_at, reviewed_at")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(100);
        const { data: recent } = await admin
          .from("author_verification_requests")
          .select("id, author_id, kind, status, document_paths, note, reject_reason, created_at, reviewed_at")
          .neq("status", "pending")
          .order("reviewed_at", { ascending: false })
          .limit(20);
        const rows = [...(pending ?? []), ...(recent ?? [])];
        const ids = Array.from(new Set(rows.map((r) => r.author_id)));
        const { data: profs } = ids.length
          ? await admin.from("profiles").select("id, name, email, avatar_url, created_at").in("id", ids)
          : { data: [] as { id: string; name: string; email: string; avatar_url: string | null; created_at: string }[] };
        const { data: dets } = ids.length
          ? await admin.from("author_details").select("profile_id, title, bio, credentials").in("profile_id", ids)
          : { data: [] as { profile_id: string; title: string | null; bio: string | null; credentials: string | null }[] };
        const pById = new Map((profs ?? []).map((p) => [p.id, p]));
        const dById = new Map((dets ?? []).map((d) => [d.profile_id, d]));

        const out = [];
        for (const r of rows) {
          let docs: { url: string; name: string }[] = [];
          if (r.status === "pending" && r.document_paths?.length) {
            const { data: signed } = await admin.storage.from("verification-docs").createSignedUrls(r.document_paths, 3600);
            docs = (signed ?? [])
              .filter((x) => x.signedUrl)
              .map((x, i) => ({ url: x.signedUrl as string, name: String(r.document_paths[i] ?? "").split("/").pop() ?? "файл" }));
          }
          const p = pById.get(r.author_id);
          const d = dById.get(r.author_id);
          out.push({
            id: r.id,
            authorId: r.author_id,
            kind: r.kind ?? "identity",
            authorName: p?.name ?? "—",
            authorEmail: p?.email ?? "—",
            status: r.status,
            note: r.note,
            rejectReason: r.reject_reason,
            createdAt: r.created_at,
            reviewedAt: r.reviewed_at,
            documents: docs,
            profile: {
              hasAvatar: !!p?.avatar_url,
              title: d?.title ?? "",
              bio: d?.bio ?? "",
              credentials: d?.credentials ?? "",
            },
          });
        }
        return json({ requests: out });
      }

      case "reviewVerification": {
        const requestId = payload?.requestId as string | undefined;
        const approve = payload?.approve as boolean | undefined;
        const reason = String(payload?.reason ?? "").trim().slice(0, 500);
        if (!requestId || typeof approve !== "boolean") return json({ error: "Некоректний запит." }, 400);
        if (!approve && !reason) return json({ error: "Вкажіть причину відмови — автор її побачить." }, 400);
        const { data: reqRow } = await admin
          .from("author_verification_requests")
          .select("id, author_id, kind, status, document_paths")
          .eq("id", requestId)
          .maybeSingle();
        if (!reqRow) return json({ error: "Заявку не знайдено." }, 404);
        if (reqRow.status !== "pending") return json({ error: "Заявку вже розглянуто." }, 400);

        if (approve) {
          const { error: vErr } = await admin
            .from("author_details")
            .update(reqRow.kind === "education" ? { education_verified: true } : { verified: true })
            .eq("profile_id", reqRow.author_id);
          if (vErr) return json({ error: vErr.message }, 500);
        }
        const { error } = await admin
          .from("author_verification_requests")
          .update({
            status: approve ? "approved" : "rejected",
            reject_reason: approve ? null : reason,
            reviewed_at: new Date().toISOString(),
            document_paths: [],
          })
          .eq("id", requestId);
        if (error) return json({ error: error.message }, 500);
        // Documents are only needed for the decision — remove them right after.
        if (reqRow.document_paths?.length) {
          try {
            await admin.storage.from("verification-docs").remove(reqRow.document_paths);
          } catch {
            /* ignore */
          }
        }
        await logAction(approve ? "verification_approved" : "verification_rejected", reqRow.author_id, { kind: reqRow.kind ?? "identity" });
        return json({ ok: true });
      }

      default:
        return json({ error: "Невідома дія." }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Помилка сервера." }, 500);
  }
});
