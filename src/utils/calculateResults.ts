import funnelStore, {
  type FunnelState,
  type PrimaryStateId,
  type Intensity,
  type SupportingPattern,
  type FunnelInsight,
} from "../store/funnelStore.ts";
import { ASSESSMENT_VERSION, MAX_ANSWER, STATE_ORDER, type AssessmentAnswer } from "../components/test/questions.ts";
import { isPrimaryStateId, clampScore } from "./primaryState.ts";

// The result engine, version 2 (21.11.2026).
// - The state is never derived from the answers: it is the one the person chose (RFC-001). The test measures how
//   pronounced it is, from its 4 core questions.
// - «Impact on daily life» can only raise the level, never lower it.
// - Other states: one screening question each; «often» or more makes it a supporting pattern (descriptive only).
// - If the chosen state is mild but another one is «almost always», the person is told so and decides — the engine
//   never switches the state on its own.
// - `safety`: a very pronounced state or a strong impact on life → the result leads with support and specialist help.
// Self-observation, not a diagnosis.

export function getIntensity(normalizedPercent: number): Intensity {
  if (normalizedPercent <= 25) return "low";
  if (normalizedPercent <= 50) return "moderate";
  if (normalizedPercent <= 75) return "high";
  return "critical";
}

const ORDER: Intensity[] = ["low", "moderate", "high", "critical"];
const atLeast = (a: Intensity, b: Intensity): Intensity => (ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b);

const SUPPORTING_MIN = 2; // «Часто» on the screening question
const MAX_SUPPORTING_PATTERNS = 2;
const SUGGEST_IF_PRIMARY_AT_MOST = 34; // the chosen state is mild (on average «Іноді» or less = 33.3%)…
const SUGGEST_IF_OTHER = 3; // …and another one is «Майже постійно»

/** The pure engine (tested in calculateResults.test.ts). */
export function scoreAssessment(primaryState: PrimaryStateId, secondaryState: PrimaryStateId | null, answers: AssessmentAnswer[]): FunnelInsight {
  const val = (a: AssessmentAnswer, c: string) => Number(a.scores[c as keyof typeof a.scores] ?? 0);
  const core = (s: PrimaryStateId) => {
    const items = answers.filter((a) => a.kind === "core" && a.questionId.startsWith(`${s}-`) && a.questionId !== `${s}-screen`);
    if (!items.length) return null;
    return (items.reduce((n, a) => n + val(a, s), 0) / (items.length * MAX_ANSWER)) * 100;
  };
  const screen = (s: PrimaryStateId) => {
    const a = answers.find((x) => x.questionId === `${s}-screen`);
    return a ? val(a, s) : null;
  };
  const impactAnswer = answers.find((a) => a.kind === "impact");
  const impact = impactAnswer ? val(impactAnswer, "impact") : 0;

  const primaryPercent = core(primaryState) ?? 0;
  let intensity = getIntensity(primaryPercent);
  if (impact >= 2) intensity = atLeast(intensity, "moderate");
  if (impact >= 3) intensity = atLeast(intensity, "high");

  const supportingPatterns: SupportingPattern[] = STATE_ORDER
    .filter((s) => s !== primaryState && s !== secondaryState)
    .map((s) => ({ category: s, value: screen(s) }))
    .filter((x): x is { category: PrimaryStateId; value: number } => x.value !== null && x.value >= SUPPORTING_MIN)
    .sort((a, b) => b.value - a.value || STATE_ORDER.indexOf(a.category) - STATE_ORDER.indexOf(b.category))
    .slice(0, MAX_SUPPORTING_PATTERNS)
    .map((x) => ({ category: x.category, normalizedScore: Math.round((x.value / MAX_ANSWER) * 100) }));

  const safety = intensity === "critical" || impact >= 3;
  // only when the chosen state really reads as mild on the page too: not when the impact on life raised the level
  const suggestedState = primaryPercent <= SUGGEST_IF_PRIMARY_AT_MOST && !safety && (intensity === "low" || intensity === "moderate")
    ? STATE_ORDER.find((s) => s !== primaryState && s !== secondaryState && screen(s) === SUGGEST_IF_OTHER) ?? null
    : null;

  const secondaryPercent = secondaryState ? core(secondaryState) : null;
  return {
    primaryState,
    intensity,
    supportingPatterns,
    secondaryState,
    primaryScore: clampScore(primaryPercent),
    version: ASSESSMENT_VERSION,
    impact,
    safety,
    suggestedState,
    secondaryIntensity: secondaryPercent === null ? null : getIntensity(secondaryPercent),
  };
}

/** Runs the engine for the person's own choice and keeps the result in the funnel store. */
export function calculateResults(selectedState: FunnelState | null, answers: AssessmentAnswer[]) {
  if (!selectedState || !isPrimaryStateId(selectedState.id)) {
    throw new Error("calculateResults: no valid Primary State selected (RFC-001).");
  }
  const secondaryState: PrimaryStateId | null =
    funnelStore.secondaryState && isPrimaryStateId(funnelStore.secondaryState.id) ? funnelStore.secondaryState.id : null;
  const insight = scoreAssessment(selectedState.id, secondaryState, answers);
  funnelStore.setAnswers(answers);
  funnelStore.setResults(Object.fromEntries(answers.map((a) => [a.questionId, a.answerIndex])));
  funnelStore.setInsight(insight);
  return insight;
}
