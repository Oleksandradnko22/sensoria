import { useEffect, useRef, useState } from "react";
import { SORT_OPTIONS as DEFAULT_SORT_OPTIONS, type SortKey } from "../../utils/catalogFilters";

type Props<K extends string> = {
  value: K;
  onChange: (next: K) => void;
  // Defaults to the programs' options; the guides catalog passes its own.
  options?: { id: K; label: string }[];
  // Colour of the open list (matches the page it sits on).
  listClassName?: string;
  // Word before the value ("Сортування", "Ціна"); the program catalog's sort by default.
  label?: string;
  // Placement of the whole control; pushed to the right by default.
  className?: string;
  // "glass" (default) sits on the blue gradient; "light" sits on the light workspace panels (author cabinet).
  variant?: "glass" | "light";
};

// Glass dropdown for the catalog sort (replaces the native <select>, whose open
// list can't be styled). Listbox semantics: arrows move, Enter/Space picks,
// Escape and outside click close.
export default function CatalogSort<K extends string = SortKey>({ value, onChange, options, listClassName = "bg-[#2c43b5]/95", label = "Сортування", className = "ml-auto", variant = "glass" }: Props<K>) {
  const light = variant === "light";
  const SORT_OPTIONS = (options ?? (DEFAULT_SORT_OPTIONS as unknown as { id: K; label: string }[]));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.id === value) ?? SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const openList = () => {
    setActive(Math.max(0, SORT_OPTIONS.findIndex((o) => o.id === value)));
    setOpen(true);
  };
  const pick = (id: K) => {
    onChange(id);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % SORT_OPTIONS.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      pick(SORT_OPTIONS[active].id);
    }
  };

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openList())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        className={`inline-flex min-h-[40px] items-center gap-2 rounded-full pl-4 pr-3 text-[14px] transition focus:outline-none focus-visible:ring-2 ${light ? "bg-white text-[#12172b] shadow-[0_6px_18px_-12px_rgba(60,60,140,0.35)] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff] focus-visible:ring-[#7c5cf0]" : "border border-white/20 bg-white/10 backdrop-blur-xl hover:bg-white/15 focus-visible:ring-white/60"}`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={light ? "text-[#6d5bd0]" : "text-white/70"}>
          <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
        </svg>
        <span className={`hidden sm:inline ${light ? "text-black/55" : "text-white/70"}`}>{label}:</span>
        <span className={`font-semibold ${light ? "text-[#12172b]" : "text-white"}`}>{current.label}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${light ? "text-[#6d5bd0]" : "text-white/70"} ${open ? "rotate-180" : ""}`}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className={`absolute right-0 z-30 mt-2 w-[240px] overflow-hidden rounded-2xl p-1.5 ${light ? "bg-white text-[#12172b] shadow-[0_18px_40px_-12px_rgba(30,41,90,0.35)] ring-1 ring-[#ebe8ff]" : `border border-white/25 ${listClassName} text-white shadow-[0_20px_40px_-12px_rgba(10,20,80,0.6)] backdrop-blur-2xl`}`}
        >
          {SORT_OPTIONS.map((o, i) => {
            const selected = o.id === value;
            return (
              <li
                key={o.id}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.id)}
                className={`flex min-h-[40px] cursor-pointer items-center justify-between gap-3 rounded-xl px-3.5 text-[14px] transition-colors ${
                  selected ? "font-semibold" : "font-medium"
                } ${active === i ? (light ? "bg-[#f1eeff]" : "bg-white/15") : ""}`}
              >
                {o.label}
                {selected && (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
