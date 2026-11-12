// A meditation's experience: INTRO → CHECK-IN (optional) → PLAYER → REPORT
// (completed, or "stopped" after a manual early finish). Reusable by nature —
// no modules, no required items, no percent; a session history of three
// facts (count, last started, last completed), nothing competitive.
//
// Audio: the real <audio> element, volume/speed/seek, timer, position resume
// and Media Session live ONE level up in context/MeditationPlayerContext.tsx —
// a single app-wide player that outlives this screen (close it and the audio
// keeps playing in the mini player). This component is a thin, disposable
// view over that player.
//
// Identity: everything saved (position, sessions, check-ins, saved practice,
// feedback, reports, author) is keyed by the stable `meditation.id`; check-in
// options are stored as stable keys (data/meditationCheckin.ts).

import { Icon } from "../ui/Icon";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { meditations } from "../../data/meditations";
import {
  completeSession,
  currentSessionFor,
  describeResult,
  isSessionOver,
  recordAfter,
  recordBefore,
  startSession as startSessionRecord,
  stopSession,
} from "../../utils/meditationSession";
import { loadSessionLog, newSessionId, updateSessionLog } from "../../utils/meditationSessionLog";
import {
  CHANGE_OPTIONS,
  FEELING_OPTIONS,
  joinChangeNote,
  normalizeStates,
  parseChangeNote,
} from "../../data/meditationCheckin";
import { findBackgroundTrack, availableBackgroundTracks } from "../../data/meditationBackgroundSounds";
import { getSessionHistory } from "../../utils/meditationSessionStore";
import { formatRelativeTime } from "../../utils/relativeTime";
import { formatClock } from "../../utils/formatClock";
import { isCheckinDisabled, disableCheckinForever } from "../../utils/meditationCheckinPrefs";
import { fetchMeditationAudioPosition, isResumablePosition } from "../../lib/meditationAudioPositions";
import {
  fetchSavedPractice,
  addSavedPractice,
  removeSavedPractice,
  type SavedPractice,
} from "../../lib/savedPractices";
import {
  isMeditationDownloaded,
  downloadMeditationAudio,
  deleteMeditationDownload,
  NoStorageSpaceError,
} from "../../lib/meditationDownloads";
import { fetchItemFeedback, submitItemFeedback, type FeedbackValue } from "../../lib/itemFeedback";
import { useSession } from "../../context/SessionContext";
import { useMeditationPlayer, type PlaybackRate } from "../../context/MeditationPlayerContext";
import {
  createMeditationMoodCheckin,
  submitMeditationMoodAfter,
  submitMeditationMoodChangeNote,
  fetchMeditationMoodCheckin,
} from "../../lib/meditationMoodCheckins";
import { fetchMeditationAuthorId } from "../../lib/contentAuthors";
import { meditationPalette } from "../../lib/meditationPalette";
import { meditationVisualFamily } from "../../lib/meditationVisualFamily";
import AskAuthorBox from "./AskAuthorBox";
import { useOpenAuthorProfile } from "../../context/AuthorProfileContext";
import MeditationVisualObject from "./MeditationVisualObject";
import MeditationReportModal from "./MeditationReportModal";
import { publicTranscript } from "../../utils/meditationTranscript";
import MeditationDownloadPicker, { type MeditationDownloadChoice } from "./MeditationDownloadPicker";

type Props = {
  meditationId: string;
  onClose: () => void;
};

// "stopped" (2026-08-30, per Sasha's explicit call — "сохранение ≠
// прохождение"): a real, separate outcome from "completed", not just
// a different heading on the same screen. Reached only via a genuine
// manual "Завершити" mid-practice — a natural/timer end always goes
// to "completed" instead (see the auto-advance effect below).
type View = "intro" | "checkin" | "player" | "stopped" | "completed";

const PLAYBACK_RATES: PlaybackRate[] = [0.75, 1, 1.25];

// "Таймер" — Sasha's explicit call (2026-08-28): especially useful for
// minimal/silent-format sessions with no constant voice guidance,
// where the point is just to sit for a chosen stretch rather than
// follow the voice track to its own end. Fixed lengths, same "quick to
// tap" spirit as everything else here.
const TIMER_MINUTES = [5, 10, 15, 20, 30];

// "Як ви почуваєтесь зараз?" — Sasha's explicit call (2026-08-28): a
// signature Sensoria feature, entirely optional, offered right before
// starting. Fixed set of states rather than free text — quick to tap,
// nothing to type, and a closed set is what lets these ever be
// aggregated/compared later.

// "Що змінилося?" — shown alongside the "Як ви зараз?" scale on the
// completed screen (2026-08-30, per Sasha's explicit call). Now a
// checklist (multiple can apply at once), not a single pick — stored
// as one joined string in meditation_mood_checkins.change_note (see
// toggleChangeNote below), no schema change needed for that.

// Joins/splits CHANGE_OPTIONS picks for the single change_note text
// column — see CHANGE_OPTIONS' own comment.

// Shared 1-5 scale for BOTH the pre-session "Наскільки сильна
// напруга?" and the post-session "Як ви зараз?" (2026-08-30, per
// Sasha's explicit call — "об'єднати до 1-5 всюди", replacing the old
// 10-button grid on the before-step and the old 1-10 number picker on
// the after-step). 1 = 😣 напружено, 5 = 😌 спокійно, on both ends of
// the same "Було ... Стало ..." pair, so they stay directly
// comparable.
const MOOD_SCALE: { value: number; label: string }[] = [
  { value: 1, label: "дуже напружено" },
  { value: 2, label: "напружено" },
  { value: 3, label: "посередині" },
  { value: 4, label: "доволі спокійно" },
  { value: 5, label: "спокійно" },
];

