// Pure rules of the guide builder: what blocks an author can add, what a fresh
// block looks like, how blocks are moved, and what is still missing before a
// guide built in the builder can be published. No React here, so it is tested
// without a browser. The block model itself is data/guideContent.ts.
import type { GuideBlockType, GuideBlockV2, GuideContent } from "../data/guideContent.ts";

export const GUIDE_BUILDER_MAX_BLOCKS = 120;
export const GUIDE_BUILDER_MIN_BLOCKS = 3;

export type BuilderGroup = "text" | "interactive" | "other";

export type BuilderBlockInfo = {
  type: GuideBlockType;
  label: string;
  hint: string;
  group: BuilderGroup;
};

// The order of this list is the order of the "add a block" palette.
export const BUILDER_BLOCKS: BuilderBlockInfo[] = [
  { type: "heading", label: "Розділ", hint: "Заголовок, з якого починається новий розділ.", group: "text" },
  { type: "rich_text", label: "Текст", hint: "Абзаци простого тексту.", group: "text" },
  { type: "callout", label: "Виноска", hint: "Важлива думка, примітка або турбота про себе.", group: "text" },
  { type: "flow", label: "Схема кроків", hint: "Послідовність: з чого що випливає.", group: "text" },
  { type: "media", label: "Зображення", hint: "Ілюстрація з підписом.", group: "text" },
  { type: "divider", label: "Розділювач", hint: "Тонка лінія між частинами.", group: "text" },
  { type: "checklist", label: "Вибір із варіантів", hint: "Читач відмічає, що з переліку про нього.", group: "interactive" },
  { type: "scale", label: "Шкала", hint: "Оцінка стану за шкалою, наприклад від 0 до 10.", group: "interactive" },
  { type: "reflection", label: "Нотатка", hint: "Питання, на яке читач відповідає у вільній формі.", group: "interactive" },
  { type: "timer_practice", label: "Практика з таймером", hint: "Покрокова вправа, яку ведуть за часом.", group: "interactive" },
  { type: "decision_tree", label: "Розвилка", hint: "Питання й кілька відповідей, кожна веде до свого кроку.", group: "interactive" },
  { type: "action_plan", label: "План дій", hint: "Читач вибирає кілька маленьких дій для себе.", group: "interactive" },
  { type: "gift", label: "Подарунок", hint: "Ваша медитація як подарунок читачеві.", group: "other" },
];

export function blockInfo(type: GuideBlockType): BuilderBlockInfo {
  return BUILDER_BLOCKS.find((b) => b.type === type) ?? BUILDER_BLOCKS[1];
}

