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
    label: "Курс не проходить модерацію",
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
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<TicketCategory>("technical");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);

  // ── MY TICKETS ───────────────────────────────────────────────────
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);

  const loadTickets = () => {
    if (!profile) return;
    fetchMyTickets(profile.id).then(setTickets);
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
        setReportOpen(false);
      }, 1800);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Не вдалося надіслати.");
    } finally {
      setReportSubmitting(false);
    }
  };

  const openSupportForm = () => {
    setReportOpen(true);
    requestAnimationFrame(() => {
      document.getElementById("support-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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

  return (
    <div className="flex flex-col gap-10">
      {/* HEADER */}
      <div>
        <h1 className="text-3xl font-bold">Допомога</h1>
        <p className="text-black/50 mt-1.5 leading-relaxed">
          Ми поруч, якщо щось не працює, незрозуміло або просто виникло питання щодо роботи з
          платформою.
        </p>
      </div>

      {/* SEARCH */}
      <div className="max-w-2xl">
        <div className="text-[15px] font-medium mb-2.5">
          Що сталося? Ми допоможемо розібратися.
        </div>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/30"><Icon name="search" size={16} /></span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Наприклад: «коли будуть виплати»"
            className="w-full pl-11 pr-4 py-4 rounded-2xl border border-black/10 bg-white text-[14px] focus:outline-none focus:border-black/25 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
          />
        </div>

        {/* QUICK SCENARIOS */}
        {!q && (
          <div className="mt-4">
            <div className="text-[12px] text-black/40 mb-2">Швидко знайти відповідь</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_SCENARIOS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => jumpToFaq(s.categoryId, s.question)}
                  className="px-4 py-2 rounded-full bg-white border border-black/10 hover:border-black/20 hover:bg-black/[0.02] transition text-[13px] font-medium"
                >
                  {s.label} →
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-10 items-start">
        {/* FAQ */}
        <div className="flex flex-col gap-7">
          {filteredCategories.length === 0 && (
            <div className="text-black/40 text-[14px]">
              Нічого не знайдено — спробуйте інший запит або напишіть у підтримку.
            </div>
          )}
          {filteredCategories.map((cat) => (
            <div key={cat.id}>
              <h3 className="text-[16px] font-semibold mb-0.5">{cat.label}</h3>
              <p className="text-[13px] text-black/45 mb-3">{cat.description}</p>
              <div className="flex flex-col gap-2.5">
                {cat.items.map((item) => {
                  const key = item.key;
                  const isOpen = openKey === key;
                  return (
                    <div
                      key={key}
                      id={key}
                      className={`rounded-xl border transition overflow-hidden scroll-mt-6 ${
                        isOpen
                          ? "border-black/15 bg-white"
                          : "border-black/5 bg-white hover:bg-black/[0.02]"
                      }`}
                    >
                      <button
                        onClick={() => setOpenKey(isOpen ? null : key)}
                        className="w-full flex items-center justify-between px-5 py-4 text-left"
                      >
                        <span className="text-[14px] font-medium">{item.q}</span>
                        <span
                          className={`text-lg transition-transform ${isOpen ? "rotate-45" : ""}`}
                        >
                          +
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-5 pb-4 text-[14px] text-black/60 leading-relaxed">
                          {item.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* SIDEBAR */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          {/* GUIDE CARD */}
          <div className="rounded-2xl bg-gradient-to-br from-[#eef2ff] to-white border border-black/5 p-6">
            <h2 className="text-[16px] font-semibold mb-2 flex items-center gap-2"><Icon name="program" size={18} /> Як зробити хороший курс</h2>
            <p className="text-[14px] text-black/60 leading-relaxed mb-4">
              Короткий гайд про структуру модулів, тривалість уроків і те, як формулювати
              результати програми, щоб учасники доходили до кінця.
            </p>
            <button className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition">
              Відкрити гайд
            </button>
          </div>

          {/* SUPPORT */}
          <div className="rounded-2xl bg-white border border-black/5 p-6">
            <h2 className="text-[16px] font-semibold">Не знайшли того, що шукали?</h2>
            <p className="text-[13px] text-black/50 mt-1.5 mb-4 leading-relaxed">
              Розкажіть, що сталося — ми підкажемо, що робити далі.
            </p>
            <button
              onClick={openSupportForm}
              className="w-full px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-500 text-white text-[14px] font-medium hover:opacity-90 transition"
            >
              Написати в підтримку
            </button>
            <p className="text-[11px] text-black/35 mt-2.5">
              Зазвичай відповідаємо протягом 1 робочого дня.
            </p>
          </div>

          {/* PROBLEM REPORT FORM */}
          {reportOpen && (
            <div id="support-form" className="rounded-2xl bg-white border border-black/5 p-6 scroll-mt-6">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] font-semibold">Розкажіть, що сталося</h2>
                <button
                  onClick={() => setReportOpen(false)}
                  className="text-black/30 hover:text-black/60 transition text-lg leading-none"
                >
                  ×
                </button>
              </div>

              {reportSent ? (
                <div className="text-[13px] text-emerald-600">
                  Звернення надіслано — з'явиться нижче, у «Ваші звернення».
                </div>
              ) : (
                <>
                  <div className="text-[12px] text-black/40 mb-1.5">Що сталося?</div>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value as TicketCategory)}
                    className="w-full mb-3 px-3 py-2.5 rounded-xl border border-black/10 text-[13px] focus:outline-none focus:border-black/30"
                  >
                    {TICKET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {TICKET_CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="Опишіть, що сталося…"
                    rows={4}
                    className="w-full mb-3 px-3 py-2.5 rounded-xl border border-black/10 text-[13px] focus:outline-none focus:border-black/30 resize-none"
                  />
                  {reportError && (
                    <div className="text-[12px] text-red-600 mb-2">{reportError}</div>
                  )}
                  <button
                    onClick={submitProblemReport}
                    disabled={reportSubmitting || !reportDescription.trim()}
                    className="w-full px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[13px] font-medium hover:opacity-90 transition disabled:opacity-50"
                  >
                    {reportSubmitting ? "Надсилаємо…" : "Надіслати"}
                  </button>
                </>
              )}
            </div>
          )}

          {/* MY TICKETS */}
          {tickets && tickets.length > 0 && (
            <div className="rounded-2xl bg-white border border-black/5 p-6">
              <h2 className="text-[15px] font-semibold mb-3">Ваші звернення</h2>
              <div className="flex flex-col gap-3">
                {tickets.map((t) => (
                  <div key={t.id} className="text-[13px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{TICKET_CATEGORY_LABELS[t.category]}</span>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          t.status === "open"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {t.status === "open" ? "Очікує відповіді" : "Вирішено"}
                      </span>
                    </div>
                    <div className="text-black/40 text-[12px] mt-0.5">
                      {formatAbsoluteDate(t.createdAt)}
                    </div>
                    {t.adminResponse && (
                      <div className="mt-1.5 text-black/60 bg-black/[0.03] rounded-lg px-3 py-2">
                        {t.adminResponse}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* WARM NOTE */}
          <div className="rounded-2xl bg-gradient-to-br from-[#fff8ec] to-white border border-black/5 p-5">
            <p className="text-[13px] text-black/55 leading-relaxed">
              <span className="inline-flex align-[-2px] mr-1.5 text-amber-500"><Icon name="heart" size={14} /></span>Ми читаємо кожне звернення особисто — Sensoria завжди поруч, якщо щось піде не
              так.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
