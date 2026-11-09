// The single real <audio> element for a participant's dashboard
// session, created once and never tied to MeditationExperience's own
// mount/unmount. That's the whole point: per Sasha's explicit call
// (2026-08-28), closing the meditation screen must NOT stop playback —
// the person is very likely doing this on a phone, screen locked,
// walking away. Mounted once in ParticipantDashboardPage, wrapping its
// entire tree (sidebar tabs, MeditationExperience, MeditationMiniPlayer
// all included) — so switching between "Огляд"/"Моє навчання"/etc. or
// locking the screen never unmounts it either; only actually leaving
// the dashboard (log out, "На сайт") does, which reads as a genuine,
// intentional exit rather than the "закрив екран/заблокував телефон"
// case this was built for.
//
// What this can't do: survive the browser tab or PWA actually being
// closed — no web app can keep JS running past that, on any platform.
// Within an open tab, though, a real <audio> element + the Media
// Session API below is enough for iOS/Android to keep playing audio
// with the screen locked and to show lock-screen transport controls —
// this is standard, well-supported browser behavior for genuine media
// playback (unlike setInterval-driven timers, which mobile browsers
// throttle hard in the background).
//
// Position syncing (fetchMeditationAudioPosition/save/clear) and
// session-history recording (utils/meditationSessionStore) both live
// here rather than in MeditationExperience, for the same reason: a
// meditation can finish while the person is on a completely different
// screen, and that still has to count as a real completed session and
// still has to save "resume from here" correctly.
//
// SECOND AUDIO LAYER (2026-08-28, per Sasha's explicit call — "це вже
// відчувається як справжній meditation player"): independent, looping
// "🎧 Фоновий звук" ambience track(s), mixed under the voice track. Was
// originally a single mutually-exclusive choice; per Sasha's 2026-09-24
// follow-up ("человек может выбирать сколько захочет звуков на фон")
// this is now any number of tracks at once, each its own <audio>
// element in bgAudiosRef (a Map keyed by track id), sharing one volume
// (backgroundVolume, "Фон") — never tied to the voice track's
// position/rate, since an ambience loop doesn't need to "match"
// playback speed or a seek. Defaults to whatever the meditation's
// author configured (data/meditationBackgroundSounds.ts) when a
// session starts, but per Sasha's later follow-up (same day) the
// PARTICIPANT can freely change or remove it live in the player too —
// this isn't locked to the author's choice, "silence" doubles as the
// literal "turn it off" option.
//
// ТАЙМЕР (2026-08-28, per Sasha's explicit call — "особливо для
// медитацій без постійного супроводу"): a separate, optional
// wall-clock countdown (5/10/15/20/30 хв) for silent/minimal-format
// sessions where the person just wants to sit for a chosen stretch
// rather than follow the voice track to its own natural end. Ticked
// off the existing 'timeupdate' listener below — deliberately NOT a
// standalone setInterval, for the same background-throttling reason
// the header comment above already explains: 'timeupdate' only fires
// while the real <audio> element is genuinely playing, so the
// countdown naturally pauses when the practice is paused and keeps
// counting reliably even with the screen locked. When it reaches
// zero: a short, gentle chime (synthesized on the spot via the Web
// Audio API — a real two-tone bell, not a labeled placeholder file)
// plays, and the session ends exactly like reaching the track's own
// end does. `sessionEnded` generalizes "this session is over" across
// all three ways that can happen (natural end, "Завершити", timer) so
// MeditationExperience can reliably show the report screen even if it
// reopens after the timer fired while it was closed.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Meditation } from "../data/meditations";
import { BACKGROUND_TRACKS, findBackgroundTrack } from "../data/meditationBackgroundSounds";
import { recordSessionStart, recordSessionCompleted, hydrateSessionHistory } from "../utils/meditationSessionStore";
import { fetchSessionSummary, logSessionCompleted, logSessionStart } from "../lib/meditationSessions";
import { getDownloadedMeditationAudio } from "../lib/meditationDownloads";
import {
  fetchMeditationAudioPosition,
  saveMeditationAudioPosition,
  clearMeditationAudioPosition,
  isResumablePosition,
} from "../lib/meditationAudioPositions";

export type PlaybackRate = 0.75 | 1 | 1.25;

