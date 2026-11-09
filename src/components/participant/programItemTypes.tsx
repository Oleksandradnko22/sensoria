// Per-type presentation of a lesson (icon, label, tint) shared by the program
// screens — moved out of ProgramExperience.tsx unchanged (2026-10-07).
import type { SVGProps } from "react";
import type { ContentItem } from "../../data/contentTypes";
import {
  TextItemIcon,
  VideoItemIcon,
  AudioItemIcon,
  ImageItemIcon,
  PdfItemIcon,
  ChecklistItemIcon,
  MixedItemIcon,
} from "./lessonIcons";

export const typeIconComponent: Record<ContentItem["type"], (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  text: TextItemIcon,
  video: VideoItemIcon,
  audio: AudioItemIcon,
  image: ImageItemIcon,
  pdf: PdfItemIcon,
  checklist: ChecklistItemIcon,
  mixed: MixedItemIcon,
};

// Real content label per type instead of a generic "Урок" — an item is
// "Відео", "Практика", "Гайд" etc., never a one-size-fits-all lesson.
export const typeLabel: Record<ContentItem["type"], string> = {
  text: "Матеріал",
  video: "Відео",
  audio: "Аудіо",
  image: "Зображення",
  pdf: "PDF",
  checklist: "Практика",
  mixed: "Матеріал",
};

// Soft per-type tint for the compact item thumbnail — a calm way to
// visually tell content types apart without real cover images.
export const typeTint: Record<ContentItem["type"], string> = {
  text: "bg-slate-100 text-slate-500",
  video: "bg-blue-50 text-blue-500",
  audio: "bg-purple-50 text-purple-500",
  image: "bg-amber-50 text-amber-600",
  pdf: "bg-rose-50 text-rose-500",
  checklist: "bg-emerald-50 text-emerald-600",
  mixed: "bg-indigo-50 text-indigo-500",
};
