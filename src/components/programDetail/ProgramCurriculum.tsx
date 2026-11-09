import { useId, useState } from "react";
import { Icon } from "../ui/Icon";
import { pluralUk } from "../../utils/plural";
import { getProgramModules } from "../../lib/programProgress";
import { isItemLocked, isModuleDone, isModuleLocked } from "../../lib/contentProgress";
import type { ContentModule, ItemProgressMap, ItemProgressStatus, ProgramProgressSummary } from "../../data/contentTypes";
import type { Program } from "../../data/programs";
import type { RealModules } from "./useProgramDetailData";

const lessonWord = (n: number) => pluralUk(n, "урок", "уроки", "уроків");
const moduleWord = (n: number) => pluralUk(n, "модуль", "модулі", "модулів");

type DisplayLesson = {
  title: string;
  optional: boolean;
  // Only for a participant who has progress on the program:
  id?: string;
  status?: ItemProgressStatus;
  locked?: boolean;
  current?: boolean;
};

type DisplayModule = {
  title: string;
  lessonCount: number;
  lessons: DisplayLesson[];
  description?: string;
  materialLabel?: string;
};

// Demo programs have a hand-written item list; real programs only have module
// rows with a lesson COUNT — so no invented lesson titles for those.
export function buildDisplayModules(program: Program, realModules: RealModules): { list: DisplayModule[]; isDemo: boolean } {
  if (program.authorId) {
    return {
      isDemo: false,
      list: realModules.map((m) => ({
        title: m.title,
        lessonCount: m.lessons,
        lessons: [],
        materialLabel: m.materialsUrl ? "PDF матеріал" : m.videoUrl ? "Відео" : undefined,
      })),
    };
  }
  const demo = getProgramModules(program.id) ?? [];
  return {
    isDemo: demo.length > 0,
    list: demo.map((m) => ({
      title: m.title,
      lessonCount: m.items.length,
      lessons: m.items.map((i) => ({ title: i.title, optional: !i.isRequired })),
      description: m.description,
    })),
  };
}

// Numbers for the hero meta row. Only lesson counts: programs are not time-limited, so no duration is shown anywhere.
export function programStats(program: Program, realModules: RealModules): { lessons: number | null } {
  if (program.authorId) {
    const lessons = realModules.reduce((s, m) => s + (m.lessons || 0), 0);
    return { lessons: lessons > 0 ? lessons : null };
  }
  const demo = getProgramModules(program.id) ?? [];
  const lessons = demo.reduce((s, m) => s + m.items.length, 0);
  return { lessons: lessons > 0 ? lessons : null };
}

// A participant who has progress on the program sees (and can open) its real
// lessons with real statuses. The sequential-lock rules are the engine's own
// (lib/contentProgress.ts), the same ones the lesson player enforces.
export type Learning = {
  modules: ContentModule[];
  map: ItemProgressMap;
  summary: ProgramProgressSummary;
};

type ViewModule = DisplayModule & { done: boolean; locked: boolean; current: boolean };

function viewModules(modules: DisplayModule[], learning: Learning | null): ViewModule[] {
  if (!learning) return modules.map((m) => ({ ...m, done: false, locked: false, current: false }));
  const { modules: ms, map, summary } = learning;
  return ms.map((m, mi) => ({
    title: m.title,
    description: m.description || undefined,
    lessonCount: m.items.length,
    done: isModuleDone(ms, map, mi),
    locked: isModuleLocked(ms, map, mi),
    current: summary.currentModuleIndex === mi,
    lessons: m.items.map((it, ii) => ({
      id: it.id,
      title: it.title,
      optional: !it.isRequired,
      status: map[it.id] ?? "not_started",
      locked: isItemLocked(ms, map, mi, ii),
      current: summary.currentModuleIndex === mi && summary.currentItemIndex === ii,
    })),
  }));
}

