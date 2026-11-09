// Reusable Emotional Profile data/model layer (2026-09-11, per Sasha's
// explicit spec — "создай reusable data/model layer emotionalProfile,
// який використовується і Dashboard, і Profile Page"). Deliberately NOT
// a new parallel result/assessment system — every function here reads
// from the existing, already-shipped assessment stack (funnelStore /
// lib/assessment.ts's SavedAssessment / data/stateProfiles.ts /
// utils/calculateResults.ts's supportingPatterns) and from the same
// real enrollment/session data the rest of the participant dashboard
// already reads. The only genuinely NEW piece of state this file
// introduces is a tiny "has this browser opened the profile page"
// localStorage flag — there is no existing signal for that anywhere,
// and it's exactly the kind of small, honest, swappable-for-a-real-
// backend-column mock layer Sasha's spec asks for.

import type { PrimaryStateId, Intensity } from "../store/funnelStore.ts";
import { categoryLabels } from "../data/categoryLabels.ts";
import { emotionalManifestations } from "../data/emotionalManifestations.ts";
import { enrollments } from "../data/participantDashboard.ts";
import { getAllSessionHistory } from "../utils/meditationSessionStore.ts";
import { hasSavedContent } from "./dashboardPriority.ts";
import { fetchAllReflections } from "./reflections.ts";
import { fetchAllMoodCheckIns } from "./moodCheckins.ts";
import { fetchAllMeditationMoodCheckIns } from "./meditationMoodCheckins.ts";

// Structurally satisfied by both funnelStore's `FunnelInsight` (session-
// only, no completedAt) and lib/assessment.ts's `SavedAssessment`
// (persisted, has completedAt) — every caller already has one or the
// other and can pass it straight through without reshaping it.
export type EmotionalProfileSource = {
  primaryState: PrimaryStateId;
  intensity: Intensity;
  primaryScore: number;
  secondaryState: PrimaryStateId | null;
  supportingPatterns: { category: string; normalizedScore: number }[];
  completedAt?: string;
};

// A calm, product-level label — never the funnel's own "Критичний"
// wording (RFC-001's Result page is written for someone mid-funnel who
// just finished a fast, energetic assessment; this page is a returning
// participant's quiet personal space, per Sasha's explicit "не медичний
// gauge" instruction).
export function getIntensityLabel(intensity: Intensity): string {
  switch (intensity) {
    case "low":
      return "Низька";
    case "moderate":
      return "Помірна";
    case "high":
      return "Висока";
    case "critical":
      return "Дуже висока";
  }
}

// "Що може впливати на ваш стан" — real data only. calculateResults.ts
// already does the honest work here (only categories scoring >=50% of
// their own max make it into supportingPatterns at all, capped at 2) —
// this just turns those category ids into the same human labels used
// everywhere else (categoryLabels). Never invents a factor that isn't
// backed by an actual elevated sub-score.
export function getInfluencingFactors(
  supportingPatterns: { category: string; normalizedScore: number }[]
): string[] {
  return supportingPatterns
    .map((p) => categoryLabels[p.category as keyof typeof categoryLabels])
    .filter((label): label is string => Boolean(label));
}

// "Як це може проявлятися" — see data/emotionalManifestations.ts's own
// header comment for why this is authored copy, not derived data.
export function getManifestations(primaryState: PrimaryStateId): string[] {
  return emotionalManifestations[primaryState];
}

export type StrengthSignals = {
  hasAssessment: boolean;
  hasObservations: boolean;
  hasStartedPractice: boolean;
  hasCompletedContent: boolean;
  hasSavedContent: boolean;
};

// "Що вже працює на вашу користь" — every line here is gated on a real,
// checkable fact about this person (Sasha's explicit "не випадкові
// компліменти" rule), never shown unconditionally. Capped at 4 so this
// stays a short, calm list even when every signal is true at once.
export function getStrengths(signals: StrengthSignals): string[] {
  const strengths: string[] = [];
  if (signals.hasAssessment) strengths.push("Ви звернули увагу на свій стан і пройшли оцінку.");
  if (signals.hasObservations) strengths.push("Ви помічаєте свій стан і зберігаєте спостереження про себе.");
  if (signals.hasStartedPractice) strengths.push("Ви вже почали робити перші кроки.");
  if (signals.hasCompletedContent) strengths.push("Ви доводите практики до завершення.");
  if (signals.hasSavedContent) strengths.push("Ви шукаєте способи допомогти собі й зберігаєте корисні матеріали.");
  return strengths.slice(0, 4);
}

export type JourneyStep = { id: string; label: string; done: boolean };

