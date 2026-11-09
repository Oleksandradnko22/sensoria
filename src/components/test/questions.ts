export type Category =
  | "anxiety"
  | "burnout"
  | "selfEsteem"
  | "relationships"
  | "motivation"
  | "stress"
  | "emotionalBalance"
  | "innerPressure"

export type Question = {
  id: number;

  question: string;

  answers: {
    text: string;

    scores: Partial<Record<Category, number>>;
  }[];
};

// The real shape of a submitted assessment answer (RFC-004). Replaces the
// `any[]` that used to flow from TestPage through calculateResults, and
// replaces `FunnelAnswer`, which never actually matched what the UI
// produced (it was missing `scores` and nothing ever populated it with a
// real `questionId`).
export type AssessmentAnswer = {
  questionId: number;
  answerIndex: number;
  scores: Partial<Record<Category, number>>;
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
    const scores: Partial<Record<Category, number>> = {};

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
      "Наскільки часто ви відкладаєте відпочинок через справи?",

    answers: createAnswers([
      "stress",
      "innerPressure",
    ]),
  },

  {
    id: 5,
    question:
      "Чи відчуваєте ви зараз нестачу мотивації або натхнення?",

    answers: createAnswers([
      "motivation",
    ]),
  },

  {
    id: 6,
    question:
      "Чи важко вам говорити про свої потреби у стосунках?",

    answers: createAnswers([
      "relationships",
    ]),
  },

  {
    id: 7,
    question:
      "Чи бувають у вас різкі емоційні перепади?",

    answers: createAnswers([
      "emotionalBalance",
    ]),
  },

  {
    id: 8,
    question:
      "Чи часто вам здається, що ви повинні робити більше, ніж можете зараз?",

    answers: createAnswers([
      "innerPressure",
      "stress",
    ]),
  },

  {
    id: 9,
    question:
      "Чи є у вас складність з мотивацією?",

    answers: createAnswers([
      "motivation",
      "burnout",
    ]),
  },

  {
    id: 10,
    question:
      "Чи переживаєте ви через конфлікти довше, ніж хотілося б?",

    answers: createAnswers([
      "relationships",
      "anxiety",
    ]),
  },

  {
    id: 11,
    question:
      "Чи буває вам складно відчувати спокій?",

    answers: createAnswers([
      "stress",
      "anxiety",
    ]),
  },

  {
    id: 12,
    question:
      "Чи важко вам дозволяти собі помилки?",

    answers: createAnswers([
      "selfEsteem",
      "innerPressure",
    ]),
  },

  {
    id: 13,
    question:
      "Чи часто ви відчуваєте емоційну нестабільність?",

    answers: createAnswers([
      "emotionalBalance",
    ]),
  },

  {
    id: 14,
    question:
      "Чи є у вас відчуття, що ви давно не відновлювались по-справжньому?",

    answers: createAnswers([
      "burnout",
      "emotionalBalance",
    ]),
  },

 {
  id: 15,
  question:
    "Чи часто вам бракує сил навіть після відпочинку?",

  answers: createAnswers([
    "burnout",
    "stress",
  ]),
},
];