// "•••" → "Поскаржитися" on a meditation (per Sasha: important for emotional
// wellbeing content). Reports the meditation itself, not a person or comment —
// see lib/contentReports.ts. Self-contained: owns its own form state.
import { useState } from "react";
import {
  submitContentReport,
  CONTENT_REPORT_REASONS,
  CONTENT_REPORT_REASON_LABELS,
  type ContentReportReason,
} from "../../lib/contentReports";

export default function MeditationReportModal({
  meditationId,
  title,
  userId,
  onClose,
}: {
  meditationId: string;
  title: string;
  userId: string | undefined;
  onClose: () => void;
}) {
  const [reportReason, setReportReason] = useState<ContentReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  const submitReport = async () => {
    if (!userId || !reportReason || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await submitContentReport({
        reporterId: userId,
        contentItemId: meditationId,
        contentKind: "meditation",
        contentTitle: title,
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

        <div
          className="fixed inset-0 z-[10050] bg-black/40 flex items-center justify-center p-4"
          onClick={() => onClose()}
        >
          <div className="w-full max-w-[420px] rounded-[20px] bg-white p-6" onClick={(e) => e.stopPropagation()}>
            {reportSubmitted ? (
              <>
                <div className="text-[15px] font-semibold mb-1">Дякуємо. Ми перевіримо цю медитацію.</div>
                <div className="flex justify-end mt-5">
                  <button
                    onClick={() => onClose()}
                    className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-medium hover:opacity-90 transition"
                  >
                    Закрити
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="text-[15px] font-semibold mb-4">Поскаржитися на медитацію</div>
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
                        name="content-report-reason"
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
                    onClick={() => onClose()}
                    className="px-4 py-2 rounded-lg border border-black/10 text-[13px] text-black/60 hover:bg-black/5 transition"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={!reportReason || reportSubmitting}
                    className="px-4 py-2 rounded-lg bg-black text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Надіслати скаргу
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
  );
}
