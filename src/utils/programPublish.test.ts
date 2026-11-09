import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublishable } from "./programPublish.ts";
import type { AuthoredContent, AuthoredItem } from "../data/authorDashboard.ts";

const item = (over: Partial<AuthoredItem> = {}): AuthoredItem => ({ title: "Урок", type: "text", isRequired: true, body: "Текст уроку", ...over });
const base = (over: Partial<AuthoredContent> = {}): AuthoredContent => ({
  id: "c1", type: "program", title: "Програма", description: "Опис програми, який достатньо розгорнутий для модерації та учасників.", status: "draft", price: "0",
  participants: 0, revenue: 0, rating: null, reviewsCount: 0, createdAt: "2026-10-06", updatedAt: "2026-10-06",
  modules: [{ title: "Модуль", lessons: 1, duration: "", items: [item()] }],
  tags: ["stress", "ai-none", "benefit:Менше напруги в щоденному житті", "benefit:Більше внутрішнього ресурсу", "benefit:Практики для щоденного спокою"],
  introVideoUrl: "https://youtu.be/abc123XYZ01",
  ...over,
});
const codes = (c: AuthoredContent) => validatePublishable(c).map((p) => p.code);

test("a complete program has no problems", () => {
  assert.deepEqual(validatePublishable(base()), []);
});

test("categories: 1-3 required", () => {
  assert.ok(codes(base({ tags: ["ai-none", "benefit:Менше напруги"] })).includes("categories"));
  assert.ok(codes(base({ tags: ["stress", "anxiety", "burnout", "recovery", "ai-none", "benefit:Менше напруги"] })).includes("categories"));
  assert.ok(!codes(base()).includes("categories"));
});

test("all three benefits are required", () => {
  assert.ok(codes(base({ tags: ["stress", "ai-none", "benefit:Менше напруги"] })).includes("benefits"));
  assert.ok(codes(base({ tags: ["stress", "ai-none", "benefit:Одна", "benefit:одна", "benefit:Інша"] })).includes("benefits"));
  assert.ok(!codes(base()).includes("benefits"));
});

test("each benefit is 20-40 characters", () => {
  assert.ok(codes(base({ tags: ["stress", "ai-none", "benefit:Менше напруги", "benefit:Більше внутрішнього ресурсу", "benefit:Практики для щоденного спокою"] })).includes("benefits"));
});

test("title, description, price", () => {
  assert.ok(codes(base({ title: " " })).includes("title"));
  assert.ok(codes(base({ description: "" })).includes("description"));
  assert.ok(codes(base({ price: "abc" })).includes("price"));
  assert.ok(codes(base({ price: "-5" })).includes("price"));
});

test("a program needs modules, and no module may be empty or unnamed", () => {
  assert.ok(codes(base({ modules: [] })).includes("modules"));
  assert.ok(codes(base({ modules: [{ title: "М", lessons: 0, duration: "", items: [] }] })).includes("module-empty"));
  assert.ok(codes(base({ modules: [{ title: " ", lessons: 1, duration: "", items: [item()] }] })).includes("module-title"));
});

test("a legacy module with only a video/material (no lessons yet) is not 'empty'", () => {
  assert.ok(codes(base({ modules: [{ title: "М", lessons: 1, duration: "", videoUrl: "https://youtu.be/x", items: [] }] })).includes("module-empty"), "a module link alone no longer counts: videos live on lessons");
});

test("video and audio lessons no longer require a transcript", () => {
  const video = item({ type: "video", videoUrl: "https://youtu.be/abc" });
  assert.equal(codes(base({ modules: [{ title: "М", lessons: 1, duration: "", items: [video] }] })).includes("lesson-transcript"), false);
});

test("each lesson type needs its own content", () => {
  const c = (it: AuthoredItem) => codes(base({ modules: [{ title: "М", lessons: 1, duration: "", items: [it] }] }));
  assert.ok(c(item({ type: "video", transcript: "x".repeat(30) })).includes("lesson-video"));
  assert.ok(c(item({ type: "audio", transcript: "x".repeat(30) })).includes("lesson-audio"));
  assert.ok(c(item({ type: "pdf", body: undefined })).includes("lesson-file"));
  assert.ok(c(item({ type: "image", body: undefined })).includes("lesson-image"));
  assert.ok(c(item({ type: "text", body: " " })).includes("lesson-body"));
  assert.ok(c(item({ type: "checklist", body: undefined, checklist: [" "] })).includes("lesson-checklist"));
  assert.ok(c(item({ title: " " })).includes("lesson-title"));
});

test("at least one lesson must be required", () => {
  assert.ok(codes(base({ modules: [{ title: "М", lessons: 1, duration: "", items: [item({ isRequired: false })] }] })).includes("no-required"));
});

test("a guide or meditation is not checked for program-only rules", () => {
  assert.deepEqual(codes(base({ type: "guide", modules: undefined })), ["file", "pages", "read-minutes"]);
  assert.ok(codes(base({ type: "guide", title: "" })).includes("title"));
});

test("a program cannot be published without the AI declaration", () => {
  assert.ok(codes(base({ tags: [] })).includes("ai-declaration"));
  assert.ok(codes(base({ tags: ["ai-none"] })).includes("benefits"));
  assert.equal(codes(base()).includes("benefits"), false);
  assert.ok(codes(base({ tags: ["stress"] })).includes("ai-declaration"));
  assert.equal(codes(base({ tags: ["stress", "ai-used"] })).includes("ai-declaration"), false);
  assert.equal(codes(base({ tags: ["ai-none"] })).includes("ai-declaration"), false);
});

