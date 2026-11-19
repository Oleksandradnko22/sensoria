// «Фінанси» → the top card: what is still missing for paid sales, and a request for a Zoom consultation with the
// Sensoria team (the FOP at monobank, the cash register, taxes). The request is a support ticket («Звернення» in
// the admin panel, the admins get an email); the team writes back to agree on the time.
import { useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { useSession } from "../../context/SessionContext";
import { fetchPaidReadiness, type PaidReadiness } from "../../lib/paidReadiness";
import { fetchMyTickets, submitTicket } from "../../lib/supportTickets";

const PREFIX = "Консультація з підключення фінансів";
const TOPICS = ["Приймання оплат (ФОП у monobank)", "Каса для чеків (ПРРО)", "Податки й документи", "Інше"] as const;

export default function FinanceSetupCard({ card }: { card: string }) {
  const session = useSession();
  const userId = session?.profile.id ?? null;
  const email = session?.profile.email ?? "";
  const [ready, setReady] = useState<PaidReadiness | null>(null);
  const [open, setOpen] = useState(false);
  const [topics, setTopics] = useState<string[]>([]);
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // an open request already sent: shown instead of a second form
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void fetchPaidReadiness().then(setReady);
    if (!userId) return;
    void fetchMyTickets(userId).then((list) => {
      const t = list.find((x) => x.status === "open" && x.description.startsWith(PREFIX));
      if (t) setPending(t.createdAt);
    });
  }, [userId]);

  const items = ready
    ? ([
        ["Приймання оплат (ФОП у monobank)", ready.mono || !ready.live],
        ["Каса для чеків (ПРРО)", ready.prro || !ready.live],
        ["Умови платних продажів", ready.consent],
      ] as const)
    : null;

  const send = async () => {
    if (!userId) return;
    if (!topics.length) return setError("Оберіть, з чим потрібна допомога.");
    if (when.trim().length < 3) return setError("Напишіть, коли вам зручно зустрітися.");
    setBusy(true);
    setError(null);
    try {
      const lines = [
        `${PREFIX} (Zoom).`,
        `Теми: ${topics.join("; ")}.`,
        `Зручний час: ${when.trim()}.`,
        ...(note.trim() ? [`Коментар: ${note.trim()}`] : []),
        ...(items ? [`Стан: ${items.map(([l, d]) => `${l} — ${d ? "так" : "ні"}`).join("; ")}.`] : []),
        `Відповісти на: ${email || "пошту облікового запису"}.`,
      ];
      await submitTicket({ userId, category: "payment", description: lines.join("\n").slice(0, 2000) });
      setPending(new Date().toISOString());
      setOpen(false);
    } catch {
      setError("Не вдалося надіслати заявку. Спробуйте ще раз.");
    } finally {
      setBusy(false);
    }
  };

  const allDone = !!items && items.every(([, d]) => d);
  const input = "min-h-[44px] w-full rounded-xl bg-white px-3.5 text-[14px] ring-1 ring-[#e3def9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca]";

  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby="fin-setup">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#eef0fd] text-[#4338ca]"><Icon name="toolbox" size={20} /></span>
            <div>
              <h2 id="fin-setup" className="text-[18px] font-bold leading-tight text-[#12172b]">{allDone ? "Платні продажі підключено" : "Підключення платних продажів"}</h2>
              <p className="text-[13px] text-black/55">{allDone ? "Можна ставити ціну на матеріали." : "Без цього матеріали можна публікувати лише безкоштовно."}</p>
            </div>
          </div>
          {items && (
            <ul className="mt-4 flex flex-col gap-2 text-[14px]">
              {items.map(([label, done]) => (
                <li key={label} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : "bg-white text-black/30 ring-1 ring-[#d9d4f7]"}`}>
                    {done && <Icon name="check" size={13} />}
                  </span>
                  <span className={done ? "text-black/55" : "font-medium text-[#1d2240]"}>{label}<span className="sr-only">{done ? ": готово" : ": не підключено"}</span></span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-[#f3f4ff] to-[#f6f1ff] p-4 ring-1 ring-[#e4def9] sm:p-5">
          <div className="text-[15px] font-semibold text-[#1d2240]">Допоможемо все налаштувати</div>
          <p className="mt-1 text-[13px] leading-relaxed text-black/60">Зустріч у Zoom з командою Sensoria: разом підключимо ФОП до приймання оплат, касу для чеків і розберемося з податками й документами.</p>
          {pending ? (
            <p role="status" className="mt-3 rounded-xl bg-white px-3.5 py-3 text-[13px] leading-relaxed text-[#2d2a5c] ring-1 ring-[#e3def9]">
              Заявку надіслано {new Date(pending).toLocaleDateString("uk-UA")}. Ми напишемо вам на пошту{email ? ` ${email}` : ""}, щоб домовитися про час зустрічі.
            </p>
          ) : !open ? (
            <button type="button" onClick={() => setOpen(true)} disabled={!userId} className="mt-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4338ca] focus-visible:ring-offset-2">
              Записатися на консультацію
            </button>
          ) : (
            <div className="mt-3 grid gap-3">
              <fieldset>
                <legend className="text-[13px] font-semibold text-[#2d2a5c]">З чим допомогти</legend>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {TOPICS.map((t) => {
                    const on = topics.includes(t);
                    return (
                      <button key={t} type="button" aria-pressed={on} onClick={() => setTopics(on ? topics.filter((x) => x !== t) : [...topics, t])}
                        className={`min-h-[38px] rounded-xl px-3 text-[13px] font-medium ring-1 transition ${on ? "bg-[#eef0fd] text-[#4338ca] ring-[#c9cffa]" : "bg-white text-[#1d2240] ring-[#e3def9] hover:bg-[#faf9ff]"}`}>
                        {t}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <label className="grid gap-1 text-[13px] font-semibold text-[#2d2a5c]">
                Коли вам зручно
                <input value={when} onChange={(e) => setWhen(e.target.value.slice(0, 200))} placeholder="Наприклад: будні після 18:00 або вівторок зранку" className={input} />
              </label>
              <label className="grid gap-1 text-[13px] font-semibold text-[#2d2a5c]">
                Коментар <span className="font-normal text-black/45">(необов’язково)</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={2} className={`${input} py-2.5`} />
              </label>
              <p className="text-[12px] text-black/50">Відповімо на {email || "пошту вашого облікового запису"}. Не надсилайте ключі каси, PIN чи паролі — вони на зустрічі не потрібні.</p>
              {error && <p role="alert" className="text-[13px] text-rose-700">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void send()} disabled={busy} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-60">{busy ? "Надсилаємо…" : "Надіслати заявку"}</button>
                <button type="button" onClick={() => { setOpen(false); setError(null); }} className="min-h-[44px] rounded-xl px-3 text-[14px] font-semibold text-black/55 hover:bg-black/[0.04]">Скасувати</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
