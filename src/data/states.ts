export type EmotionalState = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

export const emotionalStates: EmotionalState[] = [
  {
    id: "stress",
    title: "Стрес",
    description:
      "Відчуваю постійне напруження, перевантаження та складність з відпочинком.",
    icon: "⚡",
  },

  {
    id: "anxiety",
    title: "Тривожність",
    description:
      "Мені складно зупинити думки, розслабитися та відчути внутрішній спокій.",
    icon: "🌫️",
  },

  {
    id: "burnout",
    title: "Емоційне вигорання",
    description:
      "Я відчуваю втому, виснаження та нестачу внутрішніх ресурсів.",
    icon: "🕯️",
  },

  {
    id: "motivation",
    title: "Втрата мотивації",
    description:
      "Мені складно підтримувати інтерес, енергію та рухатися вперед.",
    icon: "🧭",
  },

  {
    id: "relationships",
    title: "Стосунки",
    description:
      "Є труднощі у взаєморозумінні, спілкуванні або близьких стосунках.",
    icon: "💞",
  },

  {
    id: "selfEsteem",
    title: "Самооцінка",
    description:
      "Я часто сумніваюся в собі або надто критично ставлюся до себе.",
    icon: "🌱",
  },
];