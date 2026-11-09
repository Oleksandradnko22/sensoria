import { Icon } from "../ui/Icon";
import { useEffect, useState } from "react";
import { authoredContent, reviews as reviewsData, type AuthoredContent } from "../../data/authorDashboard";
import { fetchReviewsForContentIds, replyToReview, type ReviewRow } from "../../lib/reviews";
import { fetchMeditationFeedbackForAuthor, type MeditationFeedbackEntry } from "../../lib/itemFeedback";
import { meditations } from "../../data/meditations";
import { sendMessage } from "../../lib/messages";
import { useSession } from "../../context/SessionContext";
import { formatRelativeTime } from "../../utils/relativeTime";

type Props = {
  content: AuthoredContent[];
};

const DEMO_IDS = new Set(authoredContent.map((c) => c.id));

type UnifiedReview = {
  id: string;
  // Empty for demo reviews — those never reach replyToReview() (see
  // submitReply's `if (r.real)` guard below), so there's no real id to
  // notify and nothing reads this field in that branch.
  participantId: string;
  participantName: string;
  contentId: string;
  contentTitle: string;
  rating: number;
  text: string;
  date: string;
  reply: string | null;
  real: boolean;
};

const contentTitle = (id: string) =>
  authoredContent.find((c) => c.id === id)?.title ?? id;

