// The self-observation questionnaire, version 2 (21.11.2026; replaces the fixed 15 questions of version 1).
//
// Built for the person's own choice on the State Selection screen:
//  - 4 core questions for each chosen state (1 or 2 states) — the intensity is measured on these only;
//  - 1 screening question for every other state — enough to notice that something else stands out;
//  - 1 question on how much this affects daily life (sleep, work, relationships).
// Every question measures ONE thing (no double-counting), all are about the last 2 weeks, all use the same frequency
// scale and are worded without grammatical gender. Draft wording — to be reviewed by a psychologist-author.
// Self-observation, not a diagnosis (Terms, Participant Agreement).

import type { PrimaryStateId } from "../../store/funnelStore.ts";

export const ASSESSMENT_VERSION = 2;

/** The six states plus «impact»; the two old signal categories stay only so that results of version 1 still read. */
export type Category = PrimaryStateId | "impact" | "emotionalBalance" | "innerPressure";

export type QuestionKind = "core" | "screen" | "impact";

export type Question = {
  id: string;
  /** the state this question measures («impact» for the life-impact question) */
  category: PrimaryStateId | "impact";
  kind: QuestionKind;
  /** shown above the question: the time frame */
  lead: string;
  question: string;
  answers: { text: string; scores: Partial<Record<Category, number>> }[];
};

export type AssessmentAnswer = {
  questionId: string;
  answerIndex: number;
  kind?: QuestionKind;
  scores: Partial<Record<Category, number>>;
};

export const LEAD = "За останні 2 тижні";
export const MAX_ANSWER = 3;

const FREQUENCY = ["Майже ніколи", "Іноді", "Часто", "Майже постійно"];
const IMPACT = ["Зовсім ні", "Трохи", "Помітно", "Дуже сильно"];

const answersFor = (category: Category, labels: string[]) =>
  labels.map((text, value) => ({ text, scores: { [category]: value } as Partial<Record<Category, number>> }));

/** 4 core questions per state: the main signs of it, one each. */
export const CORE: Record<PrimaryStateId, string[]> = {
  anxiety: [
    "Як часто було важко зупинити тривожні думки?",
    "Як часто відчувалися неспокій чи напруга в тілі?",
    "Як часто з'являлося очікування, що станеться щось погане?",
    "Як часто було важко розслабитися, навіть коли була можливість?",
  ],
  stress: [
    "Як часто кількість справ і вимог здавалася більшою, ніж вдається витримати?",
    "Як часто дрібниці викликали роздратування?",
    "Як часто було важко відключитися від справ навіть у вільний час?",
    "Як часто здавалося, що події виходять з-під контролю?",
  ],
  burnout: [
    "Як часто відчувалося емоційне виснаження?",
    "Як часто бракувало сил навіть після відпочинку чи сну?",
    "Як часто те, що раніше було важливим, ставало байдужим?",
    "Як часто справи робилися «на автоматі», без відчуття сенсу?",
  ],
  selfEsteem: [
    "Як часто з'являлися сумніви в собі та своїх рішеннях?",
    "Як часто настрій залежав від того, що скажуть чи подумають інші?",
    "Як часто власні помилки викликали надмірну критику до себе?",
    "Як часто порівняння з іншими було не на вашу користь?",
  ],
  relationships: [
    "Як часто було важко сказати близьким про свої потреби?",
    "Як часто конфлікти чи непорозуміння не відпускали довше, ніж хотілося б?",
    "Як часто відчувалася самотність навіть поруч з іншими людьми?",
    "Як часто було важко довіритися людям або відкритися?",
  ],
  motivation: [
    "Як часто було важко почати справи, навіть важливі?",
    "Як часто бракувало енергії чи бажання щось робити?",
    "Як часто було незрозуміло, заради чого старатися?",
    "Як часто справи відкладалися, хоча було зрозуміло, що вони важливі?",
  ],
};

/** 1 screening question per state — the most telling sign. */
export const SCREEN: Record<PrimaryStateId, string> = {
  anxiety: "Як часто турбували тривожні думки чи неспокій?",
  stress: "Як часто навантаження здавалося більшим, ніж вдається витримати?",
  burnout: "Як часто втома не минала навіть після відпочинку?",
  selfEsteem: "Як часто з'являлося незадоволення собою?",
  relationships: "Як часто стосунки з близькими були джерелом напруги?",
  motivation: "Як часто бракувало бажання щось робити?",
};

export const IMPACT_QUESTION = "Наскільки ваш стан заважав сну, роботі, навчанню чи стосункам?";

export const STATE_ORDER: PrimaryStateId[] = ["anxiety", "stress", "burnout", "selfEsteem", "relationships", "motivation"];

/**
 * The questions for this person: core ones of the chosen state(s) first, then one screening question for each other
 * state, then the impact question. 10 questions for one chosen state, 13 for two.
 */
export function buildQuestionnaire(primary: PrimaryStateId, secondary: PrimaryStateId | null = null): Question[] {
  const chosen = secondary && secondary !== primary ? [primary, secondary] : [primary];
  const out: Question[] = [];
  for (const s of chosen) {
    CORE[s].forEach((q, i) => out.push({ id: `${s}-${i + 1}`, category: s, kind: "core", lead: LEAD, question: q, answers: answersFor(s, FREQUENCY) }));
  }
  for (const s of STATE_ORDER.filter((x) => !chosen.includes(x))) {
    out.push({ id: `${s}-screen`, category: s, kind: "screen", lead: LEAD, question: SCREEN[s], answers: answersFor(s, FREQUENCY) });
  }
  out.push({ id: "impact", category: "impact", kind: "impact", lead: LEAD, question: IMPACT_QUESTION, answers: answersFor("impact", IMPACT) });
  return out;
}
