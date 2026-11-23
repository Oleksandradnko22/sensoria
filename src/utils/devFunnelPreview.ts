// Dev-only: open a funnel step directly for the device preview (devices.html). `/start?devPage=result` fills the
// funnel with a sample run (state «Стрес», answer «Іноді» everywhere) and opens the personal result. Does nothing in
// the production build (import.meta.env.DEV is false there).
import { emotionalStates } from "../data/states";
import funnelStore from "../store/funnelStore";
import { buildQuestionnaire, type AssessmentAnswer } from "../components/test/questions";
import { calculateResults } from "./calculateResults";
import type { Page } from "./routes";

export function devFunnelPage(): Page | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  if (new URLSearchParams(window.location.search).get("devPage") !== "result") return null;
  const st = emotionalStates.find((s) => s.id === "stress");
  if (!st) return null;
  funnelStore.setSelectedState({ id: st.id, title: st.title, description: st.description });
  funnelStore.setSecondaryState(null);
  const answers: AssessmentAnswer[] = buildQuestionnaire("stress", null).map((q) => {
    const i = Math.min(1, q.answers.length - 1);
    return { questionId: q.id, answerIndex: i, kind: q.kind, scores: q.answers[i].scores };
  });
  calculateResults(funnelStore.selectedState, answers);
  return "result";
}
