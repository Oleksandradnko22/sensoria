import funnelStore, {
  type FunnelState,
  type PrimaryStateId,
  type Intensity,
  type SupportingPattern,
} from "../store/funnelStore.ts";
import {
  questions,
  type Category,
  type AssessmentAnswer,
} from "../components/test/questions.ts";
import { isPrimaryStateId, clampScore } from "./primaryState.ts";

const MAX_ANSWER_VALUE = 3;

const SUPPORTING_PATTERN_THRESHOLD = 50;
const MAX_SUPPORTING_PATTERNS = 2;

function getIntensity(normalizedPercent: number): Intensity {
  if (normalizedPercent <= 25) return "low";
  if (normalizedPercent <= 50) return "moderate";
  if (normalizedPercent <= 75) return "high";
  return "critical";
}

function computeCategoryMaxScores(): Partial<Record<Category, number>> {
  const maxScores: Partial<Record<Category, number>> = {};

  questions.forEach((question) => {
    const categoriesInQuestion = new Set<Category>();

    question.answers.forEach((answer) => {
      Object.keys(answer.scores).forEach((category) => {
        categoriesInQuestion.add(category as Category);
      });
    });

    categoriesInQuestion.forEach((category) => {
      maxScores[category] = (maxScores[category] || 0) + MAX_ANSWER_VALUE;
    });
  });

  return maxScores;
}

/**
 * The Result Engine (RFC-001).
 *
 * Primary State is never derived from assessment answers — it is always
 * whatever the user selected on the State Selection screen. The assessment
 * only measures how intense that state is, and detects other elevated
 * signals as Supporting Patterns. The engine never reclassifies the user
 * into a different emotional state than the one they chose.
 */
export function calculateResults(
  selectedState: FunnelState | null,
  // Was `any[]` — closed by RFC-004's AssessmentAnswer type, which now
  // matches what TestPage/QuestionCard actually produce.
  answers: AssessmentAnswer[]
) {
  if (!selectedState || !isPrimaryStateId(selectedState.id)) {
    throw new Error(
      "calculateResults: no valid Primary State selected. The Result " +
        "Engine never guesses a category — Primary State must come from " +
        "the user's own selection (RFC-001)."
    );
  }

  const primaryState = selectedState.id;

  // 1. Aggregate raw scores per signal category from the answers given.
  const rawScores: Partial<Record<Category, number>> = {};

  answers.forEach((answer) => {
    Object.entries(answer.scores).forEach(([category, value]) => {
      const key = category as Category;
      rawScores[key] = (rawScores[key] || 0) + Number(value);
    });
  });

  // 2. Normalize every signal category against its own maximum possible
  // score, not a fixed absolute cutoff.
  const maxScores = computeCategoryMaxScores();
  const normalizedScores: Partial<Record<Category, number>> = {};

  (Object.keys(maxScores) as Category[]).forEach((category) => {
    const raw = rawScores[category] || 0;
    const max = maxScores[category] || 0;
    normalizedScores[category] = max > 0 ? (raw / max) * 100 : 0;
  });

  // 3. Intensity belongs to the Primary State only — never to whichever
  // category happened to score highest.
  const primaryNormalizedScore = normalizedScores[primaryState] || 0;
  const intensity = getIntensity(primaryNormalizedScore);

  // Rounded for display (the "Рівень навантаження" percentage and the
  // progress bar fill both read this exact number — see ResultPage.tsx —
  // so they can never disagree with each other). Also clamped to 0-100
  // (2026-09-16 audit hardening) — normally normalizedScore is already
  // in range by construction, but this is defense-in-depth against any
  // future scoring-pipeline bug producing a stray out-of-range value
  // that would otherwise reach the UI as-is.
  const primaryScore = clampScore(primaryNormalizedScore);

  // 4. Supporting Patterns: other signal categories at >=50% of their own
  // max, ranked by normalized score, capped at 2. Descriptive, never
  // diagnostic — they enrich the insight but never compete with or
  // replace the Primary State.
  const supportingPatterns: SupportingPattern[] = (
    Object.keys(normalizedScores) as Category[]
  )
    .filter((category) => category !== primaryState)
    .map((category) => ({
      category,
      normalizedScore: normalizedScores[category] || 0,
    }))
    .filter((entry) => entry.normalizedScore >= SUPPORTING_PATTERN_THRESHOLD)
    .sort((a, b) => b.normalizedScore - a.normalizedScore)
    .slice(0, MAX_SUPPORTING_PATTERNS);

  // 5. Secondary State: the second state picked on State Selection, if
  // the user chose two. Read directly from the store rather than passed
  // in as an argument, matching how this function already reaches into
  // funnelStore for its other side effects. Purely descriptive — it
  // does not participate in scoring above and never overrides
  // primaryState.
  const secondaryState: PrimaryStateId | null =
    funnelStore.secondaryState &&
    isPrimaryStateId(funnelStore.secondaryState.id)
      ? funnelStore.secondaryState.id
      : null;

  funnelStore.setAnswers(answers);
  funnelStore.setResults(rawScores as Record<string, number>);
  funnelStore.setInsight({
    primaryState,
    intensity,
    supportingPatterns,
    secondaryState,
    primaryScore,
  });

  return {
    primaryState,
    intensity,
    supportingPatterns,
    secondaryState,
    primaryScore,
  };
}