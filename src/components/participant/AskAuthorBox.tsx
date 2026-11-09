// "Запитати автора" (2026-09-09, per Sasha's explicit spec — "контент →
// автор → комунікація, без ухода наружу"). Reuses the exact same real
// messaging pipeline (lib/messages.ts) and moderation copy as
// ProgramDetailPage's original "Є питання до автора?" box, just
// pulled out into one shared component so GuideExperience/
// MeditationExperience/ProgramExperience don't each reimplement it.
//
// Renders nothing when there's no real author account behind this
// content — `authorId` is only ever set for content genuinely authored
// by a real Sensoria author (a real `content` row's author_id for
// programs, or the new guide_authors/meditation_authors mapping for
// guides/meditations — see lib/contentAuthors.ts). Demo/showcase
// content has no author account to message, so this stays invisible
// there rather than pretending otherwise.

import { useState } from "react";
import { sendMessage } from "../../lib/messages";
import { AUTHOR_LEFT_NOTICE, useAuthorLeft } from "../../lib/authorStatus";

type Props = {
  authorId: string | null | undefined;
  // null = a general question to the author (from their profile), not
  // about one piece of content.
  contentId: string | null;
  // Whoever's asking — these experiences only ever render inside a
  // signed-in participant's own dashboard, so this is always a real id
  // in practice; typed as optional purely so a missing session just
  // hides the box instead of crashing.
  userId: string | null | undefined;
  // e.g. "Є питання щодо цього гайда?" — varies by content kind, so the
  // caller supplies the exact prompt rather than this component
  // guessing from a "kind" enum.
  promptLabel: string;
  placeholder?: string;
  // Compact mode: only a quiet "promptLabel →" link is visible until
  // clicked, then the same box opens in place (no divider / big margin).
  collapsible?: boolean;
  // Collapsible, but already open (the opener lives elsewhere).
  defaultOpen?: boolean;
};

export default function AskAuthorBox({
  authorId,
  contentId,
  userId,
  promptLabel,
  placeholder,
  collapsible,
  defaultOpen,
}: Props) {
  const [open, setOpen] = useState(defaultOpen ?? !collapsible);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<{ type: "warn" | "block" | "error"; text: string } | null>(null);

  const authorLeft = useAuthorLeft(authorId);

  if (!authorId || !userId || authorId === userId) return null;

  if (authorLeft) {
    return (
      <p role="status" className="text-[13px] text-black/60 leading-relaxed">
        {AUTHOR_LEFT_NOTICE}
      </p>
    );
  }

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice(null);
    try {
      // Moderation runs server-side, authoritatively — see
      // lib/messages.ts / supabase/functions/send-message.
      const result = await sendMessage({ recipientId: authorId, contentId, body: text });

      if (!result.delivered) {
        setNotice({
          type: "block",
          text: result.chatBanned
            ? "Чат для вашого акаунта заблоковано через повторні порушення правил (деталі й таймер — у розділі «Повідомлення»). Якщо це помилка — напишіть у підтримку."
            : result.profanity
            ? "Це повідомлення не вдалося надіслати: у ньому є лексика, неприйнятна на Sensoria. Будь ласка, спілкуйтесь із повагою."
            : result.escalated
            ? "Це вже кілька спроб надіслати заборонену інформацію. Спілкування має стосуватись лише цього контенту."
            : "Це повідомлення містить контактні дані або посилання для спілкування поза Sensoria. Щоб захистити вас, ми не можемо його надіслати.",
        });
        return;
      }
      if (result.action === "WARN") {
        setNotice({
          type: "warn",
          text: "Повідомлення надіслано — але переконайтесь, що воно не веде до спілкування чи оплати поза Sensoria.",
        });
      }
      setMessageText("");
      setSent(true);
      setTimeout(() => setSent(false), 2500);
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Не вдалося надіслати повідомлення." });
    } finally {
      setSending(false);
    }
  };

  if (collapsible && !open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 text-[13.5px] font-medium text-indigo-600 hover:text-indigo-700 transition"
      >
        {promptLabel} →
      </button>
    );
  }

  return (
    <div className={collapsible ? "mt-4" : "mt-8 pt-6 border-t border-black/5"}>
      <div className="rounded-2xl bg-slate-50/70 p-4">
        <div className="text-[13.5px] font-medium text-black/75 mb-2.5">{promptLabel}</div>
        <textarea
          value={messageText}
          onChange={(e) => {
            setMessageText(e.target.value);
            setNotice(null);
          }}
          rows={3}
          placeholder={placeholder ?? "Напишіть автору…"}
          className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 bg-white text-[13.5px] leading-relaxed placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-teal-500/30 resize-none"
        />
        <button
          onClick={handleSend}
          disabled={sending || !messageText.trim()}
          className="mt-2.5 px-5 py-2.5 rounded-xl bg-black text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
        >
          {sending ? "Надсилаємо…" : "Написати автору →"}
        </button>
        {sent && <div className="text-[12px] text-emerald-600 mt-2">Надіслано ✓</div>}
        {notice && (
          <div className={`text-[12px] mt-2 ${notice.type === "warn" ? "text-amber-600" : "text-red-500"}`}>
            {notice.text}
          </div>
        )}
      </div>
    </div>
  );
}
