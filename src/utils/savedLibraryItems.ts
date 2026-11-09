// Builds the display items of the "Збережене" library from the raw saved
// records. Pure (no fetching, no React) so the display rules are testable:
//
//  - saved lessons / course exercises show the CURRENT program and lesson
//    titles from the canonical content (the saved row keeps only its stable
//    ids plus a title snapshot, used as a fallback only);
//  - if the referenced content can no longer be resolved, the card stays,
//    shows the snapshot title, is labelled "Недоступно", cannot be opened,
//    and can still be removed;
//  - notes are not saved content: they never get a remove action.
import type { IconName } from "../components/ui/Icon.tsx";
import type { ContentModule } from "../data/contentTypes.ts";
import type { SavedGuide } from "../lib/guideSaves.ts";
import type { SavedProgram } from "../lib/programSaves.ts";
import { formatPrice, isFreePrice } from "./price.ts";
import type { SavedFragment } from "../lib/guideFragments.ts";
import type { SavedPractice } from "../lib/savedPractices.ts";
import type { Bookmark } from "../lib/bookmarks.ts";
import type { GuideNote } from "../lib/guideNotes.ts";
import type { GuideBlockTarget } from "../data/guideContent.ts";
import { guides, guideSizeLabel } from "../data/guides.ts";
import { meditations } from "../data/meditations.ts";
import { programs as staticPrograms } from "../data/programs.ts";
import { categoryLabels } from "../data/categoryLabels.ts";

// "later" = saved whole guides, meditations and programs that are NOT in the cabinet yet (not bought or added).
export type LibraryFilter = "guide" | "practice" | "lesson" | "program" | "later";

// Not the "Ваші нотатки" of the observations page (those come from lessons).
export const NOTE_HINT = "Ваша нотатка до гайду — змінюється в самому гайді.";
export const UNAVAILABLE_LABEL = "Недоступно";

// One entry per saved thing, whatever table it came from.
export type LibraryItem = {
  key: string;
  group: LibraryFilter;
  // Real timestamp of the saved record (for notes: when last saved) —
  // drives "Останні збережені".
  at: string;
  icon: IconName;
  typeLabel: string;
  context?: string | null;
  title: string;
  // Long free text (fragment / note): clamped on the card, expandable.
  clamp?: boolean;
  body?: string;
  meta?: string;
  // The referenced program/lesson can no longer be resolved.
  unavailable?: boolean;
  // Inside «later»: free materials that were simply not added yet vs paid ones.
  subgroup?: "free" | "paid";
  // Everything the search looks at: title, text, author, program, topic.
  searchFields: (string | null | undefined)[];
  onOpen?: () => void;
  // Absent for notes (not saved content) — no unsave operation exists.
  onRemove?: () => void;
};

// Synchronous lookups into the already-loaded canonical catalog.
export type SavedCatalog = {
  // False until the catalog needed by the saved items has been resolved —
  // nothing is called "Недоступно" before that.
  ready: boolean;
  programTitle: (programId: string) => string | null;
  modules: (programId: string) => ContentModule[] | null;
  // Author name of the program, when known (searchable).
  programAuthor?: (programId: string) => string | null;
  // Price of the program, when known (decides «Безкоштовні» vs «Платні» in «Не придбані»).
  programPrice?: (programId: string) => string | number | null;
};

export type LessonResolution = {
  title: string;
  context: string | null;
  // "unknown": cannot tell (catalog not ready, or the saved row has no
  // programId to resolve) — snapshot is shown, no label.
  status: "current" | "unavailable" | "unknown";
};

export function resolveSavedLesson(args: {
  programId: string | null;
  itemId: string;
  snapshotItemTitle: string | null;
  snapshotProgramTitle: string | null;
  fallbackTitle: string;
  catalog: SavedCatalog;
}): LessonResolution {
  const { programId, itemId, snapshotItemTitle, snapshotProgramTitle, fallbackTitle, catalog } = args;
  const snapshot: Omit<LessonResolution, "status"> = {
    title: snapshotItemTitle ?? fallbackTitle,
    context: snapshotProgramTitle,
  };
  if (!programId || !catalog.ready) return { ...snapshot, status: "unknown" };

  const programTitle = catalog.programTitle(programId);
  const lesson = catalog
    .modules(programId)
    ?.flatMap((m) => m.items)
    .find((it) => it.id === itemId);
  if (programTitle && lesson) {
    return { title: lesson.title, context: programTitle, status: "current" };
  }
  return { ...snapshot, status: "unavailable" };
}

// Ids that still need a catalog fetch: unique, and only those the existing
// sources can't already resolve — fetched in ONE bulk call, never per card.
export function idsToFetch(programIds: (string | null)[], isResolved: (id: string) => boolean): string[] {
  const ids = new Set<string>();
  programIds.forEach((id) => {
    if (id && !isResolved(id)) ids.add(id);
  });
  return [...ids].sort();
}

