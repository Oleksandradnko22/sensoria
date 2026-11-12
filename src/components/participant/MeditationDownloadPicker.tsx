// Shared "choose background sounds + volumes, preview, then confirm"
// popover for offline meditation downloads — 2026-09-29, extracted out
// of MeditationExperience.tsx so the exact same picker (with the same
// live-preview behavior) is available everywhere a "Зберегти офлайн"
// trigger exists, not just on the meditation's own intro screen. Sasha
// explicitly asked for this after seeing it work there: "и то же самое
// для этой кнопки" (referring to the small download icon on meditation
// cards in "Моє навчання" — ParticipantLearning.tsx's ContentCard/
// MeditationLearningCard).
//
// This component owns ONLY the picker's own local choices (which
// background tracks, both volumes, whether the preview is playing) and
// the popover's open/closed state — it does NOT own isDownloaded/
// downloadProgress/downloadError or call downloadMeditationAudio
// itself. Every call site already has its own (sometimes differently
// shaped) download-progress UI; `onConfirm` hands back the finished
// choice and lets that call site run its own existing download flow
// with it, exactly like it already ran `downloadMeditationAudio(
// meditation)` with no arguments before this picker existed.
import { Icon } from "../ui/Icon";
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { findBackgroundTrack, availableBackgroundTracks } from "../../data/meditationBackgroundSounds.ts";
import type { Meditation } from "../../data/meditations.ts";
import { useMeditationPlayer } from "../../context/MeditationPlayerContext";

export type MeditationDownloadChoice = {
  backgroundTrackIds: string[];
  voiceVolume: number;
  backgroundVolume: number;
};

type Props = {
  meditation: Meditation;
  // Accent colors for the confirm button's gradient — callers already
  // have a deterministic per-meditation palette (lib/meditationPalette.ts)
  // computed for their own card/hero anyway, so this just reuses it
  // instead of picking a new arbitrary color scheme for the dialog.
  pc1: string;
  pc3: string;
  onConfirm: (choice: MeditationDownloadChoice) => void;
  // Renders the actual trigger element (an icon button on a card, a
  // text link on the intro screen, etc.) — each call site keeps its own
  // exact appearance; this component only tells it whether the dialog
  // is open and gives it a toggle function.
  trigger: (open: boolean, toggle: () => void) => ReactNode;
};

