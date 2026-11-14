// "Збережене" — a unified personal library (2026-09-09, per Sasha's
// explicit spec: "Я б взагалі створив окрему сутність... Тоді
// користувач поступово створює свою особисту бібліотеку допомоги").
// Replaces the two previously separate tabs — "Закладки" (lesson
// bookmarks + saved guide fragments) and "Моя практика" (meditations +
// course tools kept after completion) — with one screen and one mental
// model. No new tables: this reads the exact same five sources those
// two screens already did (content_item_bookmarks, guide_fragment_
// saves, content_item_saved_practices, guide_saved_for_later) plus one
// newly-included sixth (guide_notes) — see fetchAllNotesForUser's own
// comment. Grouped by kind, in the order Sasha listed: guides, guide
// fragments, meditations, course tools, notes — lesson bookmarks (the
// old "Закладки" tab's original content, not explicitly named in her
// list but with nowhere else to live) get their own group too, last.
// A group only renders once it actually has something saved in it.

import { Icon } from "../ui/Icon";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { pluralUk } from "../../utils/plural";
import { UndoableQueue } from "../../utils/undoableQueue";
import {
  UNAVAILABLE_LABEL,
  buildSavedItems,
  type LibraryFilter,
  type LibraryItem,
} from "../../utils/savedLibraryItems";
import { useSavedCatalog } from "./useSavedCatalog";
import { useSession } from "../../context/SessionContext";
import { useMeditationPlayer } from "../../context/MeditationPlayerContext";
import { fetchAllBookmarks, removeBookmark, type Bookmark } from "../../lib/bookmarks";
import {
  fetchAllSavedFragments,
  removeSavedFragment,
  type SavedFragment,
} from "../../lib/guideFragments";
import { fetchAllSavedPractices, removeSavedPractice, type SavedPractice } from "../../lib/savedPractices";
import { fetchAllSavedGuides, removeSavedGuide, type SavedGuide } from "../../lib/guideSaves";
import { fetchAllSavedPrograms, removeSavedProgram, type SavedProgram } from "../../lib/programSaves";
import { fetchOwnedKeys } from "../../lib/ownedContent";
import { ACQUIRED_EVENT } from "../../lib/acquired";
import { fetchAllNotesForUser, type GuideNote } from "../../lib/guideNotes";
import type { GuideBlockTarget } from "../../data/guideContent";
import { getSavedVersion, subscribeSaved } from "../../utils/savedSignal";
import { SAVED_SORT_OPTIONS, matchesSearch, sortSaved, type SavedSortMode } from "../../utils/savedLibrary";

import SavedPosts from "../feed/SavedPosts";
type Props = {
  onNavigate?: (key: "learning") => void;
  // Opens the program's real Lesson Player deep-linked straight to the
  // saved/bookmarked item — see ParticipantDashboardPage's openProgramAtItem.
  onOpenProgramAtItem?: (programId: string, itemId?: string) => void;
  // Opens MeditationExperience for a saved meditation's own id.
  onOpenMeditation?: (meditationId: string) => void;
  // Opens GuideExperience in-place (the same overlay "Моє навчання"
  // itself uses, not the leave-the-dashboard onOpenGuide) — for whole
  // saved guides, saved fragments, and notes alike, since all three
  // point back at a guide.
  onContinueGuide?: (guideId: string, target?: GuideBlockTarget) => void;
  // The public pages, for saved materials that are not in the cabinet yet (price, contents, add to cart).
  onOpenProgram?: (programId: string) => void;
  onOpenGuide?: (guideId: string) => void;
  onOpenMeditationPage?: (meditationId: string) => void;
  // Existing public catalog destinations, for the empty states.
  onBackToSite?: () => void;
  onViewAllGuides?: (categories: string[]) => void;
  onViewAllMeditations?: (categories: string[]) => void;
  onViewAllPrograms?: (categories: string[]) => void;
  // True while this tab is the visible one. The page stays mounted when you
  // leave it, so becoming active again is the cue to re-read what is saved.
  active?: boolean;
};

