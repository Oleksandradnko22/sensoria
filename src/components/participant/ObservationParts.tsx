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
    <time dateTime={iso} title={formatAbsoluteDate(iso)} className="flex items-center gap-2.5 sm:flex-col sm:items-center sm:gap-1.5">
      {/* a date tile, like the icon squares on «Огляд» */}
      <span className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#eef0fd] to-[#f3eeff] ring-1 ring-[#e4def9]">
        <span className="text-[20px] font-bold leading-none tabular-nums text-[#4338ca]">{ok ? d.getDate() : "—"}</span>
        <span className="mt-1 text-[11px] font-bold uppercase leading-none tracking-[0.06em] text-[#6d5bd0]">{ok ? SHORT_MONTHS[d.getMonth()] : ""}</span>
      </span>
      {time && <span className="text-[12px] font-medium tabular-nums text-black/50">{time}</span>}
    </time>
  );
}

export function MonthHeading({ children }: { children: ReactNode }) {
  return <h2 className="px-1 pb-2 pt-3 text-[13px] font-bold uppercase tracking-[0.14em] text-black/40">{children}</h2>;
}

export const MOMENT_CLS = "block w-full text-left p-4 sm:p-5 sm:grid sm:grid-cols-[64px_minmax(0,1fr)] sm:gap-x-5 rounded-[22px] bg-white shadow-[0_10px_30px_-18px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";

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
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-black/45">Було</div>
          <div className="mt-1 text-[28px] font-bold leading-none tabular-nums text-black/40">{c.beforeValue ?? "—"}</div>
        </div>
        <span aria-hidden="true" className="mb-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#f1eeff] text-[14px] text-[#6d5bd0]">
          →
        </span>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6d5bd0]">Стало</div>
          <div className="mt-1 text-[28px] font-bold leading-none tabular-nums text-[#12172b]">{c.afterValue ?? "—"}</div>
        </div>
        {c.scale !== null && <span className="pb-0.5 text-[13px] font-medium text-black/45">з {c.scale}</span>}
      </div>
      {pb !== null && pa !== null && (
        <div className="relative mt-3.5 h-4 max-w-[220px]" aria-hidden="true">
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#ece9fe]" />
          <div
            className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-[#c9bff7] to-[#8f7ff0]"
            style={{ left: `${Math.min(pb, pa)}%`, width: `${Math.abs(pa - pb)}%` }}
          />
          <span
            className="absolute top-1/2 w-3.5 h-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-[#8f7ff0] bg-white"
            style={{ left: `${pb}%` }}
          />
          <span
            className="absolute top-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] ring-2 ring-white shadow-[0_4px_10px_-2px_rgba(91,61,245,0.6)]"
            style={{ left: `${pa}%` }}
          />
        </div>
      )}
    </div>
  );
}
