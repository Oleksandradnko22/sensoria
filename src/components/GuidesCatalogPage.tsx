import { useEffect, useMemo, useRef, useState } from "react";
import GuidePreviewModal from "./GuidesPreviewModal";
import CatalogGuideCard from "./catalog/CatalogGuideCard";
import CatalogSort from "./catalog/CatalogSort";
import { useFirstRowHeight } from "./catalog/useFirstRowHeight";
import { guides, type Guide } from "../data/guides";
import { DEMO_GUIDE_PREFIX, demoGuides } from "../data/guidesDemo";
import { categoryLabels } from "../data/categoryLabels";
import Footer from "./Footer";
import {
  DEFAULT_GUIDE_FILTERS,
  GUIDE_FORMAT_OPTIONS as FORMAT_OPTIONS,
  GUIDE_PRICE_OPTIONS as PRICE_OPTIONS,
  GUIDE_SORT_OPTIONS as SORT_OPTIONS,
  filterAndSortGuides,
  type GuideSortId as SortId,
} from "../utils/guideCatalogFilters";
import { useMaterialsVersion } from "../lib/materialsStore";
import { addSavedGuide, fetchAllSavedGuides, removeSavedGuide } from "../lib/guideSaves";
import type { Profile } from "../lib/auth";

// Emotional-state chips — same tag ids and multi-select convention as the programs and meditations
// catalogs (matched against `guide.tags`, not the format "Категорії" below, which is a different
// dimension: PDF vs checklist vs workbook, not what state a guide helps with). A "Переглянути всі"
// link from the Emotional Profile page lands here with the person's real state already selected.
const stateCategories = [
  { id: "anxiety", label: categoryLabels.anxiety },
  { id: "stress", label: categoryLabels.stress },
  { id: "burnout", label: categoryLabels.burnout },
  { id: "selfEsteem", label: categoryLabels.selfEsteem },
  { id: "relationships", label: categoryLabels.relationships },
  { id: "motivation", label: categoryLabels.motivation },
];

const PAGE_SIZE = 6;

// Development build only: empty preview cards next to the real guides (see data/guidesDemo.ts).
const withDemo = (list: Guide[]): Guide[] => (import.meta.env.DEV ? [...list, ...demoGuides] : list);
const isDemo = (guide: Guide) => guide.id.startsWith(DEMO_GUIDE_PREFIX);

// The toolbar shows at most this many applied filters; the rest collapse into «+N».
const MAX_SHOWN_CHIPS = 2;

type Props = {
  // Set when arriving from a Header search-result click — opens that exact guide's preview modal
  // immediately instead of just landing on the catalog.
  initialGuideId?: string;
  // Seeds the emotional-state filter from outside (e.g. the Emotional Profile page's "Переглянути всі").
  // Still just the starting point — fully changeable once here.
  initialCategories?: string[];
  session?: Profile | null;
  onRequireLogin?: () => void;
};

const chip = (active: boolean) =>
  `min-h-[40px] rounded-full px-3.5 py-2 text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
    active ? "bg-white text-[#00867f]" : "bg-white/20 text-white hover:bg-white/30"
  }`;
const heading = "mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-white";

