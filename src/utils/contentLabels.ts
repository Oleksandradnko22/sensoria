// Two marks on program cards, both derived from data that already exists:
//  * "Sensoria" — the program was made by the platform itself (author name).
//  * "AI" — the author declared that AI was used to create the material.
//    The declaration is REQUIRED to publish a program (utils/programPublish.ts)
//    and is stored as one of two reserved tags, so no database change is needed.
//    The reserved tags never match a category, so filters and labels ignore them.

export const AI_USED_TAG = "ai-used";
export const AI_NONE_TAG = "ai-none";

export type AiDeclaration = "used" | "none";

export function aiDeclaration(tags?: string[] | null): AiDeclaration | null {
  const t = tags ?? [];
  if (t.includes(AI_USED_TAG)) return "used"; // "used" wins if both ever appear
  if (t.includes(AI_NONE_TAG)) return "none";
  return null;
}

export const isAiProgram = (tags?: string[] | null): boolean => aiDeclaration(tags) === "used";

/** Tags with the declaration replaced (never duplicated); other tags are kept as they were. */
export function withAiDeclaration(tags: string[], value: AiDeclaration): string[] {
  const rest = tags.filter((x) => x !== AI_USED_TAG && x !== AI_NONE_TAG);
  return [...rest, value === "used" ? AI_USED_TAG : AI_NONE_TAG];
}

export function isSensoriaAuthor(author?: string | null): boolean {
  return (author ?? "").trim().toLowerCase() === "sensoria";
}
