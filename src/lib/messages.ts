// Real, persisted author<->participant messaging — see
// AuthorMessages.tsx / ParticipantMessages.tsx for how this merges
// with the existing demo conversations (same "mix demo + real" pattern
// used for content). A "conversation" here is everything client-side:
// the `messages` table itself has no conversation id, just
// sender/recipient/content_id — grouped in JS by (other person,
// content) since that's what both dashboards already treat as one
// thread.
//
// Deliberately three separate queries + a client-side merge (messages,
// then profiles, then content) rather than a single embedded-join
// select — messages has two FKs into profiles (sender_id AND
// recipient_id), and guessing PostgREST's auto-generated constraint
// names for a disambiguated embed isn't something I can verify without
// live DB access in this sandbox. This is slower but never silently
// wrong.

import { supabase } from "./supabaseClient.ts";
import { sendNotificationEmail } from "./notificationPrefs.ts";
import { isUuid } from "../utils/messagesView.ts";

export type ThreadMessage = {
  id: string;
  // the sender deleted it: the thread shows «Повідомлення видалено»
  deleted?: boolean;
  senderId: string;
  body: string;
  createdAt: string;
};

export type RealConversation = {
  otherId: string;
  otherName: string;
  // Real uploaded photo only; null → the UI shows its quiet fallback.
  otherAvatarUrl: string | null;
  contentId: string | null;
  contentTitle: string | null;
  preview: string;
  // Full ISO timestamp of the last message (not date-only) — format
  // with formatRelativeTime (src/utils/relativeTime.ts) for display.
  date: string;
  unread: boolean;
};

type MessageRow = {
  id: string;
  sender_id: string;
  recipient_id: string;
  content_id: string | null;
  body: string;
  read: boolean;
  created_at: string;
  deleted_at?: string | null;
};

// supabase-js's own FunctionsHttpError always carries the same generic
// message — "Edge Function returned a non-2xx status code" — regardless
// of what the function itself actually reported; the real reason (the
// `{ error: "..." }` JSON body send-message/index.ts returns on every
// failure path) only lives on `error.context`, the raw fetch Response,
// which the caller has to read separately (2026-09-29 bugfix: this was
// previously thrown as-is, so every failure — auth, a bad recipient id,
// a DB constraint, moderation-log insert failing — surfaced as that
// same unhelpful generic string with no way to tell them apart). Falls
// back to the generic message only if the response body genuinely can't
// be read/parsed (e.g. a network-level failure with no response at all).
// A handful of the function's own failure paths already return clean,
// user-facing Ukrainian copy ("Не авторизовано.", "Некоректний запит.")
// — those are shown as-is. Anything else (a raw Postgres constraint
// violation from the messages insert, an unhandled exception's own
// .message, etc.) is technical and was never meant for a participant to
// read, so it's logged for debugging and swapped for one calm fallback
// instead.
const KNOWN_USER_FACING_MESSAGES = new Set(["Не авторизовано.", "Некоректний запит."]);
const GENERIC_SEND_FAILURE = "Не вдалося надіслати повідомлення. Спробуйте ще раз трохи згодом.";

async function describeFunctionsError(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      const message = typeof body?.error === "string" ? body.error.trim() : "";
      if (message) {
        if (KNOWN_USER_FACING_MESSAGES.has(message)) return new Error(message);
        // eslint-disable-next-line no-console
        console.error("send-message Edge Function failed:", message);
        return new Error(GENERIC_SEND_FAILURE);
      }
    } catch {
      // Body wasn't JSON (or already consumed) — fall through to the
      // generic message below rather than crashing on top of the
      // original failure.
    }
  }
  // eslint-disable-next-line no-console
  console.error("send-message Edge Function call failed:", error);
  return new Error(GENERIC_SEND_FAILURE);
}

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — повідомлення не можна надіслати.");
  }
  return supabase;
}

export const DELETED_TEXT = "Повідомлення видалено";

