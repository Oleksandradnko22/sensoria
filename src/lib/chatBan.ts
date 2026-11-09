// The signed-in person's OWN chat-ban state (read-only here — bans are
// created by the send-message Edge Function and lifted by an admin; the
// columns are pinned against client writes by a DB trigger).
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient.ts";
import type { ChatBanFields } from "../utils/chatBan.ts";
import type { SendMessageResult } from "./messages.ts";

export async function fetchMyChatBan(userId: string): Promise<ChatBanFields | null> {
  if (import.meta.env.DEV) {
    // DEV-only sample ban for design review (?moderationDemo=1).
    const demo = await import("../dev/moderationPreview.ts");
    if (demo.moderationDemoOn()) return demo.DEMO_MY_CHAT_BAN;
  }
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("chat_banned_until, chat_ban_permanent")
    .eq("id", userId)
    .maybeSingle();
  // Error (e.g. migration not run yet) → treat as "no ban"; the server is
  // the source of truth anyway and refuses banned senders.
  if (error || !data) return null;
  return { permanent: !!data.chat_ban_permanent, untilIso: data.chat_banned_until ?? null };
}

export function useMyChatBan(userId: string | undefined) {
  const [ban, setBan] = useState<ChatBanFields | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyChatBan(userId).then((b) => {
      if (!cancelled) setBan(b);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Call with a send result so the countdown shows right after a ban is issued. */
  const applyResult = useCallback((r: SendMessageResult) => {
    if (r.chatBanned) setBan({ permanent: !!r.chatBanPermanent, untilIso: r.chatBanUntil ?? null });
  }, []);
  const clear = useCallback(() => setBan(null), []);

  return { ban, applyResult, clear };
}