export function newId(prefix = "b"): string {
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rnd}`;
}

// A fresh block, with empty text fields the author fills in.
export function newBlock(type: GuideBlockType): GuideBlockV2 {
  const id = newId();
  switch (type) {
    case "heading":
      return { id, type, text: "", summary: "" };
    case "rich_text":
      return { id, type, text: "" };
    case "callout":
      return { id, type, tone: "calm", title: "", text: "" };
    case "flow":
      return { id, type, title: "", steps: [{ label: "", text: "" }, { label: "", text: "" }], caption: "" };
    case "checklist":
      return { id, type, completion: "answered", prompt: "", selection: "multiple", items: [{ id: newId("i"), label: "" }, { id: newId("i"), label: "" }] };
    case "scale":
      return { id, type, completion: "answered", prompt: "", min: 0, max: 10, lowLabel: "", highLabel: "" };
    case "reflection":
      return { id, type, completion: "answered", prompt: "", placeholder: "" };
    case "timer_practice":
      return { id, type, title: "", intro: "", phases: [{ seconds: 30, text: "" }, { seconds: 30, text: "" }], doneText: "" };
    case "decision_tree":
      return { id, type, completion: "answered", prompt: "", branches: [{ id: newId("i"), label: "", step: "" }, { id: newId("i"), label: "", step: "" }] };
    case "recommendation":
      return { id, type, prompt: "Що почитати чи послухати далі", limit: 3 };
    case "gift":
      return { id, type, meditationId: "", meditationTitle: "", text: "" };
    case "action_plan":
      return { id, type, completion: "answered", prompt: "", max: 2, items: [{ id: newId("i"), label: "" }, { id: newId("i"), label: "" }, { id: newId("i"), label: "" }] };
    case "media":
      return { id, type, url: "", alt: "", caption: "" };
    case "divider":
      return { id, type };
  }
}

// An empty guide starts with one section and a text, so the page is never blank.
export function starterBlocks(): GuideContent {
  return [newBlock("heading")];
}

// Sections: a "Розділ" block and everything up to the next one. The builder shows
// one section per tab. Content before the first heading (an old guide) is its own
// range with `heading: false`.
export type SectionRange = { start: number; end: number; heading: boolean };

export function sectionRanges(blocks: GuideContent): SectionRange[] {
  const out: SectionRange[] = [];
  blocks.forEach((b, i) => {
    if (b.type === "heading") out.push({ start: i, end: i + 1, heading: true });
    else if (out.length === 0) out.push({ start: i, end: i + 1, heading: false });
    else out[out.length - 1].end = i + 1;
  });
  return out;
}

// Swap a section with its neighbour (delta -1 = earlier, 1 = later).
export function moveSection(blocks: GuideContent, index: number, delta: -1 | 1): GuideContent {
  const r = sectionRanges(blocks);
  const to = index + delta;
  if (index < 0 || to < 0 || index >= r.length || to >= r.length) return blocks;
  const [a, b] = delta < 0 ? [r[to], r[index]] : [r[index], r[to]];
  return [...blocks.slice(0, a.start), ...blocks.slice(b.start, b.end), ...blocks.slice(a.start, a.end), ...blocks.slice(b.end)];
}

// Remove a whole section with its blocks.
export function removeSection(blocks: GuideContent, index: number): GuideContent {
  const r = sectionRanges(blocks)[index];
  return r ? [...blocks.slice(0, r.start), ...blocks.slice(r.end)] : blocks;
}

export function insertAt(blocks: GuideContent, index: number, block: GuideBlockV2): GuideContent {
  const at = Math.max(0, Math.min(blocks.length, index));
  return [...blocks.slice(0, at), block, ...blocks.slice(at)];
}

export function removeAt(blocks: GuideContent, index: number): GuideContent {
  return blocks.filter((_, i) => i !== index);
}

export function move(blocks: GuideContent, index: number, delta: -1 | 1): GuideContent {
  const to = index + delta;
  if (index < 0 || index >= blocks.length || to < 0 || to >= blocks.length) return blocks;
  const next = [...blocks];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// A copy with new ids (ids must stay unique inside one guide).
export function duplicate(block: GuideBlockV2): GuideBlockV2 {
  const copy = JSON.parse(JSON.stringify(block)) as GuideBlockV2;
  copy.id = newId();
  const anyCopy = copy as unknown as { items?: { id: string }[]; branches?: { id: string }[] };
  anyCopy.items?.forEach((it) => (it.id = newId("i")));
  anyCopy.branches?.forEach((br) => (br.id = newId("i")));
  return copy;
}

const has = (v: string | undefined | null) => Boolean(v && v.trim());
const filled = (list: string[]) => list.filter((x) => has(x)).length;

// Pictures of the blocks (every media block that has one).
export function mediaUrls(blocks: GuideContent | undefined): string[] {
  return (blocks ?? []).flatMap((b) => (b.type === "media" && b.url.trim() ? [b.url] : []));
}

const isPaidRef = (url: string) => url.startsWith("paid:");

// A paid guide keeps its pictures in the private storage, a free one in the public: a changed price needs the picture again.
export function imageVisibilityProblem(url: string | undefined, price: number | undefined): string | null {
  if (!url || !url.trim() || price === undefined || !Number.isFinite(price)) return null;
  if (price > 0 && !isPaidRef(url)) return "Гайд платний, а зображення відкрите. Завантажте його ще раз, щоб воно було захищене.";
  if (price === 0 && isPaidRef(url)) return "Гайд безкоштовний, а зображення захищене. Завантажте його ще раз, щоб його бачили всі.";
  return null;
}

// What is still missing in ONE block (empty list = the block is fine). `price` (when known) also checks where pictures are kept.
export function blockProblems(block: GuideBlockV2, price?: number): string[] {
  const out: string[] = [];
  switch (block.type) {
    case "heading":
      if (!has(block.text)) out.push("Напишіть назву розділу.");
      break;
    case "rich_text":
      if (!has(block.text)) out.push("Додайте текст.");
      break;
    case "callout":
      if (!has(block.text)) out.push("Додайте текст виноски.");
      break;
    case "flow":
      if (block.steps.filter((s) => has(s.label)).length < 2) out.push("Потрібні щонайменше два кроки з назвами.");
      break;
    case "checklist":
      if (!has(block.prompt)) out.push("Напишіть питання.");
      if (filled(block.items.map((i) => i.label)) < 2) out.push("Потрібні щонайменше два варіанти.");
      break;
    case "scale":
      if (!has(block.prompt)) out.push("Напишіть, що оцінює читач.");
      if (!(block.max > block.min)) out.push("Максимум шкали має бути більшим за мінімум.");
      break;
    case "reflection":
      if (!has(block.prompt)) out.push("Напишіть питання для нотатки.");
      break;
    case "timer_practice":
      if (!has(block.title)) out.push("Дайте практиці назву.");
      if (block.phases.filter((p) => has(p.text) && p.seconds > 0).length < 1) out.push("Додайте щонайменше один крок із часом.");
      if (!has(block.doneText)) out.push("Напишіть фразу, якою практика завершується.");
      break;
    case "decision_tree":
      if (!has(block.prompt)) out.push("Напишіть питання.");
      if (block.branches.filter((b) => has(b.label) && has(b.step)).length < 2) out.push("Потрібні щонайменше дві відповіді з кроком.");
      break;
    case "action_plan":
      if (!has(block.prompt)) out.push("Напишіть вступ до плану.");
      if (filled(block.items.map((i) => i.label)) < 2) out.push("Потрібні щонайменше дві дії.");
      break;
    case "media":
      if (!has(block.url)) out.push("Завантажте зображення.");
      else {
        const v = imageVisibilityProblem(block.url, price);
        if (v) out.push(v);
      }
      if (!has(block.alt)) out.push("Опишіть зображення словами (для людей, які його не бачать).");
      break;
    case "gift":
      if (!has(block.meditationId)) out.push("Оберіть медитацію для подарунка.");
      break;
    case "recommendation":
    case "divider":
      break;
  }
  return out;
}

// What is missing in the whole guide.
export function guideBlocksProblems(blocks: GuideContent | undefined, price?: number): string[] {
  const list = blocks ?? [];
  const out: string[] = [];
  if (list.length === 0) return ["Додайте до гайду хоча б один розділ із текстом."];
  if (!list.some((b) => b.type === "heading")) out.push("Додайте хоча б один розділ із заголовком.");
  else if (list[0].type !== "heading") out.push("Гайд має починатися з розділу.");
  if (list.length < GUIDE_BUILDER_MIN_BLOCKS) out.push(`У гайді має бути щонайменше ${GUIDE_BUILDER_MIN_BLOCKS} блоки.`);
  if (list.length > GUIDE_BUILDER_MAX_BLOCKS) out.push(`У гайді не більше ${GUIDE_BUILDER_MAX_BLOCKS} блоків.`);
  const bad = list.filter((b) => blockProblems(b, price).length > 0).length;
  if (bad > 0) out.push(bad === 1 ? "Один блок ще не заповнений." : `Ще не заповнено блоків: ${bad}.`);
  return out;
}

// Rough reading time of the guide in minutes (never shown as a limit, only to
// help the author feel the size of what they are writing).
export function wordCount(blocks: GuideContent): number {
  const text: string[] = [];
  blocks.forEach((b) => {
    const any = b as unknown as Record<string, unknown>;
    ["text", "title", "prompt", "intro", "summary", "caption", "doneText", "meditationTitle"].forEach((k) => typeof any[k] === "string" && text.push(any[k] as string));
  });
  return text.join(" ").split(/\s+/).filter(Boolean).length;
}
