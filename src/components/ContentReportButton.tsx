// "Поскаржитися" on a whole program (guides and meditations have their own
// controls). Files into content_reports, like those.
import { useState } from "react";
import ReportDialog from "./ReportDialog.tsx";
import {
  CONTENT_REPORT_REASONS,
  CONTENT_REPORT_REASON_LABELS,
  submitContentReport,
  type ContentReportReason,
} from "../lib/contentReports.ts";

export default function ContentReportButton({
  kind,
  contentId,
  title,
  viewerId,
  onRequireLogin,
}: {
  kind: "program" | "guide" | "meditation";
  contentId: string;
  title: string;
  viewerId: string | null | undefined;
  /** Guests are sent to login/registration instead of seeing the form. */
  onRequireLogin?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!viewerId && !onRequireLogin) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => (viewerId ? setOpen(true) : onRequireLogin?.())}
        className="inline-flex min-h-[44px] items-center gap-2 px-3 text-[14px] text-black/60 transition hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 21V4" />
          <path d="M5 4h11l-2 4 2 4H5" />
        </svg>
        Поскаржитися на програму
      </button>
      {open && viewerId && (
        <ReportDialog
          title="Поскаржитися на програму"
          doneText="Дякуємо. Ми перевіримо цю програму."
          reasons={CONTENT_REPORT_REASONS.map((v) => ({ value: v, label: CONTENT_REPORT_REASON_LABELS[v] }))}
          onClose={() => setOpen(false)}
          onSubmit={(reason, details) =>
            submitContentReport({
              reporterId: viewerId,
              contentItemId: contentId,
              contentKind: kind,
              contentTitle: title,
              reason: reason as ContentReportReason,
              details,
            })
          }
        />
      )}
    </>
  );
}
