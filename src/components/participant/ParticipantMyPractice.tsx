// "Моя практика" — the audio/video tools a person chose to keep using
// past course completion (see ProgramExperience.tsx's "Що хочете
// залишити собі?" checklist on the completed screen). Deliberately its
// own tab, not folded into "Закладки" or "Ваші спостереження" —
// different concept from both: not "take me back to this lesson"
// (bookmarks) and not a personal record to look back on (reflections/
// mood), but a small working toolkit of things you keep actually
// using. The course itself is over; these individual pieces aren't.
//
// Meditations (2026-08-28, per Sasha's explicit call — "Це дуже
// важливий розділ для Sensoria"): the exact same concept now also
// covers a full meditation, saved via ♡ Зберегти on its own completed
// screen (MeditationExperience.tsx), not just a lesson kept from a
// finished course. `kind` on the row (lib/savedPractices.ts) tells the
// two apart; a meditation row's title/duration/icon are looked up
// straight from data/meditations.ts (contentItemId holds its id)
// rather than duplicated into the saved row itself.

import { Icon, type IconName } from "../ui/Icon";
import { useEffect, useState } from "react";
import { useSession } from "../../context/SessionContext";
import { useMeditationPlayer } from "../../context/MeditationPlayerContext";
import { fetchAllSavedPractices, removeSavedPractice, type SavedPractice } from "../../lib/savedPractices";
import { meditations } from "../../data/meditations";

type Props = {
  onNavigate?: (key: "learning") => void;
  // Opens the program's real Lesson Player deep-linked straight to the
  // saved item (ProgramExperience's initialItemId prop) — see
  // ParticipantDashboardPage's openProgramAtItem.
  onOpenProgramAtItem?: (programId: string, itemId?: string) => void;
  // Opens MeditationExperience for a saved meditation's own id — see
  // ParticipantDashboardPage's setContinuingMeditationId.
  onOpenMeditation?: (meditationId: string) => void;
};

// A light per-topic flourish (matches Sasha's own example — 🧘/🌙/🌿
// varying by what the meditation is actually for) rather than one flat
// icon for every row. Falls back to 🧘 for anything unmapped/untagged.
// Keys are limited to tags that actually appear in data/meditations.ts
// (2026-08-30 cleanup) — innerPressure/recovery/awareness were dead
// entries that no real meditation's tags ever matched.
const MEDITATION_TAG_ICON: Record<string, IconName> = {
  anxiety: "meditation",
  emotionalBalance: "meditation",
  stress: "leaf",
  burnout: "moon",
  selfEsteem: "heart",
};

function meditationIcon(tags: string[]): IconName {
  for (const tag of tags) {
    const icon = MEDITATION_TAG_ICON[tag];
    if (icon) return icon;
  }
  return "meditation";
}

