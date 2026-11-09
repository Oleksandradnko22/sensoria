// Small "Поскаржитися" link + dialog for author / post / review. Hidden for
// your own things and for signed-out visitors (reports need an account).
import { useState } from "react";
import ReportDialog from "./ReportDialog.tsx";
import {
  ENTITY_REPORT_REASONS,
  ENTITY_REPORT_REASON_LABELS,
  ENTITY_TYPE_LABELS,
  submitEntityReport,
  type EntityReportReason,
  type EntityReportType,
} from "../lib/entityReports.ts";

const TITLES: Record<EntityReportType, string> = {
  author: "Поскаржитися на автора",
  post: "Поскаржитися на публікацію",
  review: "Поскаржитися на відгук",
};

export default function ReportButton({
  type,
  targetId,
  ownerId,
  label,
  viewerId,
  className,
}: {
  type: EntityReportType;
  targetId: string;
  ownerId: string | null;
  label: string;
  viewerId: string | null | undefined;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!viewerId || viewerId === ownerId) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${TITLES[type]}`}
        className={
          className ??
          "min-h-[44px] px-3 text-[14px] text-black/60 hover:text-black hover:underline underline-offset-2 transition"
        }
      >
        Поскаржитися
      </button>
      {open && (
        <ReportDialog
          title={TITLES[type]}
          doneText={`Дякуємо. Ми перевіримо: ${ENTITY_TYPE_LABELS[type].toLowerCase()}.`}
          reasons={ENTITY_REPORT_REASONS[type].map((v) => ({ value: v, label: ENTITY_REPORT_REASON_LABELS[v] }))}
          onClose={() => setOpen(false)}
          onSubmit={(reason, details) =>
            submitEntityReport({
              reporterId: viewerId,
              targetType: type,
              targetId,
              targetOwnerId: ownerId,
              targetLabel: label,
              reason: reason as EntityReportReason,
              details,
            })
          }
        />
      )}
    </>
  );
}
