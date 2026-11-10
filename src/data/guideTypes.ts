import type { IconName } from "../components/ui/Icon";
// The guide taxonomy an author picks from when creating a guide
// (2026-09-09, per Sasha's explicit product spec — "Автор при
// створенні вибирає: Тип гайда... І це потрібно закласти в архітектуру
// зараз, навіть якщо MVP буде простіше"). There is no real author-side
// guide-creation screen yet (guides are still static data/guides.ts
// content, same limitation `guide_authors`/AskAuthorBox already work
// around) — this file is the data-model side of that promise, ready
// for whenever the actual Guide Builder gets built, plus real
// participant-facing rendering for the one type that's genuinely a
// different EXPERIENCE, not just a label: SOS Guide (see
// GuideSOSView.tsx and Guide's own `sos` field in data/guides.ts).
//
// Deliberately separate from the pre-existing `type`/`category` fields
// on Guide (data/guides.ts) — those are free-text FORMAT labels
// ("PDF-гайд", "Checklist", "Mini guide"...) that drive
// GuidesCatalogPage's existing sidebar filter and predate this spec.
// This is a new, closed, author-facing axis about how long a guide
// takes and what kind of moment it's for — not a redesign of that
// filter.
export type GuideType = "quick" | "practical" | "deep" | "sos" | "workbook";

export type GuideTypeInfo = {
  label: string;
  durationLabel: string;
  description: string;
  icon: IconName;
};

// Order matches exactly how Sasha listed them — the order an author's
// type picker should show them in, whenever that picker gets built.
export const guideTypeOrder: GuideType[] = ["quick", "practical", "deep", "sos", "workbook"];

export const guideTypeInfo: Record<GuideType, GuideTypeInfo> = {
  quick: {
    label: "Швидкий гайд",
    durationLabel: "2–5 хв",
    description: "Коротко й по суті — головна думка за кілька хвилин.",
    icon: "bolt",
  },
  practical: {
    label: "Практичний гайд",
    durationLabel: "5–15 хв",
    description: "Покроковий інструмент, який можна одразу застосувати.",
    icon: "compass",
  },
  deep: {
    label: "Розгорнутий гайд",
    durationLabel: "15+ хв",
    description: "Глибоке занурення в тему — контекст, нюанси, повна картина.",
    icon: "guide",
  },
  // The one type Sasha explicitly called out as its own product-level
  // experience, not just a duration label — see GuideSOSView.tsx.
  sos: {
    label: "SOS-гайд",
    durationLabel: "прямо зараз",
    description: "Для моменту, коли допомога потрібна негайно — без читання, одразу дія.",
    icon: "lifebuoy",
  },
  workbook: {
    label: "Робочий зошит",
    durationLabel: "з вправами",
    description: "Гайд із вправами та полями для заповнення.",
    icon: "note",
  },
};