export function guideTitleFor(guideId: string, fallback: string | null): string {
  return guides.find((g) => g.id === guideId)?.title ?? fallback ?? "Гайд";
}

const topicLabels = (tags: string[] | undefined) =>
  (tags ?? []).map((t) => categoryLabels[t as keyof typeof categoryLabels] ?? t);

function guideSearchFields(guideId: string): string[] {
  const g = guides.find((x) => x.id === guideId);
  return g ? [g.author, g.category, ...topicLabels(g.tags)] : [];
}

// Static catalog only — authored programs' author/topic aren't loaded on
// this page (their title is, via the catalog).
function programSearchFields(programId: string | null): string[] {
  const p = programId ? staticPrograms.find((x) => x.id === programId) : undefined;
  return p ? [p.author, ...topicLabels(p.tags)] : [];
}

export type SavedRecords = {
  guides: SavedGuide[];
  fragments: SavedFragment[];
  practices: SavedPractice[];
  bookmarks: Bookmark[];
  notes: GuideNote[];
  // saved programs (program_saved_for_later); only the ones not in the cabinet are listed, under "later"
  programs?: SavedProgram[];
};

export type SavedActions = {
  openGuide?: (guideId: string, target?: GuideBlockTarget) => void;
  openMeditation?: (meditationId: string) => void;
  openProgramAtItem?: (programId: string, itemId?: string) => void;
  // The public pages, for what is not in the cabinet yet (the cabinet viewers would open the full content).
  openGuidePage?: (guideId: string) => void;
  openMeditationPage?: (meditationId: string) => void;
  openProgramPage?: (programId: string) => void;
  // Schedules the (undoable) removal of the item with this key.
  scheduleRemoval: (key: string, commit: () => Promise<void>) => void;
  // The real delete + local state update per record kind, unchanged.
  remove: {
    guide: (id: string) => () => Promise<void>;
    fragment: (id: string) => () => Promise<void>;
    practice: (id: string) => () => Promise<void>;
    bookmark: (id: string) => () => Promise<void>;
    program?: (id: string) => () => Promise<void>;
  };
};