export default function GuidesCatalogPage({ initialGuideId, initialCategories = [], session, onRequireLogin }: Props) {
  const [search, setSearch] = useState("");
  const [selectedSort, setSelectedSort] = useState<SortId>("default");
  const [selectedPrice, setSelectedPrice] = useState(DEFAULT_GUIDE_FILTERS.price);
  const [selectedCategory, setSelectedCategory] = useState(DEFAULT_GUIDE_FILTERS.format);
  // Multi-select — empty means "no state filter applied".
  const [selectedStateTags, setSelectedStateTags] = useState<string[]>(initialCategories);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedGuide, setSelectedGuide] = useState<Guide | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!initialGuideId) return;
    const found = guides.find((g) => g.id === initialGuideId);
    if (found) setSelectedGuide(found);
  }, [initialGuideId]);

  // Filter drawer (below lg): Escape closes, the page behind does not scroll, focus goes in and back.
  useEffect(() => {
    if (!drawerOpen) return;
    const opener = filtersBtnRef.current;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false);
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [drawerOpen]);

  function toggleStateTag(id: string) {
    setSelectedStateTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  const materialsVersion = useMaterialsVersion();
  const filteredGuides = useMemo(
    () => filterAndSortGuides(withDemo(guides), { search, price: selectedPrice, format: selectedCategory, states: selectedStateTags, sort: selectedSort }),
    [search, selectedSort, selectedPrice, selectedCategory, selectedStateTags, materialsVersion],
  );

  // a new filter or order starts again from the first page of results
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedSort, selectedPrice, selectedCategory, selectedStateTags]);

  useFirstRowHeight(panelRef, gridRef, [filteredGuides, visibleCount]);

  // removable chips for what is applied, same idea as the programs catalog
  const activeChips = [
    ...(search.trim() ? [{ key: "search", label: `«${search.trim()}»`, clear: () => setSearch("") }] : []),
    ...(selectedPrice !== DEFAULT_GUIDE_FILTERS.price ? [{ key: "price", label: selectedPrice, clear: () => setSelectedPrice(DEFAULT_GUIDE_FILTERS.price) }] : []),
    ...(selectedCategory !== DEFAULT_GUIDE_FILTERS.format ? [{ key: "format", label: selectedCategory, clear: () => setSelectedCategory(DEFAULT_GUIDE_FILTERS.format) }] : []),
    ...stateCategories.filter((c) => selectedStateTags.includes(c.id)).map((c) => ({ key: `state-${c.id}`, label: c.label, clear: () => toggleStateTag(c.id) })),
  ];
  const filtersActive = activeChips.length > 0;
  const resetFilters = () => {
    setSearch("");
    setSelectedPrice(DEFAULT_GUIDE_FILTERS.price);
    setSelectedCategory(DEFAULT_GUIDE_FILTERS.format);
    setSelectedStateTags([]);
  };

  // ── bookmarks (one request for the whole page, no per-card queries) ──────
  const role = session?.role;
  const userId = session?.id;
  const [saved, setSaved] = useState<Map<string, string>>(new Map()); // guideId -> saved row id
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "participant" || !userId) {
      setSaved(new Map());
      return;
    }
    let cancelled = false;
    fetchAllSavedGuides(userId)
      .then((rows) => {
        if (!cancelled) setSaved(new Map(rows.map((r) => [r.guideId, r.id])));
      })
      .catch(() => {
        // can't tell → show as not saved; toggling still works
      });
    return () => {
      cancelled = true;
    };
  }, [role, userId]);

  const savingIds = useRef(new Set<string>()); // a quick double click must not send two requests
  const toggleSaved = async (guide: Guide) => {
    if (role !== "participant" || !userId) {
      onRequireLogin?.();
      return;
    }
    if (savingIds.current.has(guide.id)) return;
    savingIds.current.add(guide.id);
    setSaveError(null);
    const existing = saved.get(guide.id);
    try {
      if (existing) {
        setSaved((m) => {
          const n = new Map(m);
          n.delete(guide.id);
          return n;
        });
        await removeSavedGuide(existing);
      } else {
        const row = await addSavedGuide({ guideId: guide.id, guideTitle: guide.title, userId });
        setSaved((m) => new Map(m).set(guide.id, row.id));
      }
    } catch {
      if (existing) setSaved((m) => new Map(m).set(guide.id, existing));
      setSaveError("Не вдалося оновити збережені. Спробуйте ще раз.");
    } finally {
      savingIds.current.delete(guide.id);
    }
  };
  const canBookmark = role !== "author";

  // the same controls in the desktop sidebar and in the mobile drawer
  const filterControls = (showSort: boolean, stretch = false) => (
    <div className={`flex flex-col gap-[18px] ${stretch ? "flex-1 justify-between" : ""}`}>
      <div>
        <div className={heading}>Пошук</div>
        <div className="relative">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/70">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук гайдів"
            aria-label="Пошук гайдів за назвою"
            className="w-full rounded-xl border border-white/30 bg-white/15 py-3 pl-10 pr-3 text-[14px] text-white placeholder-white/65 focus:border-white/70 focus:outline-none"
          />
        </div>
      </div>

      {showSort && (
        <div>
          <div className={heading}>Сортування</div>
          <div className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((o) => (
              <button key={o.id} type="button" onClick={() => setSelectedSort(o.id)} aria-pressed={selectedSort === o.id} className={chip(selectedSort === o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className={heading}>Ціна</div>
        <div className="flex flex-wrap gap-2">
          {PRICE_OPTIONS.map((item) => (
            <button key={item} type="button" onClick={() => setSelectedPrice(item)} aria-pressed={selectedPrice === item} className={chip(selectedPrice === item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={heading}>Стан</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setSelectedStateTags([])} aria-pressed={selectedStateTags.length === 0} className={chip(selectedStateTags.length === 0)}>
            Усі
          </button>
          {stateCategories.map((cat) => (
            <button key={cat.id} type="button" onClick={() => toggleStateTag(cat.id)} aria-pressed={selectedStateTags.includes(cat.id)} className={chip(selectedStateTags.includes(cat.id))}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={heading}>Категорії</div>
        <div className="flex flex-wrap gap-2">
          {FORMAT_OPTIONS.map((item) => (
            <button key={item} type="button" onClick={() => setSelectedCategory(item)} aria-pressed={selectedCategory === item} className={chip(selectedCategory === item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
    <section className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#008f94] via-[#00b8a9] to-[#00d2b4] pb-0 pt-[112px] text-white sm:pt-[132px] lg:pt-[150px]">

      <div className="relative z-10 mx-auto max-w-[1280px] px-4 sm:px-6">
        {/* HEADER */}
        <div className="mb-6 sm:mb-8">
          <h1 className="mb-2 text-[32px] font-bold leading-tight sm:text-[40px]">Каталог гайдів</h1>
          <p className="text-[16px] text-white">Практичні матеріали, чеклисти та короткі інструкції для підтримки вашого ментального стану.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start lg:gap-8">
          {/* SIDEBAR (desktop) */}
          <aside ref={panelRef} className="hidden rounded-3xl border border-white/35 bg-[#006866]/45 p-6 text-white shadow-[0_10px_30px_-12px_rgba(0,70,70,0.5)] backdrop-blur-xl lg:flex lg:flex-col">{filterControls(false, true)}</aside>

          {/* CONTENT */}
          <div className="min-w-0">
            {/* TOOLBAR */}
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2.5 text-[14px]">
              <button
                ref={filtersBtnRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 font-medium lg:hidden"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Фільтри{filtersActive ? ` · ${activeChips.length}` : ""}
              </button>

              <span className="font-medium text-white [text-shadow:0_1px_2px_rgba(0,60,60,0.5)]" aria-live="polite">
                Знайдено гайдів: <b className="text-white">{filteredGuides.length}</b>
              </span>

              {activeChips.slice(0, MAX_SHOWN_CHIPS).map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.clear}
                  aria-label={`Прибрати фільтр: ${c.label}`}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 text-[13px] hover:bg-white/20"
                >
                  {c.label}
                  <span aria-hidden="true" className="text-white/75">×</span>
                </button>
              ))}

              {activeChips.length > MAX_SHOWN_CHIPS && (
                <span aria-label={`Ще фільтрів: ${activeChips.length - MAX_SHOWN_CHIPS}`} className="inline-flex min-h-[32px] items-center rounded-full bg-white/20 px-3 text-[13px] font-semibold" title={activeChips.slice(MAX_SHOWN_CHIPS).map((c) => c.label).join(", ")}>
                  +{activeChips.length - MAX_SHOWN_CHIPS}
                </span>
              )}

              {filtersActive && (
                <button type="button" onClick={resetFilters} className="inline-flex min-h-[32px] items-center px-1 text-[13px] text-white underline underline-offset-4">
                  Скинути фільтри
                </button>
              )}

              <div className="hidden sm:ml-auto sm:block">
                <CatalogSort<SortId> value={selectedSort} onChange={setSelectedSort} options={SORT_OPTIONS} className="" listClassName="bg-[#007d76]/95" />
              </div>
            </div>

            {saveError && (
              <div role="status" className="mb-4 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-[13px]">
                {saveError}
              </div>
            )}

            {/* GRID */}
            {filteredGuides.length === 0 ? (
              <div className="rounded-3xl border border-white/20 bg-white/10 p-8 text-center backdrop-blur-xl">
                <p className="mb-4 text-[16px]">За цими фільтрами гайдів немає.</p>
                {filtersActive && (
                  <button type="button" onClick={resetFilters} className="min-h-[44px] rounded-xl bg-white px-5 text-[14px] font-semibold text-[#047857]">
                    Скинути фільтри
                  </button>
                )}
              </div>
            ) : (
              <div ref={gridRef} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filteredGuides.slice(0, visibleCount).map((guide) => (
                  <CatalogGuideCard
                    key={guide.id}
                    guide={guide}
                    onOpen={() => setSelectedGuide(guide)}
                    saved={canBookmark && !isDemo(guide) ? saved.has(guide.id) : undefined}
                    onToggleSaved={canBookmark && !isDemo(guide) ? () => void toggleSaved(guide) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LOAD MORE */}
        {visibleCount < filteredGuides.length && (
          <div className="mt-10 flex justify-center">
            <button
              type="button"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="min-h-[48px] rounded-2xl border border-white/20 bg-white/10 px-8 backdrop-blur-xl transition hover:bg-white/20"
            >
              Показати ще
            </button>
          </div>
        )}
      </div>

      {/* FILTER DRAWER (below lg) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Фільтри">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/30 bg-[#00807e] p-5 pb-6 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[18px] font-semibold">Фільтри</div>
              <button ref={drawerCloseRef} type="button" onClick={() => setDrawerOpen(false)} aria-label="Закрити" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-[20px]">
                ×
              </button>
            </div>
            {filterControls(true)}
            <div className="mt-6 flex gap-3">
              {filtersActive && (
                <button type="button" onClick={resetFilters} className="min-h-[48px] flex-1 rounded-xl border border-white/40 text-[14px] font-medium">
                  Скинути
                </button>
              )}
              <button type="button" onClick={() => setDrawerOpen(false)} className="min-h-[48px] flex-[2] rounded-xl bg-white text-[14px] font-semibold text-[#00867f]">
                Показати гайди ({filteredGuides.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* inside the section, so the gap above the footer is the page colour (not the dark app background) */}
      <Footer onOpenTest={() => {}} />

      {selectedGuide && <GuidePreviewModal guide={selectedGuide} onClose={() => setSelectedGuide(null)} userId={userId} isParticipant={role === "participant"} />}
    </section>
    </>
  );
}
