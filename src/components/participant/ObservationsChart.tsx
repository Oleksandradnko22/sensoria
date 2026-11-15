// Overview of how the participant's own before/after ratings changed over
// time. One column per real observation (oldest → newest); the hollow dot is
// "було", the filled dot "стало", the thin bar between them the change. Nothing
// is smoothed, averaged or extrapolated, and each column is positioned on the
// series' own scale (never rescaled across scales). 
import { formatAbsoluteDate } from "../../utils/relativeTime";
import type { ChartSeries } from "../../utils/observationsView";

const HEIGHT = 160;
const MONTHS = ["січ", "лют", "бер", "кві", "тра", "чер", "лип", "сер", "вер", "жов", "лис", "гру"];
const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

export default function ObservationsChart({
  series,
}: {
  series: ChartSeries;
}) {
  const { points, scale, min } = series;
  const y = (v: number) => HEIGHT - ((v - min) / Math.max(1, scale - min)) * HEIGHT;
  const ticks = [...new Set([min, Math.round((min + scale) / 2), scale])];
  const last = points.length - 1;
  const labelAt = (i: number) => i === 0 || i === last || (points.length > 6 ? false : true);

  return (
    <div className="rounded-2xl bg-gradient-to-b from-[#faf9ff] to-white px-3 pb-3 pt-5 ring-1 ring-[#f1eefb] sm:px-4">
      <div className="flex gap-3">
        <div className="relative shrink-0 w-5 text-[12px] font-medium tabular-nums text-black/40" style={{ height: HEIGHT }} aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
              {t}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative flex" style={{ height: HEIGHT }}>
            {ticks.map((t) => (
              <div key={t} className="absolute left-0 right-0 h-px bg-[#ece9fe]" style={{ top: y(t) }} aria-hidden="true" />
            ))}
            {points.map((p) => {
              const top = Math.min(y(p.before), y(p.after));
              const h = Math.abs(y(p.before) - y(p.after));
              return (
                <div
                  key={p.key}
                  role="img"
                  aria-label={`${formatAbsoluteDate(p.at)}: було ${p.before} з ${scale}, стало ${p.after} з ${scale}`}
                  title={`${formatAbsoluteDate(p.at)} · ${p.before} → ${p.after}`}
                  className="group relative flex-1 min-w-[26px] rounded-xl transition hover:bg-[#f1eeff]/70"
                >
                  {/* the change: a soft capsule from «було» to «стало» */}
                  <span
                    className="absolute left-1/2 w-3.5 -translate-x-1/2 rounded-full bg-gradient-to-b from-[#c9bff7] to-[#a99bf2] opacity-60"
                    style={{ top: top - 7, height: Math.max(h, 0) + 14 }}
                  />
                  <span
                    className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[2.5px] border-[#8f7ff0] bg-white"
                    style={{ top: y(p.before) }}
                  />
                  <span
                    className="absolute left-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] shadow-[0_4px_10px_-2px_rgba(91,61,245,0.6)] ring-2 ring-white"
                    style={{ top: y(p.after) }}
                  />
                  <span
                    className="pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 -translate-y-[calc(100%+12px)] whitespace-nowrap rounded-lg bg-[#1d1a3b] px-2 py-1 text-[12px] font-semibold text-white opacity-0 transition group-hover:opacity-100"
                    style={{ top: Math.min(y(p.before), y(p.after)) }}
                    aria-hidden="true"
                  >
                    {p.before} → {p.after}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex mt-2.5" aria-hidden="true">
            {points.map((p, i) => (
              <div key={p.key} className="flex-1 min-w-[26px] text-center text-[12px] font-medium text-black/50">
                {labelAt(i) || i % 3 === 0 ? shortDate(p.at) : ""}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
