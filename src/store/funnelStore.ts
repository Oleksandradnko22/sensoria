import type { Category, AssessmentAnswer } from "../components/test/questions.ts";

export type FunnelState = {
  id: string;
  title: string;
  description: string;
};

// `FunnelAnswer` used to live here, but it never matched what the
// assessment actually produced (RFC-004). `AssessmentAnswer`, defined in
// questions.ts alongside `Category`/`Question`, is now the single real
// type for a submitted answer.

// The six emotional states a user can select on the State Selection screen.
// This is the only set of values `FunnelInsight.primaryState` can ever
// hold (RFC-001). The Result Engine locks onto whichever one the user
// picked and never reassigns it based on assessment answers.
export type PrimaryStateId =
  | "anxiety"
  | "stress"
  | "burnout"
  | "selfEsteem"
  | "relationships"
  | "motivation";

export type Intensity =
  | "low"
  | "moderate"
  | "high"
  | "critical";

// A secondary emotional signal detected from the assessment answers.
// Descriptive, not diagnostic — it enriches the insight but never
// redefines the user's Primary State (RFC-001).
export type SupportingPattern = {
  category: Category;
  normalizedScore: number;
};

export type FunnelInsight = {
  primaryState: PrimaryStateId;
  intensity: Intensity;
  supportingPatterns: SupportingPattern[];
  // The second state the user picked on State Selection, if any (that
  // screen allows choosing up to two). Purely descriptive — it does not
  // affect scoring, intensity, or which State Profile is shown. Today it
  // exists only to drive the trust-indicator circle's two-color gradient
  // on the Result page.
  secondaryState: PrimaryStateId | null;
  // The Primary State's actual normalized score (0-100, rounded) — the
  // same number that decided which Intensity bucket this result fell
  // into (see getIntensity in calculateResults.ts). Surfaced directly so
  // the Result page can show a real percentage instead of a stand-in for
  // the Intensity bucket.
  primaryScore: number;
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

export type FunnelResults = Record<string, number>;


type FunnelStore = {
  selectedState: FunnelState | null;

  // The second state picked on State Selection, if the user chose two.
  // Kept separate from `selectedState` deliberately: `selectedState`
  // remains the single thing that drives scoring/content everywhere it
  // already did (RFC-001 primary-state rules are untouched). This is
  // additive, descriptive-only data.
  secondaryState: FunnelState | null;

  answers: AssessmentAnswer[];

  insight: FunnelInsight | null;

  user: FunnelUser | null;

program: FunnelProgram | null;

results: FunnelResults | null;

  setSelectedState: (
    state: FunnelState
  ) => void;

  setSecondaryState: (
    state: FunnelState | null
  ) => void;

  setAnswers: (
    answers: AssessmentAnswer[]
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

// --- sessionStorage persistence -------------------------------------
//
// Fixes: refreshing the browser while on the Result page used to lose
// `insight` entirely, and ResultPage would silently render nothing
// (`if (!insight) return null`). Only the three fields needed to
// reconstruct the Result page are persisted — deliberately not all of
// FunnelStore:
//
// - `user` is excluded on purpose. It currently holds a plaintext
//   password (a separate, more serious issue than this fix — flagged,
//   not solved here) and has no reason to sit in sessionStorage even
//   once that's addressed.
// - `program` and `results` aren't read anywhere on the Result page and
//   are left out to keep the persisted payload minimal.
//
// sessionStorage (not localStorage) is deliberate: this is funnel-in-
// progress state, not something that should survive after the tab
// closes or leak across unrelated future sessions.

const SESSION_STORAGE_KEY = "sensoria:funnel";

type PersistedFunnelState = Pick<
  FunnelStore,
  "selectedState" | "secondaryState" | "answers" | "insight"
>;

function readPersistedState(): PersistedFunnelState | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedFunnelState;
  } catch {
    // sessionStorage can throw (private browsing, storage disabled by
    // the user/organization, etc.) — persistence is a nice-to-have, not
    // a hard dependency. Fail silently and just don't rehydrate.
    return null;
  }
}

function persistState() {
  try {
    const payload: PersistedFunnelState = {
      selectedState: store.selectedState,
      secondaryState: store.secondaryState,
      answers: store.answers,
      insight: store.insight,
    };
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(payload)
    );
  } catch {
    // Ignore — see readPersistedState.
  }
}

function clearPersistedState() {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore.
  }
}

const persisted =
  typeof window !== "undefined" ? readPersistedState() : null;

const store: FunnelStore = {
  selectedState: persisted?.selectedState ?? null,

  secondaryState: persisted?.secondaryState ?? null,

  answers: persisted?.answers ?? [],

  insight: persisted?.insight ?? null,

  user: null,

program: null,

results: null,

  setSelectedState(state) {
    store.selectedState = state;
    persistState();
  },

  setSecondaryState(state) {
    store.secondaryState = state;
    persistState();
  },

  setAnswers(answers) {
    store.answers = answers;
    persistState();
  },

  setInsight(insight) {
    store.insight = insight;
    persistState();
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

    store.secondaryState = null;

    store.answers = [];

    store.insight = null;

    store.user = null;

store.program = null;

store.results = null;

    clearPersistedState();
  },
};

export default store;