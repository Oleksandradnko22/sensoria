// Pure logic behind the interactive guide blocks (2026-10-06): every rule
// that matters psychologically or for persistence lives here as plain
// functions, so it is unit-tested without a browser (utils/
// guideInteraction.test.ts) and the React blocks stay thin.
//
// Nothing here stores anything and nothing here scores or rewards: a choice
// limit, a neutral reflection sentence, a before/after difference stated
// as the person's own number, and the timer's clock.

import { pluralUk } from "./plural.ts";
import type {
  ActionPlanBlock,
  ChecklistBlock,
  GuideBlockV2,
  GuideSection,
  ScaleBlock,
  TimerPhase,
} from "../data/guideContent.ts";

// ---------------------------------------------------------------------------
// Answers (what the web experience knows about the person's responses).
// One flat shape so a block's state is looked up by id, never by position.
// ---------------------------------------------------------------------------
export type GuideAnswers = {
  // checklist / action_plan → chosen item indexes
  selections: Record<string, number[]>;
  // scale → the chosen number
  scales: Record<string, number>;
  // reflection → true once a note was saved
  reflections: Record<string, boolean>;
  // decision_tree → chosen branch id
  branches: Record<string, string>;
  // timer_practice → true once the practice ran to the end
  practices: Record<string, boolean>;
};

export const EMPTY_ANSWERS: GuideAnswers = {
  selections: {},
  scales: {},
  reflections: {},
  branches: {},
  practices: {},
};

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

// Toggle one option. `single`: choosing replaces; choosing the chosen one
// clears it. `multiple` with `max`: once the limit is reached, adding is
// ignored (removing always works) — the "up to 3 small actions" rule.
export function toggleChoice(
  selected: number[],
  index: number,
  mode: "single" | "multiple",
  max?: number
): number[] {
  const isSelected = selected.includes(index);
  if (mode === "single") return isSelected ? [] : [index];
  if (isSelected) return selected.filter((i) => i !== index);
  if (max !== undefined && selected.length >= max) return selected;
  return [...selected, index].sort((a, b) => a - b);
}

export function canSelectMore(selected: number[], max?: number): boolean {
  return max === undefined || selected.length < max;
}

// What changed between two selections — used to sync with the existing
// guide_checklist_checks table (one row per chosen item).
export function diffSelection(prev: number[], next: number[]): { add: number[]; remove: number[] } {
  return {
    add: next.filter((i) => !prev.includes(i)),
    remove: prev.filter((i) => !next.includes(i)),
  };
}

// The short neutral line shown after choosing in a checklist. Single-choice
// lists show the chosen item's own note; multi-choice lists show the
// block-level `insight` (one vs several). Nothing is shown for nothing.
export function checklistInsight(block: ChecklistBlock, selected: number[]): string | null {
  if (selected.length === 0) return null;
  if (block.selection === "single") {
    return block.items[selected[0]]?.note ?? null;
  }
  if (!block.insight) return null;
  return selected.length === 1 ? block.insight.one : block.insight.several;
}

// ---------------------------------------------------------------------------
// Scale — before / after
// ---------------------------------------------------------------------------

// Ukrainian plural of "пункт": 1 пункт, 2–4 пункти, 5+ пунктів.
export function pointsLabel(count: number): string {
  const n = Math.abs(count);
  return `${n} ${pluralUk(n, "пункт", "пункти", "пунктів")}`;
}

export type ScaleChange = {
  delta: number; // after − before
  // Plain statement of the person's OWN two numbers. Never says the practice
  // "worked" and never implies a clinical meaning.
  text: string;
  // Always shown with it — one exercise is one moment.
  caveat: string;
};

export const SCALE_CHANGE_CAVEAT =
  "Це лише ваше особисте відчуття в цю хвилину — не оцінка того, наскільки добре спрацювала практика.";

export function describeScaleChange(before: number, after: number): ScaleChange {
  const delta = after - before;
  const text =
    delta === 0
      ? `Ваша оцінка не змінилася: ${before} і ${after}.`
      : `Ваш стан змінився на ${pointsLabel(delta)}: з ${before} до ${after}.`;
  return { delta, text, caveat: SCALE_CHANGE_CAVEAT };
}

