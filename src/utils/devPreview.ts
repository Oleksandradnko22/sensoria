// Dev-only sample state for the program page, so the design can be judged on a real
// program without touching the database. Works ONLY in `npm run dev` (import.meta.env.DEV
// is false in production builds). Switch on with `?demo=1` on any URL, off with `?demo=0`;
// the choice is kept for the browser session.
import { computeProgress } from "../lib/contentProgress";
import type { ContentModule, ItemProgressMap, ProgramProgressSummary } from "../data/contentTypes";

const KEY = "sensoria:dev-demo";

// Evaluated once at import time (App imports this first), before the router rewrites the URL.
const enabled: boolean = (() => {
  if (!import.meta.env.DEV || typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("demo");
    if (q === "1") sessionStorage.setItem(KEY, "1");
    if (q === "0") sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
})();

export const isDevDemo = (): boolean => enabled;

// Dev-only: force a hero emblem to review all of them on one program.
// In the console: sessionStorage.setItem("sensoria:dev-art","water"); window.dispatchEvent(new Event("sensoria:dev-art"))
export function devHeroArt(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    return sessionStorage.getItem("sensoria:dev-art");
  } catch {
    return null;
  }
}

export const DEMO_BENEFITS = ["Збереження емоційної стабільності", "Підтримка внутрішнього ресурсу", "Практики усвідомленості"];

const LESSON_TITLES: Record<number, string[]> = { 2: ["Джерела енергії", "Як помічати виснаження вчасно"] };

// Sample participant state: modules 1-2 done, the current lesson is the first one of module 3.
export function demoLearning(realModules: { title: string; lessons: number }[]): { modules: ContentModule[]; map: ItemProgressMap; summary: ProgramProgressSummary } | null {
  if (!enabled || realModules.length === 0) return null;
  const currentModule = Math.min(2, realModules.length - 1);
  const modules: ContentModule[] = realModules.map((m, mi) => {
    const n = Math.max(m.lessons, 1);
    return {
      id: `demo-m${mi}`,
      title: m.title,
      description: mi === currentModule ? "Де брати енергію і як помічати виснаження до того, як стане критично." : "",
      items: Array.from({ length: n }, (_, ii) => ({
        id: `demo-m${mi}-i${ii}`,
        title: LESSON_TITLES[mi]?.[ii] ?? `Урок ${ii + 1}`,
        type: "text" as ContentModule["items"][number]["type"],
        isRequired: true,
      })),
    };
  });
  const map: ItemProgressMap = {};
  modules.forEach((m, mi) => m.items.forEach((it) => mi < currentModule && (map[it.id] = "completed")));
  map[modules[currentModule].items[0].id] = "in_progress";
  return { modules, map, summary: computeProgress(modules, map) };
}
