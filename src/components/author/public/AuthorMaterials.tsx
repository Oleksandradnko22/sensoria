// "Матеріали" tab of the public author profile: a calm, editorial library of
// what this author has made — not a store grid. One optional lead material
// (the one the author recommends in their pinned post), then a plain vertical
// list. Price text comes only from utils/price.ts.
import { useEffect, useRef, useState } from "react";
import { fetchRatingSummaryForContentIds, type RatingSummary } from "../../../lib/reviews";
import { Icon } from "../../ui/Icon";
import type { Access } from "../../../lib/ownedContent";
import MaterialCard from "./MaterialCard";
import { AUTHOR_KIND_LABEL, type AuthorContentItem } from "../../../utils/authorProfileView";

type Props = {
  items: AuthorContentItem[];
  // `${kind}:${id}` of the material the author recommends, if any
  featuredKey?: string | null;
  // `${kind}:${id}` → cabinet state, for logged-in participants only
  access?: ReadonlyMap<string, Access>;
  // sub-tab to open on (e.g. coming from «Про автора»)
  initialKind?: AuthorContentItem["kind"] | null;
  onOpen: (kind: AuthorContentItem["kind"], id: string) => void;
};

const keyOf = (i: AuthorContentItem) => `${i.kind}:${i.id}`;

export default function AuthorMaterials({ items, featuredKey, access, initialKind, onOpen }: Props) {
  // Sub-tabs by type (only types that exist). Opens on the featured
  // material's type, otherwise the first type that has something.
  const kinds = (["program", "meditation", "guide"] as AuthorContentItem["kind"][]).filter((k) => items.some((i) => i.kind === k));
  const featuredAll = featuredKey ? items.find((i) => keyOf(i) === featuredKey) ?? null : null;
  const [picked, setPicked] = useState<AuthorContentItem["kind"] | null>(initialKind ?? null);
  const kind = picked && kinds.includes(picked) ? picked : featuredAll && kinds.includes(featuredAll.kind) ? featuredAll.kind : kinds[0];
  const inKind = items.filter((i) => i.kind === kind);
  const featured = featuredAll && featuredAll.kind === kind ? featuredAll : null;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Each material shows ITS OWN rating (reviews about the material, not about the author); none = no line.
  const [ratings, setRatings] = useState<Record<string, RatingSummary>>({});
  const idsKey = items.map((i) => i.id).join(",");
  useEffect(() => {
    let cancelled = false;
    const ids = idsKey ? idsKey.split(",") : [];
    fetchRatingSummaryForContentIds(ids).then((r) => !cancelled && setRatings(r)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [idsKey]);
  const rest = featured ? inKind.filter((i) => i !== featured) : inKind;

  if (items.length === 0) {
    return (
      <div className="max-w-[720px] rounded-2xl bg-white border border-black/[0.06] px-6 py-12 text-center">
        <span className="mx-auto w-12 h-12 rounded-full bg-[#eef0fd] text-[#4338ca] flex items-center justify-center">
          <Icon name="guide" size={22} />
        </span>
        <div className="text-[16px] font-medium mt-4">Матеріалів поки немає</div>
        <p className="text-[14px] text-black/60 mt-1 max-w-[380px] mx-auto leading-relaxed">
          Коли автор опублікує практики, гайди чи програми, вони з’являться тут.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[820px] flex flex-col gap-5">
      <div role="tablist" aria-label="Тип матеріалів" className="flex flex-wrap gap-2">
        {kinds.map((k) => {
          const on = k === kind;
          const n = items.filter((i) => i.kind === k).length;
          return (
            <button
              key={k}
              ref={(el) => { tabRefs.current[k] = el; }}
              id={`mat-tab-${k}`}
              role="tab"
              aria-selected={on}
              aria-controls="mat-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => setPicked(k)}
              onKeyDown={(e) => {
                const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : e.key === "Home" ? "first" : e.key === "End" ? "last" : 0;
                if (!d) return;
                e.preventDefault();
                const at = kinds.indexOf(k);
                const next = kinds[d === "first" ? 0 : d === "last" ? kinds.length - 1 : (at + d + kinds.length) % kinds.length];
                setPicked(next);
                tabRefs.current[next]?.focus();
              }}
              className={`inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-full border text-[14px] transition-colors ${
                on
                  ? "border-[#4338ca]/30 bg-[#eef0fd] text-[#4338ca] font-semibold"
                  : "border-black/[0.12] bg-white text-black/65 hover:bg-black/[0.04] hover:text-black"
              }`}
            >
              {AUTHOR_KIND_LABEL[k]}
              <span className={`text-[12px] ${on ? "text-[#4338ca]/80" : "text-black/55"}`}>{n}</span>
            </button>
          );
        })}
      </div>

      <div id="mat-panel" role="tabpanel" aria-labelledby={`mat-tab-${kind}`} className="flex flex-col gap-3">
        {featured && <MaterialCard item={featured} featured rating={ratings[featured.id]} access={access?.get(keyOf(featured))} onOpen={onOpen} />}
        {rest.map((i) => (
          <MaterialCard key={keyOf(i)} item={i} rating={ratings[i.id]} access={access?.get(keyOf(i))} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}