test("a meditation needs audio, length and (with voice) a confirmed transcript", () => {
  const med = (over: Partial<AuthoredContent> = {}) =>
    base({ type: "meditation", modules: undefined, mainFileUrl: "https://x/a.mp3", durationMinutes: 5, meditation: { format: "guided", hasEmbeddedMusic: false, offlineDownloadEnabled: false, whenToUse: [], transcript: { text: "Сядьте зручно і зробіть вдих.", status: "confirmed", confirmedBy: "А", confirmedAt: "2026-11-04" } }, ...over });
  assert.deepEqual(codes(med()), []);
  assert.ok(codes(med({ mainFileUrl: undefined })).includes("audio"));
  assert.ok(codes(med({ durationMinutes: undefined })).includes("duration"));
  assert.ok(codes(med({ meditation: { ...med().meditation!, transcript: { text: "Сядьте зручно і зробіть вдих.", status: "draft" } } })).includes("transcript"));
  assert.deepEqual(codes(med({ meditation: { ...med().meditation!, format: "silent", transcript: undefined } })), []);
});

test("a PDF guide needs the file, pages and reading time; a structured one does not need the file", () => {
  const g = (over: Partial<AuthoredContent> = {}) =>
    base({ type: "guide", modules: undefined, mainFileUrl: "https://x/g.pdf", guide: { guideType: "quick", pages: 8, readMinutes: 5, relevantIf: [], outcomes: [] }, ...over });
  assert.deepEqual(codes(g()), []);
  assert.ok(codes(g({ mainFileUrl: undefined })).includes("file"));
  assert.ok(codes(g({ guide: { guideType: "quick", pages: 0, readMinutes: 0, relevantIf: [], outcomes: [] } })).includes("pages"));
  assert.deepEqual(codes(g({ mainFileUrl: undefined, guide: { guideType: "sos", pages: 0, readMinutes: 0, relevantIf: [], outcomes: [], source: "sensoria_structured" } })), []);
});

test("the file's bucket must match the price (paid = private, free = public)", () => {
  const m = (price: string, url: string) =>
    base({ type: "meditation", modules: undefined, price, mainFileUrl: url, durationMinutes: 5, meditation: { format: "silent", hasEmbeddedMusic: false, offlineDownloadEnabled: false, whenToUse: [] } });
  assert.deepEqual(codes(m("0", "https://x/a.mp3")), []);
  assert.deepEqual(codes(m("120", "paid:u/c/main.mp3")), []);
  assert.ok(codes(m("120", "https://x/a.mp3")).includes("file-public"));
  assert.ok(codes(m("0", "paid:u/c/main.mp3")).includes("file-private"));
});

test("the presentation video is required for a program and must be a YouTube link", () => {
  assert.equal(codes(base()).includes("intro-video"), false);
  assert.equal(codes(base({ introVideoUrl: "https://youtu.be/abc123XYZ01" })).includes("intro-video"), false);
  assert.ok(codes(base({ introVideoUrl: undefined })).includes("intro-video"));
  assert.ok(codes(base({ introVideoUrl: "   " })).includes("intro-video"));
  assert.ok(codes(base({ introVideoUrl: "https://vimeo.com/123456" })).includes("intro-video"));
});

test("a guide or a meditation does not need the presentation video", () => {
  assert.equal(codes(base({ type: "guide", modules: undefined, introVideoUrl: undefined, mainFileUrl: "https://x/a.pdf", guide: { guideType: "quick", pages: 3, readMinutes: 5, relevantIf: [], outcomes: [] } })).includes("intro-video"), false);
});

test("a program's title and description must fit the length rules", () => {
  assert.ok(codes(base({ title: "Ab" })).includes("title-length"));
  assert.ok(codes(base({ description: "Коротко" })).includes("description-length"));
});

test("a practice needs a question and, for choices, two different options", () => {
  const c = (practice: AuthoredItem["practice"]) => codes(base({ modules: [{ title: "М", lessons: 1, duration: "", items: [item({ body: "текст", practice })] }] }));
  assert.ok(c({ type: "text", prompt: "" }).includes("lesson-practice"));
  assert.equal(c({ type: "text", prompt: "Як ви?" }).includes("lesson-practice"), false);
  assert.ok(c({ type: "choice", prompt: "Питання?", options: ["a"] }).includes("lesson-practice"));
  assert.ok(c({ type: "checkboxes", prompt: "Питання?", options: ["a", "A"] }).includes("lesson-practice"));
  assert.equal(c({ type: "choice", prompt: "Питання?", options: ["a", "b"] }).includes("lesson-practice"), false);
});

test("module title, lesson title, lesson text and practice question respect their limits", () => {
  const run = (m: Partial<AuthoredContent["modules"][number]>, i: Partial<AuthoredItem> = {}) =>
    validatePublishable(base({ modules: [{ title: "Модуль", lessons: 1, duration: "", items: [item(i)], ...m }] })).map((p) => p.message).join(" | ");
  assert.match(run({ title: "аб" }), /назва/);
  assert.match(run({ title: "а".repeat(61) }), /не більше 60/);
  assert.match(run({}, { title: "аб" }), /назва уроку/);
  assert.match(run({}, { body: "коротко" }), /текст уроку/);
  assert.match(run({}, { body: "а".repeat(5001) }), /не більше 5000/);
  assert.match(run({}, { practice: { type: "text", prompt: "а".repeat(151) } }), /питання практики/);
  assert.equal(run({}), "");
});