export async function fetchConversations(
  myId: string,
  opts: { strict?: boolean } = {}
): Promise<RealConversation[]> {
  const client = requireSupabase();
  // fast path: the newest 50 conversations built in the database (supabase/messages-scale.sql)
  const fast = await client.rpc("my_conversations", { p_limit: 50, p_offset: 0, p_search: null, p_filter: "everything" });
  if (!fast.error && fast.data) {
    const items = ((fast.data as { items?: { other_id: string; content_id: string | null; last_at: string; preview: string; unread: boolean; other_name: string; other_avatar: string | null; content_title: string | null }[] }).items ?? []);
    return items.map((i) => ({ otherId: i.other_id, otherName: i.other_name, otherAvatarUrl: i.other_avatar, contentId: i.content_id, contentTitle: i.content_title, preview: i.preview, date: i.last_at, unread: i.unread }));
  }
  const listQ = (cols: string) =>
    client.from("messages").select(cols).or(`sender_id.eq.${myId},recipient_id.eq.${myId}`).order("created_at", { ascending: true });
  // `deleted_at` exists after messages-delete-migration.sql; until then fall back
  let res = await listQ("id, sender_id, recipient_id, content_id, body, read, created_at, deleted_at");
  if (res.error) res = await listQ("id, sender_id, recipient_id, content_id, body, read, created_at");
  const rows = res.data as unknown;
  const error = res.error;

  if (error && opts.strict) throw error;
  if (error || !rows) return [];
  const messageRows = rows as MessageRow[];

  const otherIds = new Set<string>();
  const contentIds = new Set<string>();
  messageRows.forEach((r) => {
    otherIds.add(r.sender_id === myId ? r.recipient_id : r.sender_id);
    if (r.content_id) contentIds.add(r.content_id);
  });

  // Guide/meditation ids are catalog slugs, not uuids — sending them to
  // the uuid `content.id` column is a 400 for the whole query.
  const programIds = Array.from(contentIds).filter(isUuid);
  const [{ data: profileRows }, { data: contentRows }] = await Promise.all([
    otherIds.size
      ? client.from("profiles").select("id, name, avatar_url").in("id", Array.from(otherIds))
      : Promise.resolve({ data: [] as { id: string; name: string; avatar_url: string | null }[] }),
    programIds.length
      ? client.from("content").select("id, title").in("id", programIds)
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);

  const nameById = new Map((profileRows ?? []).map((p) => [p.id, p.name]));
  const avatarById = new Map((profileRows ?? []).map((p) => [p.id, p.avatar_url ?? null]));
  const titleById = new Map((contentRows ?? []).map((c) => [c.id, c.title]));

  // Group into conversations keyed by (otherId, contentId) — same
  // counterpart about two different courses reads as two separate
  // threads, matching what both dashboards already show.
  const groups = new Map<string, MessageRow[]>();
  messageRows.forEach((r) => {
    const otherId = r.sender_id === myId ? r.recipient_id : r.sender_id;
    const key = `${otherId}:${r.content_id ?? "general"}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  });

  return Array.from(groups.values())
    .map((msgs) => {
      const last = msgs[msgs.length - 1];
      const otherId = last.sender_id === myId ? last.recipient_id : last.sender_id;
      const unread = msgs.some((m) => m.recipient_id === myId && !m.read && !m.deleted_at);
      return {
        otherId,
        otherName: nameById.get(otherId) ?? "Учасник Sensoria",
        otherAvatarUrl: avatarById.get(otherId) ?? null,
        contentId: last.content_id,
        contentTitle: last.content_id ? titleById.get(last.content_id) ?? null : null,
        preview: last.deleted_at ? DELETED_TEXT : last.body,
        // Full timestamp, not date-only — callers format this with
        // formatRelativeTime (src/utils/relativeTime.ts), which needs
        // the time-of-day to show "10 хв тому"/"3 год тому", not just
        // the day.
        date: last.created_at,
        unread,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export async function fetchThread(
  myId: string,
  otherId: string,
  contentId: string | null,
  opts: { strict?: boolean } = {}
): Promise<ThreadMessage[]> {
  const client = requireSupabase();
  // fast path: the newest 100 messages of this conversation only (supabase/messages-scale.sql)
  const fast = await client.rpc("my_thread", { p_other: otherId, p_content: contentId, p_before: null, p_limit: 100 });
  if (!fast.error && Array.isArray(fast.data)) {
    return (fast.data as { id: string; sender_id: string; body: string; created_at: string; deleted: boolean }[]).map((r) => ({ id: r.id, senderId: r.sender_id, body: r.body, deleted: r.deleted, createdAt: r.created_at }));
  }
  const threadQ = (cols: string) =>
    client
      .from("messages")
      .select(cols)
      .or(`and(sender_id.eq.${myId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${myId})`)
      .order("created_at", { ascending: true });
  let res = await threadQ("id, sender_id, body, created_at, content_id, deleted_at");
  if (res.error) res = await threadQ("id, sender_id, body, created_at, content_id");
  const rows = res.data as unknown;
  const error = res.error;

  if (error && opts.strict) throw error;
  if (error || !rows) return [];

  return (rows as (MessageRow & { content_id: string | null })[])
    .filter((r) => (contentId ? r.content_id === contentId : !r.content_id))
    .map((r) => ({
      id: r.id,
      senderId: r.sender_id,
      body: r.deleted_at ? "" : r.body,
      deleted: !!r.deleted_at,
      createdAt: r.created_at,
    }));
}

export type SendMessageResult = {
  // false only when the server decided BLOCK — nothing was written.
  delivered: boolean;
  action: "ALLOW" | "WARN" | "BLOCK";
  // True once this sender has hit BLOCK repeatedly in the last 30 days
  // (server-side, account-level — see send-message/index.ts) — lets the
  // UI show the harsher "repeated attempts" copy instead of the generic
  // one.
  escalated: boolean;
  // True when this sender's chat is banned (3+ BLOCKs) — nothing was sent.
  chatBanned?: boolean;
  // True when this BLOCK was because of obscene language (not contacts).
  profanity?: boolean;
  // Chat-ban details when chatBanned: permanent, or the ISO end of the ban.
  chatBanPermanent?: boolean;
  chatBanUntil?: string | null;
};

// Phase 2: moderation now happens server-side, authoritatively, inside
// the send-message Edge Function — not here. There is no direct INSERT
// policy on `messages` for regular clients anymore (see schema.sql), so
// this Edge Function call is the only way a message can actually be
// sent; a devtools-savvy user calling `.from("messages").insert(...)`
// directly gets rejected by RLS before moderation even matters.
export async function sendMessage(params: {
  recipientId: string;
  contentId: string | null;
  body: string;
}): Promise<SendMessageResult> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("send-message", {
    body: {
      recipientId: params.recipientId,
      contentId: params.contentId,
      text: params.body,
    },
  });
  if (error) throw await describeFunctionsError(error);
  if (data?.error) throw new Error(data.error);
  const result = data as SendMessageResult;

  // Best-effort email side effect — see sendNotificationEmail's own
  // comments for why this can't fail the send itself, and
  // send-notification-email/index.ts for why the recipient's actual
  // opt-in is checked there, not here. No sender name in the copy on
  // purpose: threading it through here would mean changing all three
  // call sites (AuthorMessages/ParticipantMessages/ProgramDetailPage)
  // just to pass along something the person sees the moment they open
  // the thread anyway.
  if (result.delivered) {
    const preview = params.body.length > 140 ? `${params.body.slice(0, 140)}…` : params.body;
    sendNotificationEmail(
      params.recipientId,
      "message",
      "Нове повідомлення на Sensoria",
      `У вас нове повідомлення на Sensoria:\n\n«${preview}»\n\nВідповісти можна у своєму кабінеті на сайті.`
    );
  }

  return result;
}

export async function markThreadRead(
  myId: string,
  otherId: string,
  contentId: string | null
): Promise<void> {
  const client = requireSupabase();
  const base = client
    .from("messages")
    .update({ read: true })
    .eq("recipient_id", myId)
    .eq("sender_id", otherId);
  const query = contentId ? base.eq("content_id", contentId) : base.is("content_id", null);
  await query;
}

// Only the sender can delete their own message; it disappears for both people
// (a «Повідомлення видалено» mark stays). The original text is kept for moderation only.
export async function deleteMessage(messageId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("delete_my_message", { p_message_id: messageId });
  if (error) throw error;
}

// Hides the conversation for ME only; the other person keeps their copy.
export async function deleteConversation(otherId: string, contentId: string | null): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc("hide_conversation", { p_other: otherId, p_content: contentId });
  if (error) throw error;
}

// ── light loading (supabase/messages-scale.sql); falls back to the old full read while that file isn't applied ──

export type ConversationFilter = "all" | "unread" | "archive";
export type ConversationsPage = { total: number; unread: number; archived: number; items: RealConversation[]; paged: boolean };

export async function fetchConversationsPage(
  myId: string,
  q: { limit: number; offset: number; search?: string; filter?: ConversationFilter }
): Promise<ConversationsPage> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("my_conversations", { p_limit: q.limit, p_offset: q.offset, p_search: q.search?.trim() || null, p_filter: q.filter ?? "all" });
  if (!error && data) {
    const d = data as { total: number; unread: number; archived: number; items: { other_id: string; content_id: string | null; last_at: string; preview: string; unread: boolean; other_name: string; other_avatar: string | null; content_title: string | null }[] };
    return {
      total: d.total ?? 0,
      unread: d.unread ?? 0,
      archived: d.archived ?? 0,
      paged: true,
      items: (d.items ?? []).map((i) => ({ otherId: i.other_id, otherName: i.other_name, otherAvatarUrl: i.other_avatar, contentId: i.content_id, contentTitle: i.content_title, preview: i.preview, date: i.last_at, unread: i.unread })),
    };
  }
  // old database: everything at once, filtered here
  const all = await fetchConversations(myId);
  const s = q.search?.trim().toLowerCase();
  const list = all.filter((c) => (q.filter === "unread" ? c.unread : true) && (!s || `${c.otherName} ${c.contentTitle ?? ""} ${c.preview}`.toLowerCase().includes(s)));
  return { total: list.length, unread: all.filter((c) => c.unread).length, archived: 0, paged: false, items: q.filter === "archive" ? [] : list.slice(q.offset, q.offset + q.limit) };
}

/** The newest `limit` messages of a conversation, or the ones before `before` (older pages). */
export async function fetchThreadPage(myId: string, otherId: string, contentId: string | null, before: string | null, limit = 50): Promise<{ messages: ThreadMessage[]; hasMore: boolean }> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("my_thread", { p_other: otherId, p_content: contentId, p_before: before, p_limit: limit });
  if (!error && Array.isArray(data)) {
    const messages = (data as { id: string; sender_id: string; body: string; created_at: string; deleted: boolean }[]).map((r) => ({ id: r.id, senderId: r.sender_id, body: r.body, deleted: r.deleted, createdAt: r.created_at }));
    return { messages, hasMore: messages.length === limit };
  }
  if (before) return { messages: [], hasMore: false };
  return { messages: await fetchThread(myId, otherId, contentId), hasMore: false };
}

export type Broadcast = { id: string; contentId: string | null; body: string; recipients: number; createdAt: string };

/** An author's message to all participants (or one material's): moderated, once a day, in-app only. */
export async function sendBroadcast(params: { contentId: string | null; text: string }): Promise<{ sent: number; warned: boolean }> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke("send-message", { body: { action: "broadcast", contentId: params.contentId, text: params.text } });
  if (error) throw await describeFunctionsError(error);
  if (data?.error) throw new Error(data.error);
  return { sent: Number(data?.sent) || 0, warned: !!data?.warned };
}

export async function fetchMyBroadcasts(): Promise<Broadcast[]> {
  const client = requireSupabase();
  const { data, error } = await client.from("author_broadcasts").select("id, content_id, body, recipients, created_at").order("created_at", { ascending: false }).limit(10);
  if (error || !data) return [];
  return data.map((b) => ({ id: b.id, contentId: b.content_id, body: b.body, recipients: b.recipients, createdAt: b.created_at }));
}
