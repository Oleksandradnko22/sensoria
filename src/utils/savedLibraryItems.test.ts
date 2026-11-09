import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSavedItems,
  idsToFetch,
  resolveSavedLesson,
  NOTE_HINT,
  type SavedActions,
  type SavedCatalog,
  type SavedRecords,
} from "./savedLibraryItems.ts";
import type { ContentModule } from "../data/contentTypes.ts";

const modules = (items: { id: string; title: string }[]): ContentModule[] =>
  [{ id: "m1", title: "M", description: "", items: items.map((i) => ({ ...i, type: "text" })) }] as unknown as ContentModule[];

function catalogOf(
  programs: Record<string, { title: string; items: { id: string; title: string }[] }>,
  ready = true
): SavedCatalog {
  return {
    ready,
    programTitle: (id) => programs[id]?.title ?? null,
    modules: (id) => (programs[id] ? modules(programs[id].items) : null),
  };
}

const empty: SavedRecords = { guides: [], fragments: [], practices: [], bookmarks: [], notes: [] };

function setup() {
  const scheduled: { key: string; commit: () => Promise<void> }[] = [];
  const removed: string[] = [];
  const actions: SavedActions = {
    openGuide: () => {},
    openMeditation: () => {},
    openProgramAtItem: () => {},
    scheduleRemoval: (key, commit) => scheduled.push({ key, commit }),
    remove: {
      guide: (id) => async () => void removed.push(`guide:${id}`),
      fragment: (id) => async () => void removed.push(`fragment:${id}`),
      practice: (id) => async () => void removed.push(`practice:${id}`),
      bookmark: (id) => async () => void removed.push(`bookmark:${id}`),
    },
  };
  return { actions, scheduled, removed };
}

const bookmark = (over = {}) =>
  ({
    id: "b1",
    contentItemId: "l1",
    programId: "p1",
    programTitle: "Стара програма",
    itemTitle: "Стара назва",
    createdAt: "2026-10-01T00:00:00Z",
    ...over,
  }) as SavedRecords["bookmarks"][number];

const practice = (over = {}) =>
  ({
    id: "s1",
    contentItemId: "l1",
    kind: "program",
    programId: "p1",
    programTitle: "Стара програма",
    itemTitle: "Стара вправа",
    createdAt: "2026-10-01T00:00:00Z",
    ...over,
  }) as SavedRecords["practices"][number];

test("existing saved lesson shows the CURRENT lesson and program titles", () => {
  const { actions } = setup();
  const catalog = catalogOf({ p1: { title: "Нова програма", items: [{ id: "l1", title: "Нова назва" }] } });
  const [item] = buildSavedItems({ ...empty, bookmarks: [bookmark()] }, catalog, actions);
  assert.equal(item.title, "Нова назва");
  assert.equal(item.context, "Нова програма");
  assert.equal(item.unavailable, false);
  assert.ok(item.onOpen);
});

test("existing saved course exercise also uses current titles", () => {
  const { actions } = setup();
  const catalog = catalogOf({ p1: { title: "Нова програма", items: [{ id: "l1", title: "Нова вправа" }] } });
  const [item] = buildSavedItems({ ...empty, practices: [practice()] }, catalog, actions);
  assert.equal(item.title, "Нова вправа");
  assert.equal(item.context, "Нова програма");
  assert.equal(item.group, "practice");
});

test("missing program: snapshot title + unavailable", () => {
  const { actions } = setup();
  const [item] = buildSavedItems({ ...empty, bookmarks: [bookmark()] }, catalogOf({}), actions);
  assert.equal(item.title, "Стара назва");
  assert.equal(item.context, "Стара програма");
  assert.equal(item.unavailable, true);
});

test("missing lesson in an existing program: snapshot title + unavailable", () => {
  const { actions } = setup();
  const catalog = catalogOf({ p1: { title: "Нова програма", items: [{ id: "other", title: "Інший" }] } });
  const [item] = buildSavedItems({ ...empty, bookmarks: [bookmark()] }, catalog, actions);
  assert.equal(item.title, "Стара назва");
  assert.equal(item.unavailable, true);
  // the snapshot is used, not the current program title (nothing to trust)
  assert.equal(item.context, "Стара програма");
});

test("unavailable content cannot navigate", () => {
  const { actions } = setup();
  const items = buildSavedItems({ ...empty, bookmarks: [bookmark()], practices: [practice()] }, catalogOf({}), actions);
  assert.equal(items.length, 2);
  items.forEach((i) => assert.equal(i.onOpen, undefined));
});

