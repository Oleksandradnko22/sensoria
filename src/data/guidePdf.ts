// The PDF side of a Guide (2026-10-06, per Sasha's product decision: "A
// psychological Guide is a separate PDF product/artifact. The web page
// must become a GUIDE PREVIEW / PRODUCT PAGE — the actual guide content
// lives inside the PDF").
//
// A guide now has two separate experiences:
//   1. the Preview page (components/participant/GuideExperience.tsx) —
//      introduces the guide, shows its STRUCTURE, the author, a preview
//      of the document, and lets the person open/download it;
//   2. the PDF itself (components/participant/GuidePdfReader.tsx opens
//      it) — where the full guide content actually lives.
//
// This file is the data contract between them. It is deliberately
// source-agnostic, because two author workflows are planned and the
// participant-facing page must work for BOTH without assuming either:
//   - "generated": the author builds structured content inside Sensoria
//     (Guide.content blocks) and Sensoria renders a branded PDF from it;
//   - "uploaded": the author uploads an existing, finished PDF.
// Neither workflow's authoring UI exists yet and this file doesn't build
// one — it only defines what the participant page can rely on.
//
// Nothing here is fabricated: every optional field below is absent until
// a real value exists. In particular `coverImageUrl` and `previewPages`
// have to come from the REAL PDF (rendered page images) — there is no
// PDF page-rendering step in this project yet, so today no guide carries
// them, and the preview page renders an honest template cover and omits
// the "Подивіться всередину" section instead of showing invented pages.
//
// Platform progress vs. the PDF (kept separate on purpose): the platform
// can know a guide was opened / started / completed / saved. It can NOT
// see inside a downloaded PDF — a checkbox ticked or a field filled in
// the file is not synchronized back, and nothing here assumes it is.

import { pluralUk } from "../utils/plural.ts";
import type { GuideBlock } from "./guideBlocks.ts";
import type { GuideContent, GuideSource } from "./guideContent.ts";

export type GuidePdfSource = "uploaded" | "generated";

export type GuidePdfPreviewPage = {
  // A rendered image of one real page of the PDF.
  imageUrl: string;
  // e.g. "Обкладинка", "Приклад сторінки", "Приклад вправи".
  label?: string;
};

// Everything optional: an existing guide with only `fileUrl`/`pages`
// (the original shape) is still a valid, fully working guide.
export type GuidePdfMeta = {
  source?: GuidePdfSource;
  // Overrides Guide.fileUrl when present (e.g. a versioned storage URL).
  url?: string;
  fileName?: string;
  // Overrides Guide.pages when present (the real page count of this file).
  pageCount?: number;
  fileSizeBytes?: number;
  // Free-form version label ("1.0", "2026-10-06") — lets a future
  // re-upload be told apart from the file a person already downloaded.
  version?: string;
  coverImageUrl?: string;
  previewPages?: GuidePdfPreviewPage[];
};

// One line of "Що всередині": the guide's STRUCTURE, never its content.
export type GuideOutlineItem = {
  title: string;
  // One short line saying what the section is for — not an excerpt and
  // never the actual instructions.
  summary?: string;
};

export type ResolvedGuidePdf = {
  source: GuidePdfSource;
  url: string;
  fileName: string;
  pageCount: number;
  fileSizeBytes?: number;
  version?: string;
  coverImageUrl?: string;
  previewPages: GuidePdfPreviewPage[];
};

// The minimal slice of Guide this file needs — structural on purpose, so
// data/guides.ts can import the types above without a circular import.
type GuidePdfInput = {
  title: string;
  fileUrl: string;
  pages: number;
  content?: GuideBlock[];
  source?: GuideSource;
  guideContent?: GuideContent;
  pdf?: GuidePdfMeta;
  outline?: GuideOutlineItem[];
};

// Characters a filesystem/browser download name can't carry.
function safeFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned || "guide"}.pdf`;
}

export function resolveGuidePdf(guide: GuidePdfInput): ResolvedGuidePdf {
  const meta = guide.pdf ?? {};
  return {
    // Structured content in Sensoria means the PDF is rendered FROM it
    // (workflow A); no structured content means the file is the whole
    // artifact someone uploaded (workflow B). An explicit `pdf.source`
    // always wins over this inference.
    source:
      meta.source ??
      (guide.source === "uploaded_pdf"
        ? "uploaded"
        : guide.source === "sensoria_structured" || (guide.guideContent && guide.guideContent.length > 0)
        ? "generated"
        : guide.content && guide.content.length > 0
        ? "generated"
        : "uploaded"),
    url: meta.url ?? guide.fileUrl,
    fileName: meta.fileName ?? safeFileName(guide.title),
    pageCount: meta.pageCount ?? guide.pages,
    fileSizeBytes: meta.fileSizeBytes,
    version: meta.version,
    coverImageUrl: meta.coverImageUrl,
    previewPages: (meta.previewPages ?? []).filter((page) => page.imageUrl.trim().length > 0),
  };
}

// "Що всередині": an authored outline when the guide has one, otherwise
// the headings of its structured content (titles only — no summaries are
// invented for them). A guide with neither (a bare uploaded PDF with no
// metadata) has no known structure, and the page simply omits the
// section rather than guessing.
export function getGuideOutline(guide: GuidePdfInput): GuideOutlineItem[] {
  if (guide.outline && guide.outline.length > 0) return guide.outline;
  // Structured guides: the outline IS the headings (and their one-line
  // summaries) — one list, never a second copy to keep in sync.
  if (guide.guideContent && guide.guideContent.length > 0) {
    return guide.guideContent
      .filter((block): block is Extract<GuideContent[number], { type: "heading" }> => block.type === "heading")
      .map((block) => ({ title: block.text, ...(block.summary ? { summary: block.summary } : {}) }));
  }
  if (!guide.content) return [];
  return guide.content
    .filter((block): block is Extract<GuideBlock, { type: "heading" }> => block.type === "heading")
    .map((block) => ({ title: block.text }));
}

// "12,4 МБ" / "820 КБ" — Ukrainian decimal comma, no false precision.
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb < 10 ? 1 : 0).replace(".", ",")} МБ`;
}

// Ukrainian plural for "сторінка": 1 сторінка, 2–4 сторінки, 5+ сторінок
// (11–14 always "сторінок").
export function pagesLabel(count: number): string {
  return `${count} ${pluralUk(count, "сторінка", "сторінки", "сторінок")}`;
}

// "10 розділів": Ukrainian plural for "розділ" (1 розділ, 2–4 розділи, 5+ розділів).
export function sectionsLabel(count: number): string {
  return `${count} ${pluralUk(count, "розділ", "розділи", "розділів")}`;
}