type MeditationPlayerValue = {
  meditation: Meditation | null;
  isPlaying: boolean;
  isLoading: boolean;
  // True after the audio failed to load/play (network or file problem) —
  // the screen says so and offers "Спробувати ще" (retryPlayback).
  playbackError: boolean;
  retryPlayback: () => void;
  // Loads the account's server-side session history (see lib/meditationSessions.ts).
  refreshSessionHistory: (userId: string) => void;
  currentTime: number;
  duration: number;
  // "Голос" — the main narration/voice track's own volume.
  voiceVolume: number;
  // "Фон" — shared volume for every currently-active ambience track.
  // Only meaningful when hasBackgroundSound is true; harmless to set
  // otherwise (just nothing to apply it to yet).
  backgroundVolume: number;
  // The live set of ambience track ids currently mixed in, all playing
  // simultaneously (each its own independently-looping <audio>
  // element — see data/meditationBackgroundSounds.ts's BACKGROUND_TRACKS
  // and this file's bgAudiosRef). Defaults from whatever the
  // meditation's author configured when a session starts, but the
  // participant can freely add/remove any number of tracks afterward.
  // An empty array is the literal "off" state.
  backgroundSoundIds: string[];
  // Adds the track if it isn't currently playing, removes it if it is.
  toggleBackgroundSound: (id: string) => void;
  // Stops and forgets every active track at once — "Без фону".
  clearBackgroundSounds: () => void;
  // Derived from backgroundSoundIds.length > 0 — lets the player screen
  // show/hide the "Фон" volume slider instead of always reserving space
  // for a control that does nothing.
  hasBackgroundSound: boolean;
  playbackRate: PlaybackRate;
  // The chosen countdown length in minutes, or null when no timer is
  // set — see header comment. Independent of the voice track's own
  // duration/position.
  timerMinutes: number | null;
  // Live remaining seconds, ticking down only while actually playing;
  // null whenever timerMinutes is null.
  timerRemainingSeconds: number | null;
  // Pass null to turn the timer off. Picking a new value always
  // (re)starts the countdown from that full length.
  setTimerMinutes: (minutes: number | null) => void;
  // True once the current session is over, however it got there
  // (natural end, "Завершити", or the timer) — lets the screen
  // reliably show the report even after reopening on a session that
  // finished while it was closed.
  sessionEnded: boolean;
  // Bumped every time a session genuinely starts or completes — the
  // session-history store itself (localStorage) has no reactivity of
  // its own, so anything displaying "скільки разів"/"востаннє" (the
  // intro screen, later maybe "Ваші спостереження") re-reads it
  // whenever this changes instead of only on its own mount.
  historyVersion: number;
  // Bumped on every real save OR clear of meditation_audio_positions
  // (periodic autosave while playing, pause, finishing, switching
  // tracks) — per Sasha's explicit call (2026-08-28): "Зупинено на"
  // on the "Моє навчання" card must actually refresh once the real
  // saved position moves, not just stay at whatever it was when that
  // page first loaded. ParticipantLearning re-fetches whenever this
  // changes instead of only once on mount.
  positionVersion: number;
  // Bumped on every real save OR remove of a content_item_saved_practices
  // row for a meditation ("♡ Зберегти" — MeditationExperience's completed
  // screen AND the card toggle on "Моє навчання" both write here). Per
  // Sasha's report (2026-08-28) — "adds it, but only shows after a page
  // refresh": saving from the completed screen had no way to tell the
  // "Моє навчання" card (a separate component instance, fetched once on
  // its own mount) that anything changed, so it kept showing whatever it
  // fetched at mount until a full reload re-fetched for real. Same fix
  // shape as positionVersion above — anyone showing "is this saved to
  // Моя практика" re-reads whenever this changes instead of only once.
  savedPracticeVersion: number;
  bumpSavedPracticeVersion: () => void;
  // Bumped whenever a meditation's offline download (lib/
  // meditationDownloads.ts) is added or removed — same reactive-signal
  // shape as savedPracticeVersion just above, for the same reason: the
  // card on "Моє навчання" and the intro screen's own download control
  // are separate component instances, each with no other way to learn
  // the other one just finished downloading (or removing) the same
  // meditation.
  downloadsVersion: number;
  bumpDownloadsVersion: () => void;
  // Starts a meditation, or — if it's already the one loaded (e.g.
  // still running in the mini player from before) — just resumes it
  // in place rather than restarting from 0:00. Pass forceRestart when
  // the intent is genuinely "begin again" (e.g. "Повторити" after a
  // session already ended) even if it's the same track.
  loadAndPlay: (meditation: Meditation, userId: string | null, opts?: { forceRestart?: boolean }) => void;
  togglePlay: () => void;
  seekBy: (deltaSeconds: number) => void;
  seekTo: (seconds: number) => void;
  setVoiceVolume: (v: number) => void;
  setBackgroundVolume: (v: number) => void;
  setPlaybackRate: (r: PlaybackRate) => void;
  // "Завершити" — the person ending the practice on purpose before the
  // track runs out. Counts as completed, same as reaching the end.
  finishNow: () => void;
  // A lighter alternative to finishNow() (2026-08-30, per Sasha's
  // explicit call — "сохранение ≠ прохождение", an early stop must
  // never read or count as a completed practice). Pauses and saves the
  // real position — same as any other pause — but deliberately does
  // NOT clear meditation_audio_positions and does NOT call
  // recordSessionCompleted, so the session stays genuinely resumable
  // and "скільки разів практикували" isn't inflated by a partial
  // attempt. Used for the player screen's "Завершити" link and the
  // exit-confirm dialog's "Завершити" — both now land on the new
  // "stopped" report (MeditationExperience) instead of the full
  // completion one.
  pauseForNow: () => void;
  // Fully stops and unloads — dismissing the mini player entirely,
  // not just closing the full-screen view.
  closePlayer: () => void;
  // The meditation_mood_checkins row id for the CURRENT session, if the
  // person answered the optional "Як ви почуваєтесь зараз?" step before
  // starting — null if they skipped it, or once a new session begins.
  // Lives here (not as MeditationExperience local state) for the same
  // reason everything else does: the session can finish while the
  // screen is closed, and the "А як тепер?" question still has to be
  // reachable the next time the screen opens, even in a fresh mount.
  pendingMoodCheckinId: string | null;
  setPendingMoodCheckinId: (id: string | null) => void;
};

