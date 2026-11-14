import { Icon } from "../ui/Icon";
import { useEffect, useState } from "react";
import { authorFaqCategories } from "../../data/authorDashboard";
import { useSession } from "../../context/SessionContext";
import {
  submitTicket,
  fetchMyTickets,
  TICKET_CATEGORY_LABELS,
  type TicketCategory,
  type MyTicket,
} from "../../lib/supportTickets";
import { formatAbsoluteDate } from "../../utils/relativeTime";

const TICKET_CATEGORIES = Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[];

// "Швидко знайти відповідь" — the most common reasons an author
// actually opens this page, each pointing straight at one FAQ answer.
// Matched by question text (not a hardcoded index) so reordering
// authorFaqCategories doesn't silently break a shortcut.
const QUICK_SCENARIOS: { label: string; categoryId: string; question: string }[] = [
  {
    label: "Коли будуть виплати",
    categoryId: "finance",
    question: "Як часто відбуваються виплати?",
  },
  {
    label: "Хто перевіряє матеріали",
    categoryId: "moderation",
    question: "Хто перевіряє новий контент — людина чи автоматично?",
  },
  {
    label: "Не можу увійти",
    categoryId: "account",
    question: "Не можу увійти в акаунт — що робити?",
  },
  {
    label: "Учасник порушує правила",
    categoryId: "participants",
    question: "Що робити, якщо учасник порушує правила платформи?",
  },
];

