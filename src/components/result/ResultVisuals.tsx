// Visual pieces of the result page (22.11.2026): the level as a gauge, the map of all six states from the person's
// own answers, tabs instead of a wall of text, and the impact scale. No percentages anywhere (lawyer, Ю2/Ю6):
// only words such as «часто», «відчутний».
import { motion } from "framer-motion";
import { useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import type { Intensity, PrimaryStateId } from "../../store/funnelStore";
import type { AssessmentAnswer } from "../test/questions";
import { STATE_ORDER, MAX_ANSWER } from "../test/questions";
import { categoryLabels } from "../../data/categoryLabels";

const LEVELS: { key: Intensity; label: string }[] = [
  { key: "low", label: "Легкий" },
  { key: "moderate", label: "Помірний" },
  { key: "high", label: "Відчутний" },
  { key: "critical", label: "Дуже високий" },
];
const stateLabel = (id: string) => categoryLabels[id as keyof typeof categoryLabels] ?? id;

// a point on a half circle: angle 180° (left) → 0° (right)
function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
}
function arc(cx: number, cy: number, r: number, from: number, to: number) {
  const s = polar(cx, cy, r, from);
  const e = polar(cx, cy, r, to);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 0 1 ${e.x} ${e.y}`;
}

/** The level as a half-circle gauge in four parts; the current part is lit and marked. */
export function LevelGauge({ intensity, color, reduce }: { intensity: Intensity; color: string; reduce: boolean }) {
  const idx = LEVELS.findIndex((l) => l.key === intensity);
  const cx = 150, cy = 140, r = 110, gap = 2;
  const parts = LEVELS.map((l, i) => {
    const from = 180 - i * 45 - (i === 0 ? 0 : gap / 2);
    const to = 180 - (i + 1) * 45 + (i === 3 ? 0 : gap / 2);
    return { ...l, d: arc(cx, cy, r, from, to), on: i <= idx };
  });
  const marker = polar(cx, cy, r, 180 - idx * 45 - 22.5);
  return (
    <figure className="mx-auto w-full max-w-[360px]" aria-label={`Рівень: ${LEVELS[idx].label}, ${idx + 1} з 4`}>
      <svg viewBox="0 0 300 160" className="w-full" role="img" aria-hidden="true">
        {parts.map((p, i) => (
          <motion.path
            key={p.key}
            d={p.d}
            fill="none"
            strokeWidth={20}
            strokeLinecap="butt"
            stroke={p.on ? color : "rgba(255,255,255,0.14)"}
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.15 * i, duration: 0.5 }}
            style={{ opacity: p.on ? 0.55 + 0.15 * i : 1 }}
          />
        ))}
        <motion.circle
          cx={marker.x}
          cy={marker.y}
          r={14}
          fill="#fff"
          stroke={color}
          strokeWidth={5}
          initial={reduce ? false : { scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15 * idx + 0.4, type: "spring", stiffness: 260, damping: 18 }}
        />
        <text x={cx} y={cy - 22} textAnchor="middle" fill="#fff" fontSize="26" fontWeight="700">{LEVELS[idx].label}</text>
        <text x={cx} y={cy + 2} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize="13">рівень зараз</text>
      </svg>
      <figcaption className="mt-1 flex justify-between text-[12px] text-white/50">
        <span>Легкий</span>
        <span>Дуже високий</span>
      </figcaption>
    </figure>
  );
}

type MapRow = { id: PrimaryStateId; value: number; chosen: boolean; order: number };
const freqWord = (v: number) => (v <= 0.25 ? "рідко" : v <= 0.5 ? "іноді" : v <= 0.75 ? "часто" : "майже постійно");

/** The six states from the person's own answers: the chosen ones by their 4 questions, the others by one. */
export function StateMap({ answers, reduce }: { answers: AssessmentAnswer[]; reduce: boolean }) {
  const rows: MapRow[] = STATE_ORDER.flatMap((s) => {
    const core = answers.filter((a) => a.kind === "core" && a.questionId.startsWith(`${s}-`));
    const screen = answers.find((a) => a.questionId === `${s}-screen`);
    const vals = core.length ? core.map((a) => Number(a.scores[s] ?? 0)) : screen ? [Number(screen.scores[s] ?? 0)] : [];
    if (!vals.length) return [];
    return [{ id: s, value: vals.reduce((x, y) => x + y, 0) / (vals.length * MAX_ANSWER), chosen: core.length > 0, order: core.length ? answers.indexOf(core[0]) : 0 }];
  // the state(s) the person chose come first (in the order chosen), then the others from the strongest to the mildest
  }).sort((a, b) => Number(b.chosen) - Number(a.chosen) || (a.chosen ? a.order - b.order : b.value - a.value));
  if (rows.length < 2) return null;
  const firstOther = rows.findIndex((r) => !r.chosen);
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((r, i) => (
        <li key={r.id} className="contents">
          {i === 0 && <span className="text-[12px] uppercase tracking-[0.18em] text-white/50">Обрані вами</span>}
          {i === firstOther && firstOther > 0 && <span className="mt-3 border-t border-white/10 pt-4 text-[12px] uppercase tracking-[0.18em] text-white/50">Інші стани, від найсильнішого</span>}
          <MapRowView r={r} i={i} reduce={reduce} />
        </li>
      ))}
    </ul>
  );
}

function MapRowView({ r, i, reduce }: { r: MapRow; i: number; reduce: boolean }) {
  return (
    <>
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[150px_1fr_130px] sm:gap-y-0">
          <span className="flex min-w-0 items-center gap-2 text-[14px] sm:text-[15px]">
            <span className={`truncate ${r.chosen ? "font-semibold text-white" : "text-white/80"}`}>{stateLabel(r.id)}</span>
          </span>
          <span className="order-3 col-span-2 h-3 overflow-hidden rounded-full bg-white/12 sm:order-none sm:col-span-1" aria-hidden="true">
            <motion.span
              className="block h-full rounded-full"
              // calm, in Sensoria's own colours: no bright state colours here (owner, 22.11.2026)
              style={{ background: r.chosen ? "linear-gradient(90deg, #ffffff, #d9d4ff)" : "rgba(255,255,255,0.42)" }}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.max(4, r.value * 100)}%` }}
              transition={{ delay: 0.08 * i, duration: 0.7, ease: "easeOut" }}
            />
          </span>
          <span className="whitespace-nowrap text-right text-[13px] text-white/70">
            {freqWord(r.value)}
          </span>
        </div>
    </>
  );
}