export default function MeditationDownloadPicker({ meditation, pc1, pc3, onConfirm, trigger }: Props) {
  // One source of truth for the audio session: the preview below must never
  // play at the same time as the real player, so starting it pauses that.
  const player = useMeditationPlayer();
  const [open, setOpen] = useState(false);
  const [backgroundIds, setBackgroundIds] = useState<string[]>([]);
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [backgroundVolume, setBackgroundVolume] = useState(0.4);

  // Live preview — plain <audio> elements playing simultaneously at the
  // chosen volumes (the same "mix by ear via several volumed elements"
  // approach MeditationPlayerContext already uses live), scoped to this
  // popover. It does not touch the real session's state, but it pauses the
  // real player first (see startPreview) so two sounds never overlap.
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const previewVoiceRef = useRef<HTMLAudioElement | null>(null);
  const previewBackgroundRefs = useRef<Map<string, HTMLAudioElement>>(new Map());

  const stopPreview = () => {
    previewVoiceRef.current?.pause();
    previewVoiceRef.current = null;
    previewBackgroundRefs.current.forEach((audio) => audio.pause());
    previewBackgroundRefs.current.clear();
    setPreviewPlaying(false);
  };

  const startPreview = () => {
    if (player.isPlaying) player.pauseForNow();
    const voice = new Audio(meditation.audioUrl);
    voice.volume = voiceVolume;
    voice.loop = true;
    voice.play().catch(() => {});
    previewVoiceRef.current = voice;

    backgroundIds.forEach((id) => {
      const track = findBackgroundTrack(id);
      if (!track) return;
      const bg = new Audio(track.url);
      bg.volume = backgroundVolume;
      bg.loop = true;
      bg.play().catch(() => {});
      previewBackgroundRefs.current.set(id, bg);
    });
    setPreviewPlaying(true);
  };

  useEffect(() => {
    if (previewVoiceRef.current) previewVoiceRef.current.volume = voiceVolume;
  }, [voiceVolume]);
  useEffect(() => {
    previewBackgroundRefs.current.forEach((audio) => {
      audio.volume = backgroundVolume;
    });
  }, [backgroundVolume]);

  useEffect(() => {
    if (!previewPlaying) return;
    const active = new Set(backgroundIds);
    previewBackgroundRefs.current.forEach((audio, id) => {
      if (!active.has(id)) {
        audio.pause();
        previewBackgroundRefs.current.delete(id);
      }
    });
    backgroundIds.forEach((id) => {
      if (previewBackgroundRefs.current.has(id)) return;
      const track = findBackgroundTrack(id);
      if (!track) return;
      const bg = new Audio(track.url);
      bg.volume = backgroundVolume;
      bg.loop = true;
      bg.play().catch(() => {});
      previewBackgroundRefs.current.set(id, bg);
    });
    // backgroundVolume intentionally excluded — handled by its own
    // volume-only effect above, not by tearing tracks down/recreating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundIds, previewPlaying]);

  useEffect(() => {
    if (!open) stopPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => stopPreview, []);

  const toggleBackground = (id: string) => {
    setBackgroundIds((current) => {
      if (current.includes(id)) return current.filter((existing) => existing !== id);
      const track = findBackgroundTrack(id);
      const withoutSameGroup = track?.group
        ? current.filter((existing) => findBackgroundTrack(existing)?.group !== track.group)
        : current;
      return [...withoutSameGroup, id];
    });
  };

  const handleConfirm = () => {
    setOpen(false);
    onConfirm({ backgroundTrackIds: backgroundIds, voiceVolume, backgroundVolume });
  };

  // 2026-09-29 bugfix, per Sasha's explicit call ("не внутри карточки -
  // сделай это отдельным окном"): this used to be an `absolute`-
  // positioned popover anchored inside whatever card/row the trigger
  // lived in. Every meditation card (ParticipantLearning.tsx) clips its
  // own content with `overflow-hidden` (the rounded thumbnail corners),
  // so the popover was getting visually squashed/cut off there — fine
  // on MeditationExperience's own intro screen (no clipping ancestor),
  // broken on cards. A portal-rendered, fixed, viewport-centered dialog
  // sidesteps every ancestor's overflow/positioning entirely — it's a
  // genuinely separate floating window, not something nested inside the
  // trigger's own DOM position, so this one implementation now works
  // identically everywhere regardless of what's clipping the trigger.
  return (
    <>
      {trigger(open, () => setOpen((v) => !v))}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] bg-black/40 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-[0_24px_60px_rgba(15,23,42,0.25)] border border-black/[0.06] p-5 w-full max-w-[340px] text-left"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="text-[13.5px] font-semibold text-black/70">Фоновий звук для офлайн-файлу</div>
                <button
                  onClick={() => setOpen(false)}
                  className="text-black/30 hover:text-black/60 transition text-[15px] leading-none"
                  aria-label="Закрити"
                >
                  ✕
                </button>
              </div>
            <div className="text-[11.5px] text-black/40 mb-3 leading-relaxed">
              Необов'язково — можна обрати кілька, вони збережуться разом із голосом в один файл.
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {availableBackgroundTracks(meditation.hasEmbeddedMusic).map((track) => {
                const active = backgroundIds.includes(track.id);
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => toggleBackground(track.id)}
                    className={`px-2.5 py-1 rounded-full text-[11.5px] font-medium transition ${
                      active
                        ? "bg-gradient-to-r from-cyan-400 to-cyan-500 text-white shadow-[0_2px_8px_rgba(6,182,212,0.35)]"
                        : "bg-white border border-black/[0.08] text-black/50 hover:bg-slate-100"
                    }`}
                  >
                    {track.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => (previewPlaying ? stopPreview() : startPreview())}
              className="w-full mb-3 flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[12px] font-medium border border-black/10 text-black/60 hover:bg-black/[0.03] transition"
            >
              {previewPlaying ? (<><Icon name="pause" size={13} filled /> Зупинити прослуховування</>) : (<><Icon name="play" size={13} filled /> Прослухати мікс</>)}
            </button>
            <div className="flex flex-col gap-2 mb-3.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-black/40 w-9 shrink-0">Голос</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={voiceVolume}
                  onChange={(e) => setVoiceVolume(Number(e.target.value))}
                  className="flex-1"
                  aria-label="Гучність голосу у файлі"
                />
              </div>
              {backgroundIds.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-black/40 w-9 shrink-0">Фон</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={backgroundVolume}
                    onChange={(e) => setBackgroundVolume(Number(e.target.value))}
                    className="flex-1"
                    aria-label="Гучність фонового звуку у файлі"
                  />
                </div>
              )}
            </div>
              <button
                onClick={handleConfirm}
                className="w-full rounded-full py-1.5 text-[12.5px] font-semibold text-white transition hover:opacity-90"
                style={{ background: `linear-gradient(120deg, ${pc1}, ${pc3})` }}
              >
                {backgroundIds.length > 0 ? "Змішати й зберегти" : "Зберегти без фону"}
              </button>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
