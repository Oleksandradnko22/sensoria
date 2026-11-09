// Pure rules for the program detail page (/programs/:id): which call-to-action
// the access panel shows, and the review average. No React, no network.
//
// There is no purchase flow yet, so a paid program is added to the cart, never bought directly.
// Any program (free or paid) is added to the cart first; the cart and payment
// are not built yet (see ProgramAccessPanel). A viewer who already has real
// progress on it continues instead.

import type { PriceInput } from "./price.ts";

export type ProgressLike = {
  isCompleted: boolean;
  state: string;
  currentModuleIndex: number;
} | null;

export type AccessCta =
  | { kind: "own"; label: string; note: string }
  | { kind: "start" | "continue" | "review" | "cart"; label: string; note?: undefined };

export function programCta(input: {
  price: PriceInput;
  viewerIsAuthor: boolean;
  progress: ProgressLike;
  saved: boolean;
  // already in the viewer's cabinet (taken while free): never offered for purchase, even if the price changed later
  owned?: boolean;
}): AccessCta {
  if (input.viewerIsAuthor) {
    return { kind: "own", label: "Це ваша програма", note: "Так її бачать учасники. Редагувати її можна в кабінеті автора." };
  }
  const p = input.progress;
  if (p) {
    if (p.isCompleted) return { kind: "review", label: "Переглянути програму" };
    if (p.state === "not_started") return { kind: "start", label: `Почати з модуля ${p.currentModuleIndex + 1}` };
    return { kind: "continue", label: `Продовжити з модуля ${p.currentModuleIndex + 1}` };
  }
  if (input.owned) return { kind: "start", label: "Почати програму" };
  // Free or paid, access begins with the cart; from there it moves to the cabinet.
  return { kind: "cart", label: "Додати в кошик" };
}

// Average of real review ratings, one decimal; null when there are none.
export function averageRating(ratings: number[]): string | null {
  if (ratings.length === 0) return null;
  return (ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1);
}

// Sections the in-page navigation can offer; a section without content is not listed.
export type SectionId = "curriculum" | "author" | "reviews";

export function visibleSections(input: { hasCurriculum: boolean; hasAuthor: boolean; hasReviews: boolean }): { id: SectionId; label: string }[] {
  const all: { id: SectionId; label: string; show: boolean }[] = [
    { id: "curriculum", label: "Програма", show: input.hasCurriculum },
    { id: "author", label: "Автор", show: input.hasAuthor },
    { id: "reviews", label: "Відгуки", show: input.hasReviews },
  ];
  return all.filter((s) => s.show).map(({ id, label }) => ({ id, label }));
}
