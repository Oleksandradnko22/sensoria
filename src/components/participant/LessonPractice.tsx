// "Спробуйте зараз" — the optional inline practice of a lesson, extracted from
// ProgramExperience.tsx with behaviour unchanged (2026-10-07).
//
// Owns everything only about the practice: the saved answer, the per-type
// drafts, "Змінити відповідь", and the "Зараз не готовий" menu (reminder /
// skip for this viewing / go on). The lesson screen gives it the lesson, the
// viewer, the program (for the reminder and the saved answer's context), a
// way to go to the next lesson and a way to tell the person a write failed.
//
// Per-lesson reset: an effect on (lesson id, session id) — the same two things
// the old reset effect listened to — clears the answer, the drafts and the menu
// and shows the block again. (Deliberately not done by remounting with a key:
// that left stale copies of the block in the page.)
import { useEffect, useState } from "react";
import type { Profile } from "../../lib/auth";
import type { ContentItem } from "../../data/contentTypes";
import {
  fetchPracticeResponse,
  submitPracticeResponse,
  type PracticeResponseValue,
} from "../../lib/practiceResponses";
import { eveningTimestamp, setPracticeReminder } from "../../utils/practiceReminders";

type Props = {
  item: ContentItem;
  session?: Profile | null;
  program?: { id: string; title: string };
  onNext: () => void;
  notifyWriteFailed: (what: string) => void;
};