// "Ваш шлях" — the same four steps rendered both as the Dashboard's
// one-line summary and the Profile page's full checklist, computed
// exactly once so the two can never disagree with each other (Sasha's
// explicit "не дублювати логіку профілю в двох місцях" rule). The last
// step is never `done` — it's the forward-pointing action, not a
// checkmark, by definition.
//
// `nextActionLabel` (2026-09-11, per Sasha's explicit feedback — "людина
// не розуміє, який тут доступний крок"): the generic word "Наступний
// крок" told a person there WAS a next step without ever saying what it
// actually was. Callers with a concrete action in hand (the Profile
// page always does — either a real recommended resource or "пройти
// оцінку") pass its real name instead; the Dashboard's own bare count
// usage doesn't need this detail and can omit it.
export function getJourneySteps(signals: {
  hasAssessment: boolean;
  hasViewedProfile: boolean;
  hasStartedPractice: boolean;
  nextActionLabel?: string;
}): JourneyStep[] {
  return [
    { id: "assessment", label: "Оцінка стану", done: signals.hasAssessment },
    { id: "understanding", label: "Розуміння свого стану", done: signals.hasViewedProfile },
    { id: "practice", label: "Перша практика", done: signals.hasStartedPractice },
    { id: "next", label: signals.nextActionLabel ?? "Наступний крок", done: false },
  ];
}

// Real, derived — not fabricated: a genuine partial-progress enrollment
// OR at least one real meditation session (utils/meditationSessionStore.ts,
// actively recorded whenever someone presses play) both count as "you
// took a first real action," not just "you clicked a button once."
//
// `hasRealProgramActivity` (2026-09-21, Overview/Emotional Profile
// participation follow-up): programs no longer go through the static
// `enrollments` array for real membership (see
// context/ProgramParticipationContext.tsx) — IN_PROGRESS+0% is valid
// real activity there and would never satisfy the old
// `progressPercent > 0` check below, so the real program signal is
// computed by the caller (from the shared participation context) and
// passed in here, while guides/meditations keep reading their existing
// real signals unchanged (`enrollments` still carries real guide
// status via withRealGuideStatus, and meditation session history is
// read directly below).
export function hasStartedFirstPractice(hasRealProgramActivity: boolean): boolean {
  if (hasRealProgramActivity) return true;
  if (enrollments.some((e) => e.kind !== "program" && e.progressPercent > 0)) return true;
  try {
    return Object.keys(getAllSessionHistory()).length > 0;
  } catch {
    return false;
  }
}

// Same real-program-activity handoff as hasStartedFirstPractice above —
// `hasCompletedRealProgram` is computed by the caller from the shared
// participation context; guides/meditations keep reading their
// existing `enrollments`-backed completed status unchanged.
export function hasCompletedAnyContent(hasCompletedRealProgram: boolean): boolean {
  if (hasCompletedRealProgram) return true;
  return enrollments.some((e) => e.kind !== "program" && e.status === "completed");
}

// One boolean, orchestrating the same three real personal-record
// sources ParticipantReflections.tsx/ParticipantOverview.tsx already
// read (notes, program mood check-ins, meditation mood check-ins) —
// not a new data source, just a shared "does this person have ANY of
// these" check so the Profile page's strengths list doesn't need its
// own copy of this fetch orchestration.
export async function hasAnyObservations(userId: string): Promise<boolean> {
  try {
    const [notes, moods, medMoods] = await Promise.all([
      fetchAllReflections(userId),
      fetchAllMoodCheckIns(userId),
      fetchAllMeditationMoodCheckIns(userId),
    ]);
    return notes.length > 0 || moods.length > 0 || medMoods.length > 0;
  } catch {
    return false;
  }
}

export { hasSavedContent };

// "Розуміння свого стану" has no existing signal anywhere in the app —
// there is no page-view tracking today. This is the smallest honest
// stand-in: a per-browser flag, real (it genuinely reflects whether
// THIS browser opened the Emotional Profile page), not a hardcoded
// true/false. A future real backend would replace this with a proper
// `profile_views` row without any UI change — the page only ever reads
// hasViewedEmotionalProfile()/calls markEmotionalProfileViewed().
const PROFILE_VIEWED_KEY = "sensoria:emotionalProfileViewed";

export function hasViewedEmotionalProfile(): boolean {
  try {
    return localStorage.getItem(PROFILE_VIEWED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markEmotionalProfileViewed(): void {
  try {
    localStorage.setItem(PROFILE_VIEWED_KEY, "1");
  } catch {
    // Storage unavailable (private mode, quota) — this is a nice-to-have
    // checklist tick, not core functionality; fail silently.
  }
}

