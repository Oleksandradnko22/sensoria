// Which decorative cover a program gets when it has no real cover image.
// Chosen only by topic tags (it never shows data), plus a tiny per-program
// variation so neighbouring cards of the same topic are not identical.

export type Scene = "balance" | "path" | "bloom" | "connection" | "sunrise" | "growth" | "calm";

const SCENE_BY_TAG: Record<string, Scene> = {
  emotionalBalance: "balance",
  healthyBalance: "balance",
  stress: "path",
  innerPressure: "path",
  selfEsteem: "bloom",
  relationships: "connection",
  awareness: "sunrise",
  motivation: "growth",
  anxiety: "calm",
  burnout: "calm",
  recovery: "calm",
};

export function sceneForTags(tags?: string[]): Scene {
  for (const t of tags ?? []) if (SCENE_BY_TAG[t]) return SCENE_BY_TAG[t];
  return "balance";
}

/** Stable from any string (program id): palette shift (3), mirror (2), zoom/offset (2) = 12 looks per scene. */
export function coverVariant(seed?: string): { shift: 0 | 1 | 2; mirror: boolean; zoom: boolean } {
  if (!seed) return { shift: 0, mirror: false, zoom: false };
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  return { shift: (h % 3) as 0 | 1 | 2, mirror: ((h >>> 3) & 1) === 1, zoom: ((h >>> 4) & 1) === 1 };
}
