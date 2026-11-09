import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMessagePreviews, type MessagePreview } from "./messagePreviews.ts";

const m = (id: string, unread = false): MessagePreview => ({
  id,
  authorName: id,
  contentTitle: null,
  preview: "",
  date: "",
  unread,
});

test("real first, then demo, limited to 3", () => {
  const r = mergeMessagePreviews([m("r1"), m("r2")], [m("d1"), m("d2")], undefined);
  assert.deepEqual(r.map((x) => x.id), ["r1", "r2", "d1"]);
});

test("readIds overrides original unread flag", () => {
  const r = mergeMessagePreviews([m("a", true), m("b", false)], [], { a: true, b: false });
  assert.equal(r[0].unread, false);
  assert.equal(r[1].unread, true);
});

test("unknown ids keep original flag", () => {
  const r = mergeMessagePreviews([m("a", true)], [], { other: true });
  assert.equal(r[0].unread, true);
});