const IMPACT = ["Зовсім ні", "Трохи", "Помітно", "Дуже сильно"];
const IMPACT_AREAS: { icon: IconName; label: string }[] = [
  { icon: "moon", label: "Сон" },
  { icon: "toolbox", label: "Робота й навчання" },
  { icon: "heart", label: "Стосунки" },
];

/** How much the state gets in the way of daily life: a 4-step scale. */
export function ImpactScale({ impact, color }: { impact: number; color: string }) {
  const v = Math.max(0, Math.min(3, impact));
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {IMPACT_AREAS.map((a) => (
          <span key={a.label} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] text-white/80">
            <Icon name={a.icon} size={14} /> {a.label}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-4 gap-2" aria-label={`Вплив на щоденне життя: ${IMPACT[v].toLowerCase()}`}>
        {IMPACT.map((label, i) => (
          <li key={label}>
            <span className="block h-2.5 rounded-full" style={{ backgroundColor: i <= v ? color : "rgba(255,255,255,0.14)" }} aria-hidden="true" />
            <span className={`mt-2 block text-[12px] leading-tight sm:text-[13px] ${i === v ? "font-semibold text-white" : "text-white/50"}`}>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type ResultTab = { id: string; icon: IconName; label: string; content: React.ReactNode };

/** Tabs instead of a wall of text: one short explanation at a time. */
export function ResultTabs({ tabs }: { tabs: ResultTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div>
      <div role="tablist" aria-label="Розбір результату" className="mb-5 flex flex-wrap gap-2">
        {tabs.map((t) => {
          const on = t.id === current.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`rtab-${t.id}`}
              aria-selected={on}
              aria-controls={`rpanel-${t.id}`}
              onClick={() => setActive(t.id)}
              className={`inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-[15px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                on ? "bg-white text-[#1e3a8a]" : "bg-white/10 text-white/80 hover:bg-white/15"
              }`}
            >
              <Icon name={t.icon} size={16} /> {t.label}
            </button>
          );
        })}
      </div>
      <motion.div
        key={current.id}
        id={`rpanel-${current.id}`}
        role="tabpanel"
        aria-labelledby={`rtab-${current.id}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        {current.content}
      </motion.div>
    </div>
  );
}
