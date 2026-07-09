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

  intensity:
    | "low"
    | "moderate"
    | "high"
    | "critical";

  resultType:
    | "positive"
    | "neutral"
    | "negative";
};

export type FunnelUser = {
  name: string;
  email: string;
  password: string;
};

export type FunnelProgram = {
  id: string;
  title: string;
};

export type FunnelResults = Record<
  string,
  number
>;


type FunnelStore = {
  selectedState: FunnelState | null;

  answers: FunnelAnswer[];

  insight: FunnelInsight | null;

  user: FunnelUser | null;

program: FunnelProgram | null;

results: FunnelResults | null;

  setSelectedState: (
    state: FunnelState
  ) => void;

  setAnswers: (
    answers: FunnelAnswer[]
  ) => void;

  setInsight: (
    insight: FunnelInsight
  ) => void;

  setUser: (
  user: FunnelUser
) => void;

setProgram: (
  program: FunnelProgram
) => void;

setResults: (
  results: FunnelResults
) => void;

  reset: () => void;
};

const store: FunnelStore = {
  selectedState: null,

  answers: [],

  insight: null,

  user: null,

program: null,

results: null,

  setSelectedState(state) {
    store.selectedState = state;
  },

  setAnswers(answers) {
    store.answers = answers;
  },

  setInsight(insight) {
    store.insight = insight;
  },

  setUser(user) {
  store.user = user;
},

setProgram(program) {
  store.program = program;
},

setResults(results) {
  store.results = results;
},

  reset() {
    store.selectedState = null;

    store.answers = [];

    store.insight = null;

    store.user = null;

store.program = null;

store.results = null;
  },
};

export default store;

console.log("STORE CREATED", Math.random());