const MeditationPlayerContext = createContext<MeditationPlayerValue | null>(null);

const POSITION_SAVE_INTERVAL_MS = 8000;
// "Плавне згасання" (2026-08-30, per Sasha's explicit call for sleep
// meditations): the timer reaching zero fades both audio layers out to
// silence over this stretch, rather than an abrupt stop — gentler for
// someone drifting off, and no separate sound needed on top.
const FADE_OUT_DURATION_MS = 8000;
const FADE_STEP_MS = 100;

export function MeditationPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  if (audioRef.current === null && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
    audioRef.current.preload = "metadata";
  }
  // The ambience layer(s) — any number of tracks can play at once
  // (2026-09-24, per Sasha), each its own independently-looping <audio>
  // element keyed by track id. Never seeks/rate-changes with the voice
  // track (see header comment).
  const bgAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const [meditation, setMeditation] = useState<Meditation | null>(null);
  const meditationRef = useRef<Meditation | null>(null);
  useEffect(() => {
    meditationRef.current = meditation;
  }, [meditation]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [voiceVolume, setVoiceVolumeState] = useState(1);
  const [backgroundVolume, setBackgroundVolumeState] = useState(0.4);
  const [backgroundSoundIds, setBackgroundSoundIds] = useState<string[]>([]);
  const hasBackgroundSound = backgroundSoundIds.length > 0;
  const [playbackRate, setPlaybackRateState] = useState<PlaybackRate>(1);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [positionVersion, setPositionVersion] = useState(0);
  const bumpPositionVersion = () => setPositionVersion((v) => v + 1);
  const [savedPracticeVersion, setSavedPracticeVersion] = useState(0);
  const bumpSavedPracticeVersion = () => setSavedPracticeVersion((v) => v + 1);
  const [downloadsVersion, setDownloadsVersion] = useState(0);
  const bumpDownloadsVersion = () => setDownloadsVersion((v) => v + 1);
  const [pendingMoodCheckinId, setPendingMoodCheckinId] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);

  // Таймер — mirrored in refs (for the timeupdate handler, which is
  // bound once and would otherwise read stale state) and state (for
  // the UI). timerRemainingRef is the source of truth during ticking;
  // timerRemainingSeconds just reflects it for rendering.
  const [timerMinutes, setTimerMinutesState] = useState<number | null>(null);
  const [timerRemainingSeconds, setTimerRemainingSecondsState] = useState<number | null>(null);
  const timerRemainingRef = useRef<number | null>(null);
  const timerLastTickRef = useRef<number | null>(null);
  const timerFiredRef = useRef(false);

  const userIdRef = useRef<string | null>(null);
  // See loadAndPlay's offline-blob lookup for why this exists.
  const loadTokenRef = useRef(0);
  // The timer's own gradual volume ramp-down when it reaches zero — see
  // completeViaTimer/cancelFadeOut below.
  const fadeIntervalRef = useRef<number | null>(null);
  // 2026-09-29 audit fix, per Sasha's explicit call to close this gap:
  // true only while the CURRENTLY LOADED audio.src is an offline blob
  // that already has background baked in (see meditationDownloads.ts's
  // getDownloadedMeditationAudio). loadAndPlay must never seed the
  // author's live default ambience (next.backgroundSoundIds) on top of
  // such a blob — that would play the same background twice, once
  // baked into the file and once as a live loop layered over it. Reset
  // to false the moment a fresh source loads that ISN'T such a blob
  // (a plain network stream, or a voice-only offline copy), so seeding
  // resumes normally for those.
  const offlineHasEmbeddedBackgroundRef = useRef(false);

  const play = () => {
    cancelFadeOut();
    audioRef.current?.play().catch(() => {
      // Autoplay blocked (rare here — loadAndPlay is always triggered
      // by a real click) — isPlaying just stays false, no crash.
    });
    bgAudiosRef.current.forEach((el) => el.play().catch(() => {}));
  };
  const pause = () => {
    cancelFadeOut();
    audioRef.current?.pause();
    bgAudiosRef.current.forEach((el) => el.pause());
  };

  // Stops the timer's own gradual volume ramp-down (see completeViaTimer
  // below), wherever it's called from — natural completion, or the
  // person doing literally anything else (play/pause/seek/load a new
  // track) while it's mid-fade. Always restores full volume when it
  // does, so nothing downstream (a manual resume, the next session)
  // ever starts silent because a fade got interrupted partway.
  const cancelFadeOut = () => {
    if (fadeIntervalRef.current === null) return;
    window.clearInterval(fadeIntervalRef.current);
    fadeIntervalRef.current = null;
    if (audioRef.current) audioRef.current.volume = voiceVolume;
    bgAudiosRef.current.forEach((el) => {
      el.volume = backgroundVolume;
    });
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = audio.duration && Number.isFinite(audio.duration) ? audio.duration : seconds;
    const clamped = Math.max(0, Math.min(seconds, max));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  };
  const seekBy = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    seekTo(audio.currentTime + delta);
  };

  const setVoiceVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVoiceVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
  };
  const setBackgroundVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setBackgroundVolumeState(clamped);
    bgAudiosRef.current.forEach((el) => {
      el.volume = clamped;
    });
  };
  const setPlaybackRate = (r: PlaybackRate) => {
    setPlaybackRateState(r);
    if (audioRef.current) audioRef.current.playbackRate = r;
    // Deliberately NOT applied to the ambience tracks — a background loop
    // shouldn't speed up/slow down with narration pace.
  };

  const savePositionNow = () => {
    const audio = audioRef.current;
    const med = meditationRef.current;
    const userId = userIdRef.current;
    if (!audio || !med || !userId) return;
    saveMeditationAudioPosition({
      meditationId: med.id,
      userId,
      positionSeconds: audio.currentTime,
      durationSeconds: audio.duration || null,
    }).catch(() => {});
    // Optimistic, same fire-and-forget spirit as the save call above —
    // see positionVersion's own comment in the type for why this needs
    // to exist at all.
    bumpPositionVersion();
  };

  // Tears down and forgets ONE ambience track — used both for an
  // explicit toggle-off and when a track's own audio element errors
  // (see createBgAudio below): a missing/broken ambience file should
  // never take the whole practice down, just quietly drop out of the
  // mix.
  const removeBackgroundTrack = (id: string) => {
    const el = bgAudiosRef.current.get(id);
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      bgAudiosRef.current.delete(id);
    }
    setBackgroundSoundIds((ids) => ids.filter((existing) => existing !== id));
  };

  const createBgAudio = (id: string, url: string): HTMLAudioElement | null => {
    if (typeof Audio === "undefined") return null;
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    el.volume = backgroundVolume;
    el.src = url;
    el.addEventListener("error", () => removeBackgroundTrack(id));
    return el;
  };

  // Adds ONE ambience track to the live mix — a no-op if it's already
  // playing. Used both by toggleBackgroundSound (participant clicking a
  // chip) and seedBackgroundTracks (starting a session from whatever
  // the author configured).
  const addBackgroundTrack = (id: string, opts?: { autoplay?: boolean }) => {
    if (bgAudiosRef.current.has(id)) return;
    const track = findBackgroundTrack(id);
    if (!track) return;
    // Radio-button behavior within a group (2026-09-24, per Sasha —
    // "музику при этом можно выбрать только одну"): the four music
    // variants are alternates of each other, not independent layers —
    // picking one swaps out any other currently-active track sharing
    // the same group. Tracks with no group (rain/nature/sea/fire) are
    // unaffected and keep mixing freely.
    if (track.group) {
      BACKGROUND_TRACKS.filter((t) => t.group === track.group && bgAudiosRef.current.has(t.id)).forEach((t) =>
        removeBackgroundTrack(t.id)
      );
    }
    const el = createBgAudio(id, track.url);
    if (!el) return;
    bgAudiosRef.current.set(id, el);
    setBackgroundSoundIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    if (opts?.autoplay) el.play().catch(() => {});
  };

  // Public, participant-facing: add or remove ONE ambience track from
  // the live mix — any number of tracks can be active at once
  // (2026-09-24, per Sasha — "человек может выбирать сколько захочет
  // звуков на фон"), and this takes effect immediately if a session is
  // currently playing, no pause/resume needed.
  const toggleBackgroundSound = (id: string) => {
    if (bgAudiosRef.current.has(id)) {
      removeBackgroundTrack(id);
    } else {
      addBackgroundTrack(id, { autoplay: isPlaying });
    }
  };

  // Stops and forgets every active ambience track at once — "Без
  // фону".
  const clearBackgroundSounds = () => {
    bgAudiosRef.current.forEach((el) => {
      el.pause();
      el.removeAttribute("src");
      el.load();
    });
    bgAudiosRef.current.clear();
    setBackgroundSoundIds([]);
  };

  // Replaces the whole live mix with a fresh set of tracks — used when
  // a session starts or restarts, seeded from whatever the meditation's
  // author configured (data/meditations.ts's backgroundSoundIds).
  const seedBackgroundTracks = (ids: string[]) => {
    clearBackgroundSounds();
    ids.forEach((id) => addBackgroundTrack(id));
  };

  // Resets the countdown entirely — used both for an explicit "turn
  // the timer off" and whenever a fresh session starts (a new
  // meditation, or a deliberate restart shouldn't silently inherit an
  // old countdown).
  const clearTimer = () => {
    setTimerMinutesState(null);
    timerRemainingRef.current = null;
    timerLastTickRef.current = null;
    timerFiredRef.current = false;
    setTimerRemainingSecondsState(null);
  };

  // Picking a length always (re)starts the countdown fresh from that
  // full duration, whether or not one was already running.
  const setTimerMinutes = (minutes: number | null) => {
    if (minutes === null) {
      clearTimer();
      return;
    }
    setTimerMinutesState(minutes);
    const seconds = minutes * 60;
    timerRemainingRef.current = seconds;
    timerLastTickRef.current = null;
    timerFiredRef.current = false;
    setTimerRemainingSecondsState(seconds);
  };

  const loadAndPlay = (next: Meditation, userId: string | null, opts?: { forceRestart?: boolean }) => {
    const audio = audioRef.current;
    if (!audio) return;
    userIdRef.current = userId;
    setPlaybackError(false);
    cancelFadeOut();
    // Invalidates any offline-blob lookup still in flight from a
    // previous call (see the fresh-load branch below) — every call
    // here, even ones that return early, means whatever that lookup
    // was about to do is no longer the current intent.
    const myLoadToken = ++loadTokenRef.current;

    const sameTrack = meditationRef.current?.id === next.id;

    // Same track already loaded (likely still running in the mini
    // player) and no explicit restart requested — just resume it in
    // place, never restart from the top.
    if (sameTrack && !opts?.forceRestart) {
      setMeditation(next);
      play();
      return;
    }

    // Same track, but a genuine "begin again" (e.g. "Повторити" once a
    // session has already ended) — no need to reload the source or
    // re-fetch a saved position, just jump back to 0:00. The ambience
    // loop restarts fresh too.
    if (sameTrack && opts?.forceRestart) {
      setMeditation(next);
      seekTo(0);
      // Only reseed the author's live default ambience if the currently
      // loaded audio.src ISN'T an offline blob that already has
      // background baked in — see offlineHasEmbeddedBackgroundRef's own
      // comment above for why layering both would double the sound.
      if (offlineHasEmbeddedBackgroundRef.current) {
        clearBackgroundSounds();
      } else {
        seedBackgroundTracks(next.backgroundSoundIds ?? []);
      }
      setSessionEnded(false);
      clearTimer();
      recordSessionStart(next.id);
      if (userIdRef.current) void logSessionStart(next.id, userIdRef.current);
      setHistoryVersion((v) => v + 1);
      play();
      return;
    }

    // Switching away from a different, still-loaded track — save its
    // position before we overwrite audio.src, so it isn't lost.
    if (meditationRef.current) savePositionNow();

    setMeditation(next);
    setIsLoading(true);
    setDuration(0);
    setCurrentTime(0);
    audio.playbackRate = playbackRate;
    audio.volume = voiceVolume;
    setSessionEnded(false);
    clearTimer();

    recordSessionStart(next.id);
    if (userId) void logSessionStart(next.id, userId);
    setHistoryVersion((v) => v + 1);

    // forceRestart matters here too, not just in the sameTrack branch
    // above — a genuine "Почати спочатку" on a track that ISN'T
    // currently loaded (the normal case: opening the screen fresh)
    // used to silently ignore this flag and resume from the saved DB
    // position anyway, which is wrong when the person explicitly asked
    // to start over. Also clears that saved position outright, so a
    // stale "resume from here" doesn't reappear next time either.
    const seedPositionAndPlay = () => {
      if (!userId || opts?.forceRestart) {
        if (opts?.forceRestart && userId) {
          clearMeditationAudioPosition(next.id, userId).catch(() => {});
          bumpPositionVersion();
        }
        play();
        return;
      }
      fetchMeditationAudioPosition(next.id, userId)
        .then((pos) => {
          if (isResumablePosition(pos, audio.duration)) {
            audio.currentTime = pos!.positionSeconds;
            setCurrentTime(pos!.positionSeconds);
          }
        })
        .catch(() => {})
        .finally(() => play());
    };

    // "Зберегти офлайн" (2026-08-30, per Sasha's explicit call): prefer
    // whatever's already sitting in this device's IndexedDB over the
    // network — the whole point is playing with zero connection at
    // all, on a plane or mid-walk. myLoadToken (captured at the top of
    // this function) guards against a second loadAndPlay firing while
    // this lookup is still in flight; without it, a slow/offline lookup
    // could resolve after audio.src has already moved on and clobber it.
    //
    // Seeding the live ambience layer moved here (2026-09-29 audit fix)
    // — it used to happen synchronously above, before this lookup even
    // started, which meant it always seeded the author's default
    // regardless of whether the offline copy about to load already had
    // its own background baked in. Now it only seeds when that ISN'T
    // the case; a plain network stream or a voice-only offline copy
    // still seeds exactly as before, just a moment later.
    getDownloadedMeditationAudio(next.id)
      .catch(() => null)
      .then((offline) => {
        if (loadTokenRef.current !== myLoadToken) return;
        offlineHasEmbeddedBackgroundRef.current = offline?.hasEmbeddedBackground ?? false;
        if (offline?.hasEmbeddedBackground) {
          clearBackgroundSounds();
        } else {
          seedBackgroundTracks(next.backgroundSoundIds ?? []);
        }
        audio.src = offline?.url ?? next.audioUrl;
        audio.addEventListener("loadedmetadata", seedPositionAndPlay, { once: true });
      });
  };

  const finishNow = () => {
    pause();
    savePositionNow();
    const med = meditationRef.current;
    if (med) {
      recordSessionCompleted(med.id);
      if (userIdRef.current) void logSessionCompleted(med.id, userIdRef.current);
      setHistoryVersion((v) => v + 1);
      if (userIdRef.current) {
        clearMeditationAudioPosition(med.id, userIdRef.current).catch(() => {});
        bumpPositionVersion();
      }
    }
    setSessionEnded(true);
  };

  // See the type's own comment above for why this exists separately
  // from finishNow().
  const pauseForNow = () => {
    pause();
    savePositionNow();
    bumpPositionVersion();
  };

  // The timer reaching zero — per Sasha's explicit call (2026-08-30),
  // gently fades both audio layers out to silence over
  // FADE_OUT_DURATION_MS rather than stopping abruptly, then does the
  // same "session is over" bookkeeping as any other ending. clearTimer
  // happens right away (not after the fade) so the countdown display
  // itself doesn't linger at 0:00 while the fade is still playing out.
  const completeViaTimer = () => {
    clearTimer();
    const audio = audioRef.current;
    if (!audio) {
      finishNow();
      return;
    }
    const startVoiceVolume = audio.volume;
    const startBgVolume = backgroundVolume;
    const totalSteps = Math.max(1, Math.round(FADE_OUT_DURATION_MS / FADE_STEP_MS));
    let step = 0;
    fadeIntervalRef.current = window.setInterval(() => {
      step += 1;
      const remaining = Math.max(0, 1 - step / totalSteps);
      audio.volume = startVoiceVolume * remaining;
      bgAudiosRef.current.forEach((el) => {
        el.volume = startBgVolume * remaining;
      });
      if (step >= totalSteps) {
        // Clears the interval and restores both volumes to their
        // normal levels — finishNow() pauses right after, so the
        // restored level is never actually heard, but it means
        // whatever plays next (resuming, a new session) doesn't start
        // silently.
        cancelFadeOut();
        finishNow();
      }
    }, FADE_STEP_MS);
  };

  // 2026-09-29 audit fix: `audio.pause()` fires its own 'pause' DOM
  // event asynchronously (queued as a task, per the HTML spec) — it
  // does NOT run synchronously. This function used to call
  // `audio.pause()` and then IMMEDIATELY `audio.removeAttribute("src")`
  // + `audio.load()` in the same synchronous block, which resets
  // `currentTime` back to 0 before the browser ever gets a chance to
  // fire that queued 'pause' event. The onPause handler above (which
  // calls savePositionNow()) was therefore reading a currentTime that
  // had already been reset to 0 by the time it ran — dismissing the
  // mini player with "✕" was silently saving position 0 instead of
  // wherever the person actually stopped, quietly breaking "Зупинено
  // на X:XX" / resumability for anyone who closes the mini player
  // rather than pausing it some other way. Saving the real position
  // explicitly, BEFORE touching src/load at all (same pattern
  // pauseForNow()/finishNow() already use), is what actually fixes it.
  const closePlayer = () => {
    cancelFadeOut();
    savePositionNow();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    clearBackgroundSounds();
    setMeditation(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSessionEnded(false);
    clearTimer();
  };

  // Audio element event wiring — attached once, all handlers below only
  // ever read refs (never stale state), so a mount-once effect is safe.
  // Only the voice track (audioRef) drives isPlaying/duration/ended —
  // the ambience layer is a passive passenger, always started/stopped
  // alongside it via play()/pause() above, never its own source of
  // truth.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Ticks the timer off real elapsed wall-clock time between
    // consecutive 'timeupdate' events — this event only fires while
    // the track is genuinely playing, so a paused practice naturally
    // pauses the countdown too, with no extra bookkeeping needed. See
    // this file's header comment for why this rides on 'timeupdate'
    // instead of its own setInterval.
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (timerRemainingRef.current !== null && !timerFiredRef.current) {
        const now = Date.now();
        const last = timerLastTickRef.current ?? now;
        const elapsed = (now - last) / 1000;
        timerLastTickRef.current = now;
        const next = Math.max(0, timerRemainingRef.current - elapsed);
        timerRemainingRef.current = next;
        setTimerRemainingSecondsState(next);
        if (next <= 0) {
          timerFiredRef.current = true;
          completeViaTimer();
        }
      }
    };
    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
      setIsLoading(false);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      savePositionNow();
      bgAudiosRef.current.forEach((el) => el.pause());
    };
    const onEnded = () => {
      setIsPlaying(false);
      bgAudiosRef.current.forEach((el) => el.pause());
      const med = meditationRef.current;
      if (med) {
        recordSessionCompleted(med.id);
      if (userIdRef.current) void logSessionCompleted(med.id, userIdRef.current);
        setHistoryVersion((v) => v + 1);
        if (userIdRef.current) {
          clearMeditationAudioPosition(med.id, userIdRef.current).catch(() => {});
          bumpPositionVersion();
        }
      }
      setSessionEnded(true);
    };
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => {
      setIsLoading(false);
      setPlaybackError(false);
    };
    // A real network/file failure — don't leave the button stuck on a
    // permanent loading spinner; let the person try again instead.
    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setPlaybackError(true);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic position autosave while actually playing — same 8s cadence
  // as ProgramExperience's video-position polling, so a closed tab
  // loses at most a few seconds either way.
  useEffect(() => {
    if (!isPlaying) return;
    const id = window.setInterval(savePositionNow, POSITION_SAVE_INTERVAL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, meditation?.id]);

  // Media Session — lock-screen/notification transport controls, and
  // (on mobile) part of what keeps the OS from treating this as an
  // interruptible background timer instead of real media playback.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!meditation) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meditation.title,
      artist: "Sensoria",
      album: "Медитація",
    });
  }, [meditation]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.setActionHandler("play", () => play());
    navigator.mediaSession.setActionHandler("pause", () => pause());
    navigator.mediaSession.setActionHandler("seekbackward", (details) => seekBy(-(details?.seekOffset ?? 15)));
    navigator.mediaSession.setActionHandler("seekforward", (details) => seekBy(details?.seekOffset ?? 15));
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Best-effort last save if the tab is closed or backgrounded mid-session.
  // `beforeunload` alone is unreliable on mobile (iOS Safari rarely fires it),
  // so `pagehide` and "page became hidden" save too.
  useEffect(() => {
    const onBeforeUnload = () => savePositionNow();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") savePositionNow();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pulls the account's session history from the server into the on-device
  // cache (new device, cleared browser) and refreshes whatever shows it.
  const refreshSessionHistory = (userId: string) => {
    fetchSessionSummary(userId).then((summary) => {
      if (Object.keys(summary).length === 0) return;
      hydrateSessionHistory(summary);
      setHistoryVersion((v) => v + 1);
    });
  };

  const retryPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaybackError(false);
    setIsLoading(true);
    const resumeAt = audio.currentTime;
    audio.load();
    const resume = () => {
      if (resumeAt > 0) audio.currentTime = resumeAt;
      play();
    };
    audio.addEventListener("loadedmetadata", resume, { once: true });
  };

  const value: MeditationPlayerValue = {
    meditation,
    isPlaying,
    isLoading,
    playbackError,
    retryPlayback,
    refreshSessionHistory,
    currentTime,
    duration,
    voiceVolume,
    backgroundVolume,
    backgroundSoundIds,
    toggleBackgroundSound,
    clearBackgroundSounds,
    hasBackgroundSound,
    playbackRate,
    timerMinutes,
    timerRemainingSeconds,
    setTimerMinutes,
    sessionEnded,
    historyVersion,
    positionVersion,
    savedPracticeVersion,
    bumpSavedPracticeVersion,
    downloadsVersion,
    bumpDownloadsVersion,
    loadAndPlay,
    togglePlay: () => (isPlaying ? pause() : play()),
    seekBy,
    seekTo,
    setVoiceVolume,
    setBackgroundVolume,
    setPlaybackRate,
    finishNow,
    pauseForNow,
    closePlayer,
    pendingMoodCheckinId,
    setPendingMoodCheckinId,
  };

  return <MeditationPlayerContext.Provider value={value}>{children}</MeditationPlayerContext.Provider>;
}

export function useMeditationPlayer(): MeditationPlayerValue {
  const ctx = useContext(MeditationPlayerContext);
  if (!ctx) throw new Error("useMeditationPlayer must be used within MeditationPlayerProvider");
  return ctx;
}