// `owned` holds "kind:id" keys of what is already in the cabinet. When it is not known yet (still loading or
// failed), nothing is moved to "later": the groups stay as they were.
export function buildSavedItems(records: SavedRecords, catalog: SavedCatalog, actions: SavedActions, owned?: ReadonlySet<string>): LibraryItem[] {
  const notOwned = (kind: string, id: string) => !!owned && !owned.has(`${kind}:${id}`);
  const meditationPractices = records.practices.filter((p) => p.kind === "meditation");
  const coursePractices = records.practices.filter((p) => p.kind !== "meditation");
  const open = actions.openProgramAtItem;

  // Shared by lessons and course exercises: both point at one lesson of one
  // program.
  const lessonFields = (
    row: { programId: string | null; contentItemId: string; itemTitle: string | null; programTitle: string | null },
    fallbackTitle: string
  ) => {
    const r = resolveSavedLesson({
      programId: row.programId,
      itemId: row.contentItemId,
      snapshotItemTitle: row.itemTitle,
      snapshotProgramTitle: row.programTitle,
      fallbackTitle,
      catalog,
    });
    const unavailable = r.status === "unavailable";
    return {
      title: r.title,
      context: r.context,
      unavailable,
      onOpen:
        !unavailable && open && row.programId ? () => open(row.programId!, row.contentItemId) : undefined,
      searchExtra: [
        ...(unavailable ? [UNAVAILABLE_LABEL] : []),
        ...(row.programId ? [catalog.programAuthor?.(row.programId)] : []),
      ],
    };
  };

  return [
    ...records.guides.map((g): LibraryItem => {
      const guide = guides.find((x) => x.id === g.guideId);
      const title = guideTitleFor(g.guideId, g.guideTitle);
      const key = `guide-${g.id}`;
      const later = notOwned("guide", g.guideId);
      return {
        key,
        at: g.createdAt,
        group: later ? "later" : "guide",
        subgroup: later ? (guide && !isFreePrice(guide.price) ? "paid" : "free") : undefined,
        icon: "guide",
        typeLabel: "Гайд",
        title,
        meta: later
          ? guide
            ? `${formatPrice(guide.price)} · ${guideSizeLabel(guide)}`
            : undefined
          : guide
            ? `${guideSizeLabel(guide)} · ${guide.readMinutes} хв`
            : undefined,
        searchFields: [title, ...guideSearchFields(g.guideId)],
        // not in the cabinet: the public page (price, contents), never the full guide
        onOpen: later ? (actions.openGuidePage ? () => actions.openGuidePage!(g.guideId) : undefined) : actions.openGuide ? () => actions.openGuide!(g.guideId) : undefined,
        onRemove: () => actions.scheduleRemoval(key, actions.remove.guide(g.id)),
      };
    }),
    ...records.fragments.map((f): LibraryItem => {
      const guideTitle = guideTitleFor(f.guideId, f.guideTitle);
      const key = `fragment-${f.id}`;
      return {
        key,
        at: f.createdAt,
        group: "guide",
        icon: "guide",
        typeLabel: "Фрагмент гайду",
        // Guide on top (like a program above its lesson), the fragment itself
        // as the title — so fragments of one guide are told apart.
        context: guideTitle,
        title: f.fragmentText,
        clamp: true,
        searchFields: [guideTitle, f.fragmentText, ...guideSearchFields(f.guideId)],
        // Lands on the saved block itself, not just the guide.
        onOpen: actions.openGuide
          ? () => actions.openGuide!(f.guideId, { blockId: f.blockId, blockIndex: f.fragmentIndex })
          : undefined,
        onRemove: () => actions.scheduleRemoval(key, actions.remove.fragment(f.id)),
      };
    }),
    ...meditationPractices.map((p): LibraryItem => {
      const meditation = meditations.find((m) => m.id === p.contentItemId);
      const title = p.itemTitle ?? meditation?.title ?? "Медитація";
      const key = `practice-${p.id}`;
      const later = notOwned("meditation", p.contentItemId);
      return {
        key,
        at: p.createdAt,
        group: later ? "later" : "practice",
        subgroup: later ? "free" : undefined, // every meditation is free
        icon: "meditation",
        typeLabel: "Медитація",
        title,
        meta: meditation?.duration,
        searchFields: [title, "медитація", ...topicLabels(meditation?.tags)],
        onOpen: later ? (actions.openMeditationPage ? () => actions.openMeditationPage!(p.contentItemId) : undefined) : actions.openMeditation ? () => actions.openMeditation!(p.contentItemId) : undefined,
        onRemove: () => actions.scheduleRemoval(key, actions.remove.practice(p.id)),
      };
    }),
    ...coursePractices.map((p): LibraryItem => {
      const f = lessonFields(p, "Практика");
      const key = `practice-${p.id}`;
      return {
        key,
        at: p.createdAt,
        group: "practice",
        icon: "toolbox",
        typeLabel: "Вправа з курсу",
        context: f.context,
        title: f.title,
        unavailable: f.unavailable,
        searchFields: [f.title, f.context, "вправа", ...programSearchFields(p.programId), ...f.searchExtra],
        onOpen: f.onOpen,
        onRemove: () => actions.scheduleRemoval(key, actions.remove.practice(p.id)),
      };
    }),
    ...records.bookmarks.map((b): LibraryItem => {
      const f = lessonFields(b, "Урок");
      const key = `bookmark-${b.id}`;
      return {
        key,
        at: b.createdAt,
        group: "lesson",
        icon: "program",
        typeLabel: "Урок",
        context: f.context,
        title: f.title,
        unavailable: f.unavailable,
        searchFields: [f.title, f.context, ...programSearchFields(b.programId), ...f.searchExtra],
        onOpen: f.onOpen,
        onRemove: () => actions.scheduleRemoval(key, actions.remove.bookmark(b.id)),
      };
    }),
    // Saved programs: in the cabinet already → «Програми» (opens the program); not yet → «Не придбані» (public page).
    ...(records.programs ?? []).map((p): LibraryItem => {
        const key = `program-${p.id}`;
        const later = notOwned("program", p.programId);
        const price = catalog.programPrice?.(p.programId) ?? null;
        const title = catalog.programTitle(p.programId) ?? p.programTitle ?? "Програма";
        return {
          key,
          at: p.createdAt,
          group: later ? "later" : "program",
          subgroup: later ? (price !== null && isFreePrice(price) ? "free" : "paid") : undefined,
          icon: "program",
          typeLabel: "Програма",
          title,
          meta: later && price !== null ? formatPrice(price) : undefined,
          searchFields: [title, "програма", ...programSearchFields(p.programId)],
          onOpen: later
            ? actions.openProgramPage
              ? () => actions.openProgramPage!(p.programId)
              : undefined
            : actions.openProgramAtItem
              ? () => actions.openProgramAtItem!(p.programId)
              : undefined,
          onRemove: actions.remove.program ? () => actions.scheduleRemoval(key, actions.remove.program!(p.id)) : undefined,
        };
      }),
    // Notes are the person's own writing, not saved content: no unsave
    // operation exists, so none is offered.
    ...records.notes.map((n): LibraryItem => {
      const guideTitle = guideTitleFor(n.guideId, null);
      return {
        key: `note-${n.id}`,
        at: n.updatedAt,
        group: "guide",
        icon: "note",
        typeLabel: "Нотатка до гайду",
        context: guideTitle,
        title: n.noteText,
        clamp: true,
        meta: NOTE_HINT,
        searchFields: [guideTitle, n.noteText, ...guideSearchFields(n.guideId)],
        onOpen: actions.openGuide ? () => actions.openGuide!(n.guideId, { blockIndex: n.blockIndex }) : undefined,
      };
    }),
  ];
}
