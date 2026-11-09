// Facts for the guide page that are worked out from the guide itself (never typed in by hand), so the
// page can only say what the guide really contains.
import { pluralUk } from "./plural.ts";

type BlockLike = { type: string };

type Interactive = { type: string; count: number; label: string };

// Interactive block types, in the order the page lists them, with their Ukrainian forms (1 / 2–4 / 5+).
const INTERACTIVE_LABELS: { type: string; forms: [string, string, string] }[] = [
  { type: "checklist", forms: ["чекліст", "чеклісти", "чеклістів"] },
  { type: "scale", forms: ["шкала самооцінки", "шкали самооцінки", "шкал самооцінки"] },
  { type: "reflection", forms: ["запитання для рефлексії", "запитання для рефлексії", "запитань для рефлексії"] },
  { type: "timer_practice", forms: ["практика з таймером", "практики з таймером", "практик з таймером"] },
  { type: "decision_tree", forms: ["дерево рішень", "дерева рішень", "дерев рішень"] },
  { type: "action_plan", forms: ["план дій", "плани дій", "планів дій"] },
];

/** "2 чеклісти", "1 практика з таймером"… for every interactive block type the guide really has. */
export function interactiveSummary(content?: readonly BlockLike[] | null): Interactive[] {
  if (!content || content.length === 0) return [];
  const out: Interactive[] = [];
  for (const { type, forms } of INTERACTIVE_LABELS) {
    const count = content.filter((b) => b.type === type).length;
    if (count > 0) out.push({ type, count, label: `${count} ${pluralUk(count, ...forms)}` });
  }
  return out;
}
