import { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import FilterPills from "./FilterPills";
import ConfirmDialog from "../author/public/ConfirmDialog";
import { filterReviews, reviewCounts, sortNewest, REVIEW_FILTER_LABEL, type ReviewFilter } from "../../utils/myActivityView";
import { REVIEW_EDIT_WINDOW_DAYS, isReviewEditable } from "../../utils/reviewEditWindow";
import {
  myReviews as mockReviews,
  myAuthorReviews as mockAuthorReviews,
  type ContentKind,
} from "../../data/participantDashboard";
import { fetchMyReviews, upsertReview, deleteReview, type ReviewRow } from "../../lib/reviews";
import {
  fetchMyAuthorReviews,
  upsertAuthorReview,
  deleteAuthorReview,
  type AuthorReviewRow,
} from "../../lib/authorReviews";
import { useSession } from "../../context/SessionContext";
import { useOpenAuthorProfile } from "../../context/AuthorProfileContext";
import { formatAbsoluteDate } from "../../utils/relativeTime";

// A single review card can represent either a per-content review
// (kind: "content" — the original, existing feature) or an author-level
// review (kind: "author" — new). Unifying both into one list is what
// Sasha asked for; the two kinds differ only in title/subline and in
// which lib function saves/deletes them.
type UnifiedReview = {
  id: string;
  kind: "content" | "author";
  contentId: string | null;
  contentKind: ContentKind | null;
  authorId: string | null;
  authorName: string | null;
  title: string;
  rating: number;
  text: string;
  date: string;
  authorReply?: string;
  real: boolean;
};

const KIND_LABEL: Record<ContentKind, string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};

function toUnifiedContent(r: ReviewRow): UnifiedReview {
  return {
    id: r.id,
    kind: "content",
    contentId: r.contentId,
    contentKind: r.contentKind,
    authorId: null,
    authorName: r.authorName,
    title: r.contentTitle,
    rating: r.rating,
    text: r.text,
    date: r.createdAt,
    authorReply: r.authorReply ?? undefined,
    real: true,
  };
}

function toUnifiedAuthor(r: AuthorReviewRow): UnifiedReview {
  return {
    id: r.id,
    kind: "author",
    contentId: null,
    contentKind: null,
    authorId: r.authorId,
    authorName: r.authorName,
    title: r.authorName,
    rating: r.rating,
    text: r.text,
    date: r.createdAt,
    real: true,
  };
}

type Props = {
  active?: boolean;
  onNavigate?: (key: "learning") => void;
  // Second arg lets "Переглянути відгук" ask the program preview to
  // scroll straight to its reviews block instead of opening at the top.
  onOpenProgram?: (id: string, opts?: { scrollToReviews?: boolean }) => void;
  onOpenGuide?: (id: string) => void;
  onOpenMeditation?: (id: string) => void;
};

