// "Останні повідомлення" for the overview: real conversations (loaded
// once per user) merged with demo ones (empty when demo is off).
import { useEffect, useMemo, useState } from "react";
import { fetchConversations, type RealConversation } from "../../lib/messages";
import { mergeMessagePreviews, type MessagePreview } from "../../utils/messagePreviews";

function toMessagePreview(c: RealConversation): MessagePreview {
  return {
    id: `real:${c.otherId}:${c.contentId ?? "general"}`,
    authorName: c.otherName,
    contentTitle: c.contentTitle,
    preview: c.preview,
    date: c.date,
    unread: c.unread,
  };
}

export function useRecentMessages(
  userId: string | undefined,
  demo: MessagePreview[],
  readIds: Record<string, boolean> | undefined
): MessagePreview[] {
  const [real, setReal] = useState<MessagePreview[]>([]);
  useEffect(() => {
    if (!userId) return;
    fetchConversations(userId).then((cs) => setReal(cs.map(toMessagePreview)));
  }, [userId]);
  return useMemo(() => mergeMessagePreviews(real, demo, readIds), [real, demo, readIds]);
}
