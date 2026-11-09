// "Ваш шлях" — the module-by-module route through a program, extracted from
// ProgramExperience.tsx with behaviour and markup unchanged (2026-10-07).
//
// Each module is a full stage (not a small accordion card): status, title,
// description, item count/duration and its own progress bar are always
// visible; only its content-item list toggles. Completed/future modules are
// collapsed by default, the current one opens automatically. Nothing here
// assumes a fixed module or item count — it maps whatever `modules` actually
// contains.
//
// Purely presentational: the lesson screen owns the progress, the expanded
// state and the rules (what is done / locked / next); this only draws them.
import type { ContentModule, ItemProgressMap } from "../../data/contentTypes";
import { formatDuration, safePercent, sumDuration, type FlatItemRef } from "../../lib/contentProgress";
import { CompletionBadgeIcon, LockItemIcon, StarIcon } from "./lessonIcons";
import { typeIconComponent, typeLabel, typeTint } from "./programItemTypes";

type Props = {
  modules: ContentModule[];
  summary: { currentModuleIndex: number; isCompleted: boolean };
  progress: ItemProgressMap;
  nextRef: FlatItemRef | null | undefined;
  expandedModules: Record<number, boolean>;
  onToggleModule: (moduleIndex: number) => void;
  moduleDone: (moduleIndex: number) => boolean;
  moduleLocked: (moduleIndex: number) => boolean;
  moduleRequired: (moduleIndex: number) => { id: string }[];
  moduleCompletedCount: (moduleIndex: number) => number;
  isLocked: (ref: FlatItemRef) => boolean;
  onOpenItem: (ref: FlatItemRef) => void;
  isBookmarked: (itemId: string) => boolean;
};

