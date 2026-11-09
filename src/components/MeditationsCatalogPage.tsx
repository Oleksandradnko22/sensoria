import { useEffect, useMemo, useRef, useState } from "react";
import MeditationDetailModal from "./MeditationDetailModal";
import CatalogMeditationCard from "./catalog/CatalogMeditationCard";
import CatalogSort from "./catalog/CatalogSort";
import { useFirstRowHeight } from "./catalog/useFirstRowHeight";
import Footer from "./Footer";
import { categoryLabels } from "../data/categoryLabels";
import type { Meditation } from "../data/meditations";
import { useMaterialsVersion } from "../lib/materialsStore";
import { DEMO_MEDITATION_PREFIX, demoMeditations } from "../data/meditationsDemo";
import {
  DEFAULT_MEDITATION_FILTERS as DEFAULTS,
  MEDITATION_DURATION_OPTIONS as DURATION_OPTIONS,
  MEDITATION_SORT_OPTIONS as SORT_OPTIONS,
  filterAndSortMeditations,
  type MeditationSortId as SortId,
} from "../utils/meditationCatalogFilters";
import { addSavedPractice, fetchAllSavedPractices, removeSavedPractice } from "../lib/savedPractices";
import type { Profile } from "../lib/auth";

// Emotional-state chips: same tag ids and multi-select convention as the programs and guides catalogs.
const stateCategories = [
  { id: "anxiety", label: categoryLabels.anxiety },
  { id: "stress", label: categoryLabels.stress },
  { id: "burnout", label: categoryLabels.burnout },
  { id: "selfEsteem", label: categoryLabels.selfEsteem },
  { id: "relationships", label: categoryLabels.relationships },
  { id: "motivation", label: categoryLabels.motivation },
];

const PAGE_SIZE = 6;
const MAX_SHOWN_CHIPS = 2; // the toolbar shows at most this many applied filters; the rest collapse into «+N»

// Development build only: empty preview cards next to the real meditation (see data/meditationsDemo.ts).
const isDemo = (m: Meditation) => m.id.startsWith(DEMO_MEDITATION_PREFIX);

type Props = {
  meditations: Meditation[];
  // Seeds the emotional-state filter from outside (e.g. the Emotional Profile page's "Переглянути всі").
  initialCategories?: string[];
  // Set when arriving from a Header search-result click: opens that meditation's page straight away.
  initialSelectedId?: string;
  session?: Profile | null;
  onRequireLogin?: () => void;
  // «Почати практику» for a meditation already in the cabinet
  onStart?: () => void;
};

const chip = (active: boolean) =>
  `min-h-[40px] rounded-full px-3.5 py-2 text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
    active ? "bg-white text-[#4227d5]" : "bg-white/20 text-white hover:bg-white/30"
  }`;
const heading = "mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-white";

