import test from "node:test";
import assert from "node:assert/strict";
import {
  checkPublicText,
  resolveAttachment,
  threadComments,
  toggleLike,
  appendUnique,
  isMissingRelation,
  splitPostBody,
  clipText,
  POST_MAX,
  parseVideoUrl,
  validateImages,
  clampMediaRatio,
} from "./authorPosts.ts";

test("checkPublicText: empty, long, contact info, ok", () => {
  assert.equal(checkPublicText("   ", POST_MAX).ok, false);
  assert.equal(checkPublicText("а".repeat(POST_MAX + 1), POST_MAX).ok, false);
  const blocked = checkPublicText("Пишіть у телеграм @my_name або +380501234567", POST_MAX);
  assert.equal(blocked.ok, false);
  assert.equal(checkPublicText("Чому ми довго думаємо про одну й ту саму ситуацію", POST_MAX).ok, true);
});

test("resolveAttachment: none, found, unavailable", () => {
  assert.equal(resolveAttachment(null, null, null), null);
  const ok = resolveAttachment("meditation", "m1", { title: "Заземлення", detail: "4 хв" });
  assert.equal(ok?.meta, "Медитація · 4 хв");
  assert.equal(ok?.unavailable, false);
  const gone = resolveAttachment("program", "p1", null);
  assert.equal(gone?.unavailable, true);
  assert.equal(gone?.title, null);
});

test("threadComments nests author replies and keeps orphans", () => {
  const rows = [
    { id: "r1", parentId: "c1", createdAt: "2026-01-02" },
    { id: "c2", parentId: null, createdAt: "2026-01-03" },
    { id: "c1", parentId: null, createdAt: "2026-01-01" },
    { id: "o", parentId: "missing", createdAt: "2026-01-04" },
  ];
  const t = threadComments(rows);
  assert.deepEqual(t.map((x) => x.comment.id), ["c1", "c2", "o"]);
  assert.deepEqual(t[0].replies.map((r) => r.id), ["r1"]);
});

test("splitPostBody: headline only for a short line without end punctuation", () => {
  assert.deepEqual(splitPostBody("Чому ми прокручуємо ситуацію\n\nТекст тут."), {
    headline: "Чому ми прокручуємо ситуацію",
    rest: "Текст тут.",
  });
  assert.equal(splitPostBody("Просто речення.\nДруге.").headline, null);
  assert.equal(splitPostBody("Один рядок без переносу").headline, null);
});

test("clipText", () => {
  assert.deepEqual(clipText("коротко", 50), { text: "коротко", clipped: false });
  const c = clipText("слово ".repeat(40), 50);
  assert.equal(c.clipped, true);
  assert.ok(c.text.endsWith("…") && c.text.length <= 52);
});

test("toggleLike", () => {
  const a = toggleLike({ likeCount: 2, commentCount: 1, liked: false });
  assert.deepEqual(a, { likeCount: 3, commentCount: 1, liked: true });
  assert.equal(toggleLike(a).likeCount, 2);
  assert.equal(toggleLike({ likeCount: 0, commentCount: 0, liked: true }).likeCount, 0);
});

test("appendUnique", () => {
  assert.deepEqual(appendUnique([{ id: "a" }], [{ id: "a" }, { id: "b" }]).map((x) => x.id), ["a", "b"]);
});

test("isMissingRelation", () => {
  assert.equal(isMissingRelation({ code: "42P01" }), true);
  assert.equal(isMissingRelation({ code: "PGRST205" }), true);
  assert.equal(isMissingRelation({ message: "relation does not exist" }), true);
  assert.equal(isMissingRelation({ code: "42501" }), false);
  assert.equal(isMissingRelation(null), false);
});

test("parseVideoUrl: youtube/vimeo accepted, others rejected, embed rebuilt", () => {
  const y = parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5");
  assert.equal(y?.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(parseVideoUrl("youtu.be/dQw4w9WgXcQ")?.id, "dQw4w9WgXcQ");
  assert.equal(parseVideoUrl("https://youtube.com/shorts/dQw4w9WgXcQ")?.provider, "youtube");
  assert.equal(parseVideoUrl("https://vimeo.com/123456789")?.embedUrl, "https://player.vimeo.com/video/123456789?dnt=1");
  assert.equal(parseVideoUrl("https://evil.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoUrl("https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"), null);
  assert.equal(parseVideoUrl("javascript:alert(1)"), null);
  assert.equal(parseVideoUrl("https://youtube.com/watch?v=short"), null);
  assert.equal(parseVideoUrl(""), null);
});

test("validateImages: count, type, size", () => {
  const ok = { type: "image/png", size: 1000 };
  assert.equal(validateImages([ok, ok]), null);
  assert.ok(validateImages([ok, ok, ok], 2));
  assert.ok(validateImages([{ type: "image/gif", size: 10 }]));
  assert.ok(validateImages([{ type: "image/png", size: 6 * 1024 * 1024 }]));
});

test("clampMediaRatio: landscape ≤16:9, portrait ≥4:5, square 1:1, unknown 16:9", () => {
  assert.equal(clampMediaRatio(null), 16 / 9);
  assert.equal(clampMediaRatio(3), 16 / 9);
  assert.equal(clampMediaRatio(0.4), 4 / 5);
  assert.equal(clampMediaRatio(1.02), 1);
  assert.equal(clampMediaRatio(1.5), 1.5);
});