export default function LessonPractice({ item, session, program, onNext, notifyWriteFailed }: Props) {
  const [practiceResponse, setPracticeResponse] = useState<PracticeResponseValue | null>(null);
  const [practiceTextDraft, setPracticeTextDraft] = useState("");
  const [practiceScaleDraft, setPracticeScaleDraft] = useState<number | null>(null);
  const [practiceChoiceDraft, setPracticeChoiceDraft] = useState<string | null>(null);
  const [practiceCheckboxesDraft, setPracticeCheckboxesDraft] = useState<string[]>([]);
  const [practiceEditing, setPracticeEditing] = useState(false);
  const [practiceDismissed, setPracticeDismissed] = useState(false);
  const [showNotReadyMenu, setShowNotReadyMenu] = useState(false);

  // Whenever the open lesson (or the viewer) changes: start from a clean slate
  // — no answer, empty drafts, closed menu, block shown again — then load the
  // answer given earlier and put it back into the matching draft. Same two
  // triggers the old lesson-screen reset effect used. Needs a signed-in
  // viewer to load; failures just leave the form empty.
  useEffect(() => {
    let cancelled = false;
    setPracticeResponse(null);
    setPracticeTextDraft("");
    setPracticeScaleDraft(null);
    setPracticeChoiceDraft(null);
    setPracticeCheckboxesDraft([]);
    setPracticeEditing(false);
    setPracticeDismissed(false);
    setShowNotReadyMenu(false);
    if (session?.id) {
      fetchPracticeResponse(item.id, session.id)
        .then((response) => {
          if (cancelled || !response) return;
          setPracticeResponse(response);
          if ("text" in response) setPracticeTextDraft(response.text);
          else if ("value" in response) setPracticeScaleDraft(response.value);
          else if ("choice" in response) setPracticeChoiceDraft(response.choice);
          else if ("choices" in response) setPracticeCheckboxesDraft(response.choices);
        })
        .catch(() => {
          if (!cancelled) setPracticeResponse(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [item.id, session?.id]);

  // "Спробуйте зараз" — validates the draft for whichever practice type
  // this lesson has, then persists it as a single PracticeResponseValue
  // (lib/practiceResponses.ts). Submitting again while already answered
  // (via "Змінити відповідь" below) just overwrites the row, matching
  // the one-answer-per-person model described there.
  const submitPractice = () => {
    if (!item.practice || !session?.id) return;
    const spec = item.practice;
    let response: PracticeResponseValue | null = null;
    if (spec.type === "text") {
      const text = practiceTextDraft.trim();
      if (!text) return;
      response = { text };
    } else if (spec.type === "scale") {
      if (practiceScaleDraft == null) return;
      response = { value: practiceScaleDraft };
    } else if (spec.type === "choice") {
      if (!practiceChoiceDraft) return;
      response = { choice: practiceChoiceDraft };
    } else if (spec.type === "checkboxes") {
      if (practiceCheckboxesDraft.length === 0) return;
      response = { choices: practiceCheckboxesDraft };
    }
    if (!response) return;
    setPracticeResponse(response);
    setPracticeEditing(false);
    submitPracticeResponse({
      itemId: item.id,
      userId: session.id,
      response,
      programId: program?.id,
      programTitle: program?.title,
      itemTitle: item.title,
      prompt: spec.prompt,
    }).catch(() => {
      notifyWriteFailed("вашу відповідь");
    });
  };

  const spec = item.practice;
  if (!spec || practiceDismissed) return null;

  // PRACTICE — "Спробуйте зараз". Optional, author-authored per lesson (see
  // PracticeSpec in data/contentTypes.ts). Sits right after the lesson content
  // and before any attached materials. One answer per person, persisted via
  // lib/practiceResponses.ts; having answered shows a quiet confirmation with a
  // "Змінити відповідь" way back into the form rather than silently discarding
  // the previous answer. Deliberately not styled as a quiz (no scoring, no
  // right/wrong) — just a calm space to reflect right where the lesson left off.
  return (
      <div className="mb-6">
        <h2 className="text-[15px] font-semibold text-black/80 mb-3">Спробуйте зараз</h2>
        <div className="rounded-[18px] border border-[#dbe3ff] bg-white p-6">
          <p className="text-[14px] leading-relaxed text-black/70 mb-5">{spec.prompt}</p>

          {practiceResponse && !practiceEditing ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3.5 py-1.5">
                ✓ Ваша відповідь збережена
              </span>
              <button
                onClick={() => setPracticeEditing(true)}
                className="text-[12px] text-black/40 hover:text-black/60 transition underline underline-offset-2"
              >
                Змінити відповідь
              </button>
            </div>
          ) : (
            <>
              {spec.type === "text" && (
                <textarea
                  value={practiceTextDraft}
                  onChange={(e) => setPracticeTextDraft(e.target.value)}
                  placeholder="Ваша відповідь..."
                  rows={3}
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[14px] text-black/80 placeholder:text-black/30 focus:outline-none focus:border-blue-300 resize-none"
                />
              )}

              {spec.type === "scale" && (() => {
                const scaleMin = spec.scaleMin ?? 1;
                const scaleMax = spec.scaleMax ?? 5;
                const scaleValue = practiceScaleDraft ?? scaleMin;
                const scalePercent =
                  scaleMax > scaleMin ? ((scaleValue - scaleMin) / (scaleMax - scaleMin)) * 100 : 0;
                return (
                  <div>
                    <div className="flex items-center justify-center mb-3">
                      <span className="min-w-[2.5rem] text-center px-2.5 py-1 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[13px] font-semibold">
                        {practiceScaleDraft ?? "—"}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={scaleMin}
                      max={scaleMax}
                      value={scaleValue}
                      aria-label={`Оцінка від ${scaleMin} до ${scaleMax}`}
                      aria-valuetext={practiceScaleDraft == null ? "ще не обрано" : String(practiceScaleDraft)}
                      onChange={(e) => setPracticeScaleDraft(Number(e.target.value))}
                      style={{
                        background: `linear-gradient(to right, #3b82f6 0%, #8b5cf6 ${scalePercent}%, rgba(0,0,0,0.08) ${scalePercent}%, rgba(0,0,0,0.08) 100%)`,
                      }}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-4
                        [&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full
                        [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-blue-500 [&::-webkit-slider-thumb]:shadow-[0_1px_4px_rgba(59,130,246,0.45)] [&::-webkit-slider-thumb]:cursor-pointer
                        [&::-moz-range-track]:bg-transparent [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full
                        [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-blue-500 [&::-moz-range-thumb]:shadow-[0_1px_4px_rgba(59,130,246,0.45)] [&::-moz-range-thumb]:cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[12px] text-black/40 mt-1.5">
                      <span>{spec.scaleLabels?.[0] ?? scaleMin}</span>
                      <span>{spec.scaleLabels?.[1] ?? scaleMax}</span>
                    </div>
                  </div>
                );
              })()}

              {spec.type === "choice" && (
                <div className="flex flex-col gap-2">
                  {(spec.options ?? []).map((opt) => (
                    <label
                      key={opt}
                      className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-[14px] cursor-pointer transition ${
                        practiceChoiceDraft === opt
                          ? "border-blue-300 bg-blue-50 text-black/80"
                          : "border-black/10 bg-white text-black/70 hover:bg-black/[0.02]"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`practice-choice-${item.id}`}
                        checked={practiceChoiceDraft === opt}
                        onChange={() => setPracticeChoiceDraft(opt)}
                        className="accent-blue-500"
                      />
                      {opt}
                    </label>
                  ))}
                </div>
              )}

              {spec.type === "checkboxes" && (
                <div className="flex flex-col gap-2">
                  {(spec.options ?? []).map((opt) => {
                    const checked = practiceCheckboxesDraft.includes(opt);
                    return (
                      <label
                        key={opt}
                        className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-[14px] cursor-pointer transition ${
                          checked
                            ? "border-blue-300 bg-blue-50 text-black/80"
                            : "border-black/10 bg-white text-black/70 hover:bg-black/[0.02]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setPracticeCheckboxesDraft((prev) =>
                              checked ? prev.filter((o) => o !== opt) : [...prev, opt]
                            )
                          }
                          className="accent-blue-500"
                        />
                        {opt}
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={submitPractice}
                  title="Зберегти відповідь"
                  aria-label="Зберегти відповідь"
                  className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 transition shrink-0"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="w-5 h-5">
                    <path
                      d="M4 10.5L8 14.5L16 6"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* "Зараз не готовий" — an explicit way out of
                    the practice, not just silently scrolling
                    past it. "Повернутися пізніше" just closes
                    this menu (the item stays open exactly as
                    is — nothing to persist for "do nothing
                    differently"); "Нагадати ввечері" saves a
                    same-device reminder (utils/practiceReminders.ts)
                    the dashboard surfaces once due; "Пропустити"
                    hides the block for the rest of this
                    viewing only (practiceDismissed, local-only,
                    not persisted); "Перейти далі" reuses
                    onNext(), the same
                    function the COMPLETE ACTION continue
                    button calls. */}
                <div className="relative">
                  <button
                    onClick={() => setShowNotReadyMenu((v) => !v)}
                    className="text-[12px] text-black/40 hover:text-black/60 transition"
                  >
                    Зараз не готовий
                  </button>
                  {showNotReadyMenu && (
                    <div className="absolute left-0 top-full mt-2 w-60 rounded-xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] py-1.5 z-10">
                      <button
                        onClick={() => setShowNotReadyMenu(false)}
                        className="w-full text-left px-4 py-2 text-[13px] text-black/70 hover:bg-black/5 transition"
                      >
                        Повернутися пізніше
                      </button>
                      <button
                        onClick={() => {
                          setShowNotReadyMenu(false);
                          if (item && program) {
                            setPracticeReminder({
                              itemId: item.id,
                              programId: program.id,
                              programTitle: program.title,
                              itemTitle: item.title,
                              remindAt: eveningTimestamp(),
                            });
                          }
                        }}
                        className="w-full text-left px-4 py-2 text-[13px] text-black/70 hover:bg-black/5 transition"
                      >
                        Нагадати ввечері
                      </button>
                      <button
                        onClick={() => {
                          setShowNotReadyMenu(false);
                          setPracticeDismissed(true);
                        }}
                        className="w-full text-left px-4 py-2 text-[13px] text-black/70 hover:bg-black/5 transition"
                      >
                        Пропустити
                      </button>
                      <button
                        onClick={() => {
                          setShowNotReadyMenu(false);
                          onNext();
                        }}
                        className="w-full text-left px-4 py-2 text-[13px] text-black/70 hover:bg-black/5 transition"
                      >
                        Перейти далі
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
  );
}
