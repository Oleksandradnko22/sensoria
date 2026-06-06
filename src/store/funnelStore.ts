export type FunnelState = {
  id: string;
  title: string;
  description: string;
};

export type FunnelAnswer = {
  questionId: number;
  answerIndex: number;
};

export type FunnelInsight = {
  primaryCategory: string;
  secondaryCategories: string[];
};

export type FunnelRecommendation = {
  programId: string;
};

type FunnelStore = {
  selectedState: FunnelState | null;

  answers: FunnelAnswer[];

  insight: FunnelInsight | null;

  recommendation: FunnelRecommendation | null;

  email: string | null;

  setSelectedState: (
    state: FunnelState
  ) => void;

  setAnswers: (
    answers: FunnelAnswer[]
  ) => void;

  setInsight: (
    insight: FunnelInsight
  ) => void;

  setRecommendation: (
    recommendation: FunnelRecommendation
  ) => void;

  setEmail: (
    email: string
  ) => void;

  reset: () => void;
};

const store: FunnelStore = {
  selectedState: null,

  answers: [],

  insight: null,

  recommendation: null,

  email: null,

  setSelectedState(state) {
    store.selectedState = state;
  },

  setAnswers(answers) {
    store.answers = answers;
  },

  setInsight(insight) {
    store.insight = insight;
  },

  setRecommendation(recommendation) {
    store.recommendation = recommendation;
  },

  setEmail(email) {
    store.email = email;
  },

  reset() {
    store.selectedState = null;

    store.answers = [];

    store.insight = null;

    store.recommendation = null;

    store.email = null;
  },
};

export default store;