const FILTERS: { key: LibraryFilter; label: string; hint: string }[] = [
  { key: "guide", label: "Гайди", hint: "Гайди, їхні фрагменти й ваші нотатки до гайдів" },
  { key: "practice", label: "Практики", hint: "Медитації та вправи з курсів" },
  { key: "lesson", label: "Уроки", hint: "Уроки програм, до яких ви хочете повернутися" },
  { key: "program", label: "Програми", hint: "Програми, які ви зберегли й які вже є у вашому кабінеті" },
  { key: "later", label: "Не придбані", hint: "Збережені гайди, медитації та програми, яких ще немає у вашому кабінеті" },
];

const EMPTY_COPY: Record<LibraryFilter, { text: string; cta: string }> = {
  guide: { text: "Зберігайте гайди, до яких хочете повернутися пізніше.", cta: "Переглянути гайди →" },
  practice: {
    text: "Зберігайте медитації та вправи з курсів, до яких хочете повернутися пізніше.",
    cta: "Переглянути медитації →",
  },
  lesson: { text: "Зберігайте уроки, до яких хочете повернутися пізніше.", cta: "Переглянути програми →" },
  program: { text: "Зберігайте програми, до яких хочете повернутися пізніше.", cta: "Переглянути програми →" },
  later: { text: "Зберігайте гайди, медитації та програми, які хочете взяти пізніше: вони будуть тут, поки ви не додасте їх у кабінет.", cta: "Відкрити каталог →" },
};

// How long a removal can be undone before it is actually deleted.
const UNDO_MS = 6000;
// Cards rendered per group before "Показати ще".
const PAGE_SIZE = 24;

function LibraryCard({ item }: { item: LibraryItem }) {
  const open = item.onOpen;
  const dim = item.unavailable;
  // Long fragment/note text is clamped to 3 lines; "Показати повністю" only
  // appears when it really is cut off.
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const titleRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (item.clamp && el && !expanded) setOverflowing(el.scrollHeight > el.clientHeight + 1);
  }, [item.clamp, item.title, expanded]);

  return (
    <div
      className={`rounded-2xl border transition flex items-start gap-2 p-4 min-w-0 ${
        dim ? "bg-black/[0.025] border-black/5" : "bg-white border-black/5 hover:border-black/15"
      }`}
    >
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={open}
          disabled={!open}
          className={`block w-full text-left ${open ? "cursor-pointer" : "cursor-default"}`}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-semibold uppercase tracking-wide text-black/60 mb-2">
            <span className="inline-flex items-center gap-1.5">
              <Icon name={item.icon} size={14} />
              <span>{item.typeLabel}</span>
            </span>
            {dim && (
              <span className="normal-case tracking-normal font-medium rounded-full bg-black/[0.06] text-black/60 px-2 py-0.5">
                {UNAVAILABLE_LABEL}
              </span>
            )}
          </div>
          {item.context && (
            <div className={`text-[12px] mb-0.5 break-words ${dim ? "text-black/60" : "text-black/60"}`}>
              {item.context}
            </div>
          )}
          <div
            ref={titleRef}
            className={`leading-snug break-words ${
              item.clamp
                ? `text-[14px] font-medium text-black/75 ${expanded ? "" : "line-clamp-3"}`
                : `text-[14px] font-semibold ${dim ? "text-black/60" : "text-black/85"}`
            }`}
          >
            {item.title}
          </div>
          {item.body && (
            <p className="text-[14px] text-black/60 leading-relaxed mt-1.5 line-clamp-3 break-words">{item.body}</p>
          )}
          {item.meta && <div className="text-[12px] text-black/60 mt-2">{item.meta}</div>}
        </button>
        {item.clamp && (overflowing || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="inline-flex items-center min-h-[44px] mt-1.5 text-[12px] font-medium text-blue-600 hover:underline"
          >
            {expanded ? "Згорнути" : "Показати повністю"}
          </button>
        )}
      </div>
      {item.onRemove && (
        <button
          type="button"
          onClick={item.onRemove}
          aria-label={`Прибрати зі збереженого: ${item.title.length > 60 ? `${item.title.slice(0, 60)}…` : item.title}`}
          title="Прибрати зі збереженого"
          className={`relative shrink-0 -mr-1 -mt-1 w-9 h-9 before:absolute before:-inset-1 before:content-[''] rounded-full flex items-center justify-center hover:bg-black/5 hover:text-black/45 transition ${
            dim ? "text-black/60" : "text-[#4338ca]"
          }`}
        >
          <Icon name="bookmark" size={18} filled />
        </button>
      )}
    </div>
  );
}

