import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import CatalogProgramCard from "./catalog/CatalogProgramCard";
import CatalogFiltersPanel from "./catalog/CatalogFilters";
import CatalogSort from "./catalog/CatalogSort";
import Footer from "./Footer";
import { addSavedProgram, fetchAllSavedPrograms, removeSavedProgram } from "../lib/programSaves";
import {
  DEFAULT_FILTERS,
  activeChips,
  applyClear,
  filterAndSortPrograms,
  normalizeCategories,
  type CatalogFilters,
} from "../utils/catalogFilters";
import type { Profile } from "../lib/auth";
import type { Program } from "../data/programs";

type Props = {
  programs: Program[];
  onOpen: (program: Program) => void;
  // Seeds the category filter from outside (e.g. the Library home page
  // linking in with "these are the categories relevant to your
  // result"). Still just the starting point — the user can add, remove,
  // or clear these like any other filter.
  initialCategories?: string[];
  // Bookmarks: participants save for real (programSaves), guests are sent to
  // sign in, authors get no bookmark.
  session?: Profile | null;
  onRequireLogin?: () => void;
};

// The toolbar shows at most this many applied filters; the rest collapse into «+N» (same as guides and meditations).
const MAX_SHOWN_CHIPS = 2;
const PAGE_SIZE = 6;

// Opening a program remembers the filters, "show more" depth and scroll position, so coming back
// (browser Back or the breadcrumb) lands exactly where the person left. Read once, then forgotten.
const RETURN_KEY = "sensoria:catalog-return";
type ReturnState = { filters: CatalogFilters; visibleCount: number; scrollY: number; t: number };
function readReturnState(): ReturnState | null {
  try {
    const raw = sessionStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(RETURN_KEY);
    const v = JSON.parse(raw) as ReturnState;
    return Date.now() - v.t < 30 * 60 * 1000 && v.filters ? v : null;
  } catch {
    return null;
  }
}