export default function AuthorReviews({ content }: Props) {
  const session = useSession();
  const [contentFilter, setContentFilter] = useState<"all" | string>("all");
  const [realReviews, setRealReviews] = useState<ReviewRow[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  // "Ця практика була корисною?" reaching the author's own cabinet
  // (2026-08-30, per Sasha's explicit call). A genuinely different
  // shape from the star reviews above (yes/no + optional impression,
  // not a rating+text), and scoped to meditations specifically — kept
  // as its own labeled section rather than folded into `unified`,
  // same reasoning as ParticipantMyPractice splitting meditations from
  // courses. RLS (content_item_feedback's "authors view feedback on
  // their own meditations" policy, via meditation_authors) already
  // restricts this to just this author's own meditations; filtering
  // against data/meditations.ts here is just belt-and-suspenders and
  // resolves titles for display.
  const [meditationFeedback, setMeditationFeedback] = useState<MeditationFeedbackEntry[]>([]);
  // "Написати" composer state per feedback row — same open/draft/
  // sending shape as the review-reply box below, just its own since
  // this sends a real DM (lib/messages.ts) instead of a public reply.
  const [openMessageId, setOpenMessageId] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState<Record<string, string>>({});
  const [sendingMessageId, setSendingMessageId] = useState<string | null>(null);
  const [sentMessageIds, setSentMessageIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const realContentIds = content.filter((c) => !DEMO_IDS.has(c.id)).map((c) => c.id);
    if (!realContentIds.length) return;
    fetchReviewsForContentIds(realContentIds).then(setRealReviews);
  }, [content]);

  useEffect(() => {
    fetchMeditationFeedbackForAuthor().then((rows) => {
      const meditationIds = new Set(meditations.map((m) => m.id));
      setMeditationFeedback(rows.filter((r) => meditationIds.has(r.meditationId)));
    });
  }, []);

  const unified: UnifiedReview[] = [
    ...realReviews.map((r) => ({
      id: r.id,
      participantId: r.participantId,
      participantName: r.participantName,
      contentId: r.contentId,
      contentTitle: r.contentTitle,
      rating: r.rating,
      text: r.text,
      date: r.createdAt,
      reply: r.authorReply,
      real: true,
    })),
    ...reviewsData.map((r) => ({
      id: r.id,
      participantId: "",
      participantName: r.participantName,
      contentId: r.contentId,
      contentTitle: contentTitle(r.contentId),
      rating: r.rating,
      text: r.text,
      date: r.date,
      reply: r.reply ?? null,
      real: false,
    })),
  ];

  const withReviews = content.filter((c) => c.reviewsCount > 0);
  const realReviewCount = realReviews.length;
  const mockReviewCount = withReviews.reduce((s, c) => s + c.reviewsCount, 0);
  const totalReviewCount = realReviewCount + mockReviewCount;
  const avgRating = totalReviewCount
    ? (realReviews.reduce((sum, r) => sum + r.rating, 0) +
        withReviews.reduce((sum, c) => sum + (c.rating ?? 0) * c.reviewsCount, 0)) /
      totalReviewCount
    : 0;

  const filtered = unified.filter(
    (r) => contentFilter === "all" || r.contentId === contentFilter
  );

  const submitReply = async (r: UnifiedReview) => {
    const text = draft[r.id]?.trim();
    if (!text) return;

    if (r.real) {
      setSendingId(r.id);
      try {
        await replyToReview({
          reviewId: r.id,
          reply: text,
          participantId: r.participantId,
          contentTitle: r.contentTitle,
        });
        setRealReviews((prev) =>
          prev.map((row) => (row.id === r.id ? { ...row, authorReply: text } : row))
        );
      } catch {
        // Surfacing this inline would need another notice state — the
        // reply box simply staying open (no local echo) is enough of a
        // signal that it didn't go through.
      } finally {
        setSendingId(null);
      }
      return;
    }

    setReplies((prev) => ({ ...prev, [r.id]: text }));
  };

  // "Написати" — a real DM (send-message Edge Function, same as
  // ParticipantMessages/AuthorMessages), not a public reply. This is
  // what makes the participant-facing "автор може написати" copy on
  // MeditationExperience's completed screen actually true rather than
  // an empty promise.
  const sendFeedbackMessage = async (f: MeditationFeedbackEntry) => {
    const text = messageDraft[f.id]?.trim();
    if (!text) return;
    setSendingMessageId(f.id);
    try {
      await sendMessage({ recipientId: f.participantId, contentId: null, body: text });
      setSentMessageIds((prev) => new Set(prev).add(f.id));
      setOpenMessageId(null);
    } catch {
      // Same restraint as submitReply above — no separate error state,
      // the composer staying open is signal enough that it didn't send.
    } finally {
      setSendingMessageId(null);
    }
  };

  if (!session) return null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Відгуки</h1>
          <p className="text-black/50 mt-1">
            Середній рейтинг {avgRating.toFixed(1)} ★ за {totalReviewCount} відгуками
          </p>
        </div>

        <select
          value={contentFilter}
          onChange={(e) => setContentFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-black/10 text-[14px] bg-white focus:outline-none focus:border-black/30"
        >
          <option value="all">Усі курси/гайди</option>
          {content.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {meditationFeedback.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-[13px] font-semibold text-black/45 uppercase tracking-wide">
            Медитації · «Ця практика була корисною?»
          </h2>
          <div className="flex flex-col gap-3">
            {meditationFeedback.map((f) => {
              const title = meditations.find((m) => m.id === f.meditationId)?.title ?? f.meditationId;
              return (
                <div key={f.id} className="rounded-2xl bg-white border border-black/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium text-[14px]">{title}</div>
                      <div className="text-[12px] text-black/40 mt-0.5">{f.participantName}</div>
                    </div>
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                        f.value === "helpful"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-black/5 text-black/50"
                      }`}
                    >
                      {f.value === "helpful" ? "♡ Так" : "○ Не зовсім"}
                    </span>
                  </div>
                  {f.reason && (
                    <p className="text-[13px] text-black/70 leading-relaxed mt-2.5">{f.reason}</p>
                  )}
                  <div className="flex items-center justify-between mt-2.5">
                    <div className="text-[11px] text-black/35">
                      {formatRelativeTime(f.updatedAt ?? f.createdAt)}
                    </div>
                    {sentMessageIds.has(f.id) ? (
                      <span className="text-[12px] text-black/35">Повідомлення надіслано</span>
                    ) : openMessageId !== f.id ? (
                      <button
                        onClick={() => setOpenMessageId(f.id)}
                        className="text-[12px] font-medium text-black/60 hover:text-black transition"
                      >
                        Написати
                      </button>
                    ) : null}
                  </div>
                  {openMessageId === f.id && !sentMessageIds.has(f.id) && (
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        value={messageDraft[f.id] ?? ""}
                        onChange={(e) =>
                          setMessageDraft((prev) => ({ ...prev, [f.id]: e.target.value }))
                        }
                        placeholder={`Написати ${f.participantName}...`}
                        className="flex-1 px-3.5 py-2.5 rounded-xl border border-black/10 text-[13px] focus:outline-none focus:border-black/30"
                      />
                      <button
                        onClick={() => sendFeedbackMessage(f)}
                        disabled={sendingMessageId === f.id}
                        className="px-4 py-2.5 rounded-xl bg-black text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
                      >
                        {sendingMessageId === f.id ? "…" : "Надіслати"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="rounded-2xl bg-white border border-black/5 p-10 text-center text-black/40 text-[14px]">
          Поки що немає відгуків.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {filtered.map((r) => {
          const reply = r.real ? r.reply : replies[r.id] ?? r.reply;
          return (
            <div key={r.id} className="rounded-2xl bg-white border border-black/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-[14px]">{r.participantName}</div>
                  <div className="text-[12px] text-black/40 mt-0.5">
                    {r.contentTitle} · {formatRelativeTime(r.date)}
                  </div>
                </div>
                <div className="shrink-0 inline-flex gap-0.5 text-amber-500">{Array.from({ length: r.rating }, (_, k) => <Icon key={k} name="star" size={13} filled />)}</div>
              </div>

              <p className="text-[14px] text-black/70 leading-relaxed mt-3">{r.text}</p>

              {reply ? (
                <div className="mt-4 pl-4 border-l-2 border-[#eef2ff]">
                  <div className="text-[12px] text-black/40 mb-1">Ваша відповідь</div>
                  <div className="text-[14px] text-black/70">{reply}</div>
                </div>
              ) : (
                <div className="mt-4 flex items-center gap-2">
                  <input
                    value={draft[r.id] ?? ""}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                    placeholder="Відповісти на відгук..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-black/10 text-[13px] focus:outline-none focus:border-black/30"
                  />
                  <button
                    onClick={() => submitReply(r)}
                    disabled={sendingId === r.id}
                    className="px-4 py-2.5 rounded-xl bg-black text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
                  >
                    {sendingId === r.id ? "…" : "Надіслати"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
