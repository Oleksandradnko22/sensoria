// Overview of how the participant's own before/after ratings changed over
// time. One column per real observation (oldest → newest); the hollow dot is
// "було", the filled dot "стало", the thin bar between them the change. Nothing
// is smoothed, averaged or extrapolated, and each column is positioned on the
// series' own scale (never rescaled across scales). 
import { formatAbsoluteDate } from "../../utils/relativeTime";
import type { ChartSeries } from "../../utils/observationsView";

const HEIGHT = 140;
const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
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
    <div className="flex gap-2">
      <div className="relative shrink-0 w-5 text-[12px] text-black/35" style={{ height: HEIGHT }} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: y(t) }}>
            {t}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative flex" style={{ height: HEIGHT }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute left-0 right-0 border-t border-dashed border-black/[0.08]"
              style={{ top: y(t) }}
              aria-hidden="true"
            />
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
                className="relative flex-1 min-w-[22px]"
              >
                <span
                  className="absolute left-1/2 -translate-x-1/2 w-[3px] rounded-full bg-[#4338ca]/25"
                  style={{ top, height: Math.max(h, 0) }}
                />
                <span
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[11px] h-[11px] rounded-full border-2 border-[#4338ca]/60 bg-white"
                  style={{ top: y(p.before) }}
                />
                <span
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 w-[11px] h-[11px] rounded-full bg-[#4338ca]"
                  style={{ top: y(p.after) }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex mt-2" aria-hidden="true">
          {points.map((p, i) => (
            <div key={p.key} className="flex-1 min-w-[22px] text-center text-[12px] text-black/60">
              {labelAt(i) || i % 3 === 0 ? shortDate(p.at) : ""}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