// guide_self_assessments holds a phase and a score of 0–10 (CHECK widened by
// guide-self-assessments-zero-migration.sql). A scale with no phase or a
// non-integer value is kept for the session only rather than being silently
// rewritten to a different number.
export function canPersistScore(block: Pick<ScaleBlock, "phase">, score: number): boolean {
  return block.phase !== undefined && Number.isInteger(score) && score >= 0 && score <= 10;
}

// ---------------------------------------------------------------------------
// Timer practice
// ---------------------------------------------------------------------------

export type TimerState = {
  totalSeconds: number;
  elapsed: number; // clamped to [0, total]
  remaining: number;
  phaseIndex: number; // last phase when done
  phaseRemaining: number;
  progress: number; // 0..1
  done: boolean;
};

export function totalPhaseSeconds(phases: TimerPhase[]): number {
  return phases.reduce((sum, phase) => sum + phase.seconds, 0);
}

export function timerState(phases: TimerPhase[], elapsedSeconds: number): TimerState {
  const totalSeconds = totalPhaseSeconds(phases);
  const elapsed = Math.min(Math.max(0, elapsedSeconds), totalSeconds);
  const done = totalSeconds > 0 && elapsed >= totalSeconds;
  let phaseIndex = 0;
  let phaseStart = 0;
  for (let i = 0; i < phases.length; i += 1) {
    const end = phaseStart + phases[i].seconds;
    phaseIndex = i;
    if (elapsed < end) {
      return {
        totalSeconds,
        elapsed,
        remaining: totalSeconds - elapsed,
        phaseIndex,
        phaseRemaining: end - elapsed,
        progress: totalSeconds > 0 ? elapsed / totalSeconds : 0,
        done,
      };
    }
    phaseStart = end;
  }
  return {
    totalSeconds,
    elapsed,
    remaining: 0,
    phaseIndex: Math.max(0, phases.length - 1),
    phaseRemaining: 0,
    progress: totalSeconds > 0 ? 1 : 0,
    done,
  };
}

// 0:45 style clock.
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// "Answered" state — the optional completion semantics
// ---------------------------------------------------------------------------

export function isBlockAnswered(block: GuideBlockV2, answers: GuideAnswers): boolean {
  switch (block.type) {
    case "checklist":
    case "action_plan":
      return (answers.selections[block.id]?.length ?? 0) > 0;
    case "scale":
      return answers.scales[block.id] !== undefined;
    case "reflection":
      return answers.reflections[block.id] === true;
    case "timer_practice":
      return answers.practices[block.id] === true;
    case "decision_tree":
      return answers.branches[block.id] !== undefined;
    default:
      return false;
  }
}

// A section reads as "worked through" only when it has blocks that ask for a
// response (`completion: "answered"`) and every one of them has one. Sections
// that ask for nothing are never marked.
export function isSectionAnswered(section: GuideSection, answers: GuideAnswers): boolean {
  const required = section.blocks.filter(({ block }) => block.completion === "answered");
  if (required.length === 0) return false;
  return required.every(({ block }) => isBlockAnswered(block, answers));
}

// The plan block's chosen labels, in the order the person sees them.
export function chosenLabels(block: ChecklistBlock | ActionPlanBlock, selected: number[]): string[] {
  return selected.map((i) => block.items[i]?.label).filter((label): label is string => Boolean(label));
}

// ---------------------------------------------------------------------------
// Closing summary — only what the person themselves answered
// ---------------------------------------------------------------------------

export type GuideSummary = {
  change: ScaleChange | null;
  // Chosen steps of every action plan, in the order the person sees them.
  plan: string[];
};

export function buildGuideSummary(content: GuideBlockV2[], answers: GuideAnswers): GuideSummary {
  let change: ScaleChange | null = null;
  for (const block of content) {
    if (block.type !== "scale" || block.phase !== "after" || !block.compareWith) continue;
    const before = answers.scales[block.compareWith];
    const after = answers.scales[block.id];
    if (before !== undefined && after !== undefined) change = describeScaleChange(before, after);
  }
  const plan: string[] = [];
  for (const block of content) {
    if (block.type !== "action_plan") continue;
    plan.push(...chosenLabels(block, answers.selections[block.id] ?? []));
  }
  return { change, plan };
}
