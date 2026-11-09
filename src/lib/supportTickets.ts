// "Повідомити про проблему" / "Ваші звернення" on the Help pages
// (ParticipantHelp.tsx, AuthorHelp.tsx). A general-purpose support
// ticket, distinct from message_reports (reporting the content of a
// specific conversation) and refund_requests (a refund claim tied to
// a purchase) — this is for everything else: broken content, payment
// issues, technical bugs, rule violations, or anything uncategorized.
//
// Filing is insert-only from the client; status/admin_response are
// only ever written by the team via the service-role-backed
// admin-data Edge Function (see schema.sql's RLS policies on
// support_tickets — there's no client update policy at all).

import { supabase } from "./supabaseClient.ts";
import { sendNotificationEmail } from "./notificationPrefs.ts";

export type TicketCategory =
  | "content"
  | "payment"
  | "author"
  | "rule_violation"
  | "technical"
  | "other";

export const TICKET_CATEGORY_LABELS: Record<TicketCategory, string> = {
  content: "Проблема з контентом",
  payment: "Проблема з оплатою",
  author: "Проблема з автором",
  rule_violation: "Порушення правил",
  technical: "Технічна проблема",
  other: "Інше",
};

function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase не налаштований — звернення не можна надіслати.");
  }
  return supabase;
}

export async function submitTicket(params: {
  userId: string;
  category: TicketCategory;
  description: string;
}): Promise<void> {
  const client = requireSupabase();
  // .select().single() (2026-08-30) — the inserted row's own id is now
  // needed to pass along as verification meta below, not just for its
  // own sake.
  const { data: inserted, error } = await client
    .from("support_tickets")
    .insert({
      user_id: params.userId,
      category: params.category,
      description: params.description.trim(),
    })
    .select("id")
    .single();
  if (error) throw error;

  notifyAdminsOfNewTicket(client, inserted.id, params.category, params.description.trim());
}

// Best-effort, fire-and-forget — the ticket itself is already saved by
// the time this runs, so a failed email here shouldn't surface as an
// error to the person who just filed it. "profiles are publicly
// readable" (schema.sql) already lets any authenticated client select
// is_admin, so this is a plain client-side query, same as everywhere
// else in the app that reads is_admin. There's deliberately no
// "newTicket" entry in send-notification-email's DEFAULT_EMAIL_PREF —
// admins have no toggle for this in the UI, so it defaults to sending
// (that function's own `?? true` fallback), which is what's wanted:
// nobody should be able to silently miss a new support request.
function notifyAdminsOfNewTicket(
  client: NonNullable<typeof supabase>,
  ticketId: string,
  category: TicketCategory,
  description: string
): void {
  client
    .from("profiles")
    .select("id")
    .eq("is_admin", true)
    .then(({ data: admins, error }) => {
      if (error || !admins?.length) return;
      const subject = `Нове звернення в підтримку: ${TICKET_CATEGORY_LABELS[category]}`;
      const text = `Категорія: ${TICKET_CATEGORY_LABELS[category]}\n\n${description}\n\nВідповісти можна в адмін-панелі, вкладка «Звернення».`;
      // ticketId meta (2026-08-30 security fix) — lets the Edge
      // Function confirm this ticket genuinely exists, belongs to the
      // real calling user, and that each recipient really is an admin,
      // before sending anything.
      admins.forEach((a) => sendNotificationEmail(a.id, "newTicket", subject, text, { ticketId }));
    });
}

export type MyTicket = {
  id: string;
  category: TicketCategory;
  description: string;
  status: "open" | "resolved";
  adminResponse: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

// "Ваші звернення" — everything this person has filed themselves,
// newest first, so they can see whether it's still waiting or
// already resolved without having to email in again to check.
export async function fetchMyTickets(userId: string, opts: { strict?: boolean } = {}): Promise<MyTicket[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("support_tickets")
    .select("id, category, description, status, admin_response, created_at, resolved_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error && opts.strict) throw error;
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    category: row.category as TicketCategory,
    description: row.description,
    status: row.status as "open" | "resolved",
    adminResponse: row.admin_response,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}
