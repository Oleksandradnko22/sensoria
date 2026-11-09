import { useEffect, useRef, useState } from "react";
import type { Program } from "../../data/programs";
import type { Profile } from "../../lib/auth";
import { fetchReviewsForContentIds, type ReviewRow } from "../../lib/reviews";
import { fetchProgramModules, fetchProgramItems } from "../../lib/publicContent";
import { getProgramModules } from "../../lib/programProgress";
import { computeProgress } from "../../lib/contentProgress";
import { fetchServerProgress } from "../../lib/contentProgressSync";
import { fetchAuthorPublicReviews, prefetchAuthorProfile, type AuthorPublicReview } from "../../lib/authorPublic";
import { mergeProgress } from "../../lib/mergeProgress";
import { getItemProgress } from "../../utils/demoProgressStore";
import { fetchAllSavedPrograms } from "../../lib/programSaves";
import { fetchAcquired } from "../../lib/acquired";
import { fetchAuthorDetails, type AuthorDetails } from "../../lib/authorDetails";
import type { ContentModule, ItemProgressMap, ProgramProgressSummary } from "../../data/contentTypes";

export type RealModules = Awaited<ReturnType<typeof fetchProgramModules>>;

// Everything the detail page loads for one program. Same primitives the old
// preview modal used (single-program fetches, not the dashboard's bulk ones).
// `progressRev` — bump it (e.g. when the lesson player closes) to re-read the viewer's progress.
export function useProgramDetailData(program: Program | null, session: Profile | null | undefined, progressRev = 0) {
  const programId = program?.id;
  const authorId = program?.authorId;

  const [realModules, setRealModules] = useState<RealModules>([]);
  const [modulesLoaded, setModulesLoaded] = useState(false);
  useEffect(() => {
    setModulesLoaded(false);
    if (!programId || !authorId) {
      setRealModules([]);
      setModulesLoaded(true);
      return;
    }
    let cancelled = false;
    fetchProgramModules(programId)
      .then((rows) => !cancelled && setRealModules(rows))
      .catch(() => !cancelled && setRealModules([]))
      .finally(() => !cancelled && setModulesLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [programId, authorId]);

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [reviewsRev, setReviewsRev] = useState(0);
  useEffect(() => {
    if (!programId || !authorId) {
      setReviews([]);
      return;
    }
    let cancelled = false;
    fetchReviewsForContentIds([programId])
      .then((rows) => !cancelled && setReviews(rows))
      .catch(() => !cancelled && setReviews([]));
    return () => {
      cancelled = true;
    };
  }, [programId, authorId, reviewsRev]);

  // Reviews about the author as a person — shown together with the program's reviews.
  const [authorReviews, setAuthorReviews] = useState<AuthorPublicReview[]>([]);
  useEffect(() => {
    if (!authorId) {
      setAuthorReviews([]);
      return;
    }
    let cancelled = false;
    fetchAuthorPublicReviews(authorId)
      .then((rows) => !cancelled && setAuthorReviews(rows))
      .catch(() => !cancelled && setAuthorReviews([]));
    return () => {
      cancelled = true;
    };
  }, [authorId, reviewsRev]);

  // Warm the «Автор» tab: its data starts loading as soon as the page opens.
  useEffect(() => {
    if (authorId) prefetchAuthorProfile(authorId).catch(() => undefined);
  }, [authorId]);

  const [author, setAuthor] = useState<AuthorDetails | null>(null);
  useEffect(() => {
    setAuthor(null);
    if (!authorId) return;
    let cancelled = false;
    fetchAuthorDetails(authorId)
      .then((d) => !cancelled && setAuthor(d))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authorId]);

  // Participation: undefined = loading, null = none.
  const [progressMap, setProgressMap] = useState<ItemProgressMap | null | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  // The viewer already has this program in their cabinet (e.g. took it while it was free): it never becomes a purchase.
  const [owned, setOwned] = useState(false);
  const [itemModules, setItemModules] = useState<ContentModule[] | null | undefined>(undefined);
  const userId = session?.id;
  const role = session?.role;
  const sessionPending = session === undefined;
  // Coming back to the tab (e.g. after studying in another one) re-reads the progress.
  const [focusRev, setFocusRev] = useState(0);
  const loadedFor = useRef("");
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setFocusRev((n) => n + 1);
    const onChanged = () => setFocusRev((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("sensoria:progress-changed", onChanged);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("sensoria:progress-changed", onChanged);
    };
  }, []);
  useEffect(() => {
    if (!programId) return;
    if (sessionPending) return; // still finding out who is signed in
    if (!userId || role !== "participant") {
      setProgressMap(null);
      setSaved(false);
      setOwned(false);
      setItemModules(null);
      return;
    }
    let cancelled = false;
    // a different person signed in (or first load): forget the previous answer so the button shows "checking", not a stale state
    setProgressMap((prev) => (loadedFor.current === `${userId}:${programId}` ? prev : undefined));
    setItemModules((prev) => (loadedFor.current === `${userId}:${programId}` ? prev : undefined));
    Promise.all([fetchServerProgress(programId, userId), fetchAllSavedPrograms(userId), fetchAcquired(userId)])
      .then(async ([progress, savedRows, acquiredRows]) => {
        if (cancelled) return;
        // The lesson player writes to this device first and to the server a moment later, so the
        // server copy alone can lag behind: take the higher status per lesson from both.
        const local = getItemProgress(userId, programId, false);
        const hasLocal = Object.keys(local).length > 0;
        setProgressMap(progress || hasLocal ? mergeProgress(progress ?? {}, local) : null);
        setSaved(savedRows.some((s) => s.programId === programId));
        setOwned(acquiredRows.some((a) => a.kind === "program" && a.contentId === programId));
        const modules = getProgramModules(programId) ?? (await fetchProgramItems(programId));
        if (!cancelled) {
          setItemModules(modules);
          loadedFor.current = `${userId}:${programId}`;
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProgressMap(null);
          setItemModules(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [programId, userId, role, sessionPending, progressRev, focusRev]);

  const progress: ProgramProgressSummary | null = progressMap && itemModules ? computeProgress(itemModules, progressMap) : null;

  // True until we know whether the viewer already has this program (so the button never flashes a wrong state).
  const progressLoading = session === undefined || (role === "participant" && (progressMap === undefined || (!!progressMap && itemModules === undefined)));

  return {
    progressLoading,
    // Item-level data, present only for a participant who has progress on this program.
    itemModules: progressMap && itemModules ? itemModules : null,
    progressMap: progressMap ?? null,
    realModules,
    modulesLoaded,
    reviews,
    authorReviews,
    refreshReviews: () => setReviewsRev((n) => n + 1),
    author,
    progress,
    saved,
    owned,
  };
}
