import { CATEGORIES, PRICE_OPTIONS, SORT_OPTIONS, toggleCategory, type CatalogFilters } from "../../utils/catalogFilters";

type Props = {
  filters: CatalogFilters;
  onChange: (next: CatalogFilters) => void;
  // The desktop toolbar has its own sort control; the drawer shows sorting here.
  showSort?: boolean;
};

const chip = (active: boolean) =>
  `min-h-[40px] rounded-full px-3.5 py-2 text-[13px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
    active ? "bg-white text-[#1e3a8a]" : "bg-white/10 text-white/90 hover:bg-white/20"
  }`;

const heading = "mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-white/60";

// The filter controls only (search / price / categories [/ sort]); logic stays
// in utils/catalogFilters.ts, state in ProgramsCatalogPage.
export default function CatalogFiltersPanel({ filters, onChange, showSort = false }: Props) {
  return (
    <div className="flex flex-1 flex-col justify-between gap-[18px]">
      <div>
        <div className={heading}>Пошук</div>
        <div className="relative">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Пошук програм"
            aria-label="Пошук програм за назвою"
            className="w-full rounded-xl border border-white/15 bg-white/10 py-3 pl-10 pr-3 text-[14px] text-white placeholder-white/45 focus:border-white/40 focus:outline-none"
          />
        </div>
      </div>

      {showSort && (
        <div>
          <div className={heading}>Сортування</div>
          <div className="flex flex-wrap gap-2">
            {SORT_OPTIONS.map((o) => (
              <button key={o.id} type="button" onClick={() => onChange({ ...filters, sort: o.id })} aria-pressed={filters.sort === o.id} className={chip(filters.sort === o.id)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className={heading}>Ціна</div>
        <div className="flex flex-wrap gap-2">
          {PRICE_OPTIONS.map((o) => (
            <button key={o.id} type="button" onClick={() => onChange({ ...filters, price: o.id })} aria-pressed={filters.price === o.id} className={chip(filters.price === o.id)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={heading}>Категорії</div>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => {
            const active = c.id === "all" ? filters.categories.length === 0 : filters.categories.includes(c.id);
            return (
              <button key={c.id} type="button" onClick={() => onChange({ ...filters, categories: toggleCategory(filters.categories, c.id) })} aria-pressed={active} className={chip(active)}>
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
