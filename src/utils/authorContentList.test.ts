import { test } from "node:test";
import assert from "node:assert/strict";
import { filterContent, sortContent, toggleArchive } from "./authorContentList.ts";
import type { AuthoredContent } from "../data/authorDashboard.ts";

const mk = (over: Partial<AuthoredContent>): AuthoredContent => ({
  id: "a", type: "program", title: "Т", status: "published", price: "0", participants: 0, revenue: 0, rating: null, reviewsCount: 0,
  createdAt: "2026-01-01", updatedAt: "2026-01-01", ...over,
});
const list = [
  mk({ id: "1", title: "Бета", type: "guide", status: "draft", updatedAt: "2026-03-01", participants: 5, revenue: 10, rating: 4.1 }),
  mk({ id: "2", title: "Альфа", type: "program", status: "published", updatedAt: "2026-05-01", participants: 50, revenue: 5, rating: null }),
  mk({ id: "3", title: "Гамма альфа", type: "meditation", status: "archived", updatedAt: "2026-04-01", participants: 20, revenue: 99, rating: 4.9 }),
];
const ids = (l: AuthoredContent[]) => l.map((x) => x.id).join(",");

test("filters combine: type + status + search", () => {
  assert.equal(ids(filterContent(list, { type: "all", status: "all", search: "" })), "1,2,3");
  assert.equal(ids(filterContent(list, { type: "guide", status: "all", search: "" })), "1");
  assert.equal(ids(filterContent(list, { type: "all", status: "archived", search: "" })), "3");
  assert.equal(ids(filterContent(list, { type: "all", status: "all", search: " АЛЬФА " })), "2,3");
  assert.equal(ids(filterContent(list, { type: "meditation", status: "all", search: "альфа" })), "3");
  assert.equal(ids(filterContent(list, { type: "guide", status: "archived", search: "" })), "");
});

test("default order: published, moderation, drafts, archive; newest first inside a group", () => {
  const l = [
    mk({ id: "arch", status: "archived", updatedAt: "2026-09-01" }),
    mk({ id: "draftOld", status: "draft", updatedAt: "2026-01-01" }),
    mk({ id: "pubOld", status: "published", updatedAt: "2026-02-01" }),
    mk({ id: "rev", status: "review", updatedAt: "2026-03-01" }),
    mk({ id: "pubNew", status: "published", updatedAt: "2026-06-01" }),
    mk({ id: "draftNew", status: "draft", updatedAt: "2026-07-01" }),
  ];
  assert.equal(ids(sortContent(l, "default")), "pubNew,pubOld,rev,draftNew,draftOld,arch");
});

test("archiving keeps everything, restoring returns a draft (never straight to published)", () => {
  const live = mk({ id: "x", status: "published", title: "Курс", participants: 5 });
  const archived = toggleArchive(live);
  assert.equal(archived.status, "archived");
  assert.equal(archived.title, "Курс");
  assert.equal(archived.participants, 5);
  assert.equal(toggleArchive(archived).status, "draft");
  assert.equal(live.status, "published", "the input is not mutated");
});

test("every sort order", () => {
  assert.equal(ids(sortContent(list, "newest")), "2,3,1");
  assert.equal(ids(sortContent(list, "oldest")), "1,3,2");
  assert.equal(ids(sortContent(list, "title")), "2,1,3");
  assert.equal(ids(sortContent(list, "participants")), "2,3,1");
  assert.equal(ids(sortContent(list, "revenue")), "3,1,2");
  assert.equal(ids(sortContent(list, "rating")), "3,1,2");
  assert.equal(ids(list), "1,2,3", "the input is not mutated");
});

test("default order: published, moderation, taken down, drafts, archive", () => {
  const items = [
    mk({ id: "d", status: "draft", everPublished: false, updatedAt: "2026-05-01" }),
    mk({ id: "a", status: "archived", updatedAt: "2026-05-01" }),
    mk({ id: "t", status: "draft", everPublished: true, updatedAt: "2026-01-01" }),
    mk({ id: "r", status: "review", updatedAt: "2026-05-01" }),
    mk({ id: "p", status: "published", updatedAt: "2026-05-01" }),
  ];
  assert.equal(sortContent(items, "default").map((i) => i.id).join(","), "p,r,t,d,a");
});
