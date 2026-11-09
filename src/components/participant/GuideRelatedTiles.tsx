// "Related Sensoria content" tiles, shared by the guide preview page and the
// interactive guide's recommendation block (2026-10-06) so both show the
// same items the same way. Items always come from utils/guideRelated.ts —
// this component only draws them.
import type { ReactElement } from "react";
import type { RelatedItem, RelatedKind } from "../../utils/guideRelated";
import { ArrowRightIcon, GuideGlyph, MeditationGlyph, ProgramGlyph } from "./GuideIcons";

export const RELATED_KIND_LABEL: Record<RelatedKind, string> = {
  meditation: "Медитація",
  program: "Програма",
  guide: "Гайд",
};

const RELATED_GLYPH: Record<RelatedKind, (props: { size?: number }) => ReactElement> = {
  meditation: MeditationGlyph,
  program: ProgramGlyph,
  guide: GuideGlyph,
};

export default function GuideRelatedTiles({
  items,
  onOpen,
  columns = 3,
}: {
  items: RelatedItem[];
  onOpen: (kind: RelatedKind, id: string) => void;
  columns?: 1 | 3;
}) {
  return (
    <div className={`grid gap-3 md:gap-4 ${columns === 3 ? "md:grid-cols-3" : ""}`}>
      {items.map((item) => {
        const Glyph = RELATED_GLYPH[item.kind];
        return (
          <button
            key={`${item.kind}:${item.id}`}
            onClick={() => onOpen(item.kind, item.id)}
            className="group text-left rounded-[20px] bg-white border border-black/[0.06] px-4 py-3.5 hover:border-indigo-200 hover:shadow-[0_10px_28px_rgba(79,70,229,0.10)] transition flex items-center gap-3.5"
          >
            <span className="w-10 h-10 rounded-full bg-[#eceffd] text-indigo-500 inline-flex items-center justify-center shrink-0">
              <Glyph />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[10.5px] font-semibold text-black/35 uppercase tracking-[0.12em] mb-1">
                {RELATED_KIND_LABEL[item.kind]}
              </div>
              <div className="text-[15px] font-semibold leading-snug text-black/85 line-clamp-2">{item.title}</div>
              <div className="text-[12.5px] text-black/40 mt-0.5">{item.meta}</div>
            </div>
            <span className="text-black/25 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition shrink-0">
              <ArrowRightIcon />
            </span>
          </button>
        );
      })}
    </div>
  );
}
