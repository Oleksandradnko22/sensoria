export function getPrimaryCategory(
  results: Record<string, number>
) {

  const sorted = Object.entries(results)

    .filter(([key]) =>
      ![
        "averageScore",
        "emotionalScore",
      ].includes(key)
    )

    .sort((a, b) => b[1] - a[1]);

  return sorted[0]?.[0];
}

export function getSecondaryCategories(
  results: Record<string, number>
) {

  const sorted = Object.entries(results)

    .filter(([key]) =>
      ![
        "averageScore",
        "emotionalScore",
      ].includes(key)
    )

    .sort((a, b) => b[1] - a[1]);

  return sorted.slice(1, 3).map(([key]) => key);
}