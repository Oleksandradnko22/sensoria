// The persistent "still playing" bar — visible across every tab of
// the dashboard (Огляд, Моє навчання, etc.) whenever a meditation is
// loaded in context/MeditationPlayerContext but its own full-screen
// view (MeditationExperience) isn't currently open. This is what makes
// "closed the screen, audio keeps going" actually visible/controllable
// instead of just trusting it's happening somewhere invisible — per
// Sasha's explicit call (2026-08-28), critical for mobile use.
//
// Deliberately NOT rendered while MeditationExperience is open: that
// screen already covers the full viewport (fixed inset-0, opaque
// background), so this would just sit invisibly behind it anyway —
// ParticipantDashboardPage gates it on `!continuingMeditationId` for
// clean focus order instead of relying on that z-index accident.

import { Icon } from "../ui/Icon";
import { useMeditationPlayer } from "../../context/MeditationPlayerContext";

type Props = {
  onOpen: () => void;
};

function formatClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function MeditationMiniPlayer({ onOpen }: Props) {
  const player = useMeditationPlayer();
  if (!player.meditation) return null;

  const percent = player.duration > 0 ? Math.min(100, (player.currentTime / player.duration) * 100) : 0;

  return (
    <div className="fixed bottom-4 inset-x-4 md:inset-x-auto md:left-auto md:right-6 md:w-[380px] z-40">
      <div className="rounded-2xl bg-white shadow-[0_16px_44px_rgba(10,10,40,0.2)] border border-black/5 overflow-hidden">
        <div className="h-1 bg-black/5">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-cyan-500 transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="px-3.5 py-3 flex items-center gap-3">
          <button
            onClick={() => player.togglePlay()}
            className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-white flex items-center justify-center text-[15px] hover:opacity-90 transition"
            aria-label={player.isPlaying ? "Пауза" : "Відтворити"}
          >
            {player.isLoading ? "…" : player.isPlaying ? <Icon name="pause" size={16} filled /> : <Icon name="play" size={16} filled />}
          </button>
          <button onClick={onOpen} className="flex-1 min-w-0 text-left">
            <div className="text-[13px] font-semibold truncate">{player.meditation.title}</div>
            <div className="text-[11px] text-black/40">
              {formatClock(player.currentTime)} / {player.duration ? formatClock(player.duration) : "—:—"}
            </div>
          </button>
          <button
            onClick={() => player.closePlayer()}
            className="shrink-0 w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 text-black/50 text-[13px] flex items-center justify-center transition"
            aria-label="Зупинити і закрити"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
