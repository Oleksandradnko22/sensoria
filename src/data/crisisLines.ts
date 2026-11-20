// THE list of crisis lines: the «Допомога в кризі» page and the crisis window in «Публікації» both read it, so a
// paused number cannot stay in one place (safety review 21.11.2026, С7). Re-check every quarter (docs/legal/crisis-help-edits.md).
// Not listed: Lifeline Ukraine 7333 (paused).
import type { IconName } from "../components/ui/Icon";

export const CHECKED_AT = "20.11.2026"; // test calls 20.11.2026; next check — by 20.02.2027

export type Emergency = { phone: string; title: string; when: string; primary?: boolean };
export type Line = { forWhom: string; icon: IconName; name: string; phones: { number: string; hint?: string }[]; hours: string; note?: string };

export const EMERGENCY: Emergency[] = [
  { phone: "112", title: "Екстрені служби", when: "Загроза життю, думки про самоушкодження, небезпека для вас чи інших", primary: true },
  { phone: "103", title: "Швидка медична допомога", when: "Погано з самопочуттям, потрібен лікар" },
];

export const SUPPORT: Line[] = [
  {
    forWhom: "Для всіх",
    icon: "heart",
    name: "Всеукраїнський телефон довіри",
    phones: [{ number: "0 800 501 701" }],
    hours: "Безкоштовно",
    note: "Рекомендує МОЗ України людям із суїцидальними думками та їхнім близьким.",
  },
  {
    forWhom: "Для всіх",
    icon: "lifebuoy",
    name: "Лінія емоційної підтримки МОМ",
    phones: [{ number: "0 800 211 444" }],
    hours: "Безкоштовно",
    note: "Міжнародна організація з міграції, номер із переліку МОЗ України.",
  },
  {
    forWhom: "Для чоловіків",
    icon: "comment",
    name: "Лінія психологічної підтримки «Ла Страда-Україна»",
    phones: [{ number: "2345", hint: "з мобільного" }],
    hours: "Щодня 14:00–6:00 · безкоштовно",
  },
  {
    forWhom: "Насильство, торгівля людьми",
    icon: "shield",
    name: "Національна гаряча лінія «Ла Страда-Україна»",
    phones: [{ number: "116 123", hint: "з мобільного" }, { number: "0 800 500 335", hint: "з будь-якого телефону" }],
    hours: "Цілодобово · безкоштовно",
    note: "Психологи та юристи.",
  },
];


/** the short list for the crisis window: support lines first, then emergency */
export const CRISIS_SHORT: { phone: string; name: string; note: string }[] = [
  ...SUPPORT.flatMap((l) => l.phones.map((ph) => ({ phone: ph.number, name: l.name, note: [l.forWhom, l.hours].join(" · ") }))),
  ...EMERGENCY.map((e) => ({ phone: e.phone, name: e.title, note: e.when })),
];
