import { useEffect, useState } from "react";
import { chatBanState, formatRemaining, type ChatBanFields } from "../utils/chatBan";

// Banner with a live countdown, shown above the message composer while the
// person's chat is banned. Disappears by itself when the time runs out.
export default function ChatBanNotice({
  ban,
  onExpire,
  className = "",
}: {
  ban: ChatBanFields | null;
  onExpire?: () => void;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const state = chatBanState(ban, now);

  useEffect(() => {
    if (!state.active || state.permanent) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.active, state.active && state.permanent]);

  const expired = !!ban && !ban.permanent && !state.active;
  useEffect(() => {
    if (expired) onExpire?.();
  }, [expired, onExpire]);

  if (!state.active) return null;

  return (
    <div
      role="status"
      className={`rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-[14px] text-red-800 ${className}`}
    >
      <div className="font-semibold">
        {state.permanent ? "Чат заблоковано назавжди" : "Чат тимчасово заблоковано"}
      </div>
      <p className="mt-0.5 leading-relaxed">
        Через повторні порушення правил надсилати повідомлення зараз не можна. Решта можливостей Sensoria працює
        як раніше.
      </p>
      {!state.permanent && (
        <p className="mt-1.5">
          Залишилось:{" "}
          <span className="font-semibold tabular-nums" aria-live="off">
            {formatRemaining(state.remainingMs)}
          </span>
        </p>
      )}
      <p className="mt-1.5 text-[13px] text-red-700">
        Вважаєте, це помилка? Напишіть у підтримку — ми розглянемо звернення.
      </p>
    </div>
  );
}
