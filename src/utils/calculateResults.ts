import funnelStore from "../store/funnelStore";

export function calculateResults(answers: any[]) {

  const results: Record<string, number> = {};

  answers.forEach((answer) => {

    Object.entries(answer.scores).forEach(
      ([category, value]) => {

        results[category] =
          (results[category] || 0) + Number(value);

      }
    );

  });

  const sortedResults = Object.entries(results)
    .sort((a, b) => b[1] - a[1]);

  const primaryCategory = sortedResults[0][0];

  const secondaryCategories =
    sortedResults
      .slice(1, 3)
      .map(([category]) => category);

  const primaryScore =
    results[primaryCategory] || 0;

  let intensity:
    | "low"
    | "moderate"
    | "high"
    | "critical";

  if (primaryScore <= 6) {
    intensity = "low";
  }

  else if (primaryScore <= 12) {
    intensity = "moderate";
  }

  else if (primaryScore <= 18) {
    intensity = "high";
  }

  else {
    intensity = "critical";
  }

  let resultType:
    | "positive"
    | "neutral"
    | "negative";

  if (intensity === "low") {

    resultType = "positive";

  }

  else if (intensity === "moderate") {

    resultType = "neutral";

  }

  else {

    resultType = "negative";

  }

  funnelStore.setAnswers(answers);

  funnelStore.setResults(results);

  funnelStore.setInsight({

    primaryCategory,

    secondaryCategories,

    intensity,

    resultType,

  });

  return {

    results,

    primaryCategory,

    secondaryCategories,

    intensity,

    resultType,

  };

}