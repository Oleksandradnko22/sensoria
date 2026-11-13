// "Is this program ready to leave draft?" (2026-10-06). Pure, so it is tested
// without a database. A DRAFT may be saved incomplete; sending to moderation
// or publishing requires everything below.
//
// Accessibility rule (same as meditations): a video or audio lesson needs an
// AUTHOR-written transcript. It is never generated automatically as the final
// text.

import type { AuthoredContent, AuthoredItem, AuthoredModule } from "../data/authorDashboard.ts";
import { CONTENT_LIMITS, descriptionProblem, lengthProblem, titleProblem } from "./contentLimits.ts";
import { isYoutubeUrl } from "./youtube.ts";
import { aiDeclaration } from "./contentLabels.ts";
import { benefitsFromTags, benefitsProblem } from "./programBenefits.ts";
import { categoriesProblem } from "./programCategories.ts";
import { meditationWhenProblems } from "./contentSteps.ts";
import { guideBlocksProblems } from "./guideBuilder.ts";
import { MAX_LESSONS_PER_MODULE, MAX_LESSONS_TOTAL, MAX_MODULES } from "./programModule.ts";
import { checklistItems, checklistProblem } from "./lessonChecklist.ts";
import { isHighRisk, RISK_MESSAGE } from "./riskTopics.ts";
import { SPECIALIST_WARNING_MESSAGE, warningNeedsSpecialist } from "./contentWarning.ts";

export const MIN_TRANSCRIPT_CHARS = 20;

export type PublishProblem = { code: string; message: string };

const has = (v: string | undefined | null) => Boolean(v && v.trim());

function lessonLabel(m: AuthoredModule, mi: number, it: AuthoredItem, ii: number): string {
  return `Модуль ${mi + 1} «${m.title.trim() || "без назви"}», урок ${ii + 1}${it.title.trim() ? ` «${it.title.trim()}»` : ""}`;
}

export function needsTranscript(item: Pick<AuthoredItem, "type" | "videoUrl" | "audioUrl">): boolean {
  return item.type === "video" || item.type === "audio" || has(item.videoUrl) || has(item.audioUrl);
}

// What a lesson still lacks (also used to flag lessons in the editor).
export function lessonChecks(it: AuthoredItem): { code: string; text: string }[] {
  const out: { code: string; text: string }[] = [];
  if (!has(it.title)) out.push({ code: "lesson-title", text: "вкажіть назву уроку." });
  else {
    const p = lengthProblem(it.title, CONTENT_LIMITS.lessonTitle, "назва уроку", true);
    if (p) out.push({ code: "lesson-title", text: p });
  }
  if (has(it.body)) {
    const p = lengthProblem(it.body!, CONTENT_LIMITS.lessonBody, "текст уроку", true);
    if (p) out.push({ code: "lesson-body", text: p });
  }
  // every lesson has a video (a gift lesson is the author's meditation or guide instead); audio, PDF, image are optional
  if (!it.materialId && !has(it.videoUrl)) out.push({ code: "lesson-video", text: "додайте посилання на відео YouTube." });
  else if (has(it.videoUrl) && !isYoutubeUrl(it.videoUrl!)) out.push({ code: "lesson-video", text: "посилання на відео має бути з YouTube (youtu.be/… або youtube.com/watch?v=…)." });
  if (it.type === "audio" && !has(it.audioUrl)) out.push({ code: "lesson-audio", text: "додайте аудіо." });
  if (it.type === "pdf" && !has(it.fileUrl)) out.push({ code: "lesson-file", text: "додайте файл." });
  if (it.type === "image" && !has(it.imageUrl)) out.push({ code: "lesson-image", text: "додайте зображення." });
  // the lesson text is optional: every lesson already has its video
  const cl = checklistItems(it.checklist).length > 0 || it.type === "checklist" ? checklistProblem(it.checklist) : null;
  if (cl) out.push({ code: "lesson-checklist", text: cl });
  if (it.practice) {
    const pr = it.practice;
    const pp = lengthProblem(pr.prompt, CONTENT_LIMITS.practicePrompt, "питання практики");
    if (pp) out.push({ code: "lesson-practice", text: pp });
    if (pr.type === "choice" || pr.type === "checkboxes") {
      const opts = (pr.options ?? []).map((o) => o.trim()).filter(Boolean);
      if (opts.length < 2) out.push({ code: "lesson-practice", text: "у практиці потрібно щонайменше 2 варіанти відповіді." });
      else if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) out.push({ code: "lesson-practice", text: "у практиці варіанти відповіді не мають повторюватися." });
    }
  }
  return out;
}

