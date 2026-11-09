import test from "node:test";
import assert from "node:assert/strict";
import { INTRO_MAX_LINES, introLines, blockStatus, missingParts, STORY_MIN, EMPTY_STORY, hasStory, normalizeStory, storyForSave, validateAudioFile, validateStory, visibleBlocks, type AuthorStory } from "./authorStory.ts";

const steps = [
  { title: "Помітити", text: "Свій стан." },
  { title: "Зрозуміти", text: "Що за ним." },
  { title: "Спробувати", text: "Малий крок." },
];
const valid = (over: Partial<AuthorStory> = {}): AuthorStory => ({ ...EMPTY_STORY, hidden: { ...EMPTY_STORY.hidden }, tagline: "Привіт", intro: "Текст знайомства.", portraitUrl: "https://x.co/p.jpg", steps, ...over });

test("normalizeStory: junk in → empty story", () => {
  assert.deepEqual(normalizeStory(null), EMPTY_STORY);
  assert.deepEqual(normalizeStory("x"), EMPTY_STORY);
  assert.deepEqual(normalizeStory({ steps: "no", principles: 3, media: 5 }), EMPTY_STORY);
});

test("normalizeStory: trims, caps lengths and counts", () => {
  const s = normalizeStory({
    tagline: " " + "а".repeat(200),
    intro: "б".repeat(800),
    viewpointNote: "в".repeat(400),
    steps: [...steps, { title: "Зайвий", text: "x" }],
    principles: ["a", " ", "b", "c", "d", "e"],
  });
  assert.equal(s.tagline, ""); // heading removed
  assert.equal(s.intro.length, 450);
  assert.equal(s.viewpointNote.length, 260);
  assert.equal(s.steps.length, 4); // 3 given + 1 extra, all kept (the limit is 6)
  assert.deepEqual(s.principles, ["a", "b", "c", "d"]);
});

test("normalizeStory: media validated; earlier videoUrl shape still read", () => {
  assert.equal(normalizeStory({ media: { kind: "video", url: "https://evil.example/x" } }).media, null);
  assert.equal(normalizeStory({ media: { kind: "audio", url: "http://insecure/a.mp3" } }).media, null);
  assert.equal(normalizeStory({ media: { kind: "audio", url: "https://x.supabase.co/a.mp3", caption: " Привіт ", duration: "3:20" } }).media?.caption, "Привіт");
  assert.equal(normalizeStory({ videoUrl: "https://youtu.be/dQw4w9WgXcQ" }).media?.kind, "video");
});

test("visibleBlocks: required vs optional, hidden keeps content", () => {
  const empty = visibleBlocks(EMPTY_STORY);
  assert.deepEqual([empty.intro, empty.viewpoint, empty.how, empty.principles, empty.media], [false, false, false, false, false]);

  const s = valid({ viewpoint: "Думка", principles: ["Без тиску"], media: { kind: "audio", url: "https://x.co/a.mp3", caption: "", duration: "" } });
  const all = visibleBlocks(s);
  assert.deepEqual([all.intro, all.viewpoint, all.how, all.principles, all.media], [true, true, true, true, true]);

  const hid = valid({ viewpoint: "Думка", principles: ["Без тиску"], media: s.media, hidden: { viewpoint: true, principles: true, media: true, personal: false, faq: false } });
  const v = visibleBlocks(hid);
  assert.deepEqual([v.viewpoint, v.principles, v.media], [false, false, false]);
  assert.equal(hid.viewpoint, "Думка"); // preserved
  assert.equal(normalizeStory(hid).viewpoint, "Думка"); // and survives save
  assert.equal(normalizeStory(hid).hidden.viewpoint, true);
});

test("visibleBlocks: a single stage is not a sequence", () => {
  assert.equal(visibleBlocks(valid({ steps: [steps[0]] })).how, false);
  assert.equal(visibleBlocks(valid({ steps: steps.slice(0, 2) })).how, true);
});

test("validateStory", () => {
  assert.deepEqual(validateStory(valid()), []);
  assert.deepEqual(validateStory(valid({ portraitUrl: "" }), { hasProfilePhoto: true }), []);
  assert.ok(validateStory(valid({ portraitUrl: "" })).length > 0); // photo required
  assert.ok(validateStory(valid({ intro: " " })).length > 0); // text required
  assert.ok(validateStory(valid({ intro: "Один.\n\nДва.\n\nТри." })).length > 0); // max two paragraphs
  assert.deepEqual(validateStory(valid({ tagline: "" })), []); // heading line optional
  assert.deepEqual(validateStory(valid({ steps: [] })), []); // stages are optional now
  assert.ok(validateStory(valid({ steps: [steps[0], steps[1], { title: "Спробувати", text: "" }] })).length > 0);
  assert.ok(validateStory(valid({ media: { kind: "video", url: "https://evil.example", caption: "", duration: "" } })).length > 0);
  assert.ok(validateStory(valid({ viewpointNote: "лише пояснення" })).length > 0);
});

test("save payload: empty → null; audio rules", () => {
  assert.equal(hasStory(EMPTY_STORY), false);
  assert.equal(storyForSave(EMPTY_STORY), null);
  assert.notEqual(storyForSave(valid()), null);
  assert.ok(validateAudioFile({ type: "video/mp4", size: 1 }));
  assert.ok(validateAudioFile({ type: "audio/mpeg", size: 30 * 1024 * 1024 }));
  assert.equal(validateAudioFile({ type: "audio/mpeg", size: 1000 }), null);
});