export default function ParticipantReviews({
  active = true,
  onNavigate,
  onOpenProgram,
  onOpenGuide,
  onOpenMeditation,
}: Props) {
  const session = useSession();
  const openAuthorProfile = useOpenAuthorProfile();
  const [realReviews, setRealReviews] = useState<ReviewRow[]>([]);
  const [authorReviews, setAuthorReviews] = useState<AuthorReviewRow[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [hiddenDemo, setHiddenDemo] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [draftRating, setDraftRating] = useState(5);
  const [saving, setSaving] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = (quiet = false) => {
    if (!session) return;
    if (!quiet) setLoadState("loading");
    Promise.all([
      fetchMyReviews(session.profile.id, { strict: true }),
      fetchMyAuthorReviews(session.profile.id, { strict: true }),
    ])
      .then(([c, a]) => {
        setRealReviews(c);
        setAuthorReviews(a);
        setLoadState("ready");
      })
      .catch(() => !quiet && setLoadState("error"));
  };
  const firstLoad = useRef(true);
  useEffect(() => {
    if (!active) return;
    load(!firstLoad.current);
    firstLoad.current = false;
  }, [session?.profile.id, active]); // eslint-disable-line react-hooks/exhaustive-deps

  const unsorted: UnifiedReview[] = [
    ...realReviews.map(toUnifiedContent),
    ...authorReviews.map(toUnifiedAuthor),
    ...mockReviews.map((r) => ({
      id: r.id,
      kind: "content" as const,
      contentId: r.contentId,
      contentKind: r.contentKind,
      authorId: null,
      authorName: r.authorName,
      title: r.title,
      rating: r.rating,
      text: r.text,
      date: r.date,
      authorReply: r.authorReply,
      real: false,
    })),
    ...mockAuthorReviews.map((r) => ({
      id: r.id,
      kind: "author" as const,
      contentId: null,
      contentKind: null,
      authorId: null,
      authorName: r.authorName,
      title: r.authorName,
      rating: r.rating,
      text: r.text,
      date: r.date,
      real: false,
    })),
  ];
  const reviews = sortNewest(unsorted.filter((r) => !hiddenDemo.has(r.id)), (r) => r.date);

  const openContent = (r: UnifiedReview, opts?: { scrollToReviews?: boolean }) => {
    if (!r.contentKind || !r.contentId) return;
    if (r.contentKind === "program") onOpenProgram?.(r.contentId, opts);
    if (r.contentKind === "guide") onOpenGuide?.(r.contentId);
    if (r.contentKind === "meditation") onOpenMeditation?.(r.contentId);
  };

  const canOpenContent = (r: UnifiedReview) =>
    r.kind === "content" &&
    !!r.contentKind &&
    ((r.contentKind === "program" && !!onOpenProgram) ||
      (r.contentKind === "guide" && !!onOpenGuide) ||
      (r.contentKind === "meditation" && !!onOpenMeditation));

  const startEdit = (review: UnifiedReview) => {
    // Defensive — the UI already hides/disables every path that leads
    // here once the 14-day window has passed, this just makes sure
    // nothing can slip through.
    if (!isReviewEditable(review.date)) return;
    setMenuOpenId(null);
    setActionError(null);
    setEditingId(review.id);
    setDraftText(review.text);
    setDraftRating(review.rating);
  };

  const saveEdit = async () => {
    if (!editingId || !draftText.trim() || !session) return;
    const editing = reviews.find((r) => r.id === editingId);
    if (!editing) return;

    if (editing.real && editing.kind === "content" && editing.contentId) {
      setSaving(true);
      try {
        await upsertReview({
          participantId: session.profile.id,
          contentId: editing.contentId,
          rating: draftRating,
          text: draftText.trim(),
        });
        setRealReviews((prev) =>
          prev.map((r) =>
            r.id === editingId ? { ...r, text: draftText.trim(), rating: draftRating } : r
          )
        );
        setEditingId(null);
      } catch {
        setActionError("Не вдалося зберегти відгук. Спробуйте ще раз.");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (editing.real && editing.kind === "author" && editing.authorId) {
      setSaving(true);
      try {
        await upsertAuthorReview({
          participantId: session.profile.id,
          authorId: editing.authorId,
          rating: draftRating,
          text: draftText.trim(),
        });
        setAuthorReviews((prev) =>
          prev.map((r) =>
            r.id === editingId ? { ...r, text: draftText.trim(), rating: draftRating } : r
          )
        );
        setEditingId(null);
      } catch {
        setActionError("Не вдалося зберегти відгук. Спробуйте ще раз.");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Demo review — local-only, exactly as before.
    setEditingId(null);
  };

  const confirmDelete = async (review: UnifiedReview) => {
    if (!review.real) {
      // Demo review — nothing persisted to delete, just drop the
      // confirmation UI as if it worked.
      setHiddenDemo((p) => new Set(p).add(review.id));
      setConfirmDeleteId(null);
      return;
    }
    setDeleting(true);
    try {
      if (review.kind === "content") {
        await deleteReview(review.id);
        setRealReviews((prev) => prev.filter((r) => r.id !== review.id));
      } else {
        await deleteAuthorReview(review.id);
        setAuthorReviews((prev) => prev.filter((r) => r.id !== review.id));
      }
      setConfirmDeleteId(null);
    } catch {
      setConfirmDeleteId(null);
      setActionError("Не вдалося видалити відгук. Спробуйте ще раз.");
    } finally {
      setDeleting(false);
    }
  };

  const confirmingReview = reviews.find((r) => r.id === confirmDeleteId) ?? null;
  const counts = reviewCounts(reviews);
  // a filter whose last review was deleted must not stay selected with no pill
  useEffect(() => {
    if (filter !== "all" && counts[filter] === 0) setFilter("all");
  }, [counts, filter]);
  const shown = filterReviews(reviews, filter);

  useEffect(() => {
    if (!menuOpenId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpenId(null);
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-review-menu]")) setMenuOpenId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menuOpenId]);

  const options = (["all", "program", "guide", "meditation", "author"] as ReviewFilter[])
    .filter((k) => k === "all" || counts[k] > 0)
    .map((k) => ({ key: k, label: REVIEW_FILTER_LABEL[k], count: counts[k] }));

  return (
    <div className="flex flex-col gap-6">
      <header className="min-w-0">
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Мої відгуки</h1>
        <p className="mt-1 text-[15px] text-black/55">Відгуки, які ви залишили на програми, гайди, медитації та авторів.</p>
      </header>

      {loadState === "loading" && (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Завантаження відгуків">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[132px] rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] animate-pulse" />
          ))}
        </div>
      )}

      {loadState === "error" && (
        <div role="alert" className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] px-6 py-10 text-center">
          <div className="text-[18px] font-bold text-[#12172b]">Не вдалося завантажити відгуки</div>
          <button onClick={() => load()} className="mt-3 min-h-[44px] px-5 rounded-xl bg-white ring-1 ring-[#e3def9] text-[14px] font-semibold text-[#4338ca] hover:ring-[#c9bff7] hover:bg-[#faf9ff]">
            Спробувати ще раз
          </button>
        </div>
      )}

      {loadState === "ready" && (
        <>
          {reviews.length > 0 && options.length > 1 && (
            <FilterPills label="Фільтр відгуків за типом" value={filter} onChange={setFilter} options={options} />
          )}
          {actionError && <div role="alert" className="text-[14px] text-rose-700">{actionError}</div>}

          {reviews.length === 0 ? (
            <div className="max-w-[560px] rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] px-6 py-10 text-center">
              <span className="mx-auto w-14 h-14 rounded-2xl bg-[#f1eeff] text-[#7a68e0] flex items-center justify-center">
                <Icon name="star" size={22} />
              </span>
              <div className="text-[18px] font-bold text-[#12172b] mt-4">Відгуків поки немає</div>
              <p className="text-[14px] text-black/60 mt-1 max-w-[400px] mx-auto leading-relaxed">
                Після роботи з матеріалами ви зможете поділитися своїм досвідом. Ваші відгуки допоможуть іншим
                учасникам обирати корисний контент.
              </p>
              {onNavigate && (
                <button
                  onClick={() => onNavigate("learning")}
                  className="mt-4 min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-semibold shadow-[0_10px_24px_-12px_rgba(91,61,245,0.7)] hover:opacity-95"
                >
                  Перейти до навчання
                </button>
              )}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] px-6 py-8 text-center text-[14px] text-black/60">
              У цій категорії відгуків немає.
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((r) => {
                const isEditing = editingId === r.id;
                const unavailable = r.kind === "content" && !r.title;
                const bucket = r.kind === "author" ? "Відгук про автора" : r.contentKind ? KIND_LABEL[r.contentKind] : null;
                return (
                  <li key={r.id} className="rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] p-5 sm:p-6 flex gap-4">
                    <span className="hidden sm:flex shrink-0 w-12 h-12 rounded-2xl bg-[#f1eeff] text-[#6d5bd0] items-center justify-center" aria-hidden="true">
                      <Icon name={r.kind === "author" ? "idcard" : r.contentKind ?? "star"} size={20} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {canOpenContent(r) ? (
                            <button onClick={() => openContent(r)} className="text-left text-[17px] font-bold text-[#12172b] hover:text-[#4338ca] break-words py-2.5 -my-2.5">
                              {r.title}
                            </button>
                          ) : (
                            <h2 className={`text-[17px] font-bold break-words ${unavailable ? "text-black/50" : "text-[#12172b]"}`}>
                              {unavailable ? "Матеріал більше недоступний" : r.title}
                            </h2>
                          )}
                          <div className="mt-0.5 text-[13px] text-black/55 break-words">
                            {r.kind === "author" ? (
                              <>
                                Відгук про автора
                                {r.authorId && (
                                  <>
                                    {" · "}
                                    <button onClick={() => openAuthorProfile(r.authorId!)} className="font-medium text-[#4338ca] hover:underline py-3 -my-3">
                                      Переглянути профіль
                                    </button>
                                  </>
                                )}
                              </>
                            ) : (
                              [bucket, r.authorName].filter(Boolean).join(" · ")
                            )}
                          </div>
                        </div>
                        <span className="shrink-0 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                          Опубліковано
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="mt-3 flex flex-col gap-3">
                          <div className="flex gap-1" role="radiogroup" aria-label="Оцінка">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                role="radio"
                                aria-checked={n === draftRating}
                                aria-label={`${n} з 5`}
                                onClick={() => setDraftRating(n)}
                                className={`w-11 h-11 text-[24px] leading-none ${n <= draftRating ? "text-amber-500" : "text-[#e3def9]"}`}
                              >
                                ★
                              </button>
                            ))}
                          </div>
                          <textarea
                            value={draftText}
                            onChange={(e) => setDraftText(e.target.value)}
                            rows={3}
                            aria-label="Текст відгуку"
                            className="w-full px-4 py-3 rounded-xl bg-[#faf9ff] ring-1 ring-[#e3def9] text-[16px] sm:text-[15px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0] resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <button onClick={saveEdit} disabled={saving || !draftText.trim()} className="min-h-[44px] px-5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-semibold shadow-[0_10px_24px_-12px_rgba(91,61,245,0.7)] hover:opacity-95 disabled:opacity-40">
                              {saving ? "Зберігаємо…" : "Зберегти"}
                            </button>
                            <button onClick={() => setEditingId(null)} disabled={saving} className="min-h-[44px] px-4 rounded-xl text-[14px] font-medium text-black/60 hover:bg-[#f6f4ff]">
                              Скасувати
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="text-amber-500 text-[18px] mt-2.5 leading-none tracking-[0.08em]" role="img" aria-label={`Оцінка ${r.rating} з 5`}>
                            {"★".repeat(r.rating)}
                            <span className="text-[#e3def9]">{"★".repeat(5 - r.rating)}</span>
                          </div>
                          <p className="text-[15px] text-[#2d2a5c] leading-relaxed mt-2.5 whitespace-pre-wrap break-words">{r.text}</p>
                          <div className="text-[12px] font-medium text-black/45 mt-2">{formatAbsoluteDate(r.date)}</div>
                          {r.authorReply && (
                            <div className="mt-3 rounded-2xl bg-[#faf9ff] px-4 py-3 ring-1 ring-[#f1eefb]">
                              <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#6d5bd0]">Відповідь автора</div>
                              <p className="mt-1 text-[14px] text-[#2d2a5c] leading-relaxed whitespace-pre-wrap break-words">{r.authorReply}</p>
                            </div>
                          )}
                          <div className="flex items-center justify-end mt-1">
                            <div className="relative" data-review-menu>
                              <button
                                onClick={() => setMenuOpenId(menuOpenId === r.id ? null : r.id)}
                                aria-label="Дії з відгуком"
                                aria-expanded={menuOpenId === r.id}
                                className="w-11 h-11 rounded-full hover:bg-[#f1eeff] flex items-center justify-center text-black/60 text-xl transition"
                              >
                                ⋯
                              </button>
                              {menuOpenId === r.id && (
                                <div className="absolute right-0 bottom-full mb-1 w-60 rounded-2xl bg-white p-1.5 ring-1 ring-[#ebe8ff] shadow-[0_18px_40px_-12px_rgba(30,41,90,0.35)] z-10">
                                  {canOpenContent(r) && (
                                    <button
                                      onClick={() => {
                                        setMenuOpenId(null);
                                        openContent(r, { scrollToReviews: true });
                                      }}
                                      className="w-full text-left rounded-xl px-3 py-2.5 text-[14px] font-medium text-[#12172b] hover:bg-[#f1eeff]"
                                    >
                                      Відкрити матеріал
                                    </button>
                                  )}
                                  {isReviewEditable(r.date) ? (
                                    <button onClick={() => startEdit(r)} className="w-full text-left rounded-xl px-3 py-2.5 text-[14px] font-medium text-[#12172b] hover:bg-[#f1eeff]">
                                      Редагувати
                                    </button>
                                  ) : (
                                    <div className="px-3 py-2.5 text-[14px] text-black/50" title={`Редагування доступне протягом ${REVIEW_EDIT_WINDOW_DAYS} днів після публікації`}>
                                      Редагувати
                                      <div className="text-[12px] mt-0.5">Минуло {REVIEW_EDIT_WINDOW_DAYS} днів</div>
                                    </div>
                                  )}
                                  <button
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      setActionError(null);
                                      setConfirmDeleteId(r.id);
                                    }}
                                    className="w-full text-left rounded-xl px-3 py-2.5 text-[14px] font-medium text-rose-700 hover:bg-rose-50"
                                  >
                                    Видалити
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {confirmingReview && (
        <ConfirmDialog
          title="Видалити відгук?"
          text="Після видалення цей відгук більше не буде відображатися для інших учасників."
          confirmLabel="Видалити"
          busy={deleting}
          onConfirm={() => confirmDelete(confirmingReview)}
          onCancel={() => setConfirmDeleteId(null)}
        />
      )}

    </div>
  );
}