test("unavailable content can still be removed from Saved", async () => {
  const { actions, scheduled, removed } = setup();
  const [item] = buildSavedItems({ ...empty, bookmarks: [bookmark()] }, catalogOf({}), actions);
  assert.ok(item.onRemove);
  item.onRemove!();
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].key, "bookmark-b1");
  await scheduled[0].commit();
  assert.deepEqual(removed, ["bookmark:b1"]);
});

test("nothing is called unavailable before the catalog is ready", () => {
  const { actions } = setup();
  const [item] = buildSavedItems({ ...empty, bookmarks: [bookmark()] }, catalogOf({}, false), actions);
  assert.equal(item.unavailable, false);
  assert.equal(item.title, "Стара назва");
  assert.ok(item.onOpen);
});

test("a row without a programId can't be resolved: snapshot, no label, not openable", () => {
  const r = resolveSavedLesson({
    programId: null,
    itemId: "l1",
    snapshotItemTitle: "Назва",
    snapshotProgramTitle: null,
    fallbackTitle: "Урок",
    catalog: catalogOf({}),
  });
  assert.equal(r.status, "unknown");
  const { actions } = setup();
  const [item] = buildSavedItems({ ...empty, bookmarks: [bookmark({ programId: null })] }, catalogOf({}), actions);
  assert.equal(item.unavailable, false);
  assert.equal(item.onOpen, undefined);
});

test("notes expose no unsave action and carry the explanatory label", () => {
  const { actions, scheduled } = setup();
  const note = { id: "n1", guideId: "g", noteText: "моя думка", updatedAt: "2026-10-02T00:00:00Z" } as SavedRecords["notes"][number];
  const [item] = buildSavedItems({ ...empty, notes: [note] }, catalogOf({}), actions);
  assert.equal(item.onRemove, undefined);
  assert.equal(item.meta, NOTE_HINT);
  assert.equal(scheduled.length, 0);
});

test("saved content (not notes) keeps its remove action", () => {
  const { actions } = setup();
  const catalog = catalogOf({ p1: { title: "П", items: [{ id: "l1", title: "У" }] } });
  const items = buildSavedItems({ ...empty, bookmarks: [bookmark()], practices: [practice()] }, catalog, actions);
  items.forEach((i) => assert.ok(i.onRemove));
});

test("no N+1: catalog lookups are synchronous and ids are bulk-deduplicated", () => {
  // Many saved cards of the same programs → one id per program, one call.
  const ids = idsToFetch(["p1", "p1", "p2", null, "p1", "p2"], () => false);
  assert.deepEqual(ids, ["p1", "p2"]);
  // Already-resolvable programs are not fetched at all.
  assert.deepEqual(idsToFetch(["p1", "p2"], (id) => id === "p1"), ["p2"]);
  assert.deepEqual(idsToFetch(["p1"], () => true), []);

  // The builder only does sync lookups on the provided catalog (no promises,
  // nothing is fetched per card).
  const { actions } = setup();
  let calls = 0;
  const catalog: SavedCatalog = {
    ready: true,
    programTitle: (id) => {
      calls++;
      return id === "p1" ? "П" : null;
    },
    modules: (id) => {
      calls++;
      return id === "p1" ? modules([{ id: "l1", title: "У" }]) : null;
    },
  };
  const bookmarks = Array.from({ length: 10 }, (_, i) => bookmark({ id: `b${i}` }));
  const items = buildSavedItems({ ...empty, bookmarks }, catalog, actions);
  assert.equal(items.length, 10);
  assert.ok(calls <= 2 * bookmarks.length); // a constant number of lookups per card
});

test("fragments of one guide are told apart: guide as context, the fragment as title", () => {
  const { actions } = setup();
  const frag = (id: string, text: string) =>
    ({ id, guideId: "unknown-guide", guideTitle: "Мій гайд", fragmentText: text, createdAt: "2026-10-01T00:00:00Z" }) as SavedRecords["fragments"][number];
  const items = buildSavedItems({ ...empty, fragments: [frag("f1", "Перша думка"), frag("f2", "Друга думка")] }, catalogOf({}), actions);
  assert.deepEqual(items.map((i) => i.context), ["Мій гайд", "Мій гайд"]);
  assert.deepEqual(items.map((i) => i.title), ["Перша думка", "Друга думка"]);
  items.forEach((i) => assert.equal(i.clamp, true));
});