// Small inline download-cloud glyph for the "Зберегти офлайн" pill
// (2026-09-24, per Sasha's explicit request to give that action a real
// icon instead of just text) — a plain SVG rather than pulling in an
// icon library dependency for one glyph. `filled` switches to a solid
// checkmark-in-circle once the download has actually completed, so the
// pill's icon itself communicates "done" rather than relying on color
// alone.
function DownloadIcon({ className, filled }: { className?: string; filled?: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 24 24" fill="none" className={className}>
        <circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity="0.18" />
        <path d="M7.5 12.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 3.5v11m0 0l-3.5-3.5M12 14.5l3.5-3.5M5 16.5v1.5A2.5 2.5 0 0 0 7.5 20.5h9a2.5 2.5 0 0 0 2.5-2.5v-1.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function MeditationExperience({ meditationId, onClose }: Props) {
  const meditation = meditations.find((m) => m.id === meditationId);
  const session = useSession();
  const player = useMeditationPlayer();
  const openAuthorProfile = useOpenAuthorProfile();

  // "Запитати автора" (2026-09-09, per Sasha's explicit spec) — resolved
  // via meditation_authors (lib/contentAuthors.ts). `null` (not
  // undefined) once loaded-but-absent, same reasoning as
  // GuideExperience's identical fetch.
  const [meditationAuthorId, setMeditationAuthorId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchMeditationAuthorId(meditationId).then((id) => {
      if (!cancelled) setMeditationAuthorId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [meditationId]);

  // If this exact track is already loaded in the player (started
  // earlier, maybe still running quietly in the mini player), open
  // straight into "player" (or "completed", if it already finished
  // while this screen was closed) instead of the intro — the person
  // already started it, showing "Почати" again would be confusing.
  const alreadyLoaded = player.meditation?.id === meditationId;
  // player.sessionEnded also covers a session the ТАЙМЕР finished
  // early — not just reaching the track's own natural end — so
  // reopening the screen (mini player, fresh tab) after that still
  // lands on the report instead of a stale-looking player.
  const alreadyEnded =
    alreadyLoaded &&
    isSessionOver({
      sessionEnded: player.sessionEnded,
      duration: player.duration,
      currentTime: player.currentTime,
      isPlaying: player.isPlaying,
    });
  const [view, setView] = useState<View>(alreadyEnded ? "completed" : alreadyLoaded ? "player" : "intro");
  const [history, setHistory] = useState(() => getSessionHistory(meditationId));

  // The session this screen is recording into (utils/meditationSession.ts).
  // Every start makes a NEW one, so repeating never overwrites an earlier
  // before/after. Restored from the on-device log when the screen opens onto
  // a practice that is already loaded (mini player, reload).
  const sessionRecordId = useRef<string | null>(null);
  const ensureSessionRecord = (): string => {
    if (sessionRecordId.current) return sessionRecordId.current;
    const existing = currentSessionFor(loadSessionLog(), meditationId);
    if (existing) {
      sessionRecordId.current = existing.id;
      return existing.id;
    }
    const id = newSessionId();
    updateSessionLog((l) => startSessionRecord(l, { id, meditationId, now: new Date().toISOString() }));
    sessionRecordId.current = id;
    return id;
  };

  // "Як ви почуваєтесь зараз?" — the current session's optional
  // before/after tension check. checkinStates/checkinBefore are picked
  // on the "checkin" screen; checkinAfter and checkinChangeNote are
  // answered later on "completed", one after the other. All are
  // re-hydrated from the server below when this screen mounts directly
  // onto a session that was started earlier (see the fetch effect)
  // rather than always starting fresh. checkinChangeSkipped has no
  // server column (skipping just leaves change_note null forever, same
  // as not having reached that step yet) — it only exists so this
  // mount can tell "skipped" apart from "hasn't been asked yet" without
  // a round trip.
  const [checkinStates, setCheckinStates] = useState<string[]>([]);
  const [checkinBefore, setCheckinBefore] = useState<number | null>(null);
  const [checkinAfter, setCheckinAfter] = useState<number | null>(null);
  // "Що змінилося?" — a checklist now, not a single pick (see
  // CHANGE_OPTIONS' own comment) — an empty array just means nothing
  // checked yet, no separate "skipped" flag needed anymore.
  const [checkinChangeNotes, setCheckinChangeNotes] = useState<string[]>([]);

  // "Завершити раніше" — Sasha's explicit call (2026-08-28): leaving
  // mid-practice shouldn't be a silent, ambiguous action. Pressing
  // back/✕ while a session is actually in progress (view === "player")
  // asks plainly instead of just closing — "Продовжити" cancels and
  // stays right here, "Завершити" ends the session now (same graceful
  // path as the small "Завершити" link) and lands on the report. Other
  // views (nothing running yet, or already finished) close instantly —
  // there's nothing to lose there.
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // "Поскаржитися" (2026-08-30, per Sasha's explicit call — "особливо
  // важливо для emotional wellbeing content"; a direct button, not
  // tucked behind a "•••" menu, per her immediate follow-up). Reports
  // the meditation itself, not a person or a comment — see
  // lib/contentReports.ts's header comment for why this is its own
  // table rather than reusing message_reports/content_comment_reports.
  const [showReportModal, setShowReportModal] = useState(false);

  // "•••" overflow menu on the intro screen (2026-09-25 compositional
  // redesign, per Sasha's explicit spec — "Поскаржитися should be
  // hidden inside a subtle overflow action rather than sitting beside
  // primary user actions"). Just a tiny local toggle; opening the real
  // report modal below closes it.
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  // The text of the practice opens as its own page while the sound keeps playing (the player lives in the context).
  const [textOpen, setTextOpen] = useState(false);
  // the page with the text is exactly as tall as the player block it opens from
  const playerCardRef = useRef<HTMLDivElement | null>(null);
  const [textCardHeight, setTextCardHeight] = useState<number | null>(null);
  useEffect(() => { if (view !== "player") setTextOpen(false); }, [view]);

  // "Резюме позиції" — the real saved place from meditation_audio_
  // positions (not the demo enrollment percent). Drives two things per
  // Sasha's explicit call (2026-08-28): the intro screen's CTA becomes
  // "Продовжити з M:SS" instead of "Почати"/"Почати знову", and — more
  // importantly — the optional "Як ви почуваєтесь зараз?" check-in
  // only ever shows for a genuine fresh start; resuming skips it
  // entirely. null = nothing resumable (or not checked yet); a number
  // = the real position to resume from.
  const [resumePositionSeconds, setResumePositionSeconds] = useState<number | null>(null);
  const hasResumablePosition = resumePositionSeconds !== null;

  // "Більше не питати для цієї медитації" — the checkin screen's own
  // opt-out checkbox (utils/meditationCheckinPrefs.ts), local until the
  // person actually confirms leaving that screen.
  const [checkinNeverShow, setCheckinNeverShow] = useState(false);

  // "♡ Зберегти" on the completed screen — the exact same "Моя
  // практика" concept ProgramExperience already offers at course
  // completion (lib/savedPractices.ts), now also reachable from a
  // meditation's own completed screen. null = not saved (or not
  // checked yet); a real row = saved, and its id is what removing it
  // needs.
  const [savedPractice, setSavedPractice] = useState<SavedPractice | null>(null);
  const [savingPractice, setSavingPractice] = useState(false);

  // "Зберегти офлайн" (2026-08-30, per Sasha's explicit call): a plain
  // on/off per meditation, kept entirely on-device (lib/
  // meditationDownloads.ts, IndexedDB — no Supabase, no account-wide
  // sync, same reasoning as that file's own header comment). null =
  // not checked yet; downloadProgress is only meaningful while a
  // download is actually running.
  const [isDownloaded, setIsDownloaded] = useState<boolean | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState(false);
  const [downloadNoSpace, setDownloadNoSpace] = useState(false);
  // Background/volume choice from the shared download picker
  // (components/participant/MeditationDownloadPicker.tsx, 2026-09-29 —
  // extracted out of this file so the same picker + live preview is
  // available from the meditation cards in "Моє навчання" too, per
  // Sasha's explicit follow-up). Reused as-is by the "спробувати ще"
  // retry button below, so a retry re-applies the same choice instead
  // of silently reverting to voice-only.
  const [pendingDownloadChoice, setPendingDownloadChoice] = useState<MeditationDownloadChoice>({
    backgroundTrackIds: [],
    voiceVolume: 1,
    backgroundVolume: 0.4,
  });
  // "Ця практика була корисною?" (2026-08-30, per Sasha's explicit
  // call): a single calm yes/no on the completed screen, not a
  // course-style discussion thread — "для медитації людина в більш
  // особистому стані". Reuses content_item_feedback (lib/
  // itemFeedback.ts), the exact same table ProgramExperience's lesson
  // "Цей матеріал був для вас корисним?" already writes to — just
  // different copy/icons here, and "Поділіться враженням" is always
  // available (not only as a "why not" follow-up like the lesson
  // version). No general comment thread underneath — Sasha flagged
  // that as secondary/optional ("якщо це дійсно потрібно"), so it's
  // deliberately not built here; easy to add later if it turns out to
  // be wanted.
  const [practiceFeedback, setPracticeFeedback] = useState<FeedbackValue | null>(null);
  const [practiceFeedbackReason, setPracticeFeedbackReason] = useState("");
  const [practiceFeedbackReasonSaving, setPracticeFeedbackReasonSaving] = useState(false);
  const [practiceFeedbackReasonSaved, setPracticeFeedbackReasonSaved] = useState(false);
  // Tracks a genuinely completed submitItemFeedback call (2026-08-30,
  // per Sasha's explicit call — the "✓ Ваша відповідь надіслана
  // автору" line must only appear after a real, confirmed send, not
  // the instant a button is tapped) — see chooseFeedback below.
  const [practiceFeedbackSent, setPracticeFeedbackSent] = useState(false);

  // Session history can change from the player context (a session
  // starting/completing) even while this screen isn't showing it live —
  // re-read whenever that happens.
  useEffect(() => {
    setHistory(getSessionHistory(meditationId));
  }, [meditationId, player.historyVersion]);

  // Re-hydrate the current session's check-in (if any) once, on mount —
  // covers reopening the screen (from the mini player, or a fresh
  // browser tab) onto a session whose "before" answer was captured
  // earlier in a since-unmounted instance of this component.
  useEffect(() => {
    const id = player.pendingMoodCheckinId;
    const userId = session?.profile.id;
    if (!id || !userId) return;
    fetchMeditationMoodCheckin(id, userId)
      .then((row) => {
        if (!row) return;
        setCheckinStates(normalizeStates(row.states));
        setCheckinBefore(row.beforeValue);
        setCheckinAfter(row.afterValue);
        setCheckinChangeNotes(parseChangeNote(row.changeNote));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Checks for a real resumable position once, on mount — skipped
  // entirely when alreadyLoaded (the track is already live in the
  // player context, so this screen opens straight into "player",
  // never "intro", and there's nothing for this to affect).
  useEffect(() => {
    if (alreadyLoaded) return;
    const userId = session?.profile.id;
    if (!userId) return;
    let cancelled = false;
    fetchMeditationAudioPosition(meditationId, userId)
      .then((pos) => {
        if (cancelled) return;
        if (isResumablePosition(pos)) setResumePositionSeconds(pos!.positionSeconds);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whether this meditation is already in "Моя практика" — checked
  // once on mount so the completed screen's ♡ shows the right state
  // immediately rather than always starting blank.
  useEffect(() => {
    const userId = session?.profile.id;
    if (!userId) return;
    let cancelled = false;
    fetchSavedPractice(meditationId, userId)
      .then((row) => {
        if (!cancelled) setSavedPractice(row);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whether this meditation is already downloaded for offline listening —
  // re-checked on downloadsVersion too, not just on mount, so toggling
  // it from the "Моє навчання" card (a separate component instance)
  // shows up here without a reload — same reactive-signal shape as
  // savedPracticeVersion just above.
  useEffect(() => {
    let cancelled = false;
    isMeditationDownloaded(meditationId).then((downloaded) => {
      if (!cancelled) setIsDownloaded(downloaded);
    });
    return () => {
      cancelled = true;
    };
  }, [meditationId, player.downloadsVersion]);

  // "Ця практика була корисною?" — seeded once on mount so a returning
  // visit to the completed screen shows what was already answered
  // instead of always starting blank.
  useEffect(() => {
    const userId = session?.profile.id;
    if (!userId) return;
    let cancelled = false;
    fetchItemFeedback(meditationId, userId)
      .then((fb) => {
        if (cancelled) return;
        setPracticeFeedback(fb?.value ?? null);
        setPracticeFeedbackReason(fb?.reason ?? "");
        // An existing row here means a real, already-completed send
        // from an earlier visit — the confirmations below are honest
        // to show right away in that case, same as they would after a
        // fresh send just now. "Не зовсім" only counts as confirmed
        // once a written reason actually exists (see the render
        // condition below for why) — a bare "not_helpful" with no
        // reason yet stays unconfirmed until one is sent.
        setPracticeFeedbackSent(fb?.value === "helpful");
        setPracticeFeedbackReasonSaved(!!fb?.reason);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meditationId]);

  // Completion is recorded on the session when the report screen shows —
  // whichever way it got there (natural end, timer, reopening a finished one).
  useEffect(() => {
    if (view !== "completed") return;
    const sessionId = ensureSessionRecord();
    updateSessionLog((l) => completeSession(l, sessionId, new Date().toISOString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Reopened onto a practice that is already loaded (mini player, reload):
  // restore this session's before/after from the on-device log when the
  // server copy is not available (offline, or no check-in row).
  useEffect(() => {
    if (!alreadyLoaded) return;
    const current = currentSessionFor(loadSessionLog(), meditationId);
    if (!current) return;
    sessionRecordId.current = current.id;
    if (current.before) {
      setCheckinStates((prev) => (prev.length ? prev : current.before!.stateKeys));
      setCheckinBefore((prev) => prev ?? current.before!.intensity);
    }
    if (current.after) {
      setCheckinAfter((prev) => prev ?? current.after!.intensity);
      setCheckinChangeNotes((prev) => (prev.length ? prev : current.after!.changeKeys));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Natural end of the practice, reached while this screen is open —
  // auto-advance to the report. (If it ends while the screen is
  // closed, alreadyEnded above catches it the next time it's opened.)
  useEffect(() => {
    if (view !== "player") return;
    if (
      isSessionOver({
        sessionEnded: player.sessionEnded,
        duration: player.duration,
        currentTime: player.currentTime,
        isPlaying: player.isPlaying,
      })
    ) {
      setView("completed");
    }
  }, [view, player.isPlaying, player.currentTime, player.duration, player.sessionEnded]);

  if (!meditation) {
    return createPortal(
      <div className="fixed inset-0 z-[9999] bg-[#f6f8ff] flex items-center justify-center p-4">
        <div className="w-full max-w-[440px] rounded-[24px] bg-white p-8 text-center shadow-[0_20px_80px_rgba(0,0,0,0.1)]">
          <div className="text-[16px] font-semibold mb-2">Медитацію не знайдено</div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition"
          >
            Закрити
          </button>
        </div>
      </div>,
      document.body
    );
  }

  // Also covers "Почати знову"/"Повторити" — forceRestart makes sure a
  // track that already ended actually jumps back to 0:00 instead of
  // just resuming from where "ended" left it (see
  // MeditationPlayerContext's loadAndPlay comment).
  const startSession = () => {
    const id = newSessionId();
    updateSessionLog((l) => startSessionRecord(l, { id, meditationId, now: new Date().toISOString() }));
    sessionRecordId.current = id;
    player.loadAndPlay(meditation, session?.profile.id ?? null, { forceRestart: true });
    setView("player");
  };

  // "♡ Зберегти" toggle on the completed screen — same "Моя практика"
  // concept as ProgramExperience's course-completion checklist, just a
  // plain on/off here since there's only ever one thing to save (the
  // meditation itself), not a multi-item list.
  const toggleSavedPractice = async () => {
    const userId = session?.profile.id;
    if (!userId || savingPractice) return;
    setSavingPractice(true);
    try {
      if (savedPractice) {
        await removeSavedPractice(savedPractice.id);
        setSavedPractice(null);
      } else {
        const saved = await addSavedPractice({
          itemId: meditationId,
          userId,
          kind: "meditation",
          itemTitle: meditation.title,
        });
        setSavedPractice(saved);
      }
      // Lets "Моє навчання"'s card heart (a separate component instance,
      // fetched once on its own mount) know to re-fetch instead of
      // keeping whatever it saw at mount time — see savedPracticeVersion's
      // own comment in MeditationPlayerContext.
      player.bumpSavedPracticeVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти в «Моя практика»:", err);
    } finally {
      setSavingPractice(false);
    }
  };

  // "Зберегти офлайн" — see the state declared above and lib/
  // meditationDownloads.ts for the full reasoning. `choice` comes from
  // the shared MeditationDownloadPicker popover (background tracks +
  // both volumes, already previewed there before confirming) — this
  // function's only job is running the actual download/progress/error
  // cycle with whatever choice it's handed, same as every other call
  // site of this picker.
  const runDownload = async (choice: MeditationDownloadChoice) => {
    setPendingDownloadChoice(choice);
    setDownloadError(false);
    setDownloadNoSpace(false);
    setDownloadProgress(0);
    try {
      await downloadMeditationAudio(meditation, choice, (fraction) => setDownloadProgress(fraction));
      setIsDownloaded(true);
      player.bumpDownloadsVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти медитацію офлайн:", err);
      setDownloadNoSpace(err instanceof NoStorageSpaceError);
      setDownloadError(true);
    } finally {
      setDownloadProgress(null);
    }
  };

  // "спробувати ще" re-runs the SAME choice the person already
  // confirmed (or voice-only, if the picker was never opened) rather
  // than silently reverting to voice-only on a retry.
  const handleRetryDownload = () => runDownload(pendingDownloadChoice);

  const handleRemoveDownload = async () => {
    try {
      await deleteMeditationDownload(meditationId);
      setIsDownloaded(false);
      player.bumpDownloadsVersion();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося прибрати офлайн-копію:", err);
    }
  };

  const chooseFeedback = async (value: FeedbackValue) => {
    const userId = session?.profile.id;
    if (!userId) return;
    setPracticeFeedback(value);
    // Cleared up front, not just left over from a previous pick — the
    // confirmation line only comes back once THIS submitItemFeedback
    // call genuinely finishes below.
    setPracticeFeedbackSent(false);
    // "Поділіться враженням" only ever shows for "Не зовсім" now
    // (2026-08-30, per Sasha's explicit call — picking "Так" shouldn't
    // reveal a text field at all) — so "Так" never carries a reason,
    // including clearing out any text still sitting in state from an
    // earlier "Не зовсім" pick in this same session, before it's
    // switched back to.
    const reason = value === "not_helpful" ? practiceFeedbackReason : null;
    if (value === "helpful") {
      setPracticeFeedbackReason("");
      setPracticeFeedbackReasonSaved(false);
    }
    try {
      await submitItemFeedback({ itemId: meditationId, userId, value, reason });
      // Only now — after a real, confirmed write, not the instant the
      // button was tapped (2026-08-30, per Sasha's explicit call).
      setPracticeFeedbackSent(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти відгук:", err);
    }
  };

  // "Поділіться враженням" — an explicit "Надіслати" button per Sasha's
  // follow-up (2026-08-30): a bare textarea with no visible action
  // read as unfinished. Only actually writes once a Так/Не зовсім has
  // been picked (the table's is_helpful column isn't nullable), so an
  // empty textarea with no answer chosen yet has nothing to save.
  const savePracticeFeedbackReason = async () => {
    const userId = session?.profile.id;
    if (!userId || !practiceFeedback || practiceFeedbackReasonSaving) return;
    setPracticeFeedbackReasonSaving(true);
    try {
      await submitItemFeedback({
        itemId: meditationId,
        userId,
        value: practiceFeedback,
        reason: practiceFeedbackReason,
      });
      setPracticeFeedbackReasonSaved(true);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Не вдалося зберегти враження:", err);
    } finally {
      setPracticeFeedbackReasonSaving(false);
    }
  };

  const openReportModal = () => {
    setShowReportModal(true);
    setShowActionsMenu(false);
  };

  // Intro's "Почати"/"Почати знову" and completed's "Повторити" all
  // route here first instead of calling startSession directly — a
  // fresh, empty check-in every time a NEW session begins.
  const goToCheckIn = () => {
    setCheckinStates([]);
    setCheckinBefore(null);
    setCheckinAfter(null);
    setCheckinChangeNotes([]);
    setCheckinNeverShow(false);
    setView("checkin");
  };

  // Any genuine "start from the beginning" entry point — first-ever
  // start, "Почати знову" with nothing resumable, "Повторити", and the
  // "Почати спочатку" escape hatch when there IS something resumable
  // but the person wants to discard it — routes through here. Per
  // Sasha's explicit call (2026-08-28): the check-in only makes sense
  // for a genuine fresh start, and only if it hasn't been turned off
  // for this specific meditation.
  const handleFreshStart = () => {
    if (isCheckinDisabled(meditation.id)) {
      player.setPendingMoodCheckinId(null);
      startSession();
      return;
    }
    goToCheckIn();
  };

  // Resuming a real in-progress session — skips the check-in
  // unconditionally (there's no "before" moment left to ask about,
  // the person already started) and resumes at the real saved
  // position rather than forcing a restart.
  const handleContinue = () => {
    player.setPendingMoodCheckinId(null);
    player.loadAndPlay(meditation, session?.profile.id ?? null, {});
    setView("player");
  };

  const toggleCheckinState = (s: string) => {
    setCheckinStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  };

  // Fires for both the checkin screen's primary button and "Пропустити"
  // — skip just means "start without saving anything". Also drops any
  // earlier session's unanswered pending check-in, so a stale "А як
  // тепер?" from a previous track never surfaces on this session's
  // report.
  const confirmCheckInAndStart = async (skip: boolean) => {
    player.setPendingMoodCheckinId(null);
    const hasAnswer = !skip && (checkinStates.length > 0 || checkinBefore != null);
    if (hasAnswer) {
      const userId = session?.profile.id;
      if (userId) {
        try {
          const id = await createMeditationMoodCheckin({
            meditationId: meditation.id,
            meditationTitle: meditation.title,
            userId,
            states: checkinStates,
            beforeValue: checkinBefore,
          });
          player.setPendingMoodCheckinId(id);
        } catch {
          // Best-effort — never let this block starting the practice.
        }
      }
    } else {
      setCheckinStates([]);
      setCheckinBefore(null);
    }
    if (checkinNeverShow) {
      disableCheckinForever(meditation.id);
    }
    startSession();
    if (hasAnswer) {
      // BEFORE is stored on this new session only (never on an earlier one).
      const sessionId = sessionRecordId.current;
      if (sessionId) {
        updateSessionLog((l) =>
          recordBefore(l, sessionId, { stateKeys: checkinStates, intensity: checkinBefore })
        );
      }
    }
  };

  const submitCheckinAfter = (value: number) => {
    setCheckinAfter(value);
    const sessionId = ensureSessionRecord();
    updateSessionLog((l) => recordAfter(l, sessionId, { intensity: value }));
    const userId = session?.profile.id;
    if (!userId) return;
    const id = player.pendingMoodCheckinId;
    if (id) {
      submitMeditationMoodAfter(id, userId, value).catch(() => {});
      return;
    }
    // BEFORE was skipped: the AFTER answer still gets its own row (it used to
    // be dropped because there was no row to attach it to).
    createMeditationMoodCheckin({
      meditationId: meditation.id,
      meditationTitle: meditation.title,
      userId,
      states: [],
      beforeValue: null,
    })
      .then((newId) => {
        player.setPendingMoodCheckinId(newId);
        return submitMeditationMoodAfter(newId, userId, value);
      })
      .catch(() => {});
  };

  // "Що змінилося?" — toggles one option in/out of the checklist and
  // saves the whole set as one joined string (see CHANGE_OPTIONS' own
  // comment) — no separate submit step, each tap saves immediately.
  const toggleChangeNote = (option: string) => {
    const next = checkinChangeNotes.includes(option)
      ? checkinChangeNotes.filter((o) => o !== option)
      : [...checkinChangeNotes, option];
    setCheckinChangeNotes(next);
    const sessionId = ensureSessionRecord();
    updateSessionLog((l) => recordAfter(l, sessionId, { changeKeys: next }));
    const id = player.pendingMoodCheckinId;
    const userId = session?.profile.id;
    if (id && userId) {
      submitMeditationMoodChangeNote(id, userId, joinChangeNote(next)).catch(() => {});
    }
  };

  // A genuine manual stop mid-practice — per Sasha's explicit call
  // (2026-08-30), this must never read as "completed" (no save
  // prompt, no stats, no mood check-in): just a pause that stays
  // resumable. See pauseForNow's own comment in
  // MeditationPlayerContext for why this is deliberately NOT
  // finishNow().
  const finishEarly = () => {
    player.pauseForNow();
    const sessionId = sessionRecordId.current;
    if (sessionId) updateSessionLog((l) => stopSession(l, sessionId, new Date().toISOString()));
    setView("stopped");
  };

  // "Продовжити" on the "stopped" report — the track is still loaded
  // in the player (just paused), so this simply resumes in place
  // rather than reloading from a saved position like the intro
  // screen's handleContinue does.
  const resumeFromStopped = () => {
    player.togglePlay();
    setView("player");
  };

  // Header back/✕ — intercepted only while an actual session is
  // running (view === "player"); everywhere else there's nothing in
  // progress to interrupt, so it closes right away as before.
  const handleBackClick = () => {
    if (view === "player") {
      setShowExitConfirm(true);
      return;
    }
    onClose();
  };

  const confirmFinishEarly = () => {
    setShowExitConfirm(false);
    finishEarly();
  };

  // The player screen always shows the real loaded track length once
  // known; before that (still fetching metadata) it falls back to the
  // authored catalog duration so the screen isn't just blank.
  const fallbackTotal = meditation.durationMinutes * 60;
  const totalSeconds = player.duration > 0 ? player.duration : fallbackTotal;
  const percent = totalSeconds > 0 ? Math.min(100, (player.currentTime / totalSeconds) * 100) : 0;
  const remaining = Math.max(totalSeconds - player.currentTime, 0);

  // One shared atmosphere for the whole NOTICE → PRACTICE → REFLECT
  // journey (2026-09-24 redesign, per Sasha's explicit spec — "ONE
  // coherent visual system", not four independent screens). Same
  // per-meditation palette as the catalog card and "Ваш маршрут" block
  // in ParticipantLearning (lib/meditationPalette.ts) — this specific
  // meditation always reads as the same soft lavender/blue/cyan wash
  // everywhere it shows up, intro through completion, instead of intro
  // getting its own saturated brand-gradient treatment while every
  // other view uses a calmer one.
  const [pc1, pc2, pc3] = meditationPalette(meditationId);
  // Which of the five visual moods this meditation's hero object uses
  // (2026-09-25, see lib/meditationVisualFamily.ts's own comment) —
  // derived from the meditation's real tags, nothing new to author.
  const visualFamily = meditationVisualFamily(meditation.tags);

  return createPortal(
    // 2026-09-26 brand-alignment rebuild: this outer shell is now the
    // EXACT same treatment ProgramExperience's own overlay uses —
    // strong blue→violet environment gradient + a large white rounded
    // content surface below — per Sasha's explicit spec: "SAME BRAND,
    // DIFFERENT EXPERIENCE, not SAME PAGE, DIFFERENT CONTENT". The
    // earlier per-meditation "ambient" page background is gone; the
    // meditation's own palette now only drives the hero visual object
    // and small accents INSIDE the white surface, never the page
    // background or the primary CTA (both are fixed Sensoria brand
    // treatments, shared with every other product surface).
    <div className="fixed inset-0 z-[9999] bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] overflow-y-auto">
      {/* Keyframes shared by every layer of MeditationVisualObject —
          injected once here rather than per instance, since this
          screen only ever mounts one meditation object at a time. */}
      <style>{`
        @keyframes sensoria-breathe-a { 0%, 100% { transform: scale(1) translate(0, 0); } 50% { transform: scale(1.07) translate(2%, -2%); } }
        @keyframes sensoria-breathe-b { 0%, 100% { transform: scale(1) translate(0, 0); } 50% { transform: scale(0.94) translate(-2%, 2%); } }
        @keyframes sensoria-breathe-anchor { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.045); } }
        @keyframes sensoria-drift-vertical { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-4%) scale(1.04); } }
        @keyframes sensoria-pulse-core { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: 0.85; } }
        @keyframes sensoria-rotate-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes sensoria-pulse-ring { 0%, 100% { transform: scale(1); opacity: 0.55; } 50% { transform: scale(1.18); opacity: 0; } }
        @keyframes sensoria-mote-drift { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(3%, -6%); } }
        @keyframes sensoria-twinkle { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.9; } }
      `}</style>
      <div className="fixed top-0 inset-x-0 z-20 bg-white/80 backdrop-blur-md border-b border-black/5 px-6 md:px-10 py-3 flex items-center justify-between">
        <button
          onClick={handleBackClick}
          className="text-[13px] font-medium text-black/60 hover:text-black transition flex items-center gap-1.5"
        >
          ← Моє навчання
        </button>
        <button
          onClick={handleBackClick}
          className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 text-black/60 text-[15px] transition"
          aria-label="Закрити"
        >
          ✕
        </button>
      </div>

      {view === "intro" && (
        <div className="pt-[140px] px-6 md:px-10 pb-10">
          {/* MAIN CONTENT SURFACE — the exact same large white rounded
              card ProgramExperience's own overview screen uses
              (max-w-[1220px], rounded-[28px], same shadow), floating on
              the brand gradient instead of blending into it (2026-09-26
              brand-alignment rebuild, per Sasha's explicit spec section
              3 — "large warm-white/light rounded surface... consistent
              with the existing Sensoria product"). Everything below —
              hero, suitability, expectations, author box — lives inside
              this one surface, the same material hierarchy every other
              Sensoria experience uses. */}
          <div className="max-w-[1220px] mx-auto bg-white rounded-[28px] shadow-[0_30px_80px_rgba(10,10,40,0.25)] p-8 md:p-16">
            {/* HERO — a MEDITATION-specific composition inside the
                shared Sensoria shell, not a copy of Program's own hero
                (2026-09-26, per Sasha's explicit spec: "Program:
                learning/modules/progress. Meditation: practice/state/
                atmosphere/return. Same visual DNA, different
                composition"). Intentionally ASYMMETRIC
                (2026-09-25 compositional redesign, per Sasha's explicit
                rejection of the previous fully-centered "landing page"
                layout: "Introduce intentional asymmetry... meditation
                identity/content has a clear text area, the visual
                object occupies a separate visual area"). Text column
                carries everything a person needs to decide and act;
                the atmospheric object sits beside it as its own
                visual area, not a decorative header above a centered
                stack. Order flips on mobile — text first, object
                second — so the practical content never sits below a
                tall decorative shape on a small screen. */}
            <div className="grid lg:grid-cols-[1fr_400px] gap-x-16 gap-y-10 items-center mb-10">
              <div className="order-2 lg:order-1 text-left">
                <div className="flex flex-wrap items-center gap-x-1.5 text-[12px] text-black/40 mb-4">
                  <span className="font-medium text-black/55">{meditation.author || "Sensoria"}</span>
                  <span>·</span>
                  <span>{meditation.duration}</span>
                  {meditation.backgroundSoundIds && meditation.backgroundSoundIds.length > 0 && (
                    <>
                      <span>·</span>
                      <span>
                        <Icon name="headphones" size={14} className="inline-block align-[-2px]" />{" "}
                        {meditation.backgroundSoundIds
                          .map((id) => findBackgroundTrack(id)?.label ?? id)
                          .join(", ")}
                      </span>
                    </>
                  )}
                </div>
                <h1 className="text-[36px] md:text-[42px] leading-[1.08] font-bold text-black mb-4 max-w-[540px]">
                  {meditation.title}
                </h1>
                <p className="text-black/55 text-[16px] leading-relaxed max-w-[480px] mb-7">{meditation.description}</p>

                {/* PERSONAL HISTORY — woven directly into the hero text,
                    not a separate stats card (2026-09-25, per Sasha's
                    explicit spec: "This should feel like PERSONAL
                    CONTEXT, not a dashboard statistic... treat it as
                    part of the editorial hero composition"). A thin
                    left rule instead of a rounded surface is what marks
                    it as a distinct thought without boxing it. */}
                {(hasResumablePosition || history.sessionCount > 0) && (
                  // A personal TRACE, not a stats card (2026-09-25, per
                  // Sasha's explicit spec: "● — ● — ● ... this
                  // represents returning to the practice. Do not turn
                  // it into analytics"). A short row of small connected
                  // dots stands in for "you've been here before" — the
                  // last dot glows, marking where the person is now;
                  // the real count/timing still reads as plain text
                  // right underneath, not as a chart.
                  <div className="mb-7 max-w-[440px]">
                    <div className="flex items-center gap-1.5 mb-2.5" aria-hidden="true">
                      {Array.from({ length: Math.max(1, Math.min(hasResumablePosition ? history.sessionCount + 1 : history.sessionCount, 4)) }).map((_, i, arr) => {
                        const isLast = i === arr.length - 1;
                        return (
                          <span key={i} className="flex items-center gap-1.5">
                            {i > 0 && <span className="w-3 h-px" style={{ background: `${pc3}45` }} />}
                            <span
                              className="rounded-full"
                              style={
                                isLast
                                  ? { width: 8, height: 8, background: pc3, boxShadow: `0 0 0 4px ${pc3}22` }
                                  : { width: 6, height: 6, background: `${pc1}80` }
                              }
                            />
                          </span>
                        );
                      })}
                    </div>
                    <div className="text-[13.5px] text-black/60 leading-relaxed">
                      {hasResumablePosition ? (
                        <>Ви зупинились на <span className="font-semibold text-black/80">{formatClock(resumePositionSeconds ?? 0)}</span> минулого разу.</>
                      ) : (
                        <>
                          Ви вже поверталися до цієї практики —{" "}
                          <span className="font-semibold text-black/80">
                            {history.sessionCount} {history.sessionCount === 1 ? "раз" : "разів"}
                          </span>
                          .
                        </>
                      )}
                    </div>
                    {history.lastStartedAt && (
                      <div className="text-[12px] text-black/35 mt-1">Остання практика · {formatRelativeTime(history.lastStartedAt)}</div>
                    )}
                  </div>
                )}

                {/* PRIMARY ACTION — the one strong Sensoria accent
                    gradient on the whole screen; everything else here
                    stays quiet (2026-09-25, unchanged principle from
                    the earlier pass, now left-aligned with the rest of
                    the hero instead of centered under it). */}
                <div className="flex items-center gap-4 flex-wrap mb-6">
                  <button
                    onClick={hasResumablePosition ? handleContinue : handleFreshStart}
                    className="px-8 py-3.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[15px] font-semibold hover:opacity-90 transition shadow-[0_10px_24px_rgba(99,102,241,0.35)]"
                  >
                    {hasResumablePosition
                      ? `Продовжити з ${formatClock(resumePositionSeconds ?? 0)} →`
                      : history.sessionCount > 0
                      ? "Почати знову →"
                      : `Почати практику · ${meditation.duration} →`}
                  </button>
                  {hasResumablePosition && (
                    <button onClick={handleFreshStart} className="text-[12px] text-black/35 hover:text-black/60 transition">
                      Почати спочатку
                    </button>
                  )}
                </div>

                {/* Quiet secondary actions + the overflow menu
                    (2026-09-25, per Sasha's explicit spec: "Поскаржитися
                    should be hidden inside a subtle overflow action
                    rather than sitting beside primary user actions").
                    "Зберегти" and "Завантажити офлайн" stay visible and
                    plain-text — genuinely useful, not metadata — but
                    neither competes visually with the CTA above. */}
                <div className="relative flex items-center gap-4 flex-wrap text-[12.5px] text-black/45">
                  <button onClick={toggleSavedPractice} disabled={savingPractice} className="hover:text-black/70 transition disabled:opacity-60">
                    {savedPractice ? "✓ Збережено" : "♡ Зберегти"}
                  </button>
                  {/* "Зберегти офлайн" — an author-optional feature
                      (2026-09-26, per Sasha's explicit call: "опция
                      загрузки будет не обязательной — это будет решать
                      автор"). Hidden entirely, not just disabled, when
                      this meditation's author hasn't turned it on
                      (meditation.offlineDownloadEnabled — see its own
                      comment in data/meditations.ts for why there's no
                      author-editor UI for this yet). */}
                  {meditation.offlineDownloadEnabled && (
                    <>
                      <span className="text-black/15">·</span>
                      {isDownloaded !== null &&
                        (isDownloaded ? (
                          <span className="inline-flex items-center gap-1.5">
                            <DownloadIcon className="w-3.5 h-3.5" filled />
                            Збережено офлайн
                            <button onClick={handleRemoveDownload} className="underline underline-offset-2 hover:text-black/70 transition">
                              прибрати
                            </button>
                          </span>
                        ) : downloadProgress !== null ? (
                          <span className="inline-flex items-center gap-1.5">
                            <DownloadIcon className="w-3.5 h-3.5" />
                            Завантаження… {Math.round(downloadProgress * 100)}%
                          </span>
                        ) : downloadError ? (
                          // A contextual, dismissible inline error instead of
                          // a permanent red technical message (2026-09-25,
                          // per Sasha's explicit spec) — offers a real retry
                          // and can be waved away without reloading anything.
                          <span className="inline-flex items-center gap-1.5 text-black/45">
                            {downloadNoSpace ? "Недостатньо місця на пристрої" : "Не вдалося зберегти офлайн"}
                            <button onClick={handleRetryDownload} className="underline underline-offset-2 hover:text-black/70 transition">
                              спробувати ще
                            </button>
                            <button onClick={() => setDownloadError(false)} className="hover:text-black/70 transition" aria-label="Приховати">
                              ✕
                            </button>
                          </span>
                        ) : (
                          // Opens the shared background/volume picker
                          // popover FIRST (2026-09-25, per Sasha's
                          // explicit call) rather than downloading
                          // immediately — the actual download only
                          // starts once that popover is confirmed (see
                          // runDownload). Shared with the meditation
                          // cards in "Моє навчання" (ParticipantLearning.tsx)
                          // — see MeditationDownloadPicker.tsx's own header.
                          <MeditationDownloadPicker
                            meditation={meditation}
                            pc1={pc1}
                            pc3={pc3}
                            onConfirm={runDownload}
                            trigger={(_open, toggle) => (
                              <button onClick={toggle} className="inline-flex items-center gap-1.5 hover:text-black/70 transition">
                                <DownloadIcon className="w-3.5 h-3.5" />
                                Зберегти офлайн
                              </button>
                            )}
                          />
                        ))}
                    </>
                  )}
                  <span className="text-black/15">·</span>
                  <div className="relative">
                    <button
                      onClick={() => setShowActionsMenu((v) => !v)}
                      className="w-6 h-6 -my-1 rounded-full hover:bg-black/5 transition flex items-center justify-center text-black/40 hover:text-black/70"
                      aria-label="Більше дій"
                    >
                      •••
                    </button>
                    {showActionsMenu && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setShowActionsMenu(false)} />
                        <div className="absolute left-0 top-7 z-20 bg-white rounded-xl shadow-[0_10px_30px_rgba(15,23,42,0.12)] border border-black/[0.06] py-1.5 min-w-[160px]">
                          <button
                            onClick={openReportModal}
                            className="w-full text-left px-3.5 py-2 text-[13px] text-black/60 hover:bg-black/[0.03] hover:text-black/80 transition"
                          >
                            Поскаржитися
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* HERO VISUAL — its own distinct visual area, not a
                  decorative header (2026-09-25, see GroundingVisual's
                  own comment above for the compositional reasoning). */}
              <div className="order-1 lg:order-2">
                <MeditationVisualObject family={visualFamily} pc1={pc1} pc2={pc2} pc3={pc3} />
              </div>
            </div>

            {/* "Ця практика може підійти, якщо ви:" — an editorial
                content block, not a UI component (2026-09-25, per
                Sasha's explicit spec: "stop presenting it as a generic
                rounded card... it should feel like useful context").
                A thin top divider marks the section break instead of a
                tinted rounded surface; the local atmosphere wash sits
                only faintly behind the heading, not filling a card. */}
            {meditation.whenToUse.length > 0 && (
              // ONE substantial soft-tinted Sensoria surface (2026-09-26
              // brand-alignment rebuild, per Sasha's explicit spec
              // section 7 — "Create one substantial soft-tinted
              // Sensoria surface... do NOT create four separate cards
              // ... this section should feel richer than the current
              // plain bullet list"). Same material language as the
              // rest of the product — a rounded, gently gradient-tinted
              // panel, not the bare-typography treatment the neutral-
              // page version used — with a small unique marker per line
              // so it still reads as an emotional profile, not a
              // uniform bullet list.
              <div
                className="mb-10 rounded-[24px] border border-[#e6e1fa] bg-[#f8f6ff] p-6 md:p-7"
              >
                <div className="text-[17px] font-bold text-[#1d1a3b] mb-3.5">Ця практика може підійти, якщо</div>
                <ul className="flex flex-col gap-2.5 text-[15px] text-[#2d2a5c] leading-relaxed">
                  {meditation.whenToUse.map((line, i) => {
                    const color = ["#5b3df5", "#8a63f7", "#2f6bff"][i % 3];
                    const shape = i % 3;
                    return (
                      <li key={line} className="flex items-center gap-3">
                        <span className="flex w-3 shrink-0 items-center justify-center">
                        <span
                          className="shrink-0"
                          style={
                            shape === 0
                              ? { width: 6, height: 6, borderRadius: "9999px", background: color }
                              : shape === 1
                              ? { width: 8, height: 8, borderRadius: "9999px", border: `1.5px solid ${color}` }
                              : { width: 7, height: 7, borderRadius: "40% 60% 55% 45%/55% 40% 60% 45%", background: color, opacity: 0.75 }
                          }
                        />
                        </span>
                        <span>{line}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* "Чого очікувати" — a clean Sensoria section, same
                material language as the rest of the product (2026-09-26
                brand-alignment rebuild, per Sasha's explicit spec
                section 9 — "create a clean Sensoria section... they can
                be connected subtly, but avoid the current thin
                editorial-document timeline. The component should feel
                like part of the Sensoria product system"). A soft
                bordered surface (the same treatment Sensoria already
                uses for compact content panels) instead of bare
                typography floating on the white card, with numbered
                markers connected by a slightly bolder accent line. */}
            <div className="rounded-[24px] border border-[#dbe3ff] bg-[#f8faff] p-6 md:p-7 mb-10">
              <h2 className="text-[19px] font-bold mb-1 text-black/80">Чого очікувати</h2>
              <p className="text-[13px] text-black/40 mb-7">{meditation.duration} без поспіху.</p>
              <div className="grid md:grid-cols-3 gap-8 md:gap-6">
                {[
                  "Знайдіть тихе місце, де вас ніхто не потурбує.",
                  "Сядьте або ляжте так, як вам зручно.",
                  "Практику можна зупинити в будь-який момент — це не тест.",
                ].map((line, i) => (
                  <div key={line} className="flex items-center gap-3">
                    <span
                      className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-bold shadow-[0_4px_10px_rgba(99,102,241,0.3)]"
                      style={{ background: `linear-gradient(135deg, ${pc1}, ${pc3})` }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-[14px] text-black/60 leading-relaxed">{line}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* "Запитати автора" — framed as part of the product, not a
                support form (2026-09-25, per Sasha's explicit copy
                spec). Renders nothing unless this meditation has a real
                author account behind it (own divider/spacing included,
                see AskAuthorBox); generous spacing above instead of a
                divider line. */}
            {meditationAuthorId && (
              <button
                onClick={() => openAuthorProfile(meditationAuthorId)}
                className="mt-8 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-indigo-600 hover:text-indigo-700 transition"
              >
                Переглянути профіль автора →
              </button>
            )}
            <AskAuthorBox
              authorId={meditationAuthorId}
              contentId={meditation.id}
              userId={session?.profile.id}
              promptLabel="Хочете щось уточнити? Запитайте автора практики."
              placeholder="Ваше питання…"
            />
          </div>
        </div>
      )}

      {view === "player" && textOpen && (() => {
        const paragraphs = publicTranscript(meditation);
        if (!paragraphs) return null;
        return (
          <div className="fixed inset-0 z-10 bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]" role="dialog" aria-modal="true" aria-label="Текст практики">
            <div className="h-screen px-6 pt-[84px] pb-6 flex items-center justify-center">
              <div style={textCardHeight ? { height: textCardHeight } : undefined} className="flex max-h-full min-h-[520px] w-full max-w-[1240px] flex-col overflow-hidden rounded-[32px] border border-black/[0.04] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                {/* TOP — the text, scrolls inside the block */}
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-[1040px] px-10 pt-10 pb-12 md:px-16">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[#4a2fd0]">Текст практики</div>
                      <h2 className="mt-2 mb-6 text-[30px] font-bold leading-tight text-[#1d1a3b]">{meditation.title}</h2>
                      <div className="flex flex-col gap-6 text-[19px] leading-[1.8] text-[#2d2a5c]">
                        {paragraphs.map((p, i) => (
                          <p key={i}>{p}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
                </div>

                {/* BOTTOM — the sound keeps going: the same controls as on the player screen */}
                <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#ece9fe] bg-[#faf9ff] px-10 py-5 md:px-16">
                  <button
                    type="button"
                    onClick={() => player.togglePlay()}
                    aria-label={player.isPlaying ? "Пауза" : "Відтворити"}
                    disabled={player.isLoading}
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#5b3df5] text-white shadow-[0_10px_24px_-10px_rgba(91,61,245,0.9)] transition hover:bg-[#4a2fd0] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#5b3df5]/25 disabled:opacity-60"
                  >
                    {player.isLoading ? "…" : player.isPlaying ? <Icon name="pause" size={20} filled /> : <Icon name="play" size={20} filled />}
                  </button>
                  <div className="shrink-0 text-[17px] font-semibold tabular-nums text-[#1d1a3b]">
                    {formatClock(player.currentTime)} <span className="font-normal text-[#6b6a85]">/ {formatClock(totalSeconds)}</span>
                  </div>
                  <div className="min-w-[160px] flex-1">
                    <QuietSlider value={Math.min(player.currentTime, totalSeconds || 0)} max={totalSeconds || 0} step={0.5} onChange={(v) => player.seekTo(v)} aria="Перемотка" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setTextOpen(false)}
                    className="inline-flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border border-[#d9d4f5] bg-white px-5 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50"
                  >
                    ← Назад до практики
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {view === "checkin" && (
        <div className="pt-[60px] min-h-screen flex items-center justify-center px-6">
          <div className="w-full max-w-[640px]">
            {/* A short emotional pause before the practice, not a
                generic survey (2026-09-24 redesign, per Sasha's explicit
                spec; widened + solid white 2026-09-25 per Sasha's follow-up
                — the translucent glass panel over the atmosphere read too
                cramped/low-contrast, so this is now an opaque white card,
                same family as the intro/completed screens) — pills tinted
                from this meditation's own palette instead of a hard-coded
                emerald-500, emoji dialed back to a supporting role rather
                than the loudest thing on the screen. */}
            <div className="rounded-[32px] bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,0.06)] border border-black/5">
              <div className="text-[19px] font-bold mb-1.5 text-center">Як ви почуваєтесь зараз?</div>
              <div className="text-[13px] text-black/45 mb-6 text-center">
                Необов'язково — просто щоб потім показати, як змінився ваш стан.
              </div>

              <div className="text-[12px] font-medium text-black/45 mb-2.5">Що зараз найближче до вас?</div>
              <div className="flex flex-wrap gap-2 mb-7">
                {FEELING_OPTIONS.map((o) => {
                  const active = checkinStates.includes(o.key);
                  return (
                    <button
                      key={o.key}
                      aria-pressed={active}
                      onClick={() => toggleCheckinState(o.key)}
                      className="px-3.5 py-2 rounded-full text-[13px] font-medium border transition"
                      style={
                        active
                          ? { background: `linear-gradient(120deg, ${pc1}, ${pc2})`, borderColor: "transparent", color: "#1f2937" }
                          : { borderColor: "rgba(0,0,0,0.08)", color: "rgba(0,0,0,0.55)" }
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>

              <div className="mb-7">
                <div className="text-[12px] font-medium text-black/45 mb-2.5">Наскільки сильна напруга?</div>
                <div role="radiogroup" aria-label="Наскільки сильна напруга? від 1 (напружено) до 5 (спокійно)" className="flex items-center justify-between max-w-[320px]">
                  {MOOD_SCALE.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setCheckinBefore(s.value)}
                      className={`w-10 h-10 rounded-full border text-[15px] font-semibold text-black/70 flex items-center justify-center transition ${
                        checkinBefore === s.value ? "scale-110 border-transparent" : "border-black/10 bg-white/70 opacity-60 hover:opacity-100"
                      }`}
                      style={checkinBefore === s.value ? { background: `linear-gradient(120deg, ${pc1}, ${pc3})` } : undefined}
                      role="radio"
                      aria-checked={checkinBefore === s.value}
                      aria-label={`${s.value} з 5 — ${s.label}`}
                    >
                      {s.value}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-black/30 mt-1.5 max-w-[320px]">
                  <span>Напружено</span>
                  <span>Спокійно</span>
                </div>
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => confirmCheckInAndStart(false)}
                  className="w-full px-5 py-3.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[15px] font-semibold hover:opacity-90 transition shadow-[0_10px_24px_rgba(99,102,241,0.35)]"
                >
                  ▶ Почати практику
                </button>
                <button
                  onClick={() => confirmCheckInAndStart(true)}
                  className="text-[13px] text-black/35 hover:text-black/60 transition"
                >
                  Пропустити
                </button>
              </div>

              {/* "Більше не питати" — Sasha's explicit call
                  (2026-08-28): per-meditation, not global (see
                  utils/meditationCheckinPrefs.ts). Applies from the
                  NEXT session onward — this one still proceeds normally
                  either way. Deliberately the quietest thing on the
                  screen (2026-09-24 redesign) — a preference, not an
                  action competing with the two above it. */}
              <label className="flex items-center justify-center gap-2 mt-6 text-[11px] text-black/35 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checkinNeverShow}
                  onChange={(e) => setCheckinNeverShow(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-black/40"
                />
                Більше не питати про самопочуття для цієї медитації
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Wide two-column layout (2026-08-30, per Sasha's explicit call
          — "розширити на весь екран, але розумно" + settings that are
          actually visible, not hidden behind a toggle). LEFT: the
          primary loop — title, ring/play, progress, ±15с/швидкість,
          everything needed to just listen. RIGHT: Таймер/Фоновий
          звук/Голос as a permanent sidebar. Still locked to one
          screen: max-h-full + the two-column body's own flex-1 +
          overflow-y-auto means a short window scrolls INSIDE the
          card, never stretches the page. */}
      {view === "player" && (
        <div className="h-screen px-6 pt-[84px] pb-6 flex items-center justify-center">
          <div ref={playerCardRef} className="w-full max-w-[1240px] max-h-full bg-white rounded-[32px] shadow-[0_24px_70px_rgba(15,23,42,0.08)] border border-black/[0.04] flex flex-col overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="grid md:grid-cols-[1fr_480px]">
                {/* LEFT — the primary loop */}
                <div className="flex flex-col items-center justify-center text-center px-10 py-9 md:border-r md:border-[#ece9fe]">
                  <div className="text-[12px] font-medium text-emerald-600/70 uppercase tracking-wider mb-1.5">
                    Медитація
                  </div>
                  <h2 className="text-[22px] font-bold text-black/85 mb-5">{meditation.title}</h2>

                  {/* Progress ring — a plain SVG circle here rather than
                      reusing ui/CircularProgress: that component is
                      styled for compact card use (44px, no center
                      content), while this needs a large ring with the
                      play/pause control inside it. Now driven by the
                      real <audio> element's currentTime/duration
                      (context/MeditationPlayerContext), not a timer. */}
                  <div className="relative w-[192px] h-[192px] mx-auto mb-6">
                    <div className="absolute inset-[10px] rounded-full bg-gradient-to-br from-emerald-100/60 to-cyan-100/60 blur-xl" />
                    <svg viewBox="0 0 220 220" className="relative w-full h-full -rotate-90">
                      <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="10" />
                      <circle
                        cx="110"
                        cy="110"
                        r="100"
                        fill="none"
                        stroke="url(#meditation-ring-gradient)"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 100}
                        strokeDashoffset={2 * Math.PI * 100 * (1 - percent / 100)}
                        style={{ transition: "stroke-dashoffset 1s linear" }}
                      />
                      <defs>
                        <linearGradient id="meditation-ring-gradient" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <button
                      onClick={() => player.togglePlay()}
                      className="absolute inset-0 m-auto w-20 h-20 rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex items-center justify-center text-[26px] hover:scale-105 transition disabled:opacity-60"
                      aria-label={player.isPlaying ? "Пауза" : "Відтворити"}
                      disabled={player.isLoading}
                    >
                      {player.isLoading ? "…" : player.isPlaying ? <Icon name="pause" size={18} filled /> : <Icon name="play" size={18} filled />}
                    </button>
                  </div>

                  {/* Draggable/seekable progress — a real transport,
                      not just a visual. */}
                  <input
                    type="range"
                    min={0}
                    max={totalSeconds || 0}
                    step={0.5}
                    value={Math.min(player.currentTime, totalSeconds || 0)}
                    onChange={(e) => player.seekTo(Number(e.target.value))}
                    className="w-full max-w-[360px] mb-2"
                    aria-label="Перемотка"
                  />

                  <div className="text-[18px] font-semibold text-black/85 mb-0.5">
                    {formatClock(player.currentTime)} <span className="text-black/30 font-normal">/ {formatClock(totalSeconds)}</span>
                  </div>
                  {player.playbackError ? (
                    <div role="alert" className="mb-6 text-[13px] text-black/60 text-center">
                      Не вдалося завантажити аудіо. Перевірте з'єднання.{" "}
                      <button onClick={player.retryPlayback} className="font-semibold text-indigo-600 hover:text-indigo-700 transition">
                        Спробувати ще
                      </button>
                    </div>
                  ) : (
                    <div className="text-[12px] text-black/40 mb-6" aria-live="polite">
                      {player.isLoading ? "Завантаження…" : remaining > 0.5 ? `Залишилось ${formatClock(remaining)}` : "Практику завершено"}
                    </div>
                  )}

                  {/* ±15с перемотка + швидкість відтворення —
                      "вторинне" (2026-08-30, per Sasha's explicit
                      call): smaller and quieter than the play control
                      above. */}
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => player.seekBy(-15)}
                      className="px-3 py-1.5 rounded-full bg-slate-50 border border-black/[0.04] hover:bg-slate-100 text-black/55 text-[12px] font-medium transition"
                      aria-label="Назад на 15 секунд"
                    >
                      ⟲ 15с
                    </button>
                    <div className="flex items-center gap-0.5 rounded-full bg-slate-50 border border-black/[0.04] p-1">
                      {PLAYBACK_RATES.map((rate) => (
                        <button
                          key={rate}
                          onClick={() => player.setPlaybackRate(rate)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition ${
                            player.playbackRate === rate
                              ? "bg-white shadow-[0_2px_8px_rgba(0,0,0,0.08)] text-black/80"
                              : "text-black/40 hover:text-black/60"
                          }`}
                        >
                          {rate}×
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => player.seekBy(15)}
                      className="px-3 py-1.5 rounded-full bg-slate-50 border border-black/[0.04] hover:bg-slate-100 text-black/55 text-[12px] font-medium transition"
                      aria-label="Вперед на 15 секунд"
                    >
                      15с ⟳
                    </button>
                  </div>
                </div>

                {/* RIGHT — Таймер/Фоновий звук/Голос as a permanent
                    sidebar (2026-08-30, per Sasha's explicit call —
                    "зроби доп опції більш видними"): no toggle
                    anymore, always visible next to the player instead
                    of collapsed behind a click. */}
                <div className="flex flex-col justify-center gap-8 px-8 py-9 text-left">
                  <section>
                    <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b6a85]">Таймер</h3>
                    <div className="flex flex-wrap gap-2">
                      {TIMER_MINUTES.map((mins) => {
                        const active = player.timerMinutes === mins;
                        return (
                          <button
                            key={mins}
                            type="button"
                            aria-pressed={active}
                            onClick={() => player.setTimerMinutes(mins)}
                            className={`min-h-[38px] rounded-full px-4 text-[14px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${active ? "bg-[#5b3df5] text-white shadow-[0_6px_16px_-8px_rgba(91,61,245,0.8)]" : "bg-[#f4f2fc] text-[#2d2a5c] hover:bg-[#ece9fe]"}`}
                          >
                            {mins} хв
                          </button>
                        );
                      })}
                      {player.timerMinutes !== null && (
                        <button
                          type="button"
                          onClick={() => player.setTimerMinutes(null)}
                          className="min-h-[38px] rounded-full px-3 text-[14px] font-medium text-[#4a2fd0] underline-offset-4 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50"
                        >
                          Вимкнути
                        </button>
                      )}
                    </div>
                    {player.timerMinutes !== null && player.timerRemainingSeconds !== null && (
                      <div className="mt-2 text-[13px] text-[#6b6a85]">До плавного завершення: {formatClock(player.timerRemainingSeconds)}</div>
                    )}
                  </section>

                  <section className="border-t border-[#ece9fe] pt-8">
                    <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b6a85]">Фоновий звук</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        aria-pressed={!player.hasBackgroundSound}
                        onClick={() => player.clearBackgroundSounds()}
                        className={`min-h-[38px] rounded-full px-4 text-[14px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${!player.hasBackgroundSound ? "bg-[#5b3df5] text-white shadow-[0_6px_16px_-8px_rgba(91,61,245,0.8)]" : "bg-[#f4f2fc] text-[#2d2a5c] hover:bg-[#ece9fe]"}`}
                      >
                        Без фону
                      </button>
                      {availableBackgroundTracks(meditation.hasEmbeddedMusic).map((track) => {
                        const active = player.backgroundSoundIds.includes(track.id);
                        return (
                          <button
                            key={track.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => player.toggleBackgroundSound(track.id)}
                            className={`min-h-[38px] rounded-full px-4 text-[14px] font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50 ${active ? "bg-[#5b3df5] text-white shadow-[0_6px_16px_-8px_rgba(91,61,245,0.8)]" : "bg-[#f4f2fc] text-[#2d2a5c] hover:bg-[#ece9fe]"}`}
                          >
                            {track.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="border-t border-[#ece9fe] pt-8">
                    <h3 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#6b6a85]">Гучність</h3>
                    <div className="flex flex-col gap-5">
                      <QuietSlider label="Голос" value={player.voiceVolume} onChange={player.setVoiceVolume} aria="Гучність голосу" />
                      {player.hasBackgroundSound && (
                        <QuietSlider label="Фон" value={player.backgroundVolume} onChange={player.setBackgroundVolume} aria="Гучність фонового звуку" />
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>

            {/* Bottom bar — spans the full width under both columns. */}
            <div className="shrink-0 border-t border-black/[0.05] px-10 py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap items-center gap-4">
                {publicTranscript(meditation) && (
                  <button
                    type="button"
                    onClick={() => { setTextCardHeight(playerCardRef.current?.offsetHeight ?? null); setTextOpen(true); }}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[#d9d4f5] bg-[#f8f6ff] px-5 text-[14px] font-semibold text-[#4a2fd0] transition hover:bg-[#f0ecff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50"
                  >
                    <Icon name="note" size={18} />
                    Текст практики
                  </button>
                )}
                <div className="text-[11px] text-black/30">
                  Можна заблокувати екран або вийти з цього екрана — практика продовжить відтворюватися.
                </div>
              </div>
              <button
                onClick={finishEarly}
                className="px-4 py-1.5 rounded-full text-[12px] text-black/40 hover:text-black/65 hover:bg-slate-100 transition shrink-0"
              >
                Завершити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Медитацію зупинено" — a real manual stop mid-practice
          (2026-08-30, per Sasha's explicit call). Deliberately bare:
          no save prompt, no "N практик всього" stat, no mood
          check-in — none of that belongs to a partial attempt, and
          showing it here is exactly what read as "провалив практику"
          to begin with. Just where it stopped, and a way back in
          either direction. */}
      {view === "stopped" && (
        <div className="min-h-screen flex items-center justify-center px-6 pt-[84px] pb-6">
          <div className="w-full max-w-[460px] rounded-[32px] border border-black/[0.04] bg-white px-10 py-10 text-center shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-[#f3efff] text-[#4a2fd0]"><Icon name="leaf" size={28} /></div>
            <h2 className="mb-2 text-[24px] font-bold text-[#1d1a3b]">Медитацію зупинено</h2>
            <div className="mb-1 text-[17px] font-semibold tabular-nums text-[#2d2a5c]">
              {formatClock(player.currentTime)} <span className="font-normal text-[#6b6a85]">/ {formatClock(totalSeconds)}</span>
            </div>
            <p className="mb-8 text-[15px] text-[#4b4a66]">Ви можете повернутися до неї будь-коли.</p>
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={resumeFromStopped}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#5b3df5] px-8 text-[15px] font-semibold text-white shadow-[0_12px_26px_-12px_rgba(91,61,245,0.9)] transition hover:bg-[#4a2fd0] focus:outline-none focus-visible:ring-4 focus-visible:ring-[#5b3df5]/25"
              >
                <Icon name="play" size={16} filled />
                Продовжити
              </button>
              <button onClick={onClose} className="min-h-[44px] rounded-full px-5 text-[14px] font-medium text-[#4a2fd0] transition hover:bg-[#f3efff] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5b3df5]/50">
                Повернутися до навчання
              </button>
            </div>
          </div>
        </div>
      )}

      {view === "completed" && (
        <div className="pt-[60px] min-h-screen flex items-center justify-center px-6">
          {/* A quiet emotional landing, not a generic success modal
              (2026-09-24 redesign, per Sasha's explicit spec — "I just
              finished a small personal practice", not "operation
              completed successfully"). Widened + solid white + equal
              top/bottom balance (2026-09-25, per Sasha's follow-up — same
              fix, same reasoning, as the checkin screen right above: a
              translucent glass card read cramped/low-contrast against the
              atmosphere, and centering the whole viewport (not accounting
              for the fixed header) sat it visibly closer to the bottom
              edge than the top — the checkin screen's own `pt-[60px]`
              wrapper already solves exactly this, so this reuses it
              instead of a second, subtly different centering rule). */}
          <div className="max-w-[880px] w-full bg-white rounded-[32px] shadow-[0_24px_70px_rgba(15,23,42,0.06)] border border-black/5 px-9 py-7 text-center">
            <div className="mb-1.5 flex justify-center text-emerald-600"><Icon name="leaf" size={26} /></div>
            <h2 className="text-[20px] font-bold mb-1">Практику завершено</h2>
            <div className="text-[15px] text-black/55 mb-1">{meditation.title}</div>
            <p className="text-[13px] text-black/40 mb-3">Ви дали собі кілька хвилин зупинитися.</p>

            {/* "Це була ваша N-та практика" — the same real session
                history as the intro screen's own insight line
                (2026-09-24, per Sasha's explicit spec), shown as a
                quiet fact rather than a stat card. */}
            {history.sessionCount > 0 && (
              <div className="text-[13px] text-black/40 mb-4">
                Це була ваша {history.sessionCount}-та практика.
                {history.sessionCount > 1 && " Ви вже поверталися до цієї медитації раніше."}
              </div>
            )}

            {/* Mood check-in + usefulness feedback side-by-side on wide
                screens (2026-09-25, per Sasha's "зменшити у висоту,
                збільшити у ширину" follow-up) — the card just got wider,
                so stacking these two independent panels vertically was
                pure wasted height; a two-column row uses that width
                instead. Falls back to a single column on narrow
                viewports/print, same content either way.
                (2026-09-25 follow-up: the imbalance this caused — mood
                panel growing tall once "Що змінилося?" expands, leaving
                a dead patch of white next to the short usefulness panel
                — is fixed by compacting that checklist itself, see its
                own comment below, rather than abandoning the two-column
                layout.) */}
            {/* 2026-09-29 bugfix, per Sasha's explicit call ("отцентруй
                блок який сдвинулся влево"): this two-column grid was
                fixed at `md:grid-cols-2` even when the mood-checkin
                panel doesn't render at all (no "before" answer this
                session — see pendingMoodCheckinId's own comment above).
                A single grid item still only fills its own first
                column, leaving the second column's width as dead empty
                space and reading as "pushed left" rather than centered.
                Falls back to a plain centered flex layout when there's
                only the one panel to show. */}
            <div
              className={
                player.pendingMoodCheckinId
                  ? "grid grid-cols-1 md:grid-cols-2 gap-4 items-start text-left"
                  : "flex justify-center text-left"
              }
            >

            {/* "Як ви зараз?" (2026-08-30) — the main event on this
                screen, not an afterthought: "не медитація завершена ✓,
                а як ви зараз". Only reachable when this session had a
                "before" answer. Foundation for a future до/після
                comparison (2026-09-24 redesign note): before and after
                both live on the same 1-5 MOOD_SCALE, one written right
                before the practice, this one right after — already
                structured so Sensoria can show "було → стало" together
                later without a new data model. */}
            {player.pendingMoodCheckinId && (
              <div className="rounded-2xl p-5 text-left h-full" style={{ background: `${pc1}14`, border: `1px solid ${pc1}33` }}>
                <div className="text-[14px] font-semibold text-black/75 mb-3 text-center">Як ви зараз?</div>
                <div role="radiogroup" aria-label="Як ви зараз? від 1 (напружено) до 5 (спокійно)" className="flex items-center justify-center gap-2.5">
                  {MOOD_SCALE.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => submitCheckinAfter(s.value)}
                      className={`w-11 h-11 rounded-full border text-[16px] font-semibold text-black/70 flex items-center justify-center transition ${
                        checkinAfter === s.value ? "scale-110 border-transparent" : "bg-white/70 opacity-60 hover:opacity-100"
                      }`}
                      style={
                        checkinAfter === s.value
                          ? { background: `linear-gradient(120deg, ${pc1}, ${pc3})` }
                          : { borderColor: `${pc1}55` }
                      }
                      role="radio"
                      aria-checked={checkinAfter === s.value}
                      aria-label={`${s.value} з 5 — ${s.label}`}
                    >
                      {s.value}
                    </button>
                  ))}
                </div>
                <div className="flex justify-between text-[11px] text-black/30 mt-1.5 max-w-[240px] mx-auto">
                  <span>Напружено</span>
                  <span>Спокійно</span>
                </div>

                {checkinAfter != null && (
                  <>
                    {(() => {
                      // The person's own report, framed as such — never as an
                      // effect of the practice (utils/meditationSession.ts).
                      const result = describeResult({
                        before: checkinBefore != null ? { stateKeys: [], intensity: checkinBefore } : null,
                        after: { intensity: checkinAfter, changeKeys: [] },
                      });
                      return result.kind === "none" ? null : (
                        <div className="text-center mt-4" aria-live="polite">
                          <div className="text-[13px] text-black/65">{result.text}</div>
                          <div className="text-[11.5px] text-black/35 mt-1">{result.caveat}</div>
                        </div>
                      );
                    })()}

                    <div className="text-[12px] font-medium text-black/55 mt-4 mb-2 text-center">
                      Що змінилося?
                    </div>
                    {/* Wrapping chips, not stacked full-width rows
                        (2026-09-25, per Sasha's "подумати компактно
                        зробити" — this list was the single biggest
                        height contributor once expanded, growing the
                        mood panel far past its neighbor in the two-
                        column layout above). Same toggle semantics as
                        before (checkinChangeNotes/toggleChangeNote,
                        multi-select) — just laid out like the checkin
                        screen's own FEELING_STATES chips instead of a
                        checkbox list, so 5 options wrap into ~2 short
                        rows instead of 5 tall ones. */}
                    <div className="flex flex-wrap justify-center gap-2">
                      {CHANGE_OPTIONS.map((opt) => {
                        const active = checkinChangeNotes.includes(opt.key);
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleChangeNote(opt.key)}
                            className="px-3 py-1.5 rounded-full text-[12.5px] font-medium border transition"
                            style={
                              active
                                ? { background: `linear-gradient(120deg, ${pc1}, ${pc2})`, borderColor: "transparent", color: "#1f2937" }
                                : { borderColor: `${pc1}40`, color: "rgba(0,0,0,0.55)" }
                            }
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* "Чи була ця практика корисною?" — a single lightweight
                yes/no, not a survey (2026-09-24 redesign, per Sasha's
                explicit spec). Same content_item_feedback persistence
                as before — visual only. */}
            <div className="rounded-2xl bg-black/[0.025] px-5 py-4 text-left h-full w-full max-w-[420px]">
              <div className="text-[13px] font-medium text-black/55 mb-2.5 text-center">
                Чи була ця практика корисною?
              </div>
              {/* Real pressed feedback, not just a faint tint (2026-09-25,
                  per Sasha's explicit report on this exact widget) — a
                  selected answer now reads as CLEARLY chosen: solid
                  palette-gradient fill + filled heart for "Так" (same
                  gradient language the mood/chip buttons elsewhere on
                  this screen already use for "selected"), a filled dot
                  for "Не зовсім", and a `active:scale-95` press-down on
                  both so the tap itself feels like it registered, not
                  only the state that follows it. */}
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => chooseFeedback("helpful")}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium border transition active:scale-95 ${
                    practiceFeedback === "helpful"
                      ? "border-transparent text-black/85 scale-105 shadow-sm"
                      : "border-black/10 text-black/50 hover:bg-black/5"
                  }`}
                  style={practiceFeedback === "helpful" ? { background: `linear-gradient(120deg, ${pc1}, ${pc3})` } : undefined}
                >
                  {practiceFeedback === "helpful" ? "♥ Так" : "♡ Так"}
                </button>
                <button
                  onClick={() => chooseFeedback("not_helpful")}
                  className={`px-4 py-2 rounded-full text-[13px] font-medium border transition active:scale-95 ${
                    practiceFeedback === "not_helpful"
                      ? "bg-black/10 border-black/25 text-black/80 scale-105 shadow-sm"
                      : "border-black/10 text-black/50 hover:bg-black/5"
                  }`}
                >
                  {practiceFeedback === "not_helpful" ? "● Не зовсім" : "○ Не зовсім"}
                </button>
              </div>
              {/* Confirmation only for "Так" — tapping IS the whole
                  answer, confirmed once the write really completes. "Не
                  зовсім" has its own separate confirmation below, tied
                  to the reason field's own "Надіслати". */}
              {practiceFeedback === "helpful" && practiceFeedbackSent && (
                <div className="text-[12px] text-black/45 font-medium text-center mt-2">
                  ✓ Дякуємо. Ваша відповідь допомагає автору.
                </div>
              )}
              {practiceFeedback === "not_helpful" && (
                <div className="mt-3">
                  <textarea
                    value={practiceFeedbackReason}
                    onChange={(e) => {
                      setPracticeFeedbackReason(e.target.value);
                      setPracticeFeedbackReasonSaved(false);
                    }}
                    placeholder="Поділіться враженням (необов'язково)"
                    rows={2}
                    className="w-full max-w-[360px] mx-auto block px-3.5 py-2.5 rounded-xl border border-black/10 bg-white/70 text-[13px] resize-none focus:outline-none focus:border-black/30"
                  />
                  <div className="mt-2 max-w-[360px] mx-auto text-center">
                    {practiceFeedbackReasonSaved ? (
                      <span className="text-[12px] text-black/45 font-medium">
                        ✓ Дякуємо. Автор побачить це і за потреби напише вам, щоб дізнатися деталі.
                      </span>
                    ) : (
                      <button
                        onClick={savePracticeFeedbackReason}
                        disabled={!practiceFeedbackReason.trim() || practiceFeedbackReasonSaving}
                        className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[12px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {practiceFeedbackReasonSaving ? "…" : "Надіслати"}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>

            {/* ♡ Зберегти — a short state label, not a sentence: this is
                just a bookmark, the heading above already says the
                practice is done. Quiet text link now rather than a
                pill, matching the intro screen's own secondary-actions
                treatment. */}
            <button
              onClick={toggleSavedPractice}
              disabled={savingPractice}
              className="mt-4 mb-6 text-[12px] text-black/40 hover:text-black/65 transition disabled:opacity-60"
            >
              {savedPractice ? "✓ Збережено" : "♡ Зберегти"}
            </button>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={handleFreshStart}
                className="px-6 py-3 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-semibold hover:opacity-90 transition shadow-[0_10px_24px_rgba(99,102,241,0.35)]"
              >
                Повторити
              </button>
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-full border border-black/10 bg-white/70 text-black/60 text-[14px] font-medium hover:bg-white transition"
              >
                До моїх медитацій
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "Завершити раніше" — Sasha's explicit call (2026-08-28):
          leaving mid-practice must never feel like the person did
          something wrong. Same visual pattern as the delete/report
          confirmations elsewhere in the app (ProgramExperience). */}
      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[10050] bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowExitConfirm(false)}
        >
          <div className="w-full max-w-[380px] rounded-[20px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-[15px] font-semibold mb-1">Завершити медитацію?</div>
            <p className="text-[13px] text-black/50 mb-5">Ви можете повернутися до неї пізніше.</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="px-5 py-2.5 rounded-xl border border-black/10 text-[13px] font-medium text-black/70 hover:bg-black/5 transition"
              >
                Продовжити
              </button>
              <button
                onClick={confirmFinishEarly}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 text-white text-[13px] font-semibold hover:opacity-90 transition"
              >
                Завершити
              </button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <MeditationReportModal
          meditationId={meditationId}
          title={meditation.title}
          userId={session?.profile.id}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>,
    document.body
  );
}

// Volume control in the Sensoria style: a slim lavender line, violet where it is filled, a white dot with a violet ring.
function QuietSlider({ label, value, onChange, aria, max = 1, step = 0.01 }: { label?: string; value: number; onChange: (v: number) => void; aria: string; max?: number; step?: number }) {
  const pct = max > 0 ? Math.round(Math.min(1, Math.max(0, value / max)) * 1000) / 10 : 0;
  return (
    <label className="flex items-center gap-5">
      {label && <span className="w-12 shrink-0 text-[14px] text-[#2d2a5c]">{label}</span>}
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        aria-label={aria}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ background: `linear-gradient(to right, #5b3df5 ${pct}%, #e3def9 ${pct}%)` }}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full focus:outline-none [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-solid [&::-moz-range-thumb]:border-[#5b3df5] [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-solid [&::-webkit-slider-thumb]:border-[#5b3df5] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_2px_8px_rgba(91,61,245,0.35)] focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-[#5b3df5]/25"
      />
    </label>
  );
}
