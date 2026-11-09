// Text + progress for the overview's single "Продовжити" card, per content
// kind. Pure: callers pass in the already-resolved real progress values.
import { formatClock } from "./formatClock.ts";

export type PrimaryMetaInput =
  | {
      kind: "program";
      // null while the program's summary is unknown
      summary: { currentModuleIndex: number; totalModules: number; percent: number } | null;
    }
  | {
      kind: "meditation";
      // confirmed resumable position, or null
      positionSeconds: number | null;
      duration?: string;
    }
  | {
      kind: "guide";
      viewed: number;
      total: number;
      sizeLabel?: string;
    };

export type PrimaryMeta = { metaLine?: string; percent: number | null };

export function buildPrimaryMeta(input: PrimaryMetaInput): PrimaryMeta {
  if (input.kind === "program") {
    const s = input.summary;
    if (!s) return { percent: null };
    return {
      metaLine: `Модуль ${s.currentModuleIndex + 1} із ${s.totalModules} · ${s.percent}% завершено`,
      percent: s.percent,
    };
  }
  if (input.kind === "meditation") {
    return {
      metaLine:
        typeof input.positionSeconds === "number"
          ? `Зупинено на ${formatClock(input.positionSeconds)}`
          : input.duration,
      percent: null,
    };
  }
  const viewed = Math.min(input.viewed, input.total);
  return {
    metaLine:
      input.total > 0
        ? `Ви переглянули ${viewed} із ${input.total} розділів`
        : input.sizeLabel
        ? input.sizeLabel
        : undefined,
    percent: input.total > 0 ? Math.round((viewed / input.total) * 100) : null,
  };
}

// A program with a real computed 0% reads "Почати"; everything else
// "Продовжити" (a program can be the primary card as soon as any item is
// touched, while genuinely at 0%).
export function primaryActionVerb(kind: "program" | "meditation" | "guide", percent: number | null): "Почати" | "Продовжити" {
  return kind === "program" && percent === 0 ? "Почати" : "Продовжити";
}
