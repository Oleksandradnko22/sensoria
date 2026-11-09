// The interactive faces of each block type (2026-10-06). One small component
// per block; all behavior rules live in utils/guideInteraction.ts and all
// storage in useGuideAnswers.ts — these only draw and forward events.
//
// Design intent: the interaction should feel like part of the text. No
// form-control chrome — options are quiet lines with a soft marker, the
// rating is a row of dots on a line, the practice is a calm screen of its
// own. No points, badges, streaks or progress bars; the only moving thing
// is the practice's own clock.
import { useEffect, useRef, useState } from "react";
import type {
  ActionPlanBlock,
  CalloutBlock,
  ChecklistBlock,
  DecisionTreeBlock,
  FlowBlock,
  ReflectionBlock,
  ScaleBlock,
  TimerPracticeBlock,
} from "../../data/guideContent";
import {
  canSelectMore,
  checklistInsight,
  describeScaleChange,
  formatClock,
  timerState,
  type GuideAnswers,
} from "../../utils/guideInteraction";
import type { Reflection } from "../../lib/reflections";
import { CheckIcon } from "./GuideIcons";

// ---------------------------------------------------------------------------
// Text-ish blocks
// ---------------------------------------------------------------------------

export function RichText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="flex flex-col gap-4">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[17px] md:text-[19px] leading-[1.7] text-black/75 max-w-[820px]">
          {p}
        </p>
      ))}
    </div>
  );
}

const CALLOUT_TONE: Record<NonNullable<CalloutBlock["tone"]>, string> = {
  calm: "bg-[#eceffd]",
  note: "bg-black/[0.035]",
  care: "bg-[#e7f5ef]",
};

export function Callout({ block }: { block: CalloutBlock }) {
  return (
    <div className={`rounded-[22px] px-6 py-5 ${CALLOUT_TONE[block.tone ?? "calm"]}`}>
      {block.title && <div className="text-[14.5px] font-semibold text-black/80 mb-1">{block.title}</div>}
      <p className="text-[15px] leading-relaxed text-black/65">{block.text}</p>
    </div>
  );
}

