// PREVIEW ONLY: five empty meditation cards so the catalog can be judged with more than one card. They exist
// only in the development build (see MeditationsCatalogPage), have no audio behind them, cannot be played or
// bookmarked, and are not part of the real `meditations` list. Delete this file with its import when real
// meditations are added.
import type { Meditation } from "./meditations.ts";

export const DEMO_MEDITATION_PREFIX = "demo-";

const base = { audioUrl: "", offlineDownloadEnabled: false, hasEmbeddedMusic: false } as const;
const make = (id: string, title: string, durationMinutes: number, format: Meditation["format"], tags: string[], description: string, whenToUse: string[]): Meditation => ({
  ...base,
  id: `${DEMO_MEDITATION_PREFIX}${id}`,
  title,
  durationMinutes,
  duration: `${durationMinutes} хв`,
  format,
  tags,
  description,
  whenToUse,
});

export const demoMeditations: Meditation[] = [
  make("breath-478", "Дихання 4-7-8 перед сном", 6, "guided", ["stress", "anxiety"], "Повільне дихання з ведучим, щоб тіло зрозуміло: настав час відпочивати.", ["не можете заснути через тривожні думки", "тіло напружене після насиченого дня"]),
  make("body-scan", "Сканування тіла", 12, "guided", ["stress", "burnout"], "Покроково проходимо тілом від ніг до голови, помічаючи напругу й відпускаючи її.", ["відчуваєте втому, яку важко пояснити", "хочете повернутися до відчуттів у тілі"]),
  make("morning-light", "Ранкове світло", 5, "minimal", ["motivation"], "Коротка практика з кількома підказками на тлі музики: м’який початок дня.", ["прокидаєтесь без сил", "хочете почати день спокійно"]),
  make("self-kindness", "Лагідність до себе", 9, "guided", ["selfEsteem", "relationships"], "Практика турботи про себе: кілька фраз підтримки, які можна повторити будь-коли.", ["суворо критикуєте себе", "після важкої розмови з близькою людиною"]),
  make("silent-rain", "Тиша і дощ", 15, "silent", ["stress", "burnout"], "Майже в тиші: звуки дощу та кілька спокійних сигналів на початку й наприкінці.", ["потрібна довша пауза без слів", "любите медитувати у власному ритмі"]),
];