export default function AuthorHelp() {
  const session = useSession();
  const profile = session?.profile;

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // ── PROBLEM REPORT ───────────────────────────────────────────────
  const [reportCategory, setReportCategory] = useState<TicketCategory>("technical");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);

  // ── MY TICKETS ───────────────────────────────────────────────────
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);

  const loadTickets = () => {
    if (!profile) return;
    fetchMyTickets(profile.id).then(setTickets).catch(() => setTickets([]));
  };

  useEffect(() => {
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const submitProblemReport = async () => {
    if (!profile || !reportDescription.trim()) return;
    setReportSubmitting(true);
    setReportError(null);
    try {
      await submitTicket({
        userId: profile.id,
        category: reportCategory,
        description: reportDescription.trim(),
      });
      setReportSent(true);
      setReportDescription("");
      loadTickets();
      setTimeout(() => {
        setReportSent(false);
      }, 1800);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Не вдалося надіслати.");
    } finally {
      setReportSubmitting(false);
    }
  };


  const jumpToFaq = (categoryId: string, question: string) => {
    const cat = authorFaqCategories.find((c) => c.id === categoryId);
    const idx = cat?.items.findIndex((i) => i.q === question) ?? -1;
    if (!cat || idx === -1) return;
    setQuery("");
    const key = `${categoryId}-${idx}`;
    setOpenKey(key);
    requestAnimationFrame(() => {
      document.getElementById(key)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const categoriesWithKeys = authorFaqCategories.map((cat) => ({
    ...cat,
    items: cat.items.map((item, i) => ({ ...item, key: `${cat.id}-${i}` })),
  }));

  const q = query.trim().toLowerCase();
  const filteredCategories = q
    ? categoriesWithKeys
        .map((cat) => ({
          ...cat,
          items: cat.items.filter(
            (item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q)
          ),
        }))
        .filter((cat) => cat.items.length > 0)
    : categoriesWithKeys;

  const [faqCat, setFaqCat] = useState<string>("all");
  const shownCategories = q ? filteredCategories : filteredCategories.filter((c) => faqCat === "all" || c.id === faqCat);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Допомога</h1>
        <p className="mt-1 text-[15px] text-black/55">Відповіді на часті питання, відеоінструкції й зв’язок із командою Sensoria.</p>
      </div>

      {/* search */}
      <section className="rounded-[28px] bg-gradient-to-br from-[#eef0fd] via-white to-[#f6f1ff] p-6 ring-1 ring-[#e4def9] sm:p-8">
        <h2 className="text-[20px] font-bold text-[#12172b]">Що сталося? Знайдемо відповідь</h2>
        <div className="relative mt-4">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/35"><Icon name="search" size={18} /></span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Наприклад: «коли будуть виплати»" aria-label="Пошук у допомозі" className="w-full rounded-2xl bg-white py-4 pl-12 pr-4 text-[15px] ring-1 ring-[#e3def9] focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]" />
        </div>
        {!q && (
          <div className="mt-4 flex flex-wrap gap-2">
            {QUICK_SCENARIOS.map((s) => (
              <button key={s.label} type="button" onClick={() => jumpToFaq(s.categoryId, s.question)} className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#e3def9] transition hover:bg-[#f6f4ff]">{s.label} →</button>
            ))}
          </div>
        )}
      </section>

      {/* video instructions */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Модулі та уроки програми", "https://youtu.be/9N-hBpSTeyU"],
          ["Студія запису медитацій", "https://youtu.be/-sF3fac4iY8"],
          ["Конструктор гайдів", "https://youtu.be/ZLYGMK7Dz6o"],
          ["Як завантажити відео на YouTube", "https://youtu.be/_bc0HnxvtZQ"],
        ].map(([title, url]) => (
          <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-3 rounded-[22px] bg-white p-4 ring-1 ring-[#ece8fb] transition hover:ring-[#c9bff7]">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3b6df0] to-[#7c5cf0] text-white"><Icon name="play" size={18} /></span>
            <span className="min-w-0">
              <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-[#6d5bd0]">Відеоінструкція</span>
              <span className="block text-[14px] font-semibold leading-snug text-[#12172b] group-hover:text-[#4338ca]">{title}</span>
            </span>
          </a>
        ))}
      </section>

      {/* FAQ */}
      <section className="rounded-[26px] bg-white p-5 ring-1 ring-[#ece8fb] sm:p-6">
        <h2 className="text-[18px] font-bold text-[#12172b]">Часті питання</h2>
        {!q && (
          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Теми">
            {[{ id: "all", label: "Усі" }, ...authorFaqCategories.map((c) => ({ id: c.id, label: c.label }))].map((c) => (
              <button key={c.id} type="button" role="tab" aria-selected={faqCat === c.id} onClick={() => setFaqCat(c.id)} className={`min-h-[38px] rounded-xl px-3.5 text-[13px] font-semibold transition ${faqCat === c.id ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/30" : "bg-[#faf9ff] text-black/60 hover:bg-[#f3f1fb]"}`}>{c.label}</button>
            ))}
          </div>
        )}
        {shownCategories.length === 0 && <p className="mt-4 text-[14px] text-black/55">Нічого не знайдено — спробуйте інші слова або напишіть нам нижче.</p>}
        <div className="mt-4 flex flex-col gap-2">
          {shownCategories.flatMap((cat) => cat.items.map((item) => {
            const isOpen = openKey === item.key;
            return (
              <div key={item.key} id={item.key} className={`scroll-mt-6 overflow-hidden rounded-2xl ring-1 transition ${isOpen ? "bg-[#faf9ff] ring-[#d9d4f5]" : "bg-white ring-[#f1eefb] hover:ring-[#e3def9]"}`}>
                <button type="button" onClick={() => setOpenKey(isOpen ? null : item.key)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
                  <span className="text-[15px] font-semibold text-[#12172b]">{item.q}</span>
                  <Icon name="chevron" size={18} className={`shrink-0 text-black/40 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && <div className="px-5 pb-4 text-[14px] leading-relaxed text-[#2d2a5c]">{item.a}</div>}
              </div>
            );
          }))}
        </div>
      </section>

      {/* write to us */}
      <section id="support-form" className="scroll-mt-6 rounded-[26px] bg-white p-5 ring-1 ring-[#ece8fb] sm:p-6">
        <div className="flex items-start gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#5b3df5]"><Icon name="mail" size={20} /></span>
          <div>
            <h2 className="text-[18px] font-bold text-[#12172b]">Не знайшли відповіді? Напишіть нам</h2>
            <p className="text-[14px] text-black/55">Читаємо кожне звернення особисто й зазвичай відповідаємо протягом робочого дня.</p>
          </div>
        </div>
        {reportSent ? (
          <p role="status" className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-[14px] text-emerald-900 ring-1 ring-emerald-100">Звернення надіслано. Відповідь з’явиться нижче, у «Ваші звернення».</p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Тема звернення">
              {TICKET_CATEGORIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={reportCategory === c} onClick={() => setReportCategory(c)} className={`min-h-[38px] rounded-xl px-3.5 text-[13px] font-semibold transition ${reportCategory === c ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/30" : "bg-[#faf9ff] text-black/60 hover:bg-[#f3f1fb]"}`}>{TICKET_CATEGORY_LABELS[c]}</button>
              ))}
            </div>
            <textarea value={reportDescription} onChange={(e) => setReportDescription(e.target.value.slice(0, 2000))} placeholder="Опишіть, що сталося і що ви вже спробували…" rows={4} aria-label="Опис звернення" className="w-full resize-y rounded-2xl bg-[#faf9ff] p-4 text-[15px] ring-1 ring-[#e3def9] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]" />
            {reportError && <p role="alert" className="text-[13px] text-rose-700">{reportError}</p>}
            <button type="button" onClick={submitProblemReport} disabled={reportSubmitting || !reportDescription.trim()} className="min-h-[46px] self-start rounded-2xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-6 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:opacity-40">{reportSubmitting ? "Надсилаємо…" : "Надіслати"}</button>
          </div>
        )}

        {tickets && tickets.length > 0 && (
          <div className="mt-6 border-t border-[#f1eefb] pt-5">
            <h3 className="text-[15px] font-bold text-[#12172b]">Ваші звернення</h3>
            <ul className="mt-3 flex flex-col gap-2.5">
              {tickets.map((t) => (
                <li key={t.id} className="rounded-2xl bg-[#faf9ff] px-4 py-3 ring-1 ring-[#ece8fb]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold text-[#12172b]">{TICKET_CATEGORY_LABELS[t.category]}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${t.status === "open" ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{t.status === "open" ? "Очікує відповіді" : "Вирішено"}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-black/45">{formatAbsoluteDate(t.createdAt)}</div>
                  {t.adminResponse && <div className="mt-2 rounded-xl bg-white px-3 py-2 text-[14px] text-[#2d2a5c] ring-1 ring-[#ece8fb]"><b className="text-[#4338ca]">Sensoria:</b> {t.adminResponse}</div>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