export function Flow({ block }: { block: FlowBlock }) {
  return (
    <div>
      {block.title && (
        <div className="text-[12px] font-semibold text-indigo-500/80 uppercase tracking-[0.14em] mb-4">{block.title}</div>
      )}
      <ol className="grid gap-2 md:grid-cols-4 md:gap-0">
        {block.steps.map((step, i) => (
          <li key={i} className="relative md:pr-5">
            <div className="rounded-[20px] bg-gradient-to-br from-[#eceffd] to-[#f3effe] px-4 py-4 h-full">
              <div className="text-[15px] font-semibold text-black/85">{step.label}</div>
              {step.text && <div className="text-[13px] leading-snug text-black/55 mt-1">{step.text}</div>}
            </div>
            {i < block.steps.length - 1 && (
              <span
                aria-hidden="true"
                className="hidden md:flex absolute right-0 top-1/2 -translate-y-1/2 w-5 justify-center text-indigo-300 text-[16px]"
              >
                →
              </span>
            )}
            {i < block.steps.length - 1 && (
              <span aria-hidden="true" className="md:hidden block text-center text-indigo-300 leading-none pt-2">
                ↓
              </span>
            )}
          </li>
        ))}
      </ol>
      {block.caption && <p className="text-[14px] text-black/50 mt-4 max-w-[560px]">{block.caption}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Choices — checklist & action plan share one look
// ---------------------------------------------------------------------------

function Marker({ checked, round }: { checked: boolean; round: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-[2px] w-[22px] h-[22px] shrink-0 inline-flex items-center justify-center border-[1.5px] transition ${
        round ? "rounded-full" : "rounded-[7px]"
      } ${
        checked
          ? "bg-gradient-to-br from-[#2f6bff] to-[#8b5cf6] border-transparent text-white"
          : "border-black/25 text-transparent group-hover:border-indigo-300"
      }`}
    >
      <CheckIcon size={13} />
    </span>
  );
}

export function Choices({
  block,
  selected,
  onToggle,
}: {
  block: ChecklistBlock | ActionPlanBlock;
  selected: number[];
  onToggle: (index: number) => void;
}) {
  const single = block.type === "checklist" && block.selection === "single";
  const max = block.type === "action_plan" ? block.max : undefined;
  const insight = block.type === "checklist" ? checklistInsight(block, selected) : null;
  const full = !canSelectMore(selected, max);
  return (
    <div>
      <div className="text-[17px] md:text-[19px] font-semibold tracking-tight text-black/85 leading-snug mb-1">
        {block.prompt}
      </div>
      {max !== undefined && (
        <div className="text-[13px] text-black/40 mb-2" aria-live="polite">
          Обрано {selected.length} з {max}
        </div>
      )}
      <ul className="flex flex-col mt-3" role={single ? "radiogroup" : "group"} aria-label={block.prompt}>
        {block.items.map((item, i) => {
          const checked = selected.includes(i);
          const blocked = full && !checked;
          return (
            <li key={item.id} className="border-t border-black/[0.07] first:border-t-0">
              <button
                type="button"
                role={single ? "radio" : "checkbox"}
                aria-checked={checked}
                aria-disabled={blocked}
                onClick={() => onToggle(i)}
                className={`group w-full text-left flex items-start gap-3.5 py-3.5 transition ${
                  blocked ? "opacity-40 cursor-not-allowed" : ""
                }`}
              >
                <Marker checked={checked} round={single} />
                <span className={`text-[16px] leading-snug ${checked ? "text-black/90 font-medium" : "text-black/70"}`}>
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {insight && (
        <p className="mt-3 rounded-[20px] bg-[#eceffd] px-5 py-4 text-[15px] leading-relaxed text-black/70" aria-live="polite">
          {insight}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scale — a row of dots on a line; unset until the person answers
// ---------------------------------------------------------------------------

export function Scale({
  block,
  value,
  compareValue,
  onChange,
}: {
  block: ScaleBlock;
  value: number | undefined;
  // The "before" reading, when this is the "after" scale.
  compareValue?: number;
  onChange: (value: number) => void;
}) {
  const values = Array.from({ length: block.max - block.min + 1 }, (_, i) => block.min + i);
  const change = value !== undefined && compareValue !== undefined ? describeScaleChange(compareValue, value) : null;
  return (
    <div>
      <div className="text-[17px] md:text-[19px] font-semibold tracking-tight text-black/85 leading-snug mb-4">
        {block.prompt}
      </div>
      {block.compareWith && compareValue !== undefined && (
        <div className="text-[13.5px] text-black/45 mb-3">Перед практикою ви оцінили: {compareValue}</div>
      )}
      <div className="relative" role="radiogroup" aria-label={block.prompt}>
        <div aria-hidden="true" className="absolute left-3 right-3 top-1/2 h-px bg-black/15 -translate-y-1/2" />
        <div className="relative flex justify-between gap-1">
          {values.map((n) => {
            const active = value === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={String(n)}
                onClick={() => onChange(n)}
                className={`w-[26px] h-[26px] sm:w-[34px] sm:h-[34px] rounded-full text-[11.5px] sm:text-[13px] font-medium inline-flex items-center justify-center transition ${
                  active
                    ? "bg-gradient-to-br from-[#2f6bff] to-[#8b5cf6] text-white scale-110 shadow-[0_6px_16px_rgba(79,70,229,0.35)]"
                    : "bg-[#f8f9fe] border border-black/15 text-black/55 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                {n}
              </button>
            );
          })}
        </div>
      </div>
      {(block.lowLabel || block.highLabel) && (
        <div className="flex justify-between text-[12.5px] text-black/40 mt-3">
          <span>{block.lowLabel}</span>
          <span>{block.highLabel}</span>
        </div>
      )}
      {change && (
        <div className="mt-5 rounded-[20px] bg-[#eceffd] px-5 py-4" aria-live="polite">
          <div className="text-[16px] font-medium text-black/80">{change.text}</div>
          <div className="text-[13.5px] text-black/50 mt-1">{change.caveat}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Timer practice — a calm screen of its own
// ---------------------------------------------------------------------------

export function TimerPractice({
  block,
  done,
  onDone,
}: {
  block: TimerPracticeBlock;
  done: boolean;
  onDone: () => void;
}) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const finished = useRef(false);

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const elapsed = startedAt === null ? 0 : (now - startedAt) / 1000;
  const state = timerState(block.phases, elapsed);
  const running = startedAt !== null && !state.done;
  const completed = (startedAt !== null && state.done) || done;

  useEffect(() => {
    if (startedAt !== null && state.done && !finished.current) {
      finished.current = true;
      onDone();
    }
  }, [startedAt, state.done, onDone]);

  const start = () => {
    finished.current = false;
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
  };
  const stop = () => setStartedAt(null);

  return (
    <div className="rounded-[28px] bg-gradient-to-br from-[#e9eeff] via-[#f1eeff] to-[#e8f6f2] px-6 md:px-10 py-9 md:py-11 text-center">
      <style>{`@keyframes sensoriaGuideFade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } } @media (prefers-reduced-motion: reduce) { .sensoria-guide-phase { animation: none !important; } }`}</style>
      <div className="text-[12px] font-semibold text-indigo-500/80 uppercase tracking-[0.14em] mb-2">{block.title}</div>

      {!running && !completed && (
        <>
          {block.intro && <p className="text-[15.5px] leading-relaxed text-black/60 max-w-[460px] mx-auto">{block.intro}</p>}
          <button
            type="button"
            onClick={start}
            className="mt-6 inline-flex items-center gap-2 px-8 py-3.5 rounded-full bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] text-white text-[15px] font-semibold shadow-[0_10px_28px_rgba(79,70,229,0.3)] hover:opacity-90 transition"
          >
            Почати
          </button>
        </>
      )}

      {running && (
        <div aria-live="polite">
          <div className="text-[44px] md:text-[52px] font-light tabular-nums text-black/80 leading-none mt-3">
            {formatClock(state.remaining)}
          </div>
          <p
            key={state.phaseIndex}
            className="text-[18px] md:text-[20px] leading-relaxed text-black/75 max-w-[480px] mx-auto mt-5 min-h-[84px] sensoria-guide-phase animate-[sensoriaGuideFade_0.7s_ease]"
          >
            {block.phases[state.phaseIndex].text}
          </p>
          <div className="h-[3px] max-w-[320px] mx-auto rounded-full bg-black/10 overflow-hidden mt-4">
            <div
              className="h-full bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] transition-[width] duration-300 ease-linear"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
          <button type="button" onClick={stop} className="mt-6 text-[13px] text-black/45 hover:text-black/70 transition">
            Зупинити
          </button>
        </div>
      )}

      {completed && !running && (
        <div aria-live="polite">
          <p className="text-[19px] md:text-[21px] leading-relaxed text-black/80 max-w-[460px] mx-auto mt-3">
            {block.doneText}
          </p>
          <button type="button" onClick={start} className="mt-5 text-[13px] text-indigo-600 hover:text-indigo-700 transition">
            Повторити
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision tree — one question, a few branches, one next step each
// ---------------------------------------------------------------------------

export function DecisionTree({
  block,
  selectedBranchId,
  onSelect,
}: {
  block: DecisionTreeBlock;
  selectedBranchId: string | undefined;
  onSelect: (branchId: string) => void;
}) {
  const selected = block.branches.find((b) => b.id === selectedBranchId);
  return (
    <div>
      <div className="text-[17px] md:text-[19px] font-semibold tracking-tight text-black/85 leading-snug mb-4">
        {block.prompt}
      </div>
      <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label={block.prompt}>
        {block.branches.map((branch) => {
          const active = branch.id === selectedBranchId;
          return (
            <button
              key={branch.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(branch.id)}
              className={`px-5 py-2.5 rounded-full text-[15px] font-medium border transition ${
                active
                  ? "bg-gradient-to-r from-[#2f6bff] to-[#8b5cf6] border-transparent text-white"
                  : "border-black/15 text-black/65 hover:border-indigo-300 hover:text-indigo-600 bg-white/60"
              }`}
            >
              {branch.label}
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="mt-5 rounded-[22px] bg-[#eceffd] px-6 py-5" aria-live="polite">
          <div className="text-[12px] font-semibold text-indigo-500/80 uppercase tracking-[0.14em] mb-1.5">
            Наступний крок
          </div>
          <p className="text-[16.5px] leading-relaxed text-black/75">{selected.step}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reflection — private
// ---------------------------------------------------------------------------

function readDraft(key?: string): string {
  if (!key) return "";
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string | undefined, value: string) {
  if (!key) return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // storage unavailable — the draft just isn't kept
  }
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };

export function ReflectionField({
  block,
  history,
  canSave,
  onSave,
  draftKey,
}: {
  block: ReflectionBlock;
  history: Reflection[];
  canSave: boolean;
  onSave: (text: string) => Promise<boolean>;
  // Where an unsaved draft is kept on this device (so a closed tab or a
  // page turn does not lose what was typed). Cleared once saved.
  draftKey?: string;
}) {
  const [text, setTextState] = useState(() => readDraft(draftKey));
  const setText = (value: string) => {
    setTextState(value);
    writeDraft(draftKey, value);
  };
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    const ok = await onSave(text);
    setSaving(false);
    if (ok) {
      setText("");
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 3000);
    }
  };

  return (
    <div>
      <div className="text-[17px] md:text-[19px] font-semibold tracking-tight text-black/85 leading-snug mb-3">
        {block.prompt}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder={block.placeholder ?? "Напишіть тут…"}
        disabled={!canSave}
        className="w-full rounded-[22px] bg-white border border-black/10 px-5 py-4 text-[16px] leading-relaxed text-black/80 placeholder:text-black/30 resize-none focus:outline-none focus:border-indigo-300 disabled:opacity-60"
      />
      <div className="flex items-center gap-4 mt-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave || saving || !text.trim()}
          className="px-6 py-2.5 rounded-full bg-black text-white text-[13.5px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? "Зберігаємо…" : "Зберегти спостереження"}
        </button>
        <span className="text-[12.5px] text-black/40">
          {justSaved ? "Збережено у «Ваших спостереженнях»" : "Приватно — це бачите лише ви"}
        </span>
      </div>
      {history.length > 0 && (
        <ul className="mt-5 flex flex-col gap-2">
          {history.slice(0, 3).map((entry) => (
            <li key={entry.id} className="text-[14.5px] leading-relaxed text-black/60 border-l-2 border-indigo-200 pl-4">
              {entry.note}
              <span className="block text-[12px] text-black/35 mt-0.5">
                {new Date(entry.createdAt).toLocaleDateString("uk-UA", DATE_FORMAT)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers shared with the renderer
// ---------------------------------------------------------------------------

export function compareValueFor(block: ScaleBlock, answers: GuideAnswers): number | undefined {
  return block.compareWith ? answers.scales[block.compareWith] : undefined;
}
