// A gentle window when a text sounds like a crisis: where to get help in Ukraine right now. The post itself goes to
// a moderator instead of the feed (supabase/feeds.sql: feed_text_is_crisis). Shown in «Публікації» before sending.
import { Icon } from "../ui/Icon";

export const UA_HELP: { phone: string; name: string; note: string }[] = [
  { phone: "7333", name: "Lifeline Ukraine", note: "Лінія запобігання самогубствам і психологічної підтримки. Цілодобово, безкоштовно з мобільного." },
  { phone: "116 123", name: "Ла Страда-Україна", note: "Психологічна підтримка для дорослих. Безкоштовно." },
  { phone: "116 111", name: "Дитяча лінія", note: "Для дітей, підлітків і молоді. Безкоштовно." },
  { phone: "1547", name: "Урядова лінія", note: "Якщо ви потерпаєте від насильства. Цілодобово." },
  { phone: "112", name: "Екстрена допомога", note: "Якщо зараз є загроза життю. Також 103 — швидка." },
];

export default function CrisisHelp({ onSend, onBack, busy = false }: { onSend?: () => void; onBack: () => void; busy?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#12172b]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="crisis-title">
      <div className="sensoria-scroll max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-[0_40px_100px_-40px_rgba(40,30,120,0.6)] sm:rounded-[28px] sm:p-7">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#5b3df5]"><Icon name="lifebuoy" size={24} /></span>
        <h2 id="crisis-title" className="mt-4 text-[21px] font-bold leading-snug text-[#12172b]">Схоже, вам зараз дуже важко</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[#2d2a5c]">Ви не самі. Поговорити з фахівцем можна просто зараз — безкоштовно й анонімно.</p>
        <ul className="mt-5 flex flex-col gap-2.5">
          {UA_HELP.map((h) => (
            <li key={h.phone}>
              <a href={`tel:${h.phone.replace(/\s/g, "")}`} className="flex items-center gap-4 rounded-2xl bg-[#faf9ff] px-4 py-3 ring-1 ring-[#ece8fb] transition hover:bg-[#f3efff]">
                <span className="min-w-[78px] text-[20px] font-bold tabular-nums text-[#4338ca]">{h.phone}</span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-[#12172b]">{h.name}</span>
                  <span className="block text-[13px] leading-snug text-black/55">{h.note}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {onSend && <p className="mt-5 text-[13px] leading-snug text-black/55">Якщо надішлете цей текст, його спершу прочитає модератор Sensoria, а не стрічка. Так ми дбаємо про вас і про інших.</p>}
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={onBack} className="min-h-[46px] flex-1 rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[15px] font-semibold text-white">Повернутися</button>
          {onSend && <button type="button" onClick={onSend} disabled={busy} className="min-h-[46px] flex-1 rounded-2xl bg-white px-5 text-[15px] font-semibold text-[#4338ca] ring-1 ring-[#d9d4f5] hover:bg-[#f6f4ff] disabled:opacity-50">{busy ? "Надсилаємо…" : "Надіслати модератору"}</button>}
        </div>
      </div>
    </div>
  );
}
