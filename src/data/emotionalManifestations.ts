import type { PrimaryStateId } from "../store/funnelStore.ts";

// "Як це може проявлятися" — 4-5 concrete, everyday observations per
// Primary State (2026-09-11, per Sasha's Emotional Profile spec). Kept
// at the STATE level, not per intensity — the four intensities of a
// state already share the same underlying shape (see stateProfiles.ts's
// `explanation`/`insight` fields for each), so a separate 5-item list
// per intensity would just repeat itself with softer/harder adjectives
// rather than saying anything genuinely different. Deliberately soft,
// non-clinical phrasing ("може", never "у вас є") — the profile page
// itself adds the "може проявлятися" framing once in the section
// header, so these read as short observations underneath it, the same
// register as Sasha's own worked example for "Емоційне вигорання".
//
// This is authored product copy, same category as stateProfiles.ts —
// not something derived from data, because there is no structured data
// this could come from. Editable here independently of the engineering
// around it.
export const emotionalManifestations: Record<PrimaryStateId, string[]> = {
  anxiety: [
    "важче зупинити потік тривожних думок",
    "складно розслабитися навіть у спокійні моменти",
    "тіло тримає напругу без явної причини",
    "сон стає більш поверхневим",
    "звичні рішення даються складніше",
  ],
  stress: [
    "навіть прості справи вимагають більше зусиль",
    "складніше перемикатися між задачами",
    "відпочинок не завжди відчувається як відпочинок",
    "частіше зʼявляється дратівливість у дрібницях",
    "концентрація знижується ближче до вечора",
  ],
  burnout: [
    "важче відновлювати енергію навіть після відпочинку",
    "складно зосередитися на звичних справах",
    "знижується мотивація",
    "хочеться менше спілкуватися",
    "навіть прості завдання відчуваються виснажливими",
  ],
  selfEsteem: [
    "власні досягнення здаються недостатніми",
    "думка інших людей впливає сильніше, ніж хотілося б",
    "помилки довго не відпускають",
    "складно визнавати власні сильні сторони",
    "порівняння себе з іншими зʼявляється частіше",
  ],
  relationships: [
    "складніше відкрито говорити про свої потреби",
    "непорозуміння залишають довгий емоційний слід",
    "зʼявляється бажання відсторонитися від близьких людей",
    "очікування від інших частіше не виправдовуються",
    "конфлікти переживаються довше, ніж хотілося б",
  ],
  motivation: [
    "складніше почати навіть важливі справи",
    "звичні цілі здаються менш значущими",
    "рішення частіше відкладаються на потім",
    "бракує відчуття «навіщо це все»",
    "натхнення зʼявляється рідше, ніж раніше",
  ],
};