// Custom dropdown instead of a native <select>: the native control is drawn by
// the OS/browser (grey gradient + stepper arrows in Safari) and can't match
// the platform's look.
function SortMenu({ value, onChange }: { value: SavedSortMode; onChange: (v: SavedSortMode) => void }) {
  const [open, setOpen] = useState(false);
  const current = SAVED_SORT_OPTIONS.find((o) => o.key === value) ?? SAVED_SORT_OPTIONS[0];

  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!open) return;
    // Focus the selected option so ↑/↓ work straight away.
    listRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"] button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const btns = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (i + 1) % btns.length : (i - 1 + btns.length) % btns.length;
        btns[next]?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Сортування: ${current.label}`}
        className="min-h-[44px] w-full sm:w-auto flex items-center justify-between gap-2.5 rounded-xl bg-white border border-black/10 hover:border-black/25 px-3.5 py-2.5 text-[14px] font-medium text-black/70 transition focus:outline-none focus-visible:border-black/30"
      >
        <span>{current.label}</span>
        <span className={`text-black/60 transition-transform ${open ? "rotate-180" : ""}`}>
          <Icon name="chevron" size={16} />
        </span>
      </button>
      {open && (
        <>
          {/* Click-outside-to-close, same pattern as the comment menu. */}
          <div className="fixed inset-0 z-[5]" onClick={() => setOpen(false)} />
          <ul
            ref={listRef}
            role="listbox"
            aria-label="Сортування"
            className="absolute right-0 top-full mt-1.5 z-10 min-w-full sm:min-w-[210px] rounded-xl bg-white border border-black/10 shadow-[0_8px_24px_rgba(15,23,42,0.08)] py-1"
          >
            {SAVED_SORT_OPTIONS.map((o) => {
              const selected = o.key === value;
              return (
                <li key={o.key} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.key);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2 text-left text-[14px] transition hover:bg-black/[0.04] ${
                      selected ? "font-semibold text-black/85" : "text-black/65"
                    }`}
                  >
                    <span>{o.label}</span>
                    {selected && (
                      <span className="text-[#4338ca]">
                        <Icon name="check" size={15} />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default function ParticipantSaved({
  onNavigate,
  onOpenProgramAtItem,
  onOpenMeditation,
  onContinueGuide,
  onOpenProgram,
  onOpenGuide,
  onOpenMeditationPage,
  onBackToSite,
  onViewAllGuides,
  onViewAllMeditations,
  onViewAllPrograms,
  active = true,
}: Props) {
  const session = useSession();
  const player = useMeditationPlayer();
  const userId = session?.profile.id;

  const [savedGuides, setSavedGuides] = useState<SavedGuide[]>([]);
  const [fragments, setFragments] = useState<SavedFragment[]>([]);
  const [practices, setPractices] = useState<SavedPractice[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [savedPrograms, setSavedPrograms] = useState<SavedProgram[]>([]);
  // "kind:id" of what is already in the cabinet; null = not known (nothing is moved to «Не придбані» then)
  const [ownedKeys, setOwnedKeys] = useState<Set<string> | null>(null);
  const [notes, setNotes] = useState<GuideNote[]>([]);
  const [loading, setLoading] = useState(true);
  // null = not chosen yet: show the first group that has something saved.
  // Filter and sort are remembered for the browser session (not the search text).
  const [chosenFilter, setChosenFilter] = useState<LibraryFilter | null>(() => {
    try {
      const v = sessionStorage.getItem("sensoria.saved.filter");
      return FILTERS.some((f) => f.key === v) ? (v as LibraryFilter) : null;
    } catch {
      return null;
    }
  });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SavedSortMode>(() => {
    try {
      const v = sessionStorage.getItem("sensoria.saved.sort");
      return SAVED_SORT_OPTIONS.some((o) => o.key === v) ? (v as SavedSortMode) : "recent";
    } catch {
      return "recent";
    }
  });
  useEffect(() => {
    try {
      if (chosenFilter) sessionStorage.setItem("sensoria.saved.filter", chosenFilter);
      sessionStorage.setItem("sensoria.saved.sort", sort);
    } catch {
      // storage unavailable (private mode) — just not remembered
    }
  }, [chosenFilter, sort]);

  // Reads all five sources. Re-runs whenever the tab becomes visible again
  // (something may have been saved elsewhere meanwhile), when a practice is
  // (un)saved elsewhere (savedPracticeVersion) and on "Спробувати ще раз".
  // A failed read is reported as an error — never shown as an empty library.
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const hasLoaded = useRef(false);
  // Re-reading is skipped when the tab is merely shown again and nothing
  // changed: no save/unsave signal (utils/savedSignal.ts, fired by lib/*
  // add/remove), same user, no retry, and the data is under 5 minutes old.
  const savedSignal = useSyncExternalStore(subscribeSaved, getSavedVersion);
  const lastLoad = useRef<{ key: string; at: number } | null>(null);
  useEffect(() => {
    if (!userId || !active) return;
    const loadKey = `${userId}|${reloadKey}|${player.savedPracticeVersion}|${savedSignal}`;
    const last = lastLoad.current;
    if (hasLoaded.current && last && last.key === loadKey && Date.now() - last.at < 5 * 60_000) return;
    let cancelled = false;
    if (!hasLoaded.current) setLoading(true);
    const strict = { strict: true };
    Promise.all([
      fetchAllSavedGuides(userId, strict),
      fetchAllSavedFragments(userId, strict),
      fetchAllSavedPractices(userId, strict),
      fetchAllBookmarks(userId, strict),
      fetchAllNotesForUser(userId, strict),
      fetchAllSavedPrograms(userId),
      fetchOwnedKeys(userId, { demoEnrollments: false }).then((m) => new Set(m.keys())).catch(() => null),
    ])
      .then(([g, f, p, b, n, sp, owned]) => {
        if (cancelled) return;
        setSavedGuides(g);
        setFragments(f);
        setPractices(p);
        setBookmarks(b);
        setNotes(n.filter((note) => note.noteText.trim().length > 0));
        setSavedPrograms(sp);
        setOwnedKeys(owned);
        hasLoaded.current = true;
        lastLoad.current = { key: loadKey, at: Date.now() };
        setLoadError(false);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, active, reloadKey, player.savedPracticeVersion, savedSignal]);

  // Added to the cabinet from the cart: it leaves «Не придбані», so re-read.
  useEffect(() => {
    const again = () => setReloadKey((k) => k + 1);
    window.addEventListener(ACQUIRED_EVENT, again);
    return () => window.removeEventListener(ACQUIRED_EVENT, again);
  }, []);

  // ---- Removal with undo -------------------------------------------------
  // Clicking the bookmark hides the item at once and shows a toast; the real
  // delete (the same remove* calls as before) runs after UNDO_MS unless the
  // person taps "Скасувати" — so undo restores the original record untouched
  // instead of re-creating it. Leaving the page flushes pending deletes.
  // The timing logic lives in utils/undoableQueue.ts (unit-tested).
  const [queueState, setQueueState] = useState<{ pending: string[]; hidden: string[] }>({ pending: [], hidden: [] });
  const [errorToasts, setErrorToasts] = useState<string[]>([]);
  const queueRef = useRef<UndoableQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new UndoableQueue({
      delayMs: UNDO_MS,
      onChange: setQueueState,
      onFailed: () => {
        // Deleting failed (e.g. offline): the item is still saved and comes
        // back; say so.
        const id = `err-${Date.now()}`;
        setErrorToasts((prev) => [...prev, id]);
        setTimeout(() => setErrorToasts((prev) => prev.filter((x) => x !== id)), 4000);
      },
    });
  }
  const queue = queueRef.current;
  const scheduleRemoval = (key: string, commit: () => Promise<void>) => void queue.schedule(key, commit);

  useEffect(() => () => void queue.flush().catch(() => {}), [queue]);
  // Closing/reloading the browser tab does not unmount React, so commit the
  // pending deletes on pagehide too — otherwise a record removed within the
  // last UNDO_MS would silently come back (best effort: the request is sent
  // as the page goes away).
  useEffect(() => {
    const onHide = () => void queue.flush().catch(() => {});
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [queue]);

  const handleRemoveGuide = (id: string) => async () => {
    await removeSavedGuide(id);
    setSavedGuides((prev) => prev.filter((g) => g.id !== id));
  };

  const handleRemoveFragment = (id: string) => async () => {
    await removeSavedFragment(id);
    setFragments((prev) => prev.filter((f) => f.id !== id));
  };

  const handleRemovePractice = (id: string) => async () => {
    await removeSavedPractice(id);
    setPractices((prev) => prev.filter((p) => p.id !== id));
    // Same cross-instance signal the old ParticipantMyPractice.tsx
    // sent — lets a meditation card elsewhere drop its own ♥ live.
    player.bumpSavedPracticeVersion();
  };

  const handleRemoveProgram = (id: string) => async () => {
    await removeSavedProgram(id);
    setSavedPrograms((prev) => prev.filter((p) => p.id !== id));
  };

  const handleRemoveBookmark = (id: string) => async () => {
    await removeBookmark(id);
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
  };

  const catalog = useSavedCatalog([...practices.map((p) => p.programId), ...bookmarks.map((b) => b.programId)]);
  const allItems: LibraryItem[] = buildSavedItems(
    { guides: savedGuides, fragments, practices, bookmarks, notes, programs: savedPrograms },
    catalog,
    {
      openGuide: onContinueGuide,
      openMeditation: onOpenMeditation,
      openProgramAtItem: onOpenProgramAtItem,
      openGuidePage: onOpenGuide,
      openMeditationPage: onOpenMeditationPage,
      openProgramPage: onOpenProgram,
      scheduleRemoval,
      remove: {
        guide: handleRemoveGuide,
        fragment: handleRemoveFragment,
        practice: handleRemovePractice,
        bookmark: handleRemoveBookmark,
        program: handleRemoveProgram,
      },
    },
    ownedKeys ?? undefined,
  );

  // Items waiting out their undo window are hidden, not yet deleted.
  const items = allItems.filter((i) => !queueState.hidden.includes(i.key));
  const filter: LibraryFilter =
    chosenFilter ?? FILTERS.find((f) => items.some((i) => i.group === f.key))?.key ?? "guide";
  const setFilter = (f: LibraryFilter) => setChosenFilter(f);
  const matched = items.filter((i) => matchesSearch(i.searchFields, query));
  const countIn = (group: LibraryFilter) => matched.filter((i) => i.group === group).length;
  const totalIn = (group: LibraryFilter) => items.filter((i) => i.group === group).length;
  const groupTotal = items.filter((i) => i.group === filter).length;
  const visible = sortSaved(
    matched.filter((i) => i.group === filter),
    sort
  );
  const searching = query.trim().length > 0;
  // "Показати ще": start from one page again whenever the list changes shape.
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => setLimit(PAGE_SIZE), [filter, query, sort]);

  const browse: Record<LibraryFilter, (() => void) | undefined> = {
    guide: onViewAllGuides ? () => onViewAllGuides([]) : onBackToSite,
    practice: onViewAllMeditations ? () => onViewAllMeditations([]) : onBackToSite,
    lesson: onViewAllPrograms ? () => onViewAllPrograms([]) : onBackToSite,
    program: onViewAllPrograms ? () => onViewAllPrograms([]) : onBackToSite,
    later: onBackToSite,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Збережене</h1>
        <p className="text-black/60 mt-1">
          Ваша особиста бібліотека допомоги: гайди, медитації, вправи з курсів і нотатки, які ви
          вирішили залишити собі. Те, чого ще немає у вашому кабінеті, лежить окремо у вкладці «Не придбані».
        </p>
      </div>
      <SavedPosts />

      {loadError && items.length === 0 ? (
        <div className="max-w-xl rounded-2xl bg-white border border-black/5 p-8 sm:p-10 text-center">
          <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
            <Icon name="warning" size={18} />
          </div>
          <div className="text-[16px] font-medium mb-1.5">Не вдалося завантажити збережене</div>
          <p className="text-[14px] text-black/60 mb-5">
            Ваші матеріали нікуди не зникли — перевірте з’єднання й спробуйте ще раз.
          </p>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition"
          >
            Спробувати ще раз
          </button>
        </div>
      ) : !loading && items.length === 0 ? (
        <div className="max-w-xl rounded-2xl bg-white border border-black/5 p-8 sm:p-10 text-center">
          <div className="mx-auto mb-3 w-10 h-10 rounded-full bg-[#eef2ff] text-[#4338ca] flex items-center justify-center">
            <Icon name="bookmark" size={18} />
          </div>
          <div className="text-[16px] font-medium mb-1.5">Збережіть те, що хочете не загубити</div>
          <p className="text-[14px] text-black/60 mb-5">
            Гайди, практики та уроки залишаться тут, щоб ви могли повернутися до них у потрібний момент.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3">
            {onBackToSite && (
              <button
                onClick={onBackToSite}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition"
              >
                Відкрити каталог
              </button>
            )}
            {onNavigate && (
              <button
                onClick={() => onNavigate("learning")}
                className="inline-flex items-center min-h-[44px] text-[14px] font-medium text-blue-600 hover:underline"
              >
                Перейти до навчання →
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {loadError && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-[14px] text-amber-800">
              <span>Не вдалося оновити список — показано останні завантажені дані.</span>
              <button onClick={() => setReloadKey((k) => k + 1)} className="font-semibold hover:underline">
                Спробувати ще раз
              </button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 min-w-0">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/60 pointer-events-none">
                <Icon name="search" size={16} />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук у збереженому"
                aria-label="Пошук у збереженому"
                className="min-h-[44px] w-full rounded-xl bg-white border border-black/10 pl-10 pr-20 py-2.5 text-[14px] focus:outline-none focus:border-black/30 transition"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-black/60 hover:text-black/70 transition"
                >
                  Очистити
                </button>
              )}
            </div>
            <SortMenu value={sort} onChange={setSort} />
          </div>

          <div
            role="tablist"
            aria-label="Фільтр збереженого"
            className="flex flex-wrap gap-2"
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const i = FILTERS.findIndex((f) => f.key === filter);
              const next = FILTERS[(i + (e.key === "ArrowRight" ? 1 : FILTERS.length - 1)) % FILTERS.length];
              setFilter(next.key);
              requestAnimationFrame(() => document.getElementById(`saved-tab-${next.key}`)?.focus());
            }}
          >
            {FILTERS.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  id={`saved-tab-${f.key}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls="saved-panel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => setFilter(f.key)}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-[14px] font-medium border transition ${
                    active
                      ? "bg-[#eef0fd] text-[#4338ca] border-[#4338ca]/35"
                      : "bg-white text-black/60 border-black/10 hover:border-black/25"
                  }`}
                >
                  {f.label}
                  <span className={active ? "text-[#4338ca]/80" : "text-black/60"}> · {searching ? countIn(f.key) : totalIn(f.key)}</span>
                </button>
              );
            })}
          </div>

          <p className="text-[12px] text-black/60 -mt-3">{FILTERS.find((f) => f.key === filter)?.hint}</p>

          <div id="saved-panel" role="tabpanel" aria-labelledby={`saved-tab-${filter}`} aria-busy={loading}>
          {visible.length > 0 ? (
            <>
              {filter === "later" ? (
                // paid ones and free-but-not-added ones are kept apart, each under its own heading
                <div className="flex flex-col gap-6">
                  {(
                    [
                      { id: "paid", title: "Платні", hint: "Потрібно придбати, щоб додати в кабінет" },
                      { id: "free", title: "Безкоштовні, ще не додані", hint: "Додайте їх у кабінет через кошик, коли захочете почати" },
                    ] as const
                  ).map((sec) => {
                    const part = visible.slice(0, limit).filter((i) => (i.subgroup ?? "paid") === sec.id);
                    if (part.length === 0) return null;
                    return (
                      <section key={sec.id} aria-label={sec.title}>
                        <h2 className="text-[16px] font-semibold">
                          {sec.title} <span className="font-normal text-black/60">· {part.length}</span>
                        </h2>
                        <p className="mb-3 text-[13px] text-black/60">{sec.hint}</p>
                        <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3">
                          {part.map((item) => (
                            <LibraryCard key={item.key} item={item} />
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3">
                  {visible.slice(0, limit).map((item) => (
                    <LibraryCard key={item.key} item={item} />
                  ))}
                </div>
              )}
              {visible.length > limit && (
                <div className="flex justify-center mt-4">
                  <button
                    type="button"
                    onClick={() => setLimit((n) => n + PAGE_SIZE)}
                    className="min-h-[44px] px-4 py-2 rounded-xl border border-black/10 bg-white text-[14px] font-medium text-black/65 hover:border-black/25 transition"
                  >
                    Показати ще ({visible.length - limit})
                  </button>
                </div>
              )}
            </>
          ) : loading ? (
            <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-2 gap-3" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="rounded-2xl border border-black/5 bg-white p-4 animate-pulse">
                  <div className="h-2.5 w-20 rounded bg-black/[0.07]" />
                  <div className="h-3.5 w-3/4 rounded bg-black/[0.07] mt-3" />
                  <div className="h-2.5 w-1/3 rounded bg-black/[0.05] mt-3" />
                </div>
              ))}
            </div>
          ) : searching ? (
            <div className="rounded-2xl bg-white border border-black/5 px-5 py-5">
              <div className="text-[14px] font-medium">Нічого не знайдено</div>
              <p className="text-[14px] text-black/60 mt-1">
                За запитом «{query.trim()}» у розділі «{FILTERS.find((f) => f.key === filter)?.label}» збігів немає.
              </p>
              {FILTERS.filter((f) => f.key !== filter && countIn(f.key) > 0).length > 0 && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[14px]">
                  {FILTERS.filter((f) => f.key !== filter && countIn(f.key) > 0).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setFilter(f.key)}
                      className="inline-flex items-center min-h-[44px] text-blue-600 hover:underline"
                    >
                      {f.label}: {countIn(f.key)} →
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : groupTotal === 0 ? (
            <div className="rounded-2xl bg-white border border-black/5 px-5 py-6">
              <div className="text-[14px] font-medium">Тут поки порожньо</div>
              <p className="text-[14px] text-black/60 mt-1">{EMPTY_COPY[filter].text}</p>
              {FILTERS.some((f) => f.key !== filter && totalIn(f.key) > 0) && (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[14px]">
                  <span className="inline-flex min-h-[44px] items-center text-black/60">У збереженому вже є:</span>
                  {FILTERS.filter((f) => f.key !== filter && totalIn(f.key) > 0).map((f) => (
                    <button key={f.key} onClick={() => setFilter(f.key)} className="inline-flex items-center min-h-[44px] text-blue-600 hover:underline">
                      {f.label}: {totalIn(f.key)} →
                    </button>
                  ))}
                </div>
              )}
              {browse[filter] && (
                <button
                  onClick={browse[filter]}
                  className="inline-flex items-center min-h-[44px] mt-3 text-[14px] font-medium text-blue-600 hover:underline"
                >
                  {EMPTY_COPY[filter].cta}
                </button>
              )}
            </div>
          ) : null}
          </div>
        </>
      )}

      {(queueState.pending.length > 0 || errorToasts.length > 0) && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed z-50 flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm ${
            // Keep clear of the meditation mini-player: above it on phones
            // (it spans the width), on the left on desktop (it sits bottom-right,
            // and a centred toast would run into it on narrower windows).
            player.meditation
              ? "left-1/2 -translate-x-1/2 bottom-28 md:left-6 md:translate-x-0 md:bottom-4"
              : "left-1/2 -translate-x-1/2 bottom-4"
          }`}
        >
          {queueState.pending.length > 0 && (
            <div className="flex items-center justify-between gap-4 rounded-xl bg-black/90 text-white text-[14px] px-4 py-3 shadow-lg">
              <span>
                {queueState.pending.length === 1
                  ? "Прибрано зі збереженого"
                  : `Прибрано ${queueState.pending.length} ${pluralUk(queueState.pending.length, "запис", "записи", "записів")}`}
              </span>
              <button
                onClick={() => queueState.pending.forEach((key) => queue.undo(key))}
                className="shrink-0 font-semibold text-[#a5b4fc] hover:text-white transition"
              >
                {queueState.pending.length === 1 ? "Скасувати" : "Скасувати все"}
              </button>
            </div>
          )}
          {errorToasts.map((id) => (
            <div key={id} className="rounded-xl bg-rose-700 text-white text-[14px] px-4 py-3 shadow-lg">
              Не вдалося прибрати зі збереженого
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