export default function ProgramsCatalogPage({ programs, onOpen, initialCategories = [], session, onRequireLogin }: Props) {
  // Multi-select categories: an empty array means "all". Seeded once on mount —
  // this component remounts each time the page is opened, so a deep link seeds correctly.
  // A deep link (initialCategories) wins over a remembered state.
  const [restored] = useState<ReturnState | null>(() => (initialCategories.length ? null : readReturnState()));
  const [filters, setFilters] = useState<CatalogFilters>(
    () => restored?.filters ?? { ...DEFAULT_FILTERS, categories: normalizeCategories(initialCategories) }
  );
  const [visibleCount, setVisibleCount] = useState(restored?.visibleCount ?? PAGE_SIZE);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filtersBtnRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (restored) window.scrollTo(0, restored.scrollY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openProgram = (program: Program) => {
    try {
      sessionStorage.setItem(RETURN_KEY, JSON.stringify({ filters, visibleCount, scrollY: window.scrollY, t: Date.now() } satisfies ReturnState));
    } catch {
      // storage unavailable: the catalog just starts fresh next time
    }
    onOpen(program);
  };

  // Filter drawer (below lg): Escape closes, the page behind does not scroll,
  // focus moves into the drawer and returns to the «Фільтри» button.
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

  const filtered = useMemo(() => filterAndSortPrograms(programs, filters), [programs, filters]);
  // The filter block is as tall as the toolbar + the FIRST row of cards (desktop only).
  const asideRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const programKey = filtered.length;
  useLayoutEffect(() => {
    const aside = asideRef.current;
    const content = contentRef.current;
    if (!aside || !content) return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const measure = () => {
      const first = content.querySelector("article");
      if (!desktop.matches || !first) {
        aside.style.minHeight = "";
        return;
      }
      aside.style.minHeight = `${Math.round(first.getBoundingClientRect().bottom - aside.getBoundingClientRect().top)}px`;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(content);
    const first = content.querySelector("article");
    if (first) ro.observe(first);
    desktop.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      desktop.removeEventListener("change", measure);
    };
  }, [programKey, visibleCount]);

  const chips = activeChips(filters);
  const filtersActive = chips.length > 0;

  const update = (next: CatalogFilters) => {
    setFilters(next);
    setVisibleCount(PAGE_SIZE);
  };

  // ── bookmarks (one request for the whole page, no per-card queries) ──────
  const role = session?.role;
  const userId = session?.id;
  const [saved, setSaved] = useState<Map<string, string>>(new Map()); // programId -> saved row id
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== "participant" || !userId) {
      setSaved(new Map());
      return;
    }
    let cancelled = false;
    fetchAllSavedPrograms(userId)
      .then((rows) => {
        if (!cancelled) setSaved(new Map(rows.map((r) => [r.programId, r.id])));
      })
      .catch(() => {
        // can't tell → show as not saved; toggling still works
      });
    return () => {
      cancelled = true;
    };
  }, [role, userId]);

  const toggleSaved = async (program: Program) => {
    if (role !== "participant" || !userId) {
      onRequireLogin?.();
      return;
    }
    setSaveError(null);
    const existing = saved.get(program.id);
    try {
      if (existing) {
        setSaved((m) => {
          const n = new Map(m);
          n.delete(program.id);
          return n;
        });
        await removeSavedProgram(existing);
      } else {
        const row = await addSavedProgram({ programId: program.id, programTitle: program.title, userId });
        setSaved((m) => new Map(m).set(program.id, row.id));
      }
    } catch {
      if (existing) setSaved((m) => new Map(m).set(program.id, existing));
      setSaveError("Не вдалося оновити збережені. Спробуйте ще раз.");
    }
  };
  const canBookmark = role !== "author";

  return (
    <>
      <main className="min-h-screen pt-[112px] text-white sm:pt-[132px] lg:pt-[150px]">
        <div className="mx-auto max-w-[1280px] px-4 sm:px-6">
          {/* HEADER */}
          <div className="mb-6 sm:mb-8">
            <h1 className="mb-2 text-[32px] font-bold leading-tight sm:text-[40px]">Каталог програм</h1>
            <p className="text-[16px] text-white/70">Покрокові програми з модулями та вправами для підтримки вашого ментального стану.</p>
          </div>

          <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start lg:gap-8">
            {/* SIDEBAR (desktop) */}
            <aside ref={asideRef} className="hidden rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-2xl lg:flex lg:flex-col">
              <CatalogFiltersPanel filters={filters} onChange={update} />
            </aside>

            {/* CONTENT */}
            <div ref={contentRef} className="min-w-0">
              {/* TOOLBAR */}
              <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2.5 text-[14px]">
                <button
                  ref={filtersBtnRef}
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="inline-flex min-h-[40px] items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 font-medium lg:hidden"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 6h16M7 12h10M10 18h4" />
                  </svg>
                  Фільтри{filtersActive ? ` · ${chips.length}` : ""}
                </button>

                <span className="font-medium text-white" aria-live="polite">
                  Знайдено програм: <b className="text-white">{filtered.length}</b>
                </span>

                {chips.slice(0, MAX_SHOWN_CHIPS).map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => update(applyClear(filters, c.clear))}
                    aria-label={`Прибрати фільтр: ${c.label}`}
                    className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 text-[13px] hover:bg-white/20"
                  >
                    {c.label}
                    <span aria-hidden="true" className="text-white/70">×</span>
                  </button>
                ))}

                {chips.length > MAX_SHOWN_CHIPS && (
                  <span aria-label={`Ще фільтрів: ${chips.length - MAX_SHOWN_CHIPS}`} className="inline-flex min-h-[32px] items-center rounded-full bg-white/20 px-3 text-[13px] font-semibold" title={chips.slice(MAX_SHOWN_CHIPS).map((c) => c.label).join(", ")}>
                    +{chips.length - MAX_SHOWN_CHIPS}
                  </span>
                )}

                {filtersActive && (
                  <button type="button" onClick={() => update({ ...DEFAULT_FILTERS })} className="inline-flex min-h-[32px] items-center gap-1.5 px-1 text-[13px] text-white underline underline-offset-4">
                    Скинути фільтри
                  </button>
                )}

                <CatalogSort value={filters.sort} onChange={(sort) => update({ ...filters, sort })} />
              </div>

              {saveError && (
                <div role="status" className="mb-4 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-[13px]">
                  {saveError}
                </div>
              )}

              {/* GRID */}
              {filtered.length === 0 ? (
                <div className="rounded-3xl border border-white/15 bg-white/10 p-8 text-center backdrop-blur-xl">
                  <p className="mb-4 text-[16px]">За цими фільтрами програм немає.</p>
                  {filtersActive && (
                    <button type="button" onClick={() => update({ ...DEFAULT_FILTERS })} className="min-h-[44px] rounded-xl bg-white px-5 text-[14px] font-semibold text-[#1e3a8a]">
                      Скинути фільтри
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {filtered.slice(0, visibleCount).map((program) => (
                    <CatalogProgramCard
                      key={program.id}
                      program={program}
                      onOpen={() => openProgram(program)}
                      saved={canBookmark ? saved.has(program.id) : undefined}
                      onToggleSaved={canBookmark ? () => void toggleSaved(program) : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* LOAD MORE */}
          {visibleCount < filtered.length && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                className="min-h-[48px] rounded-2xl border border-white/15 bg-white/10 px-8 backdrop-blur-xl transition hover:bg-white/15"
              >
                Показати ще
              </button>
            </div>
          )}
        </div>
      </main>

      {/* FILTER DRAWER (below lg) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Фільтри">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl border border-white/15 bg-[#22389f] p-5 pb-6 text-white shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[18px] font-semibold">Фільтри</div>
              <button ref={drawerCloseRef} type="button" onClick={() => setDrawerOpen(false)} aria-label="Закрити" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[20px]">
                ×
              </button>
            </div>
            <CatalogFiltersPanel filters={filters} onChange={update} showSort />
            <div className="mt-6 flex gap-3">
              {filtersActive && (
                <button type="button" onClick={() => update({ ...DEFAULT_FILTERS })} className="min-h-[48px] flex-1 rounded-xl border border-white/25 text-[14px] font-medium">
                  Скинути
                </button>
              )}
              <button type="button" onClick={() => setDrawerOpen(false)} className="min-h-[48px] flex-[2] rounded-xl bg-white text-[14px] font-semibold text-[#1e3a8a]">
                Показати програми ({filtered.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer onOpenTest={() => {}} />
    </>
  );
}