export default function ProgramModulesPath({
  modules,
  summary,
  progress,
  nextRef,
  expandedModules,
  onToggleModule,
  moduleDone,
  moduleLocked,
  moduleRequired,
  moduleCompletedCount,
  isLocked,
  onOpenItem,
  isBookmarked,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {modules.map((mod, mi) => {
        const done = moduleDone(mi);
        const current = summary.currentModuleIndex === mi && !summary.isCompleted;
        const locked = moduleLocked(mi);
        const expanded = !!expandedModules[mi];
        const modDuration = sumDuration([mod]);
        // Required-only, both sides — matches moduleDone/moduleCompletedCount's
        // own definition (see their comments above) and safePercent's
        // "100 only in lockstep with done" guarantee, same as computeProgress.
        const modPercent = safePercent(moduleCompletedCount(mi), moduleRequired(mi).length);
        const statusIcon = done ? "✓" : current ? "●" : "○";
        const moduleContentId = `program-module-${mod.id}`;
        return (
          <div
            key={mod.id}
            className={`rounded-2xl border border-black/5 bg-white overflow-hidden ${
              locked && !done && !current ? "opacity-60" : ""
            }`}
          >
            <button
              onClick={() => onToggleModule(mi)}
              aria-expanded={expanded}
              aria-controls={moduleContentId}
              className="w-full flex items-start gap-3.5 px-5 py-4 text-left hover:bg-black/[0.015] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2"
            >
              <span
                className={`text-[16px] font-semibold shrink-0 mt-0.5 ${
                  done ? "text-emerald-600" : current ? "text-[#4338ca]" : "text-black/25"
                }`}
                aria-hidden="true"
              >
                {statusIcon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[14px] font-semibold truncate">
                    Модуль {mi + 1} · {mod.title}
                  </div>
                  <span className={`shrink-0 text-black/30 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true">⌄</span>
                </div>
                <p className="text-[12.5px] text-black/50 leading-relaxed mt-1 mb-2 max-w-[540px] line-clamp-1">{mod.description}</p>
                <div className="flex items-center gap-3">
                  <div className="h-1 rounded-full bg-black/[0.06] overflow-hidden max-w-[180px] flex-1">
                    <div
                      className={`h-full transition-all ${done ? "bg-emerald-500" : "bg-gradient-to-r from-blue-500 to-purple-500"}`}
                      style={{ width: `${modPercent}%` }}
                    />
                  </div>
                  {modDuration > 0 && (
                    <span className="text-[11px] text-black/40 shrink-0">{formatDuration(modDuration)}</span>
                  )}
                </div>
              </div>
            </button>

            {expanded && (
              <div id={moduleContentId} role="region" className="px-4 pb-4 pt-1 border-t border-black/5 bg-[#fafbff]">
                <div className="flex flex-col">
                  {mod.items.map((item, ii) => {
                    const ref: FlatItemRef = { moduleIndex: mi, itemIndex: ii, itemId: item.id, isRequired: item.isRequired };
                    const status = progress[item.id] ?? "not_started";
                    const itemLocked = isLocked(ref);
                    const isNext = !!nextRef && nextRef.moduleIndex === mi && nextRef.itemIndex === ii;
                    return (
                      <button
                        key={item.id}
                        disabled={itemLocked}
                        onClick={() => onOpenItem(ref)}
                        className={`flex items-center gap-3 py-3 px-2 border-b border-black/5 last:border-0 text-left rounded-xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
                          itemLocked ? "cursor-not-allowed opacity-50" : isNext ? "bg-[#eef2ff]" : "hover:bg-black/[0.03]"
                        }`}
                      >
                        {/* Compact per-type "thumbnail" — a soft
                            tinted tile, not a photo, so items are
                            visually distinguishable without
                            fabricating cover images. */}
                        <span
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            status === "completed" ? "bg-emerald-50 text-emerald-600" : typeTint[item.type]
                          }`}
                        >
                          {status === "completed" ? (
                            <CompletionBadgeIcon className="w-5 h-5" />
                          ) : itemLocked ? (
                            <LockItemIcon className="w-[18px] h-[18px]" />
                          ) : (
                            (() => {
                              const ItemIcon = typeIconComponent[item.type];
                              return <ItemIcon className="w-5 h-5" />;
                            })()
                          )}
                        </span>
                        <span className="flex-1 min-w-0">
                          <div className={`text-[14px] truncate ${isNext ? "font-semibold text-[#3730a3]" : "font-medium text-black/85"}`}>
                            {item.title}
                            {!item.isRequired && <span className="text-black/35 font-normal"> (необов'язково)</span>}
                          </div>
                          <div className="text-[12px] text-black/40 truncate">
                            {typeLabel[item.type]}
                            {item.durationMinutes ? ` · ${formatDuration(item.durationMinutes)}` : ""}
                          </div>
                        </span>
                        <span className="shrink-0 flex items-center gap-3">
                          {/* Passive indicator — the row's own
                              click already opens this item,
                              where the real toggle lives (next
                              to the title). Just a quiet signal
                              here, not a second control. */}
                          {isBookmarked(item.id) && (
                            <StarIcon className="w-3.5 h-3.5 text-amber-500" fill="currentColor" stroke="none" />
                          )}
                          <span className="text-[12px] font-medium">
                            {status === "completed" && <span className="text-emerald-600">✓ Завершено</span>}
                            {status === "in_progress" && !isNext && <span className="text-amber-600">● У процесі</span>}
                            {itemLocked && (
                              <span className="text-black/30 inline-flex items-center gap-1">
                                <LockItemIcon className="w-3 h-3" /> Заблоковано
                              </span>
                            )}
                            {!itemLocked && status === "not_started" && !isNext && (
                              <span className="text-black/30 font-normal">○ Не розпочато</span>
                            )}
                            {/* Honest, distinct from "Завершено"
                                — the person declined this one's
                                content warning (see "Не зараз"),
                                it doesn't block what comes after
                                it, but nothing here pretends it
                                was actually watched/read. */}
                            {status === "skipped" && <span className="text-black/35">— Пропущено</span>}
                            {isNext && status !== "completed" && <span className="text-[#4338ca]">→ Наступний</span>}
                          </span>
                          {isNext && status !== "completed" && (
                            // Purely visual — the row itself
                            // (the surrounding <button>) already
                            // opens this exact item on click.
                            <span className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[12px] font-semibold whitespace-nowrap">
                              Продовжити →
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
