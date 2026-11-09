// The single seam between "what the PDF contains" and "who draws it"
// (2026-10-06).
//
// WHAT the PDF contains is fixed and renderer-independent: the guide's
// GuideContent turned into StaticBlock[] (data/guideStatic.ts, toStaticBlocks)
// — the same blocks as the interactive version, each in its static form.
// The page layout (utils/guidePdfLayout.ts) is pure and needs only a
// text-measuring function, so it can run anywhere.
//
// WHO draws it, today: the reader's browser (lib/guidePdfExport.ts) — no
// server, no Edge Function. The per-download mark is issued by the existing
// RPC (lib/pdfMarkIssue.ts) before drawing.
//
// LATER (not now): a server-side renderer can implement the same interface —
// for entitlement-aware generation, controlled/signed downloads, stronger
// branding/attribution protection. It would receive this same request, run
// the same layout with a server font-measure, and return the PDF; callers
// would not change, only getGuidePdfRenderer() below.
import type { StaticBlock } from "../data/guideStatic";
import { exportGuidePdf } from "./guidePdfExport";
import type { Viewer } from "./pdfStamp";

export type GuidePdfRequest = {
  guideId: string;
  title: string;
  subtitle?: string;
  blocks: StaticBlock[];
  viewer: Viewer;
  // This download's mark, issued before rendering (a copy never exists
  // without its issuance record).
  mark: { token: number; seed: number };
};

export interface GuidePdfRenderer {
  render(request: GuidePdfRequest): Promise<Blob>;
}

export const browserGuidePdfRenderer: GuidePdfRenderer = {
  render: ({ title, subtitle, blocks, viewer, mark }) =>
    exportGuidePdf({ title, subtitle, blocks, viewer, token: mark.token, seed: mark.seed }),
};

// The one place to swap the implementation.
export function getGuidePdfRenderer(): GuidePdfRenderer {
  return browserGuidePdfRenderer;
}
