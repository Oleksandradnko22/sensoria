export function getRecommendations(
  topCategories: string[],
  items: any[]
) {

  return items

    .map((item) => {

      let score = 0;

      topCategories.forEach((category) => {

        if (
          item.tags?.includes(category)
        ) {
          score += 10;
        }

      });

      return {
        ...item,
        recommendationScore: score,
      };
    })

    .filter(
      (item) =>
        item.recommendationScore > 0
    )

    .sort(
      (a, b) =>
        b.recommendationScore -
        a.recommendationScore
    );
}