// Soft lavender waves behind the header of the opened module (decoration only).
function HeaderWaves() {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg viewBox="0 0 400 96" preserveAspectRatio="none" aria-hidden="true" focusable="false" className="pointer-events-none absolute inset-y-0 right-0 h-full w-[40%] sm:w-[62%]">
      <defs>
        <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#c6d3fb" stopOpacity="0" />
          <stop offset=".45" stopColor="#c3cffa" />
          <stop offset="1" stopColor="#c9b8fa" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d9d2fb" stopOpacity="0" />
          <stop offset=".6" stopColor="#ddd3fc" />
          <stop offset="1" stopColor="#efe9fe" />
        </linearGradient>
      </defs>
      <path d="M0 96C70 90 110 40 190 44S300 84 400 10V96z" fill={`url(#${id}a)`} opacity=".85" />
      <path d="M120 96C200 74 270 60 330 36S380 14 400 6" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1.6" />
      <path d="M200 96C270 82 330 70 400 34V96z" fill={`url(#${id}b)`} opacity=".8" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Check({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

const STATUS_LABEL: Partial<Record<ItemProgressStatus, string>> = {
  completed: "Пройдено",
  skipped: "Пропущено",
  in_progress: "Розпочато",
};

function LessonRow({ l, onOpen }: { l: DisplayLesson; onOpen?: (itemId: string) => void }) {
  const canOpen = !!onOpen && !!l.id && !l.locked;
  const done = l.status === "completed";
  const skipped = l.status === "skipped";
  const base = "flex w-full items-center gap-3.5 rounded-[18px] border px-3.5 py-3 text-left";
  const tone = l.current
    ? "border-[#b9b2f7] bg-[#f0eeff] shadow-[0_8px_20px_-14px_rgba(91,61,245,0.6)]"
    : l.locked
      ? "border-[#e8ebf7] bg-[#f6f7fc]"
      : "border-[#e3e8fb] bg-[#f6f8ff]";
  const interactive = canOpen ? "cursor-pointer transition hover:border-[#c3cdf7] hover:bg-[#eef2ff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]" : "cursor-default";

  const body = (
    <>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
          done ? "border-emerald-200 bg-emerald-100 text-emerald-600" : l.locked ? "border-[#e1e5f4] bg-white text-slate-400" : l.current ? "border-[#7b6cf6] bg-[#5b3df5] text-white" : "border-[#d4dcfb] bg-white text-[#2f6bff]"
        }`}
      >
        {done ? <Check size={17} /> : l.locked ? <Icon name="lock" size={15} /> : skipped ? <span className="text-[16px] leading-none">–</span> : <Icon name="play" size={13} filled />}
      </span>
      <span className={`min-w-0 flex-1 text-[16px] font-medium ${l.locked ? "text-slate-500" : "text-slate-900"}`}>{l.title}</span>
      {l.current ? (
        <span className="shrink-0 rounded-full bg-[#5b3df5] px-2.5 py-1 text-[12px] font-semibold text-white">Ви тут</span>
      ) : l.status && STATUS_LABEL[l.status] ? (
        <span className={`shrink-0 text-[13px] font-medium ${done ? "text-emerald-600" : "text-slate-500"}`}>{STATUS_LABEL[l.status]}</span>
      ) : null}
      {l.optional && <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[12px] font-medium text-slate-500 ring-1 ring-[#e0e6fb]">необов'язково</span>}
    </>
  );

  if (!onOpen || !l.id) return <div className={`${base} ${tone}`}>{body}</div>;
  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={() => onOpen(l.id!)}
      aria-current={l.current ? "step" : undefined}
      title={l.locked ? "Спочатку пройдіть попередні обов'язкові уроки" : undefined}
      className={`${base} ${tone} ${interactive}`}
    >
      {body}
      {l.locked && <span className="sr-only">Урок ще закритий</span>}
    </button>
  );
}

type Props = {
  program: Program;
  modules: DisplayModule[];
  learning: Learning | null;
  onOpenItem?: (itemId: string) => void;
};

// Structure of the program: header summary (+ the viewer's own progress when
// there is any), then an accordion of modules. Visitors see structure only
// (titles, counts) — lesson content itself is never rendered here, so nothing
// paid leaks. A participant with progress also gets real statuses, the
// "Ви тут" marker, and can open any unlocked lesson straight in the player.
export default function ProgramCurriculum({ modules: base, learning, onOpenItem }: Props) {
  const baseId = useId();
  const modules = viewModules(base, learning);
  const isExpandable = (m: ViewModule) => m.lessons.length > 0 || !!m.description || !!m.materialLabel;
  const [open, setOpen] = useState<number | null>(() => {
    const cur = modules.findIndex((m) => m.current && isExpandable(m));
    if (cur >= 0) return cur;
    const first = modules.findIndex(isExpandable);
    return first >= 0 ? first : null;
  });

  const totalLessons = modules.reduce((s, m) => s + m.lessonCount, 0);
  const summary = learning?.summary ?? null;
  const showProgress = !!summary && summary.percent > 0 && !summary.isCompleted;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="text-[15px] font-medium text-slate-500">
          Структура програми:{" "}
          <span className="whitespace-nowrap">{modules.length} {moduleWord(modules.length)}</span>
          {totalLessons > 0 && (
            <>
              <span aria-hidden="true" className="mx-2">·</span>
              <span className="whitespace-nowrap">{totalLessons} {lessonWord(totalLessons)}</span>
            </>
          )}
        </p>
        {summary?.isCompleted && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[13px] font-semibold text-emerald-700">Програму пройдено</span>}
        {showProgress && (
          <div className="flex min-w-[200px] items-center gap-3 text-[13px] font-medium text-slate-500">
            <div role="progressbar" aria-label="Ваш прогрес" aria-valuemin={0} aria-valuemax={100} aria-valuenow={summary!.percent} className="h-2 flex-1 overflow-hidden rounded-full bg-[#e9ecfb]">
              <div className="h-full rounded-full bg-gradient-to-r from-[#0057ff] to-[#7b2cff]" style={{ width: `${summary!.percent}%` }} />
            </div>
            <span className="tabular-nums">{summary!.percent}%</span>
          </div>
        )}
      </div>

      <ol className="mt-5 flex flex-col gap-3">
        {modules.map((m, index) => {
          const expandable = isExpandable(m);
          const panelId = `${baseId}-${index}`;
          const isOpen = expandable && open === index;
          return (
            <li key={`${index}-${m.title}`} className={`overflow-hidden rounded-[22px] border bg-white ${isOpen ? "border-[#d9ddfb]" : "border-[#e6eaf8]"}`}>
              <button
                type="button"
                disabled={!expandable}
                aria-expanded={expandable ? isOpen : undefined}
                aria-controls={expandable ? panelId : undefined}
                onClick={() => setOpen(isOpen ? null : index)}
                className={`relative flex w-full items-center gap-4 p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4338ca] disabled:cursor-default sm:px-5 sm:py-4 ${
                  isOpen ? "bg-gradient-to-r from-[#eef0ff] to-[#e3e2fd]" : "hover:bg-[#f8f9ff] disabled:hover:bg-transparent"
                }`}
              >
                {isOpen && <HeaderWaves />}
                <span
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[18px] font-semibold ${
                    m.done ? "bg-emerald-100 text-emerald-600" : m.locked ? "bg-[#eceefa] text-slate-400" : "bg-[#e9e6fc] text-[#4338ca]"
                  }`}
                >
                  {m.done ? <Check size={22} /> : m.locked ? <Icon name="lock" size={18} /> : index + 1}
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block text-[18px] font-semibold leading-snug text-slate-900">{m.title}</span>
                  <span className="mt-0.5 block text-[14px] text-slate-500">
                    {m.lessonCount > 0 ? `${m.lessonCount} ${lessonWord(m.lessonCount)}` : "Без окремих уроків"}
                    {m.current && <span className="ml-2 font-medium text-[#4338ca]">· Ви тут</span>}
                  </span>
                  {m.locked && <span className="sr-only">Модуль ще закритий</span>}
                </span>
                {expandable && (
                  <span aria-hidden="true" className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${isOpen ? "bg-white text-[#4338ca] shadow-sm" : "text-slate-500"}`}>
                    <Chevron open={isOpen} />
                  </span>
                )}
              </button>

              {isOpen && (
                <div id={panelId} className="flex flex-col gap-3 px-4 pb-5 pt-4 sm:px-5">
                  {m.description && <p className="text-[15px] leading-relaxed text-slate-600">{m.description}</p>}
                  {m.lessons.length > 0 && (
                    <ul className="flex flex-col gap-2.5">
                      {m.lessons.map((l, li) => (
                        <li key={l.id ?? `${li}-${l.title}`}>
                          <LessonRow l={l} onOpen={learning ? onOpenItem : undefined} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.materialLabel && (
                    <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#f6f8ff] px-3.5 py-2 text-[14px] font-medium text-slate-600 ring-1 ring-[#e3e8fb]">
                      <Icon name="clip" size={15} /> {m.materialLabel}
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
