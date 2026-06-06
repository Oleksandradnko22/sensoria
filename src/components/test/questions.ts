export type Category =
  | "anxiety"
  | "burnout"
  | "selfEsteem"
  | "relationships"
  | "motivation"
  | "stress"
  | "emotionalBalance"
  | "innerPressure"
  | "resilience"
  | "balance"
  | "awareness"
  | "recovery"
  | "adaptability";

export type Question = {
  id: number;

  question: string;

  answers: {
    text: string;

    scores: Partial<Record<Category, number>>;
  }[];
};

const scale = [
  {
    text: "Майже ніколи",
    value: 0,
  },

  {
    text: "Іноді",
    value: 1,
  },

  {
    text: "Часто",
    value: 2,
  },

  {
    text: "Майже постійно",
    value: 3,
  },
];

function createAnswers(
  categories: Category[]
) {
  return scale.map((item) => {
    const scores: Partial<
      Record<Category, number>
    > = {};

    categories.forEach((cat) => {
      scores[cat] = item.value;
    });

    return {
      text: item.text,
      scores,
    };
  });
}

export const questions: Question[] = [
  {
    id: 1,
    question:
      "Як часто вам складно зупинити потік думок?",

    answers: createAnswers([
      "anxiety",
      "stress",
    ]),
  },

  {
    id: 2,
    question:
      "Наскільки часто ви відчуваєте емоційне виснаження?",

    answers: createAnswers([
      "burnout",
      "stress",
    ]),
  },

  {
    id: 3,
    question:
      "Чи залежить ваш настрій від думки інших людей?",

    answers: createAnswers([
      "selfEsteem",
    ]),
  },

  {
    id: 4,
    question:
      "Чи складно вам розслабитись навіть у спокійній обстановці?",

    answers: createAnswers([
      "anxiety",
      "innerPressure",
    ]),
  },

  {
    id: 5,
    question:
      "Наскільки часто ви відкладаєте відпочинок через справи?",

    answers: createAnswers([
      "stress",
      "innerPressure",
    ]),
  },

  {
    id: 6,
    question:
      "Чи буває у вас відчуття втрати напрямку у житті?",

    answers: createAnswers([
      "motivation",
    ]),
  },

  {
    id: 7,
    question:
      "Чи важко вам говорити про свої потреби у стосунках?",

    answers: createAnswers([
      "relationships",
    ]),
  },

  {
    id: 8,
    question:
      "Чи бувають у вас різкі емоційні перепади?",

    answers: createAnswers([
      "emotionalBalance",
    ]),
  },

  {
    id: 9,
    question:
      "Чи часто ви відчуваєте внутрішній тиск?",

    answers: createAnswers([
      "innerPressure",
      "stress",
    ]),
  },

  {
    id: 10,
    question:
      "Чи складно вам перестати аналізувати ситуації?",

    answers: createAnswers([
      "anxiety",
      "emotionalBalance",
    ]),
  },

  {
    id: 11,
    question:
      "Наскільки часто ви відчуваєте втому без причини?",

    answers: createAnswers([
      "burnout",
    ]),
  },

  {
    id: 12,
    question:
      "Чи часто ви критикуєте себе?",

    answers: createAnswers([
      "selfEsteem",
      "innerPressure",
    ]),
  },

  {
    id: 13,
    question:
      "Чи є у вас складність з мотивацією?",

    answers: createAnswers([
      "motivation",
      "burnout",
    ]),
  },

  {
    id: 14,
    question:
      "Чи переживаєте ви через конфлікти довше, ніж хотілося б?",

    answers: createAnswers([
      "relationships",
      "anxiety",
    ]),
  },

  {
    id: 15,
    question:
      "Чи буває вам складно відчувати спокій?",

    answers: createAnswers([
      "stress",
      "anxiety",
    ]),
  },

  {
    id: 16,
    question:
      "Чи є у вас відчуття внутрішнього перевантаження?",

    answers: createAnswers([
      "burnout",
      "stress",
    ]),
  },

  {
    id: 17,
    question:
      "Чи важко вам дозволяти собі помилки?",

    answers: createAnswers([
      "selfEsteem",
      "innerPressure",
    ]),
  },

  {
    id: 18,
    question:
      "Чи часто ви відчуваєте емоційну нестабільність?",

    answers: createAnswers([
      "emotionalBalance",
    ]),
  },

  {
    id: 19,
    question:
      "Чи буває вам складно бути наодинці зі своїми думками?",

    answers: createAnswers([
      "anxiety",
      "stress",
    ]),
  },

  {
    id: 20,
    question:
      "Чи є у вас відчуття, що ви давно не відновлювались по-справжньому?",

    answers: createAnswers([
      "burnout",
      "emotionalBalance",
    ]),
  },

  {
  id: 21,
  question:
    "Чи вдається вам достатньо швидко відновлюватись після складних періодів?",

  answers: [
    {
      text: "Так, зазвичай досить легко",
      scores: {
        resilience: 3,
        recovery: 3,
        balance: 2,
      },
    },

    {
      text: "Частково",
      scores: {
        resilience: 2,
        recovery: 1,
      },
    },

    {
      text: "Скоріше ні",
      scores: {
        burnout: 2,
        stress: 2,
      },
    },

    {
      text: "Майже ніколи",
      scores: {
        burnout: 3,
        stress: 3,
      },
    },
  ],
},

{
  id: 22,
  question:
    "Наскільки добре ви розумієте свої емоції та стан?",

  answers: [
    {
      text: "Дуже добре",
      scores: {
        awareness: 3,
        balance: 2,
      },
    },

    {
      text: "Достатньо добре",
      scores: {
        awareness: 2,
      },
    },

    {
      text: "Іноді мені складно",
      scores: {
        anxiety: 1,
        emotionalBalance: 1,
      },
    },

    {
      text: "Майже не розумію",
      scores: {
        anxiety: 3,
        emotionalBalance: 2,
      },
    },
  ],
},

{
  id: 23,
  question:
    "Як ви зазвичай реагуєте на зміни або нові ситуації?",

  answers: [
    {
      text: "Досить спокійно",
      scores: {
        adaptability: 3,
        resilience: 2,
      },
    },

    {
      text: "Потрібен час на адаптацію",
      scores: {
        adaptability: 1,
      },
    },

    {
      text: "Часто хвилююсь",
      scores: {
        anxiety: 2,
      },
    },

    {
      text: "Дуже важко переношу зміни",
      scores: {
        anxiety: 3,
        stress: 2,
      },
    },
  ],
},
];