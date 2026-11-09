// The dedicated reader for an UPLOADED guide PDF (2026-10-06) — the screen
// that "Відкрити гайд →" leads to for a guide whose source is "uploaded_pdf".
// The file is never altered and never gets invented interactivity; what
// changes is HOW it is shown: through the shielded, watermarked viewer
// (ProtectedPdfViewer), not the browser's raw PDF frame with its own
// download button.
//
// Platform vs. PDF: the reader can tell the platform that the guide was
// opened and (when the person says so) that they've worked through it. It
// cannot see inside the PDF.
import type { ResolvedGuidePdf } from "../../data/guidePdf";
import { CheckIcon } from "./GuideIcons";
import ProtectedPdfViewer from "./ProtectedPdfViewer";

type Props = {
  guideId: string;
  title: string;
  pdf: ResolvedGuidePdf;
  onClose: () => void;
  // Only offered when the platform can actually record it for this guide
  // (see GuideExperience): omitted → no "mark as done" control at all.
  onMarkCompleted?: () => void;
  isCompleted?: boolean;
};

export default function GuidePdfReader({ guideId, title, pdf, onClose, onMarkCompleted, isCompleted }: Props) {
  const extra = onMarkCompleted ? (
    isCompleted ? (
      <span className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-medium text-emerald-600">
        <CheckIcon />
        <span className="hidden sm:inline">Опрацьовано</span>
      </span>
    ) : (
      <button
        onClick={onMarkCompleted}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-[12.5px] font-medium text-black/60 hover:text-black hover:bg-black/[0.05] transition"
      >
        <CheckIcon />
        <span className="hidden sm:inline">Позначити як опрацьований</span>
      </button>
    )
  ) : null;

  return (
    <ProtectedPdfViewer
      title={title}
      url={pdf.url}
      contentId={guideId}
      kind="uploaded_pdf"
      onClose={onClose}
      extraActions={extra}
    />
  );
}