export default function ParticipantMyPractice({ onNavigate, onOpenProgramAtItem, onOpenMeditation }: Props) {
  const session = useSession();
  const player = useMeditationPlayer();
  const [practices, setPractices] = useState<SavedPractice[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Re-fetches on savedPracticeVersion, not just on mount — this page
  // stays mounted after its first visit (ParticipantDashboardPage's
  // keep-alive tabs), so without this the list only ever reflected
  // whatever was saved the first time you opened "Моя практика".
  // Toggling ♡ elsewhere (the card on "Моє навчання", or the
  // meditation's own completed screen) never touches this component
  // directly — this is how it hears about it. This is almost certainly
  // what Sasha's "додає, але не одразу — тільки після оновлення
  // сторінки" was actually describing: not the heart icon itself, but
  // the item failing to show up here without a reload.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetchAllSavedPractices(session.profile.id)
      .then((rows) => {
        if (!cancelled) setPractices(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.profile.id, player.savedPracticeVersion]);

  // No confirmation dialog — same reasoning as ParticipantBookmarks.tsx:
  // low-stakes, one tap to add back at the next course completion (or
  // meditation) or by saving it again.
  const handleRemove = async (id: string) => {
    setRemovingId(id);
    try {
      await removeSavedPractice(id);
      setPractices((prev) => prev.filter((p) => p.id !== id));
      // Lets a meditation card on "Моє навчання" (a separate, possibly
      // already-mounted instance) drop its own ♥ without needing a
      // reload — same savedPracticeVersion signal the card's own toggle
      // and the completed-screen toggle both send.
      player.bumpSavedPracticeVersion();
    } finally {
      setRemovingId(null);
    }
  };

  const meditationPractices = practices.filter((p) => p.kind === "meditation");
  const coursePractices = practices.filter((p) => p.kind !== "meditation");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold">Моя практика</h1>
        <p className="text-black/60 mt-1">
          Інструменти й медитації, які ви вирішили залишити собі.
        </p>
      </div>

      {loading ? null : practices.length === 0 ? (
        <div className="max-w-xl rounded-2xl bg-white border border-black/5 p-10 text-center">
          <div className="text-[16px] font-medium mb-1.5">Тут з'являться ваші практики</div>
          <p className="text-[14px] text-black/60 mb-4">
            Після завершення курсу можна вибрати, які аудіо- чи відео-інструменти залишити собі, а після
            медитації — натиснути «♡ Зберегти». Все це залишиться тут.
          </p>
          {onNavigate && (
            <button
              onClick={() => onNavigate("learning")}
              className="text-[14px] font-medium text-blue-600 hover:underline"
            >
              Перейти до навчання →
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Meditations and course tools are different enough things
              (a full session vs. a piece kept from a finished course)
              that mixing them into one grid made the section read as
              cluttered — per Sasha's explicit call (2026-08-28), each
              gets its own labeled group instead, meditations first. */}
          {meditationPractices.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[14px] font-semibold text-black/60 uppercase tracking-wide">Медитації</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {meditationPractices.map((p) => (
                  <PracticeRow
                    key={p.id}
                    p={p}
                    onOpenMeditation={onOpenMeditation}
                    removing={removingId === p.id}
                    onRemove={() => handleRemove(p.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {coursePractices.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-[14px] font-semibold text-black/60 uppercase tracking-wide">З курсів</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {coursePractices.map((p) => (
                  <PracticeRow
                    key={p.id}
                    p={p}
                    onOpenProgramAtItem={onOpenProgramAtItem}
                    removing={removingId === p.id}
                    onRemove={() => handleRemove(p.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PracticeRow({
  p,
  onOpenMeditation,
  onOpenProgramAtItem,
  removing,
  onRemove,
}: {
  p: SavedPractice;
  onOpenMeditation?: (meditationId: string) => void;
  onOpenProgramAtItem?: (programId: string, itemId?: string) => void;
  removing: boolean;
  onRemove: () => void;
}) {
  const isMeditation = p.kind === "meditation";
  const meditation = isMeditation ? meditations.find((m) => m.id === p.contentItemId) : undefined;
  const clickable = isMeditation ? !!onOpenMeditation : !!onOpenProgramAtItem && !!p.programId;
  const handleClick = () => {
    if (!clickable) return;
    if (isMeditation) onOpenMeditation!(p.contentItemId);
    else onOpenProgramAtItem!(p.programId!, p.contentItemId);
  };
  return (
    <div
      onClick={clickable ? handleClick : undefined}
      className={`rounded-2xl bg-white border border-black/5 px-5 py-4 flex items-center justify-between gap-3 ${
        clickable ? "cursor-pointer hover:border-black/15 transition" : ""
      }`}
    >
      <div className="min-w-0">
        {isMeditation ? (
          <div className="text-[14px] font-medium text-black/80 truncate flex items-center gap-1.5">
            <span className="shrink-0 text-black/45"><Icon name={meditationIcon(meditation?.tags ?? [])} size={16} /></span>
            <span className="truncate">
              {p.itemTitle ?? meditation?.title ?? "Медитація"}
              {meditation && <span className="text-black/60 font-normal"> — {meditation.duration}</span>}
            </span>
          </div>
        ) : (
          <>
            {p.programTitle && <div className="text-[12px] text-black/60 truncate mb-0.5">{p.programTitle}</div>}
            <div className="text-[14px] font-medium text-black/80 truncate">{p.itemTitle ?? "Практика"}</div>
          </>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        disabled={removing}
        title="Прибрати з «Моя практика»"
        className="shrink-0 text-black/60 hover:text-red-500 text-[20px] leading-none transition disabled:opacity-40"
      >
        ×
      </button>
    </div>
  );
}
