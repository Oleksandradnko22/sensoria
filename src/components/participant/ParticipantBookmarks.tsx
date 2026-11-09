// "Закладки" — its own tab, deliberately separate from "Ваші
// спостереження" (ParticipantReflections.tsx). A bookmark is a quick-
// access utility list ("take me back to this lesson"), not a personal
// record to look back on and reflect over the way notes/mood check-ins
// are — different enough in kind that folding it into the observations
// page (an earlier pass of this feature did exactly that) blurred what
// each page was for. Purely personal: RLS on content_item_bookmarks is
// self-only, nothing author-facing.

import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { fetchAllBookmarks, removeBookmark, type Bookmark } from "../../lib/bookmarks";
import {
  fetchAllSavedFragments,
  removeSavedFragment,
  type SavedFragment,
} from "../../lib/guideFragments";

type Props = {
  onNavigate?: (key: "learning") => void;
  // Opens the program's real Lesson Player deep-linked straight to the
  // bookmarked item (ProgramExperience's initialItemId prop) — see
  // ParticipantDashboardPage's openProgramAtItem.
  onOpenProgramAtItem?: (programId: string, itemId?: string) => void;
};

export default function ParticipantBookmarks({ onNavigate, onOpenProgramAtItem }: Props) {
  const session = useSession();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // "Мої збереження" (2026-09-08, per Sasha's explicit spec) — separate
  // fetch/state/list from the lesson bookmarks above, even though both
  // live on this same page: a saved guide fragment isn't a lesson, has
  // no program to deep-link into, and is its own concept (GuideExperience's
  // per-point ♡, not the star inside a lesson). Same page because both
  // answer the same underlying question — "where do I find things I
  // marked to come back to?" — just for two different kinds of content.
  const [fragments, setFragments] = useState<SavedFragment[]>([]);
  const [fragmentsLoading, setFragmentsLoading] = useState(true);
  const [removingFragmentId, setRemovingFragmentId] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchAllBookmarks(session.profile.id)
      .then((rows) => {
        if (!cancelled) setBookmarks(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchAllSavedFragments(session.profile.id)
      .then((rows) => {
        if (!cancelled) setFragments(rows);
      })
      .finally(() => {
        if (!cancelled) setFragmentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id]);

  // No confirmation dialog — a bookmark is low-stakes, quick to re-add
  // if it was a mistake, so a second "are you sure?" step would just be
  // friction.
  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await removeBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setRemovingId(null);
    }
  };

  const handleRemoveFragment = async (id: string) => {
    setRemovingFragmentId(id);
    try {
      await removeSavedFragment(id);
      setFragments((prev) => prev.filter((f) => f.id !== id));
    } finally {
      setRemovingFragmentId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Закладки</h1>
        <p className="text-black/50 mt-1">Уроки, які ви зберегли, щоб повернутися до них пізніше.</p>
      </div>

      {loading ? null : bookmarks.length === 0 ? (
        <div className="max-w-xl rounded-2xl bg-white border border-black/5 p-10 text-center">
          <div className="text-[15px] font-medium mb-1.5">Тут з'являться ваші закладки</div>
          <p className="text-[13px] text-black/45 mb-4">
            Під час уроку є зірочка біля назви — натисніть її, щоб зберегти урок і швидко знайти
            його тут пізніше.
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate("learning")}
              className="text-[13px] font-medium text-blue-600 hover:underline"
            >
              Перейти до навчання →
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {bookmarks.map((b) => {
            const clickable = !!onOpenProgramAtItem && !!b.programId;
            return (
              <div
                key={b.id}
                onClick={clickable ? () => onOpenProgramAtItem!(b.programId!, b.contentItemId) : undefined}
                className={`rounded-2xl bg-white border border-black/5 px-5 py-4 flex items-center justify-between gap-3 ${
                  clickable ? "cursor-pointer hover:border-black/15 transition" : ""
                }`}
              >
                <div className="min-w-0">
                  {b.programTitle && <div className="text-[12px] text-black/40 truncate mb-0.5">{b.programTitle}</div>}
                  <div className="text-[14px] font-medium text-black/80 truncate">{b.itemTitle ?? "Урок"}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(b.id);
                  }}
                  disabled={removingId === b.id}
                  title="Прибрати із закладок"
                  className="shrink-0 text-black/30 hover:text-red-500 text-[18px] leading-none transition disabled:opacity-40"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* "Мої збереження" — окремі частини гайдів, а не уроки, тому
          власний заголовок і власний список, а не змішування з
          розділом вище. */}
      <div className="pt-2">
        <h2 className="text-xl font-bold">Мої збереження</h2>
        <p className="text-black/50 mt-1">Окремі частини гайдів, які ви зберегли собі.</p>
      </div>

      {fragmentsLoading ? null : fragments.length === 0 ? (
        <div className="max-w-xl rounded-2xl bg-white border border-black/5 p-10 text-center">
          <div className="text-[15px] font-medium mb-1.5">Тут з'являться збережені частини гайдів</div>
          <p className="text-[13px] text-black/45 mb-4">
            Під час читання гайду біля кожного пункту є ♡ — натисніть її, щоб зберегти саме цю
            частину, а не весь гайд.
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate("learning")}
              className="text-[13px] font-medium text-blue-600 hover:underline"
            >
              Перейти до навчання →
            </button>
          )}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {fragments.map((f) => (
            <div
              key={f.id}
              className="rounded-2xl bg-white border border-black/5 px-5 py-4 flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                {f.guideTitle && <div className="text-[12px] text-black/40 truncate mb-1">{f.guideTitle}</div>}
                <div className="text-[13.5px] text-black/75 leading-relaxed">{f.fragmentText}</div>
              </div>
              <button
                onClick={() => handleRemoveFragment(f.id)}
                disabled={removingFragmentId === f.id}
                title="Прибрати зі збережень"
                className="shrink-0 text-black/30 hover:text-red-500 text-[18px] leading-none transition disabled:opacity-40"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
