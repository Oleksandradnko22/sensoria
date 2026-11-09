import test from "node:test";
import assert from "node:assert/strict";
import { guideFromRow, meditationFromRow, mergeIntoList, type ContentRow } from "./publicMaterialsMap.ts";

const base = { description: "d", price: 0, tags: ["anxiety"], created_at: "2026-05-01T10:00:00Z", duration_minutes: 5 };

test("meditation row maps; embed may be object or array; hidden body gives empty audio", () => {
  const row: ContentRow = { ...base, id: "u1", kind: "meditation", slug: "m1", title: "T", content_meditation_meta: [{ format: "silent", when_to_use: ["a"] }], content_meditation_body: null };
  const m = meditationFromRow(row)!;
  assert.equal(m.id, "m1");
  assert.equal(m.durationMinutes, 5);
  assert.equal(m.format, "silent");
  assert.equal(m.audioUrl, "");
  assert.deepEqual(m.whenToUse, ["a"]);
});

test("rows without slug or meta are skipped", () => {
  assert.equal(meditationFromRow({ ...base, id: "u", kind: "meditation", slug: null, title: "T" }), null);
  assert.equal(meditationFromRow({ ...base, id: "u", kind: "meditation", slug: "x", title: "T" }), null);
  assert.equal(guideFromRow({ ...base, id: "u", kind: "guide", slug: "x", title: "T" }), null);
  assert.equal(guideFromRow({ ...base, id: "u", kind: "meditation", slug: "x", title: "T", content_guide_meta: {} }), null);
});

test("guide row maps blocks, author and date", () => {
  const g = guideFromRow({
    ...base, id: "u", kind: "guide", slug: "g1", title: "G", price: "120", author: { name: "Анна" },
    content_guide_meta: { source: "sensoria_structured", pages: 3, read_minutes: 4, outcomes: ["o"] },
    content_guide_body: { blocks: [{ type: "text" }] },
  })!;
  assert.equal(g.id, "g1");
  assert.equal(g.author, "Анна");
  assert.equal(g.price, "120");
  assert.equal(g.publishedAt, "2026-05-01");
  assert.equal(g.guideContent?.length, 1);
});

test("merge updates by id, keeps protected and missing fields, appends new", () => {
  const list = [{ id: "a", title: "old", author: "Sensoria", extra: 1 as number | undefined }];
  const changed = mergeIntoList(list, [{ id: "a", title: "new", author: "Person", extra: undefined }, { id: "b", title: "B", author: "X", extra: 2 }], ["author"]);
  assert.equal(changed, true);
  assert.equal(list[0].title, "new");
  assert.equal(list[0].author, "Sensoria");
  assert.equal(list[0].extra, 1);
  assert.equal(list.length, 2);
  assert.equal(mergeIntoList(list, [{ id: "a", title: "new", author: "Person", extra: undefined }], ["author"]), false);
});