export default function MeditationsCatalogPage({ meditations, initialCategories = [], initialSelectedId, session, onRequireLogin, onStart }: Props) {
  const materialsVersion = useMaterialsVersion();
  const catalog = useMemo<Meditation[]>(() => (import.meta.env.DEV ? [...meditations, ...demoMeditations] : [...meditations]), [meditations, materialsVersion]);
  const [search, setSearch] = useState("");
  const [selectedSort, setSelectedSort] = useState<SortId>("default");
  const [duration, setDuration] = useState(DEFAULTS.duration);
  const [states, setStates] = useState<string[]>(initialCategories);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Meditation | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  // Arriving from a search result: show the meditation's page and mark its card.
  useEffect(() => {
    if (!initialSelectedId) return;
    const found = meditations.find((m) => m.id === initialSelectedId);
    if (!found) return;
    setSelected(found);
    setHighlightedId(found.id);
    const t = setTimeout(() => setHighlightedId(null), 2200);
    return () => clearTimeout(t);
  }, [initialSelectedId, meditations]);

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

  const toggleState = (id: string) => setStates((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));

  const filtered = useMemo(
    () => filterAndSortMeditations(catalog, { search, duration, states, sort: selectedSort }),
    [catalog, search, duration, states, selectedSort],
  );

  // a new filter or order starts again from the first page of results
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, selectedSort, duration, states]);

  useFirstRowHeight(panelRef, gridRef, [filtered, visibleCount]);

  const activeChips = [
    ...(search.trim() ? [{ key: "search", label: `«${search.trim()}»`, clear: () => setSearch("") }] : []),
    ...(duration !== DEFAULTS.duration ? [{ key: "duration", label: duration, clear: () => setDuration(DEFAULTS.duration) }] : []),
    ...stateCategories.filter((c) => states.includes(c.id)).map((c) => ({ key: `state-${c.id}`, label: c.label, clear: () => toggleState(c.id) })),
  ];
  const filtersActive = activeChips.length > 0;
  const resetFilters = () => {
    setSearch("");
    setDuration(DEFAULTS.duration);
    setStates([]);
  };

  // ── bookmarks (one request for the whole page, no per-card queries) ──────
  const role = session?.role;
  const userId = session?.id;
  const [saved, setSaved] = useState<Map<string, string>>(new Map()); // meditationId -> saved row id
  const [saveError, setSaveError] = useState<string | null>(null);
  const savingIds = useRef(new Set<string>()); // a quick double click must not send two requests

  useEffect(() => {
    if (role !== "participant" || !userId) {
      setSaved(new Map());
      return;
    }
    let cancelled = false;
    fetchAllSavedPractices(userId)
      .then((rows) => {
        if (!cancelled) setSaved(new Map(rows.filter((r) => r.kind === "meditation").map((r) => [r.contentItemId, r.id])));
      })
      .catch(() => {
        // can't tell → show as not saved; toggling still works
      });
    return () => {
      cancelled = true;
    };
  }, [role, userId]);

  const toggleSaved = async (m: Meditation) => {
    if (role !== "participant" || !userId) {
      onRequireLogin?.();
      return;
    }
    if (savingIds.current.has(m.id)) return;
    savingIds.current.add(m.id);
    setSaveError(null);
    const existing = saved.get(m.id);
    try {
      if (existing) {
        setSaved((prev) => {
          const n = new Map(prev);
          n.delete(m.id);
          return n;
        });
        await removeSavedPractice(existing);
      } else {
        const row = await addSavedPractice({ itemId: m.id, userId, kind: "meditation", itemTitle: m.title });
        setSaved((prev) => new Map(prev).set(m.id, row.id));
      }
    } catch {
      if (existing) setSaved((prev) => new Map(prev).set(m.id, existing));
      setSaveError("Не вдалося оновити збережені. Спробуйте ще раз.");
    } finally {
      savingIds.current.delete(m.id);
    }
  };
  const canBookmark = role !== "author";

  // the same controls in the desktop sidebar and in the mobile drawer
  const filterControls = (showSort: boolean, stretch = false) => (
    <div className={`flex flex-col gap-[18px] ${stretch ? "flex-1 justify-between" : ""}`}>
      <div>
        <div className={heading}>Пошук</div>
        <div className="relative">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/80">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Пошук медитацій"
            aria-label="Пошук медитацій за назвою"
            className="w-full rounded-xl border border-white/35 bg-white/15 py-3 pl-10 pr-3 text-[14px] text-white placeholder-white/75 focus:border-white/80 focus:outline-none"
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
        <div className={heading}>Тривалість</div>
        <div className="flex flex-wrap gap-2">
          {DURATION_OPTIONS.map((item) => (
            <button key={item} type="button" onClick={() => setDuration(item)} aria-pressed={duration === item} className={chip(duration === item)}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={heading}>Стан</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setStates([])} aria-pressed={states.length === 0} className={chip(states.length === 0)}>
            Усі
          </button>
          {stateCategories.map((cat) => (
            <button key={cat.id} type="button" onClick={() => toggleState(cat.id)} aria-pressed={states.includes(cat.id)} className={chip(states.includes(cat.id))}>
              {cat.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <section className="relative min-h-screen overflow-hidden bg-gradient-to-br from-[#5143ff] via-[#8a62ff] to-[#be93ff] pb-0 pt-[112px] text-white sm:pt-[132px] lg:pt-[150px]">
      <div className="relative z-10 mx-auto max-w-[1280px] px-4 sm:px-6">
        {/* HEADER */}
        <div className="mb-6 sm:mb-8">
          <h1 className="mb-2 text-[32px] font-bold leading-tight sm:text-[40px]">Каталог медитацій</h1>
          <p className="text-[16px] text-white">Короткі аудіопрактики, щоб швидко заспокоїтись і повернути відчуття опори.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start lg:gap-8">
          {/* SIDEBAR (desktop) */}
          <aside ref={panelRef} className="hidden rounded-3xl border border-white/40 bg-[#3c2bcb]/35 p-6 text-white shadow-[0_10px_30px_-12px_rgba(40,15,100,0.45)] backdrop-blur-xl lg:flex lg:flex-col">{filterControls(false, true)}</aside>

          {/* CONTENT */}
          <div className="min-w-0">
            {/* TOOLBAR */}
            <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2.5 text-[14px]">
              <button
                ref={filtersBtnRef}
                type="button"
                onClick={() => setDrawerOpen(true)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/35 bg-white/15 px-4 font-medium lg:hidden"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M4 6h16M7 12h10M10 18h4" />
                </svg>
                Фільтри{filtersActive ? ` · ${activeChips.length}` : ""}
              </button>

              <span className="font-medium text-white" aria-live="polite">
                Знайдено медитацій: <b>{filtered.length}</b>
              </span>

              {activeChips.slice(0, MAX_SHOWN_CHIPS).map((c) => (
                <button key={c.key} type="button" onClick={c.clear} aria-label={`Прибрати фільтр: ${c.label}`} className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-white/35 bg-white/15 px-3 text-[13px] hover:bg-white/25">
                  {c.label}
                  <span aria-hidden="true" className="text-white/80">×</span>
                </button>
              ))}

              {activeChips.length > MAX_SHOWN_CHIPS && (
                <span aria-label={`Ще фільтрів: ${activeChips.length - MAX_SHOWN_CHIPS}`} className="inline-flex min-h-[32px] items-center rounded-full bg-white/25 px-3 text-[13px] font-semibold" title={activeChips.slice(MAX_SHOWN_CHIPS).map((c) => c.label).join(", ")}>
                  +{activeChips.length - MAX_SHOWN_CHIPS}
                </span>
              )}

              {filtersActive && (
                <button type="button" onClick={resetFilters} className="inline-flex min-h-[32px] items-center px-1 text-[13px] text-white underline underline-offset-4">
                  Скинути фільтри
                </button>
              )}

              <div className="hidden sm:ml-auto sm:block">
                <CatalogSort<SortId> value={selectedSort} onChange={setSelectedSort} options={SORT_OPTIONS} className="" listClassName="bg-[#4d36e9]/95" />
              </div>
            </div>

            {saveError && (
              <div role="status" className="mb-4 rounded-xl border border-white/30 bg-white/15 px-4 py-2.5 text-[13px]">
                {saveError}
              </div>
            )}

            {/* GRID */}
            {filtered.length === 0 ? (
              <div className="rounded-3xl border border-white/30 bg-white/15 p-8 text-center backdrop-blur-xl">
                <p className="mb-4 text-[16px]">За цими фільтрами медитацій немає.</p>
                {filtersActive && (
                  <button type="button" onClick={resetFilters} className="min-h-[44px] rounded-xl bg-white px-5 text-[14px] font-semibold text-[#4227d5]">
                    Скинути фільтри
                  </button>
                )}
              </div>
            ) : (
              <div ref={gridRef} className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.slice(0, visibleCount).map((m) => (
                  <CatalogMeditationCard
                    key={m.id}
                    meditation={m}
                    onOpen={() => setSelected(m)}
                    highlighted={m.id === highlightedId}
                    saved={canBookmark && !isDemo(m) ? saved.has(m.id) : undefined}
                    onToggleSaved={canBookmark && !isDemo(m) ? () => void toggleSaved(m) : undefined}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LOAD MORE */}
        {visibleCount < filtered.length && (
          <div className="mt-10 flex justify-center">
            <button type="button" onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)} className="min-h-[48px] rounded-2xl border border-white/30 bg-white/15 px-8 backdrop-blur-xl transition hover:bg-white/25">
              Показати ще
            </button>
          </div>
        )}
      </div>

      {/* FILTER DRAWER (below lg) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Фільтри">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/30 bg-[#6146f5] p-5 pb-6 text-white shadow-2xl">
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
              <button type="button" onClick={() => setDrawerOpen(false)} className="min-h-[48px] flex-[2] rounded-xl bg-white text-[14px] font-semibold text-[#4227d5]">
                Показати медитації ({filtered.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* inside the section, so the gap above the footer is the page colour (not the dark app background) */}
      <Footer onOpenTest={() => {}} />

      {selected && (
        <MeditationDetailModal
          meditation={selected}
          onClose={() => setSelected(null)}
          userId={userId}
          isParticipant={role === "participant"}
          onStart={onStart}
          demo={isDemo(selected)}
        />
      )}
    </section>
  );
}
