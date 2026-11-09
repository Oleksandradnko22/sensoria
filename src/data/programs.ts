// THE program type — one definition for the demo catalog, real authored
// programs (lib/publicContent.ts adds nothing to it but a required authorId),
// the catalog page, CourseCard, ProgramDetailPage and ProgramExperience.
// (2026-10-07: replaces the inferred type here, App.tsx's copy and the
// catalog page's own copy.)
import { programModules } from "./programModules.ts";
import { moduleCountLabel } from "../utils/moduleLabel.ts";

export type Program = {
  id: string;
  title: string;
  author: string;
  // A string everywhere ("0", "1500"); read it only through utils/price.ts.
  price: string;
  // Size of the program as a module count ("6 модулів") — programs are not limited by time, so never days.
  // Kept under the name `duration` for compatibility; empty when the module count is unknown.
  duration: string;
  description: string;
  benefits: string[];
  tags: string[];

  // Only real, published author content has these (demo programs omit them):
  // authorId is how ProgramDetailPage decides whether to offer "Написати
  // автору"; coverUrl falls back to the accent-gradient placeholder when absent.
  authorId?: string;
  coverUrl?: string;
  coverFocus?: import("../utils/coverFocus.ts").CoverFocus;
  // How many of the author's own materials are included in the program as free gift lessons.
  giftCount?: number;

  // Optional display/sort extras, never set on real data: the home carousel's
  // hand-written cards carry meta/recommended/createdAt (read by CourseCard);
  // `rating` feeds the catalog's "Рейтинг" sort, which is inert while nothing
  // sets it.
  meta?: string;
  recommended?: boolean;
  createdAt?: string;
  // When the program was added to the catalog (real programs only); feeds the «Нові» sort.
  // Separate from createdAt on purpose: that one drives the home carousel's «Новий» badge.
  addedAt?: string;
  rating?: number;
};

export const programs: Program[] = [

  {
  id: "healthy-balance",

  title:
    "Підтримка емоційного балансу",

  author:
    "Sensoria",

  price: "0",

  duration: moduleCountLabel(programModules["healthy-balance"]?.length),

  description:
    "Коротка програма для тих, хто хоче навчитись помічати емоційне виснаження раніше і підтримувати стабільність у щоденному житті.",

  benefits: [
    "Збереження емоційної стабільності",
    "Підтримка внутрішнього ресурсу",
    "Практики усвідомленості",
  ],

  tags: [
    "healthyBalance",
    ],
  },

  {
  id: "stress-course",

  title: "Робота зі стресом",

  author: "Андрій Коваленко",

  price: "1500",

  duration: moduleCountLabel(programModules["stress-course"]?.length),

  description:
    "Практична програма для тих, хто відчуває постійну напругу, вигорання або втрату енергії — про те, як розпізнавати стрес і повертати собі стабільний стан.",

  benefits: [
    "Зниження напруги",
    "Відновлення енергії",
    "Практики стабілізації",
  ],

  tags: [
    "stress",
    "burnout",
    "innerPressure",
    ],
  },

  {
    id: "self-esteem-course",

    title: "Здорова самооцінка",

    author: "Марія Шевченко",

    price: "0",

    duration: moduleCountLabel(programModules["self-esteem-course"]?.length),

description:
  "Програма про те, звідки береться самооцінка, чому внутрішній критик буває голоснішим за підтримку — і як це змінити.",

benefits: [
  "Формування здорової самооцінки",
  "Зниження самокритики",
  "Розвиток внутрішньої підтримки",
],

    tags: [
      "selfEsteem",
      "innerPressure",
    ],
  },

  {
    id: "relationships-course",

    title: "Здорові стосунки",

    author: "Анна Кравчук",

    price: "1800",

    duration: moduleCountLabel(programModules["relationships-course"]?.length),

description:
  "Про те, як будувати стосунки без злиття і без дистанції — особисті кордони, комунікація без звинувачень і робота з конфліктами.",

benefits: [
  "Покращення комунікації",
  "Формування особистих кордонів",
  "Здорові взаємини",
],

    tags: [
      "relationships",
      "emotionalBalance",
    ],
  },

  {
    id: "mindfulness-course",

    title: "Усвідомленість у житті",

    author: "Ігор Петренко",

    price: "900",

    duration: moduleCountLabel(programModules["mindfulness-course"]?.length),

description:
  "Курс про усвідомленість у щоденному житті — практики уваги до тіла, роботи з відволіканням і повернення в теперішній момент.",

benefits: [
  "Практики усвідомленості",
  "Зниження емоційного навантаження",
  "Покращення концентрації",
],

    tags: [
      "emotionalBalance",
      "awareness",
      "recovery",
    ],
  },
];
