// The STATIC (print / PDF-friendly) representation of a structured guide
// (2026-10-06). Pure data in → pure data out: no React, no browser, no
// interaction state. That is the whole point — the static version has to
// stay fully understandable and usable with JavaScript off and on paper.
//
//   interactive scale      → a numbered row 0 1 2 … 10 to circle
//   interactive checklist  → empty checkboxes
//   60-second timer        → numbered written instructions
//   private reflection     → a blank ruled writing area
//   decision tree          → readable "if … → then …" branches
//   action plan            → empty checkboxes with the same limit in words
//
// components/participant/GuideStaticRenderer.tsx only draws these;
// guideStatic.test.ts guards that no block type can come out empty.

import type { GuideBlockV2, GuideContent } from "./guideContent.ts";
import { groupIntoSections } from "./guideContent.ts";

export type StaticBlock =
  | { kind: "heading"; number: string; text: string; summary?: string }
  | { kind: "paragraphs"; paragraphs: string[] }
  | { kind: "callout"; tone: "calm" | "note" | "care"; title?: string; text: string }
  | { kind: "flow"; title?: string; steps: { label: string; text?: string }[]; caption?: string }
  | { kind: "checkboxes"; prompt: string; instructions?: string; items: string[] }
  | {
      kind: "number_scale";
      prompt: string;
      instructions: string;
      values: number[];
      lowLabel?: string;
      highLabel?: string;
    }
  | { kind: "writing_area"; prompt: string; lines: number }
  | { kind: "instructions"; title: string; intro?: string; steps: string[]; doneText: string }
  | { kind: "tree"; prompt: string; branches: { label: string; step: string }[] }
  | { kind: "image"; url: string; alt: string; caption?: string }
  | { kind: "divider" };

const DEFAULT_WRITING_LINES = 5;

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function numberRange(min: number, max: number): number[] {
  const values: number[] = [];
  for (let n = min; n <= max; n += 1) values.push(n);
  return values;
}

// "15 с" / "1 хв" — only used inside written practice instructions.
export function formatSeconds(seconds: number): string {
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} хв`;
  return `${seconds} с`;
}

export function toStaticBlock(block: GuideBlockV2): StaticBlock | null {
  switch (block.type) {
    case "heading":
      // Section numbers are applied by toStaticBlocks, which knows the order.
      return { kind: "heading", number: "", text: block.text, summary: block.summary };
    case "rich_text":
      return { kind: "paragraphs", paragraphs: splitParagraphs(block.text) };
    case "callout":
      return { kind: "callout", tone: block.tone ?? "calm", title: block.title, text: block.text };
    case "flow":
      return { kind: "flow", title: block.title, steps: block.steps, caption: block.caption };
    case "checklist":
      return {
        kind: "checkboxes",
        prompt: block.static?.prompt ?? block.prompt,
        instructions:
          block.static?.instructions ??
          (block.selection === "single" ? "Позначте один варіант." : "Позначте все, що підходить."),
        items: block.items.map((item) => item.label),
      };
    case "scale":
      return {
        kind: "number_scale",
        prompt: block.static?.prompt ?? block.prompt,
        instructions: block.static?.instructions ?? `Оцініть свій стан від ${block.min} до ${block.max}:`,
        values: numberRange(block.min, block.max),
        lowLabel: block.lowLabel,
        highLabel: block.highLabel,
      };
    case "reflection":
      return {
        kind: "writing_area",
        prompt: block.static?.prompt ?? block.prompt,
        lines: block.staticLines ?? DEFAULT_WRITING_LINES,
      };
    case "timer_practice":
      return {
        kind: "instructions",
        title: block.title,
        intro: block.static?.instructions ?? block.intro,
        steps: block.phases.map((phase) => `${phase.text} (≈ ${formatSeconds(phase.seconds)})`),
        doneText: block.doneText,
      };
    case "decision_tree":
      return {
        kind: "tree",
        prompt: block.static?.prompt ?? block.prompt,
        branches: block.branches.map((branch) => ({ label: branch.label, step: branch.step })),
      };
    case "action_plan":
      return {
        kind: "checkboxes",
        prompt: block.static?.prompt ?? block.prompt,
        instructions: block.static?.instructions ?? `Оберіть не більше ${block.max}.`,
        items: block.items.map((item) => item.label),
      };
    case "recommendation":
      // Links to other Sensoria content are a web-only affordance: the
      // printed/PDF version never carries them (and a section that was only
      // a recommendation disappears with it, see toStaticBlocks).
      return null;
    case "media":
      return { kind: "image", url: block.url, alt: block.alt, caption: block.caption };
    case "divider":
      return { kind: "divider" };
  }
}

export function toStaticBlocks(content: GuideContent): StaticBlock[] {
  const result: StaticBlock[] = [];
  for (const section of groupIntoSections(content)) {
    const body = section.blocks
      .map(({ block }) => toStaticBlock(block))
      .filter((b): b is StaticBlock => b !== null);
    // A section with nothing printable (e.g. only recommendations) is left
    // out whole, heading included; remaining headings are renumbered so the
    // printed document has no gap.
    if (body.length === 0) continue;
    if (section.heading) {
      const heading = toStaticBlock(section.heading);
      if (heading && heading.kind === "heading") {
        heading.number = String(result.filter((b) => b.kind === "heading").length + 1).padStart(2, "0");
        result.push(heading);
      }
    }
    result.push(...body);
  }
  return result;
}

// A readable plain-text rendering — used by tests to prove each block keeps
// its psychological content without any UI, and handy for exports.
export function staticToPlainText(blocks: StaticBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        lines.push("", `${block.number} — ${block.text}`);
        break;
      case "paragraphs":
        block.paragraphs.forEach((p) => lines.push(p));
        break;
      case "callout":
        lines.push(block.title ? `${block.title}: ${block.text}` : block.text);
        break;
      case "flow":
        lines.push(block.steps.map((s) => s.label).join(" → "));
        break;
      case "checkboxes":
        lines.push(block.prompt);
        if (block.instructions) lines.push(block.instructions);
        block.items.forEach((item) => lines.push(`☐ ${item}`));
        break;
      case "number_scale":
        lines.push(block.prompt, block.instructions, block.values.join(" "));
        break;
      case "writing_area":
        lines.push(block.prompt, ...Array.from({ length: block.lines }, () => "______________________"));
        break;
      case "instructions":
        lines.push(block.title);
        if (block.intro) lines.push(block.intro);
        block.steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
        lines.push(block.doneText);
        break;
      case "tree":
        lines.push(block.prompt);
        block.branches.forEach((b) => lines.push(`Якщо: ${b.label} → ${b.step}`));
        break;
      case "image":
        lines.push(block.caption ?? block.alt);
        break;
      case "divider":
        lines.push("—");
        break;
    }
  }
  return lines.join("\n").trim();
}