test("blockStatus explains why a block is not public", () => {
  assert.equal(blockStatus(valid(), "intro"), null);
  assert.match(blockStatus(EMPTY_STORY, "intro") ?? "", /Потрібно/);
  assert.match(blockStatus(valid({ portraitUrl: "" }), "intro", false) ?? "", /фото/);
  assert.match(blockStatus(valid({ viewpoint: "x", hidden: { viewpoint: true, principles: false, media: false, personal: false, faq: false } }), "viewpoint") ?? "", /приховано/);
  assert.match(blockStatus(valid(), "viewpoint") ?? "", /порожня/);
  assert.match(blockStatus(valid({ steps: steps.slice(0, 1) }), "how") ?? "", /два/);
  assert.match(blockStatus(valid(), "media") ?? "", /ще немає/);
  assert.match(blockStatus(valid({ media: { kind: "audio", url: "", caption: "", duration: "" } }), "media") ?? "", /не завантажено/);
  assert.equal(blockStatus(valid({ media: { kind: "audio", url: "https://x.co/a.mp3", caption: "", duration: "" } }), "media"), null);
});

test("a YouTube link the author (or the test seed) sets is kept", () => {
  assert.equal(normalizeStory({ media: { kind: "video", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ" } }).media?.kind, "video");
});

test("new blocks: duration, offers, personal story and photos", () => {
  const s = normalizeStory({
    media: { kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", duration: "3:20" },
    offers: ["a", " ", "b", "c", "d", "e"],
    notOffers: ["x"],
    personal: " Моя історія ",
    photos: ["https://x.co/1.jpg", "http://insecure/2.jpg", "https://x.co/3.jpg"],
  });
  assert.equal(s.media?.duration, "3:20");
  assert.deepEqual(s.offers, ["a", "b", "c", "d"]);
  assert.equal(s.personal, "Моя історія");
  assert.deepEqual(s.photos, ["https://x.co/1.jpg", "https://x.co/3.jpg"]);
  assert.equal(normalizeStory({ media: { kind: "video", url: "https://youtu.be/dQw4w9WgXcQ", duration: "abc" } }).media?.duration, "");
  assert.equal(visibleBlocks(s).limits, true);
  assert.equal(visibleBlocks(s).personal, true);
  assert.equal(visibleBlocks(valid({ personal: "т", hidden: { viewpoint: false, principles: false, media: false, personal: true, faq: false } })).personal, false);
  assert.equal(visibleBlocks(valid({ photos: ["https://x.co/1.jpg"] })).personal, true);
  assert.equal(visibleBlocks(valid()).personal, false);
});

test("intro keeps at most two paragraphs", () => {
  const s = normalizeStory({ intro: "Перший.\n\nДругий.\n\nТретій." });
  assert.equal(s.intro, "Перший.\n\nДругий.");
});

test("intro must fit next to the portrait (estimated lines)", () => {
  assert.equal(introLines("", ""), 0);
  assert.ok(introLines("Короткий заголовок", "Один абзац тексту.") < INTRO_MAX_LINES);
  // two full paragraphs + a long heading no longer fit
  const long = "а".repeat(220);
  assert.ok(introLines("б".repeat(80), `${long}\n\n${long}`) > INTRO_MAX_LINES);
  assert.ok(validateStory(valid({ tagline: "б".repeat(80), intro: `${long}\n\n${long}` })).some((e) => /задовгий/.test(e)));
  assert.deepEqual(validateStory(valid({ tagline: "", intro: `${"в".repeat(150)}\n\n${"г".repeat(150)}` })), []);
});

test("missingParts: every personalised block is required, with minimums", () => {
  const empty = missingParts(EMPTY_STORY, true);
  assert.deepEqual(Object.values(empty).map((x) => x.length > 0), [true, true, true, true, true, true]);
  const t = (n: number) => "а".repeat(n);
  const full: AuthorStory = {
    ...EMPTY_STORY,
    intro: t(STORY_MIN.intro),
    viewpoint: t(STORY_MIN.viewpoint),
    viewpointNote: t(STORY_MIN.viewpointNote),
    steps: Array.from({ length: STORY_MIN.steps }, () => ({ title: t(STORY_MIN.stepTitle), text: t(STORY_MIN.stepText) })),
    principles: Array.from({ length: STORY_MIN.principles }, () => t(STORY_MIN.principle)),
    principleIcons: ["", "", ""],
    offers: Array.from({ length: STORY_MIN.offers }, () => t(STORY_MIN.offer)),
    offerIcons: ["", ""],
    notOffers: [t(STORY_MIN.notOffer)],
    faq: Array.from({ length: STORY_MIN.faq }, () => ({ q: t(STORY_MIN.faqQ), a: t(STORY_MIN.faqA) })),
    media: { kind: "audio", url: "https://x.co/a.mp3", caption: "", duration: "" },
  };
  assert.deepEqual(Object.values(missingParts(full, true)).flat(), []);
  // one character short in any block is reported
  assert.ok(missingParts({ ...full, intro: t(STORY_MIN.intro - 1) }, true).intro.length > 0);
  assert.ok(missingParts({ ...full, faq: full.faq.slice(0, 2) }, true).faq.length > 0);
  assert.ok(missingParts(full, false).intro.length > 0); // no photo at all
  assert.ok(missingParts({ ...full, media: null }, true).media.length > 0);
});
