// The person's responses inside a structured guide (2026-10-06) — one hook,
// one place, built ONLY on persistence that already exists:
//
//   choices (checklist, action plan) → guide_checklist_checks (lib/guideChecklistChecks.ts)
//   before / after ratings           → guide_self_assessments (lib/guideSelfAssessments.ts)
//   private observation              → content_item_reflections (lib/reflections.ts) —
//                                      the same append-only journal that feeds
//                                      "Ваші спостереження"; owner-only (RLS)
//   decision-tree branch, timer run  → session only (nothing to restore, by design)
//
// No new table, no fake persistence: where the existing storage cannot hold
// a value (a 0 on the 0–10 scale; the table's CHECK is 1–10) the value is
// kept for the session and simply not written.
//
// State is plain useState; writes are applied optimistically, queued so fast
// clicks never race, and rolled back (with a visible message) if they fail.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActionPlanBlock, ChecklistBlock, GuideContent, ReflectionBlock, ScaleBlock } from "../../data/guideContent";
import { blockIndexOf } from "../../data/guideContent";
import {
  EMPTY_ANSWERS,
  canPersistScore,
  diffSelection,
  toggleChoice,
  type GuideAnswers,
} from "../../utils/guideInteraction";
import { answersFromRows, checkKey } from "../../utils/guideAnswerMapping";
import { checkChecklistItem, fetchChecklistChecksForGuide, uncheckChecklistItem } from "../../lib/guideChecklistChecks";
import { fetchSelfAssessmentsForGuide, saveSelfAssessment } from "../../lib/guideSelfAssessments";
import { fetchReflectionsForItem, submitReflection, type Reflection } from "../../lib/reflections";
import { errorMessage } from "../../lib/errorMessage";

type Params = {
  guideId: string;
  guideTitle: string;
  content: GuideContent;
  userId: string | null | undefined;
};

export const reflectionItemId = (guideId: string, blockId: string) => `${guideId}:${blockId}`;

export function useGuideAnswers({ guideId, guideTitle, content, userId }: Params) {
  const [answers, setAnswersState] = useState<GuideAnswers>(EMPTY_ANSWERS);
  // Mirror of `answers` that is updated synchronously, so a write's
  // before/after is computed from the latest state, never from a render
  // that has not happened yet.
  const answersRef = useRef<GuideAnswers>(EMPTY_ANSWERS);
  const setAnswers = useCallback((fn: (a: GuideAnswers) => GuideAnswers) => {
    answersRef.current = fn(answersRef.current);
    setAnswersState(answersRef.current);
  }, []);
  const [reflectionHistory, setReflectionHistory] = useState<Record<string, Reflection[]>>({});
  const [error, setError] = useState<string | null>(null);
  const checkRowIds = useRef<Record<string, string>>({});
  // Writes run one after another so a quick double-click can't interleave.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = (job: () => Promise<void>) => {
    queue.current = queue.current.then(job, job);
    return queue.current;
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [checks, assessments] = await Promise.all([
          fetchChecklistChecksForGuide(guideId, userId),
          fetchSelfAssessmentsForGuide(guideId, userId),
        ]);
        const loaded = answersFromRows(content, checks, assessments);
        const history: Record<string, Reflection[]> = {};
        for (const block of content) {
          if (block.type !== "reflection") continue;
          const rows = await fetchReflectionsForItem(reflectionItemId(guideId, block.id), userId);
          history[block.id] = rows;
          if (rows.length > 0) loaded.answers.reflections[block.id] = true;
        }
        if (cancelled) return;
        checkRowIds.current = loaded.checkRowIds;
        setAnswers((prev) => ({
          // Anything already answered this session wins over stored rows
          // that arrived late; session-only kinds are never in storage.
          selections: { ...loaded.answers.selections, ...prev.selections },
          scales: { ...loaded.answers.scales, ...prev.scales },
          reflections: { ...loaded.answers.reflections, ...prev.reflections },
          branches: prev.branches,
          practices: prev.practices,
        }));
        setReflectionHistory(history);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Не вдалося завантажити відповіді гайду:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // content is static module data; ids/user define what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideId, userId]);

  const setChoice = useCallback(
    (block: ChecklistBlock | ActionPlanBlock, itemIndex: number) => {
      const mode = block.type === "checklist" && block.selection === "single" ? "single" : "multiple";
      const max = block.type === "action_plan" ? block.max : undefined;
      const prev = answersRef.current.selections[block.id] ?? [];
      const next = toggleChoice(prev, itemIndex, mode, max);
      if (next === prev) return; // blocked by the limit
      setAnswers((a) => ({ ...a, selections: { ...a.selections, [block.id]: next } }));
      if (!userId) return;
      const blockIndex = blockIndexOf(content, block.id);
      enqueue(async () => {
        const { add, remove } = diffSelection(prev, next);
        try {
          for (const itemIdx of remove) {
            const key = checkKey(block.id, itemIdx);
            const rowId = checkRowIds.current[key];
            if (rowId) {
              await uncheckChecklistItem(rowId);
              delete checkRowIds.current[key];
            }
          }
          for (const itemIdx of add) {
            const row = await checkChecklistItem({ guideId, blockId: block.id, blockIndex, itemIndex: itemIdx, userId });
            checkRowIds.current[checkKey(block.id, itemIdx)] = row.id;
          }
          setError(null);
        } catch (err) {
          setAnswers((a) => ({ ...a, selections: { ...a.selections, [block.id]: prev } }));
          setError(`Не вдалося зберегти вибір: ${errorMessage(err)}`);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, guideId, userId, setAnswers]
  );

  const setScale = useCallback(
    (block: ScaleBlock, value: number) => {
      setAnswers((a) => ({ ...a, scales: { ...a.scales, [block.id]: value } }));
      if (!userId || !block.phase || !canPersistScore(block, value)) return;
      const blockIndex = blockIndexOf(content, block.id);
      enqueue(async () => {
        try {
          await saveSelfAssessment({ guideId, blockId: block.id, blockIndex, phase: block.phase!, score: value, userId });
          setError(null);
        } catch (err) {
          setError(`Не вдалося зберегти оцінку: ${errorMessage(err)}`);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, guideId, userId, setAnswers]
  );

  const setBranch = useCallback(
    (blockId: string, branchId: string) => {
      setAnswers((a) => ({ ...a, branches: { ...a.branches, [blockId]: branchId } }));
    },
    [setAnswers]
  );

  const markPractice = useCallback(
    (blockId: string) => {
      setAnswers((a) => ({ ...a, practices: { ...a.practices, [blockId]: true } }));
    },
    [setAnswers]
  );

  const saveReflection = useCallback(
    async (block: ReflectionBlock, note: string): Promise<boolean> => {
      const text = note.trim();
      if (!userId || !text) return false;
      try {
        const saved = await submitReflection({
          itemId: reflectionItemId(guideId, block.id),
          userId,
          programTitle: guideTitle,
          itemTitle: "Ваше спостереження",
          note: text,
        });
        setReflectionHistory((h) => ({ ...h, [block.id]: [saved, ...(h[block.id] ?? [])] }));
        setAnswers((a) => ({ ...a, reflections: { ...a.reflections, [block.id]: true } }));
        setError(null);
        return true;
      } catch (err) {
        setError(`Не вдалося зберегти спостереження: ${errorMessage(err)}`);
        return false;
      }
    },
    [guideId, guideTitle, userId, setAnswers]
  );

  return { answers, reflectionHistory, error, setChoice, setScale, setBranch, markPractice, saveReflection };
}

export type GuideAnswersApi = ReturnType<typeof useGuideAnswers>;
