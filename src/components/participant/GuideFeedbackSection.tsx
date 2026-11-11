// "Чи був цей гайд корисним?" — the feedback block at the END of a guide's
// preview page (2026-10-06, moved here out of GuideExperience.tsx when
// that screen became a product preview; every piece of logic below is the
// same one it already had, not a reimplementation).
//
// Original design call (2026-09-09, Sasha: "не класична соцмережа з купою
// реакцій"): three deliberately separate actions rather than one
// reactions menu — a single calm binary reaction, "Залишити відгук" as
// its own action (rating + text), and "Поскаржитися" as its own
// standalone control, not tucked into a "•••" menu.
//   - reaction  → content_item_feedback (lib/itemFeedback.ts), keyed by
//                 guide id, same table the meditation completed screen
//                 writes to;
//   - review    → lib/reviews.ts upsertReview, same as programs;
//   - report    → content_reports (lib/contentReports.ts), same table and
//                 modal shape as MeditationExperience.
// Persistence and moderation are untouched by the move.
import { useEffect, useState } from "react";
import { fetchItemFeedback, submitItemFeedback, type FeedbackValue } from "../../lib/itemFeedback";
import { fetchMyReviews, upsertReview } from "../../lib/reviews";
import {
  submitContentReport,
  CONTENT_REPORT_REASONS,
  CONTENT_REPORT_REASON_LABELS,
  type ContentReportReason,
} from "../../lib/contentReports";

type Props = {
  guideId: string;
  guideTitle: string;
  userId: string | null | undefined;
};

