import { archetypes } from "./archetypes";
import type { Archetype } from "./archetypes";

export function calculateResults(
  answers: any[]
) {
  const totals: Record<string, number> = {};

  let emotionalScore = 0;

  let totalAnswers =0;
  let totalScore = 0;

  answers.forEach((answer) => {

    if (answer.answerIndex === 0) {
  emotionalScore += 2;
}

if (answer.answerIndex === 1) {
  emotionalScore += 1;
}

if (answer.answerIndex === 2) {
  emotionalScore -= 1;
}

if (answer.answerIndex === 3) {
  emotionalScore -= 2;
}

    Object.entries(answer.scores).forEach(
      ([category, value]) => {

        const score = Number(value);

        totalScore += score;
        totalAnswers++;

        // POSITIVE COMPENSATION

if (score === 0) {
  totals.balance =
    (totals.balance || 0) + 2;

  totals.recovery =
    (totals.recovery || 0) + 2;

  totals.resilience =
    (totals.resilience || 0) + 1;
}

if (score === 1) {
  totals.balance =
    (totals.balance || 0) + 1;

  totals.awareness =
    (totals.awareness || 0) + 1;
}

        if (!totals[category]) {
          totals[category] = 0;
        }

        totals[category] += score;

        // STRONG ANSWER BONUS
        if (score >= 3) {
          totals[category] += 2;
        }

        // MEDIUM BONUS
        if (score === 2) {
          totals[category] += 1;
        }
      }
    );
  });

  

  // COMBINATIONS

  if (
    totals.burnout > 10 &&
    totals.stress > 10
  ) {
    totals.burnout += 4;
    totals.stress += 4;
  }

  if (
    totals.anxiety > 10 &&
    totals.emotionalBalance > 8
  ) {
    totals.anxiety += 3;
  }

  if (
    totals.selfEsteem > 8 &&
    totals.innerPressure > 8
  ) {
    totals.innerPressure += 4;
  }

  if (
    totals.motivation > 7 &&
    totals.burnout > 10
  ) {
    totals.burnout += 3;
  }

  totals.averageScore = 
    totalAnswers > 0
        ? totalScore / totalAnswers
        : 0;
  
    totals.emotionalScore = emotionalScore;

  return totals;
} 

export function getTopCategories(
  results: Record<string, number>
) {
  return Object.entries(results)
    .filter(([key]) =>
      ![
        "averageScore",
        "emotionalScore",
      ].includes(key)
    )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key]) => key);
}

export function getArchetype(
  results: Record<string, number>
): Archetype {

  const sorted = Object.entries(results)
    .filter(([key]) =>
      ![
        "averageScore",
        "emotionalScore",
      ].includes(key)
    )
    .sort((a, b) => b[1] - a[1]);

  const first = sorted[0]?.[0];
  const second = sorted[1]?.[0];

  if (
    first === "stress" &&
    second === "burnout"
  ) {
    return archetypes.find(
      (a) => a.id === "overloaded-achiever"
    )!;
  }

  if (
    first === "anxiety" &&
    second === "emotionalBalance"
  ) {
    return archetypes.find(
      (a) => a.id === "emotional-analyst"
    )!;
  }

  if (
    first === "selfEsteem" &&
    second === "innerPressure"
  ) {
    return archetypes.find(
      (a) => a.id === "exhausted-perfectionist"
    )!;
  }

  if (
    first === "relationships" &&
    second === "emotionalBalance"
  ) {
    return archetypes.find(
      (a) => a.id === "sensitive-connector"
    )!;
  }

  if (
    first === "motivation" &&
    second === "emotionalBalance"
  ) {
    return archetypes.find(
      (a) => a.id === "reflective-explorer"
    )!;
  }

  if (
    first === "relationships" &&
    second === "selfEsteem"
  ) {
    return archetypes.find(
      (a) => a.id === "sensitive-creator"
    )!;
  }

  if (
    first === "balance" &&
    second === "resilience"
  ) {
    return archetypes.find(
      (a) => a.id === "emotionally-balanced"
    )!;
  }

  if (
    first === "motivation" &&
    second === "relationships"
  ) {
    return archetypes.find(
      (a) => a.id === "balanced-adapter"
    )!;
  }

  return archetypes.find(
    (a) => a.id === "reflective-explorer"
  )!;
}

export function getPercentages(
  results: Record<string, number>
) {
  const MAX = 40;

  const percentages: Record<
    string,
    number
  > = {};

  Object.entries(results).forEach(
    ([key, value]) => {
      percentages[key] = Math.min(
        100,
        Math.round((value / MAX) * 100)
      );
    }
  );

  return percentages;
}