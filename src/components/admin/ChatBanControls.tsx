import { chatBanState, formatRemaining, nextBanLabel, banStepLabel } from "../../utils/chatBan";
import type { SenderChatBan } from "../../utils/moderationView";

// Chat-ban status for one person + the "lift it" button — shared by the
// Модерація cards and the Користувачі table so both read the same.
export default function ChatBanControls({
  ban,
  busy,
  onLift,
  compact = false,
}: {
  ban: SenderChatBan;
  busy: boolean;
  onLift: () => void;
  compact?: boolean;
}) {
  const state = chatBanState({ permanent: ban.permanent, untilIso: ban.until }, Date.now());

  if (!state.active) {
    // Not banned now — but if they had bans before, say what the NEXT one
    // would be, so the escalation is never a surprise to the admin.
    if (ban.count === 0 || compact) return null;
    return (
      <div className="text-[12px] text-black/60">
        Було блокувань чату: {ban.count}. Наступне: {nextBanLabel(ban.count)}.
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-[12px] font-medium">
        Чат заблоковано · {state.permanent ? "назавжди" : `ще ${formatRemaining(state.remainingMs).replace(/ \d+ с$/, "")}`}
      </span>
      <span className="text-[12px] text-black/60">
        {ban.count}-е блокування ({banStepLabel(ban.count)})
      </span>
      <button
        onClick={onLift}
        disabled={busy}
        className="min-h-[44px] px-3 rounded-lg text-[13px] font-medium bg-[#eef2ff] text-[#1d4ed8] hover:bg-[#e0e7ff] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"
      >
        Зняти блокування чату
      </button>
    </div>
  );
}