export default function GuideFeedbackSection({ guideId, guideTitle, userId }: Props) {
  const [feedback, setFeedback] = useState<FeedbackValue | null>(null);
  const [feedbackReason, setFeedbackReason] = useState("");
  const [feedbackReasonSaving, setFeedbackReasonSaving] = useState(false);
  const [feedbackReasonSaved, setFeedbackReasonSaved] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchItemFeedback(guideId, userId).then((fb) => {
      if (cancelled) return;
      setFeedback(fb?.value ?? null);
      setFeedbackReason(fb?.reason ?? "");
      setFeedbackSent(!!fb);
      setFeedbackReasonSaved(fb?.value === "not_helpful" && !!fb.reason);
    });
    return () => {
      cancelled = true;
    };
  }, [guideId, userId]);

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [reviewLoaded, setReviewLoaded] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchMyReviews(userId).then((reviews) => {
      if (cancelled) return;
      const existing = reviews.find((r) => r.contentId === guideId);
      if (existing) {
        setReviewRating(existing.rating);
        setReviewText(existing.text);
      }
      setReviewLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [guideId, userId]);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  if (!userId) return null;

  const chooseFeedback = async (value: FeedbackValue) => {
    setFeedback(value);
    setFeedbackSent(false);
    const reason = value === "not_helpful" ? feedbackReason : null;
    if (value === "helpful") {
      setFeedbackReason("");
      setFeedbackReasonSaved(false);
    }
    try {
      await submitItemFeedback({ itemId: guideId, userId, value, reason });
      setFeedbackSent(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти відгук:", err);
    }
  };

  const saveFeedbackReason = async () => {
    if (!feedback || feedbackReasonSaving) return;
    setFeedbackReasonSaving(true);
    try {
      await submitItemFeedback({ itemId: guideId, userId, value: feedback, reason: feedbackReason });
      setFeedbackReasonSaved(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти враження:", err);
    } finally {
      setFeedbackReasonSaving(false);
    }
  };

  const handleSaveReview = async () => {
    if (!reviewText.trim() || savingReview) return;
    setSavingReview(true);
    setReviewError(null);
    try {
      await upsertReview({
        participantId: userId,
        contentId: guideId,
        rating: reviewRating,
        text: reviewText.trim(),
      });
      setReviewSaved(true);
      setTimeout(() => setReviewSaved(false), 2500);
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Не вдалося зберегти відгук.");
    } finally {
      setSavingReview(false);
    }
  };

  const openReportModal = () => {
    setReportReason(null);
    setReportDetails("");
    setReportSubmitted(false);
    setShowReportModal(true);
  };

  const submitReport = async () => {
    if (!reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await submitContentReport({
        reporterId: userId,
        contentItemId: guideId,
        contentKind: "guide",
        contentTitle: guideTitle,
        reason: reportReason,
        details: reportDetails,
      });
      setReportSubmitted(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося надіслати скаргу:", err);
    } finally {
      setReportSubmitting(false);
    }
  };

  return (
    <section className="text-center">
      <h2 className="text-[16px] font-semibold text-black/80 mb-3">Чи був цей гайд корисним?</h2>
      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => chooseFeedback("helpful")}
          className={`px-4 py-2 rounded-full text-[13px] font-medium border transition ${
            feedback === "helpful"
              ? "bg-indigo-50 border-indigo-200 text-indigo-700"
              : "border-black/10 text-black/60 hover:bg-black/5"
          }`}
        >
          ♡ Так
        </button>
        <button
          onClick={() => chooseFeedback("not_helpful")}
          className={`px-4 py-2 rounded-full text-[13px] font-medium border transition ${
            feedback === "not_helpful"
              ? "bg-black/5 border-black/20 text-black/70"
              : "border-black/10 text-black/60 hover:bg-black/5"
          }`}
        >
          ○ Не зовсім
        </button>
      </div>
      {feedback === "helpful" && feedbackSent && (
        <div className="text-[12px] text-indigo-700 font-medium mt-2.5">✓ Ваша відповідь надіслана автору</div>
      )}
      {feedback === "not_helpful" && (
        <div className="mt-3">
          <textarea
            value={feedbackReason}
            onChange={(e) => {
              setFeedbackReason(e.target.value);
              setFeedbackReasonSaved(false);
            }}
            placeholder="Поділіться враженням (необов'язково)"
            rows={2}
            className="w-full max-w-[360px] mx-auto block px-3.5 py-2.5 rounded-xl border border-black/10 bg-white text-[13px] resize-none focus:outline-none focus:border-black/30"
          />
          <div className="mt-2 max-w-[360px] mx-auto text-center">
            {feedbackReasonSaved ? (
              <span className="text-[12px] text-indigo-700 font-medium">
                ✓ Надіслано успішно. Автор побачить це і за потреби напише вам, щоб дізнатися деталі.
              </span>
            ) : (
              <button
                onClick={saveFeedbackReason}
                disabled={!feedbackReason.trim() || feedbackReasonSaving}
                className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[12px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {feedbackReasonSaving ? "…" : "Надіслати"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 mt-3 text-[12.5px] text-black/30">
        <button
          onClick={() => setShowReviewForm((v) => !v)}
          aria-expanded={showReviewForm}
          className="font-medium text-black/50 hover:text-black/75 transition"
        >
          Залишити відгук
        </button>
        <span aria-hidden="true">·</span>
        <button onClick={openReportModal} className="font-medium text-black/40 hover:text-black/65 transition">
          Поскаржитися
        </button>
      </div>

      {showReviewForm && reviewLoaded && (
        <div className="max-w-[360px] mx-auto mt-4">
          <div className="flex gap-1 justify-center mb-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setReviewRating(n)}
                className={`text-[20px] leading-none ${n <= reviewRating ? "text-amber-400" : "text-black/15"}`}
              >
                ★
              </button>
            ))}
          </div>
          <textarea
            value={reviewText}
            onChange={(e) => {
              setReviewText(e.target.value);
              setReviewError(null);
            }}
            rows={3}
            placeholder="Поділіться враженнями від гайда..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-black/10 bg-white text-[13px] focus:outline-none focus:border-black/30 resize-none"
          />
          <button
            onClick={handleSaveReview}
            disabled={savingReview || !reviewText.trim()}
            className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
          >
            {savingReview ? "Зберігаємо…" : "Зберегти відгук"}
          </button>
          {reviewSaved && <div className="text-[12px] text-indigo-700 mt-2">Збережено ✓</div>}
          {reviewError && <div className="text-[12px] text-red-500 mt-2">{reviewError}</div>}
        </div>
      )}

      {/* "⚑ Поскаржитися" modal — same shape as MeditationExperience's. */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-[10150] bg-black/40 flex items-center justify-center p-4 text-left"
          onClick={() => setShowReportModal(false)}
        >
          <div className="w-full max-w-[420px] rounded-[20px] bg-white p-6" onClick={(e) => e.stopPropagation()}>
            {reportSubmitted ? (
              <>
                <div className="text-[15px] font-semibold mb-1">Дякуємо. Ми перевіримо цей гайд.</div>
                <div className="flex justify-end mt-5">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition"
                  >
                    Закрити
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold mb-4">Поскаржитися на гайд</div>
                <div className="flex flex-col gap-2 mb-4">
                  {CONTENT_REPORT_REASONS.map((reason) => (
                    <label
                      key={reason}
                      className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-[13px] cursor-pointer transition ${
                        reportReason === reason ? "border-black/30 bg-black/[0.03]" : "border-black/10 hover:bg-black/[0.02]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="guide-report-reason"
                        checked={reportReason === reason}
                        onChange={() => setReportReason(reason)}
                        className="accent-black"
                      />
                      {CONTENT_REPORT_REASON_LABELS[reason]}
                    </label>
                  ))}
                </div>
                {reportReason === "other" && (
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Опишіть коротко, що не так (необов'язково)"
                    rows={3}
                    className="w-full mb-4 px-3.5 py-2.5 rounded-xl border border-black/10 text-[13px] resize-none focus:outline-none focus:border-black/30"
                  />
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="px-4 py-2 rounded-lg border border-black/10 text-[13px] text-black/60 hover:bg-black/5 transition"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={!reportReason || reportSubmitting}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Надіслати скаргу
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
