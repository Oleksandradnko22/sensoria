// The guide shown as an actual DOCUMENT (2026-10-06, guide preview page).
// The point of this visual is one realization: "this is a real PDF I will
// receive" — so it's a cover sheet with two sheets fanned out behind it,
// soft depth, rounded page corners, not an abstract hero.
//
// Honesty rules:
//   - If the guide carries a real rendered cover (`pdf.coverImageUrl`),
//     that image IS the front sheet, and any real `previewPages` fill the
//     sheets behind it.
//   - Otherwise the front sheet is a TEMPLATE cover composed from the
//     guide's real metadata (category, title, author) around its abstract
//     visual — an honest stand-in for a real cover, never a pretend
//     screenshot of the file. The sheets behind it stay plain blank paper
//     (depth only): drawing fake text lines on them would imply pages
//     that don't exist.
import GuideVisual from "./GuideVisual";
import { formatFileSize, pagesLabel, type ResolvedGuidePdf } from "../../data/guidePdf";

type Props = {
  title: string;
  author: string;
  category: string;
  tag?: string;
  pdf: ResolvedGuidePdf;
  // Structured guide: there is no uploaded file, so the line under the
  // document names what it really is instead of a file name / page count.
  structuredLabel?: string;
};

const SHEET_SHADOW = "0 18px 40px rgba(30,41,90,0.16), 0 2px 6px rgba(30,41,90,0.08)";

// A4-ish page proportions.
const SHEET = "absolute left-1/2 top-1/2 w-[168px] sm:w-[212px] aspect-[1/1.414] rounded-[14px] overflow-hidden bg-white border border-black/[0.06]";

function PageImage({ src }: { src: string }) {
  return <img src={src} alt="" className="w-full h-full object-cover" draggable={false} />;
}

export default function GuidePdfVisual({ title, author, category, tag, pdf, structuredLabel }: Props) {
  const [second, third] = pdf.previewPages;
  // File line under the document — only facts that are really known.
  const fileFacts = [
    pagesLabel(pdf.pageCount),
    pdf.fileSizeBytes ? formatFileSize(pdf.fileSizeBytes) : null,
    pdf.version ? `v${pdf.version}` : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col items-center gap-4">
    <div className="relative mx-auto w-[260px] h-[300px] sm:w-[340px] sm:h-[380px] select-none" aria-hidden="true">
      {/* Sheet behind, fanned left */}
      <div
        className={SHEET}
        style={{ transform: "translate(-50%, -50%) translateX(-30%) rotate(-8deg)", boxShadow: SHEET_SHADOW }}
      >
        {second && <PageImage src={second.imageUrl} />}
      </div>

      {/* Sheet behind, fanned right */}
      <div
        className={SHEET}
        style={{ transform: "translate(-50%, -50%) translateX(30%) rotate(7deg)", boxShadow: SHEET_SHADOW }}
      >
        {third && <PageImage src={third.imageUrl} />}
      </div>

      {/* Front cover */}
      <div className={SHEET} style={{ transform: "translate(-50%, -50%)", boxShadow: SHEET_SHADOW }}>
        {pdf.coverImageUrl ? (
          <PageImage src={pdf.coverImageUrl} />
        ) : (
          <div className="flex flex-col h-full">
            <GuideVisual tag={tag} className="h-[46%] w-full" />
            <div className="flex-1 flex flex-col px-4 sm:px-5 pt-3.5 pb-4">
              <div className="text-[8px] sm:text-[9px] font-semibold text-black/35 uppercase tracking-[0.14em]">
                {category}
              </div>
              <div className="mt-1.5 text-[13px] sm:text-[15px] font-semibold leading-[1.2] text-black/85 line-clamp-4">
                {title}
              </div>
              <div className="mt-auto flex items-end justify-between gap-2">
                <div className="text-[8.5px] sm:text-[10px] text-black/45 leading-tight line-clamp-2">{author}</div>
                <div className="text-[7px] sm:text-[8px] font-semibold tracking-[0.2em] text-black/25 shrink-0">
                  SENSORIA
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Spine shading + page-edge highlight: reads as a bound document */}
        <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black/[0.07] to-transparent pointer-events-none" />
        <div className="absolute top-2.5 left-4 px-2 py-0.5 rounded-full bg-white/85 backdrop-blur-sm text-[8px] sm:text-[9px] font-semibold tracking-wider text-black/55">
          PDF
        </div>
      </div>
    </div>
    <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-white/80 border border-black/[0.06] px-3.5 py-1.5 text-[12px] text-black/55">
      {structuredLabel ? (
        <span className="font-semibold text-black/70">{structuredLabel}</span>
      ) : (
        <>
          <span className="font-semibold text-black/70 truncate max-w-[180px] sm:max-w-[240px]">{pdf.fileName}</span>
          <span className="text-black/25">·</span>
          <span className="whitespace-nowrap">{fileFacts.join(" · ")}</span>
        </>
      )}
    </div>
    </div>
  );
}