test("notes show the guide as context and the note text; still no unsave", () => {
  const { actions } = setup();
  const note = { id: "n1", guideId: "unknown-guide", noteText: "Довга нотатка", updatedAt: "2026-10-02T00:00:00Z" } as SavedRecords["notes"][number];
  const [item] = buildSavedItems({ ...empty, notes: [note] }, catalogOf({}), actions);
  assert.equal(item.title, "Довга нотатка");
  assert.equal(item.clamp, true);
  assert.equal(item.onRemove, undefined);
});

test("the program's author is searchable for lessons", () => {
  const { actions } = setup();
  const catalog: SavedCatalog = {
    ...catalogOf({ p1: { title: "Програма", items: [{ id: "l1", title: "Урок" }] } }),
    programAuthor: (id) => (id === "p1" ? "Марія Шевченко" : null),
  };
  const [item] = buildSavedItems({ ...empty, bookmarks: [bookmark()] }, catalog, actions);
  assert.ok(item.searchFields.includes("Марія Шевченко"));
});

// ── «Не придбані»: saved whole guides / meditations / programs that are not in the cabinet ──
const savedGuide = { id: "sg1", guideId: "what-to-do-when-anxiety-hits", guideTitle: "Гайд", createdAt: "2026-10-03T00:00:00Z" } as SavedRecords["guides"][number];
const savedMeditation = practice({ id: "sm1", kind: "meditation", contentItemId: "quick-grounding", programId: null, itemTitle: "Швидке заземлення" });
const savedProgram = { id: "sp1", programId: "p9", programTitle: "Здорові стосунки", createdAt: "2026-10-04T00:00:00Z" } as NonNullable<SavedRecords["programs"]>[number];

test("saved guide, meditation and program not in the cabinet go to «later» and open the public page", () => {
  const { actions } = setup();
  const opened: string[] = [];
  const act: SavedActions = {
    ...actions,
    openGuide: () => opened.push("cabinet-guide"),
    openGuidePage: (id) => opened.push(`page-guide:${id}`),
    openMeditationPage: (id) => opened.push(`page-med:${id}`),
    openProgramPage: (id) => opened.push(`page-prog:${id}`),
  };
  const items = buildSavedItems({ ...empty, guides: [savedGuide], practices: [savedMeditation], programs: [savedProgram] }, catalogOf({}), act, new Set());
  assert.deepEqual(items.map((i) => i.group), ["later", "later", "later"]);
  items.forEach((i) => i.onOpen?.());
  assert.deepEqual(opened, ["page-guide:what-to-do-when-anxiety-hits", "page-med:quick-grounding", "page-prog:p9"]);
});

test("what is already in the cabinet stays in its own group; a saved program there goes to «program»", () => {
  const { actions } = setup();
  const owned = new Set(["guide:what-to-do-when-anxiety-hits", "meditation:quick-grounding", "program:p9"]);
  const items = buildSavedItems({ ...empty, guides: [savedGuide], practices: [savedMeditation], programs: [savedProgram] }, catalogOf({}), actions, owned);
  assert.deepEqual(items.map((i) => i.group), ["guide", "practice", "program"]);
});

test("when ownership is not known yet nothing is moved to «later»", () => {
  const { actions } = setup();
  const items = buildSavedItems({ ...empty, guides: [savedGuide], practices: [savedMeditation], programs: [] }, catalogOf({}), actions);
  assert.deepEqual(items.map((i) => i.group), ["guide", "practice"]);
});

test("a saved program can be removed (undoable) from «later»", () => {
  const { actions, scheduled, removed } = setup();
  const act: SavedActions = { ...actions, remove: { ...actions.remove, program: (id) => async () => void removed.push(`program:${id}`) } };
  const [item] = buildSavedItems({ ...empty, programs: [savedProgram] }, catalogOf({}), act, new Set());
  item.onRemove?.();
  assert.equal(scheduled[0].key, "program-sp1");
  void scheduled[0].commit();
  assert.deepEqual(removed, ["program:sp1"]);
});

test("in «later» free and paid are told apart: free guide/meditation/program vs a paid one", () => {
  const { actions } = setup();
  const catalog: SavedCatalog = { ...catalogOf({}), programPrice: (id) => (id === "p9" ? "1800" : "0") };
  const free = { ...savedProgram, id: "sp2", programId: "p0" };
  const items = buildSavedItems({ ...empty, guides: [savedGuide], practices: [savedMeditation], programs: [savedProgram, free] }, catalog, actions, new Set());
  const by = (title: string) => items.find((i) => i.key === title)?.subgroup;
  assert.equal(by("guide-sg1"), "free"); // the real guide costs 0
  assert.equal(by("practice-sm1"), "free");
  assert.equal(by("program-sp1"), "paid");
  assert.equal(by("program-sp2"), "free");
});