export function validatePublishable(content: AuthoredContent, opts?: { isSpecialist?: boolean }): PublishProblem[] {
  const problems: PublishProblem[] = [];
  const add = (code: string, message: string) => problems.push({ code, message });

  // High-risk topics need a «Фахівець» (checked only when the caller knows the author's kind).
  if (opts && !opts.isSpecialist && isHighRisk(content)) add("risk-topic", RISK_MESSAGE);

  if (!has(content.title)) add("title", "Вкажіть назву.");
  if (!has(content.description)) add("description", "Додайте опис.");
  const price = Number(content.price);
  if (!Number.isFinite(price) || price < 0) add("price", "Ціна має бути числом від 0.");

  // A paid guide/meditation must keep its file in the private bucket, a free one in the public bucket: changing the
  // price after uploading means uploading the file again.
  if ((content.type === "meditation" || content.type === "guide") && has(content.mainFileUrl) && Number.isFinite(price)) {
    const isPrivate = content.mainFileUrl!.startsWith("paid:");
    if (price > 0 && !isPrivate) add("file-public", "Матеріал платний, а файл завантажено як відкритий. Завантажте файл ще раз, щоб він був захищений.");
    if (price === 0 && isPrivate) add("file-private", "Матеріал безкоштовний, а файл захищений. Завантажте файл ще раз, щоб його могли відкрити.");
  }

  // the same for the lesson files of a paid program (audio, pictures, PDFs); the editor moves them by itself
  if (content.type === "program" && Number.isFinite(price) && price > 0) {
    const open = (content.modules ?? []).some((m) => (m.items ?? []).some((it) => [it.audioUrl, it.imageUrl, it.fileUrl].some((u) => has(u) && /\/storage\/v1\/object\/public\/content-files\//.test(u!))));
    if (open) add("lesson-files-public", "Програма платна, а файли уроків ще відкриті. Зачекайте кілька секунд, поки Sensoria їх захистить, або завантажте їх ще раз.");
  }

  if (content.type === "meditation") {
    if (!has(content.mainFileUrl)) add("audio", "Завантажте аудіо медитації.");
    if (!content.durationMinutes || content.durationMinutes < 1) add("duration", "Вкажіть тривалість у хвилинах.");
    const whenProblem = meditationWhenProblems(content.meditation?.whenToUse ?? [])[0];
    if (whenProblem) add("when-to-use", whenProblem);
  }

  if (content.type === "guide" && content.guide?.source === "sensoria_structured") {
    guideBlocksProblems(content.guideBlocks, Number(content.price)).forEach((m) => add("guide-blocks", m));
  }
  if (content.type === "guide" && content.guide?.source !== "sensoria_structured") {
    if (!has(content.mainFileUrl)) add("file", "Завантажте PDF-файл гайду.");
    if (!content.guide || content.guide.pages < 1) add("pages", "Вкажіть кількість сторінок.");
  }

  // Length rules (the same ones the step-by-step editor shows) and 1-3 categories: for every kind of material.
  if (has(content.title)) { const t = titleProblem(content.title); if (t) add("title-length", t); }
  if (has(content.description)) { const d = descriptionProblem(content.description!); if (d) add("description-length", d); }
  const cat = categoriesProblem(content.tags);
  if (cat) add("categories", cat);

  if (content.type !== "program") return problems;

  // Every program must say whether AI was used — it is shown to buyers as an "AI" mark.
  if (!aiDeclaration(content.tags)) add("ai-declaration", "Вкажіть, чи використовували ви ШІ під час створення програми.");

  // The presentation video is required for a program, and must be a YouTube link the page can embed.
  if (!has(content.introVideoUrl)) add("intro-video", "Додайте відео-презентацію: використайте відео з профілю або вставте посилання на YouTube.");
  else if (!isYoutubeUrl(content.introVideoUrl!)) add("intro-video", "Відео-презентація: вставте посилання на YouTube (youtu.be/… або youtube.com/watch?v=…).");

  // «Що ви отримаєте» — all three benefits, shown on the program page.
  const bp = benefitsProblem(benefitsFromTags(content.tags));
  if (bp) add("benefits", bp);

  const modules = content.modules ?? [];
  if (modules.length === 0) add("modules", "Додайте хоча б один модуль.");
  if (modules.length > MAX_MODULES) add("modules-max", `У програмі не більше ${MAX_MODULES} модулів.`);
  if (modules.some((m) => (m.items?.length ?? 0) > MAX_LESSONS_PER_MODULE)) add("lessons-max", `У модулі не більше ${MAX_LESSONS_PER_MODULE} уроків.`);
  if (modules.reduce((n, m) => n + (m.items?.length ?? 0), 0) > MAX_LESSONS_TOTAL) add("lessons-total", `У програмі не більше ${MAX_LESSONS_TOTAL} уроків.`);

  let required = 0;
  let lessons = 0;
  modules.forEach((m, mi) => {
    if (!has(m.title)) add("module-title", `Модуль ${mi + 1}: вкажіть назву.`);
    else {
      const p = lengthProblem(m.title, CONTENT_LIMITS.moduleTitle, `Модуль ${mi + 1}: назва`, true);
      if (p) add("module-title", p);
    }
    const items = m.items ?? [];
    if (items.length === 0) {
      add("module-empty", `Модуль ${mi + 1} «${m.title.trim() || "без назви"}» порожній: додайте урок.`);
    }
    items.forEach((it, ii) => {
      lessons += 1;
      if (it.isRequired) required += 1;
      const where = lessonLabel(m, mi, it, ii);
      for (const c of lessonChecks(it)) add(c.code, `${where}: ${c.text}`);
      if (opts && !opts.isSpecialist && warningNeedsSpecialist(it.contentWarning)) add("lesson-warning", `${where}: ${SPECIALIST_WARNING_MESSAGE}`);
    });
  });
  if (lessons > 0 && required === 0) add("no-required", "Позначте хоча б один урок обов'язковим.");
  return problems;
}
