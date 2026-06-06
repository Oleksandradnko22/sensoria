export type Archetype = {
  id: string;

  title: string;

  emoji: string;

  description: string;

  matches: string[];

  categories: string[];

  traits: string[];
};

export const archetypes: Archetype[] = [
  {
    id: "overloaded-achiever",

    title: "Перевантажений achiever",

    emoji: "⚡",

    description:
      "Ви звикли тримати все під контролем та постійно рухатись вперед, але організм може вже знаходитись у стані перевантаження.",

    matches: ["stress", "innerPressure"],

    traits: [
      "Високі вимоги до себе",
      "Складність з відпочинком",
      "Постійна внутрішня напруга",
    ],

    categories: ["stress", "innerPressure", "burnout"

    ],
  },

  {
    id: "emotional-analyst",

    title: "Емоційний аналітик",

    emoji: "🧠",

    description:
      "Ви схильні багато аналізувати свої думки та емоції, через що мозку буває складно переключитись та відпочити.",

    matches: ["anxiety", "emotionalBalance"],

    traits: [
      "Схильність до overthinking",
      "Глибока рефлексія",
      "Підвищена тривожність",
    ],

    categories: ["anxiety", "emotionalBalance", "awareness"

    ],
  },

  {
    id: "exhausted-perfectionist",

    title: "Виснажений перфекціоніст",

    emoji: "🕯️",

    description:
      "Ви можете бути дуже вимогливими до себе та власних результатів, через що емоційний ресурс поступово виснажується.",

    matches: ["burnout", "selfEsteem", "stress"],

    traits: [
      "Самокритика",
      "Страх помилок",
      "Емоційне виснаження",
    ],

    categories: ["burnout", "selfEsteem", "recovery"

    ],
  },

  {
    id: "sensitive-connector",

    title: "Чутливий комунікатор",

    emoji: "💞",

    description:
      "Для вас дуже важливі емоційні зв’язки та атмосфера у стосунках, через що конфлікти та дистанція можуть сильно впливати на стан.",

    matches: ["relationships", "emotionalBalance"],

    traits: [
      "Висока емоційна чутливість",
      "Потреба у близькості",
      "Переживання через стосунки",
    ],

    categories: ["relationships", "emotionalBalance", "awareness"

    ],
  },

{
  id: "reflective-explorer",

  title: "Рефлексивний дослідник",

  emoji: "🌙",

  description:
    "Ви схильні глибоко аналізувати свої думки та внутрішній стан. Вам важливо краще розуміти себе та власні емоції.",

  matches: [
    "emotionalBalance",
    "motivation",
  ],

  traits: [
    "Глибока рефлексія",
    "Самоаналіз",
    "Пошук внутрішнього балансу",
  ],

    categories: ["emotionalBalance", "motivation", "awareness"

    ],
},

{
  id: "balanced-adapter",

  title: "Гнучкий адаптер",

  emoji: "🌿",

  description:
    "Ви достатньо добре адаптуєтесь до змін та вмієте відновлювати баланс навіть у стресових ситуаціях.",

  matches: [
    "motivation",
    "relationships",
  ],

  traits: [
    "Емоційна гнучкість",
    "Стійкість",
    "Здатність адаптуватись",
  ],
    categories: ["motivation", "relationships", "resilience"

    ],
},

{
  id: "sensitive-creator",

  title: "Чутливий творець",

  emoji: "🎨",

  description:
    "Ви емоційно глибока людина, яка тонко відчуває атмосферу та внутрішні переживання.",

  matches: [
    "relationships",
    "selfEsteem",
  ],

  traits: [
    "Емоційна глибина",
    "Чутливість",
    "Творче мислення",
  ],
    categories: ["relationships", "selfEsteem", "awareness"

    ],
},

{
  id: "emotionally-balanced",

  title: "Емоційно збалансований",

  emoji: "🌿",

  description:
    "Ваш емоційний стан зараз виглядає достатньо стабільним. Ви вмієте адаптуватись до навантаження та відновлювати внутрішній баланс.",

  matches: [
    "balance",
    "recovery",
    "resilience",
  ],

  traits: [
    "Внутрішня стабільність",
    "Гнучкість",
    "Здатність до відновлення",
  ],
    categories: ["balance", "recovery", "resilience"

    ],
},
];
