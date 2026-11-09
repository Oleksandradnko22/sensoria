// Small presentational pieces of "Ваші спостереження". Module-level (not
// declared inside the page component) so they keep their identity between
// renders instead of being re-created every time.
import type { ReactNode } from "react";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import type { StateChange } from "../../utils/stateChanges";

const SHORT_MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];

// Day + month for the left column (above the record on phones), with the time
// of day underneath — two records on one day differ by it.
export function DateBlock({ iso }: { iso: string }) {
  const d = new Date(iso);
  const ok = Number.isFinite(d.getTime());
  const time = ok ? d.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <time dateTime={iso} title={formatAbsoluteDate(iso)} className="flex items-baseline gap-1.5 sm:block sm:pt-0.5">
      <span className="font-serif text-[20px] sm:text-[30px] leading-none text-black/80">{ok ? d.getDate() : "—"}</span>
      <span className="text-[12px] font-semibold uppercase tracking-wider text-black/60 sm:block sm:mt-1">
        {ok ? SHORT_MONTHS[d.getMonth()] : ""}
      </span>
      {time && <span className="text-[12px] text-black/60 sm:block sm:mt-0.5">{time}</span>}
    </time>
  );
}

export function MonthHeading({ children }: { children: ReactNode }) {
  return <h2 className="font-serif text-[20px] text-black/70 pt-2 pb-1 px-4">{children}</h2>;
}

export const MOMENT_CLS = "block w-full text-left py-5 px-4 sm:grid sm:grid-cols-[72px_minmax(0,1fr)] sm:gap-x-5 rounded-xl";

// Before → after as the focal point of a moment: two numbers on a short track
// of the record's own scale (position only — no derived value).
export function ChangeFigure({ c }: { c: StateChange }) {
  const pos = (v: number | null) =>
    v === null || c.scale === null ? null : Math.max(0, Math.min(100, ((v - 1) / Math.max(1, c.scale - 1)) * 100));
  const pb = pos(c.beforeValue);
  const pa = pos(c.afterValue);
  return (
    <div className="min-w-0">
      <div className="flex items-end gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-black/60">Було</div>
          <div className="font-serif text-[32px] leading-none text-black/60">{c.beforeValue ?? "—"}</div>
        </div>
        <span aria-hidden="true" className="pb-1.5 text-black/30 text-[20px]">
          →
        </span>
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-wide text-[#4338ca]/70">Стало</div>
          <div className="font-serif text-[32px] leading-none text-black/90">{c.afterValue ?? "—"}</div>
        </div>
        {c.scale !== null && <span className="pb-1 text-[12px] text-black/60">з {c.scale}</span>}
      </div>
      {pb !== null && pa !== null && (
        <div className="relative mt-3 h-3 max-w-[200px]" aria-hidden="true">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-black/10" />
          <div
            className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#4338ca]/25"
            style={{ left: `${Math.min(pb, pa)}%`, width: `${Math.abs(pa - pb)}%` }}
          />
          <span
            className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#4338ca]/60 bg-[#fffdf9]"
            style={{ left: `${pb}%` }}
          />
          <span
            className="absolute top-1/2 w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#4338ca]"
            style={{ left: `${pa}%` }}
          />
        </div>
      )}
    </div>
  );
}
