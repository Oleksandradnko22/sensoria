// «Допомога»: search + quick answers + FAQ by category + a way to write to
// support. FAQ content comes from data/participantDashboard.ts (unchanged);
// tickets are real (lib/supportTickets.ts) and a success message is shown only
// after the insert was accepted.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { participantFaqCategories } from "../../data/participantDashboard";
import { useSession } from "../../context/SessionContext";
import {
  submitTicket,
  fetchMyTickets,
  TICKET_CATEGORY_LABELS,
  type TicketCategory,
  type MyTicket,
} from "../../lib/supportTickets";
import { formatAbsoluteDate } from "../../utils/relativeTime";
import { pluralUk } from "../../utils/plural";
import { searchFaq } from "../../utils/helpSearch";
import { friendlyAuthError } from "../../utils/authErrors";
import HelpIllustration from "./HelpIllustration";

const TICKET_CATEGORIES = Object.keys(TICKET_CATEGORY_LABELS) as TicketCategory[];
const TICKET_MAX = 2000;

const CATEGORY_ICON: Record<string, IconName> = {
  billing: "card",
  learning: "graduation",
  authors: "comment",
  reviews: "star",
  account: "shield",
};

// The most common reasons to open this page, each pointing at one FAQ answer.
// Matched by question text (not an index), so reordering the data does not
// silently break a shortcut.
const QUICK_SCENARIOS: { label: string; icon: IconName; categoryId: string; question: string }[] = [
  { label: "Не бачу придбаний курс", icon: "library", categoryId: "billing", question: "Де знайти придбаний контент?" },
  { label: "Хочу повернути кошти", icon: "refresh", categoryId: "billing", question: "Чи можу я отримати повернення коштів?" },
  { label: "Не можу увійти", icon: "idcard", categoryId: "account", question: "Не можу увійти в акаунт — що робити?" },
  { label: "Хочу написати автору", icon: "mail", categoryId: "authors", question: "Як написати автору?" },
];

const field =
  "w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-black/15 bg-white text-[16px] sm:text-[14px] focus:outline-none focus:border-[#4338ca]/60 focus-visible:ring-2 focus-visible:ring-[#4338ca]/20";

export default function ParticipantHelp() {
  const session = useSession();
  const profile = session?.profile;

  const [query, setQuery] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set([participantFaqCategories[0]?.id]));
  const [openKey, setOpenKey] = useState<string | null>(null);

  // ── SUPPORT FORM ─────────────────────────────────────────────────
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<TicketCategory>("content");
  const [reportDescription, setReportDescription] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);
  const closeTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  // ── MY TICKETS ───────────────────────────────────────────────────
  const [tickets, setTickets] = useState<MyTicket[]>([]);
  const [ticketsState, setTicketsState] = useState<"loading" | "ready" | "error">("loading");
  const loadTickets = () => {
    if (!profile) return;
    fetchMyTickets(profile.id, { strict: true })
      .then((t) => {
        setTickets(t);
        setTicketsState("ready");
      })
      .catch(() => setTicketsState("error"));
  };
  useEffect(loadTickets, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submitProblemReport = async () => {
    if (!profile || reportSubmitting || !reportDescription.trim()) return;
    setReportSubmitting(true);
    setReportError(null);
    try {
      await submitTicket({ userId: profile.id, category: reportCategory, description: reportDescription.trim() });
      setReportSent(true);
      setReportDescription("");
      loadTickets();
      closeTimer.current = window.setTimeout(() => {
        setReportSent(false);
        setReportOpen(false);
      }, 2200);
    } catch (e) {
      setReportError(friendlyAuthError(e, "Не вдалося надіслати звернення. Спробуйте ще раз."));
    } finally {
      setReportSubmitting(false);
    }
  };

  const openSupportForm = () => {
    setReportOpen(true);
    setReportSent(false);
    requestAnimationFrame(() => {
      const el = document.getElementById("support-form");
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      el?.querySelector<HTMLElement>("select")?.focus({ preventScroll: true });
    });
  };

  // ── FAQ ──────────────────────────────────────────────────────────
  // Stable key = category id + original position, assigned before filtering.
  const withKeys = useMemo(
    () => participantFaqCategories.map((c) => ({ ...c, items: c.items.map((it, i) => ({ ...it, key: `${c.id}-${i}` })) })),
    []
  );
  const searching = query.trim().length > 0;
  const found = useMemo(() => searchFaq(withKeys, query), [withKeys, query]);

  const toggleCat = (id: string) =>
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const jumpToFaq = (categoryId: string, question: string) => {
    const cat = withKeys.find((c) => c.id === categoryId);
    const item = cat?.items.find((i) => i.q === question);
    if (!cat || !item) return;
    setQuery("");
    setOpenCats((prev) => new Set(prev).add(categoryId));
    setOpenKey(item.key);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById(item.key)?.scrollIntoView({ behavior: "smooth", block: "center" }))
    );
  };

  const visible = found.categories;
  const catOpen = (id: string) => searching || openCats.has(id);

  return (
    <div className="flex flex-col gap-6">
      {/* INTRO + SEARCH + QUICK ACTIONS */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#eef0fd] via-white to-[#f4eefe] border border-black/[0.05] p-5 sm:p-7">
        <HelpIllustration className="hidden sm:block absolute right-4 top-3 w-[240px] lg:w-[300px] opacity-95 pointer-events-none" />
        <div className="relative max-w-[640px]">
          <h1 className="text-3xl font-bold">Допомога</h1>
          <p className="text-black/65 mt-1.5 leading-relaxed sm:max-w-[420px] lg:max-w-none">
            Ми поруч, якщо щось не працює, незрозуміло або просто виникло питання.
          </p>

          <div role="search" className="relative mt-5 sm:mr-0">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-black/50 pointer-events-none">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Пошук відповіді"
              placeholder="Наприклад: «я оплатив(-ла) курс, але не бачу його»"
              className="w-full min-h-[52px] pl-11 pr-11 rounded-2xl border border-black/[0.12] bg-white text-[16px] sm:text-[14px] focus:outline-none focus:border-[#4338ca]/60 focus-visible:ring-2 focus-visible:ring-[#4338ca]/20 shadow-[0_1px_2px_rgba(0,0,0,0.03)] [&::-webkit-search-cancel-button]:hidden"
            />
            {searching && (
              <button
                onClick={() => setQuery("")}
                aria-label="Очистити пошук"
                className="absolute right-0 top-0 w-[52px] h-[52px] flex items-center justify-center text-black/60 hover:text-black text-xl"
              >
                ×
              </button>
            )}
          </div>
          <div aria-live="polite" className="text-[14px] text-black/60 mt-2 min-h-[20px]">
            {searching ? (found.total ? `Знайдено: ${found.total}` : "") : ""}
          </div>

          {!searching && (
            <div className="mt-2">
              <div className="text-[12px] font-medium text-black/60 mb-2">Швидко знайти відповідь</div>
              <div className="flex flex-wrap gap-2">
                {QUICK_SCENARIOS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => jumpToFaq(s.categoryId, s.question)}
                    className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full bg-white border border-black/[0.12] hover:border-[#4338ca]/40 hover:bg-[#f6f7ff] transition-colors text-[14px] font-medium text-black/85"
                  >
                    <span className="text-[#4338ca]"><Icon name={s.icon} size={16} /></span>
                    {s.label}
                    <span aria-hidden="true" className="text-black/65">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* FAQ */}
        <div className="flex flex-col gap-3">
          {searching && found.total === 0 && (
            <div className="rounded-2xl bg-white border border-black/[0.06] px-6 py-8 text-center">
              <div className="text-[16px] font-medium">Нічого не знайдено</div>
              <p className="text-[14px] text-black/60 mt-1">Спробуйте інші слова або напишіть у підтримку.</p>
              <button onClick={openSupportForm} className="mt-3 min-h-[44px] px-5 rounded-xl border border-black/[0.12] text-[14px] font-medium hover:bg-black/[0.04]">
                Написати в підтримку
              </button>
            </div>
          )}

          {visible.map((cat) => {
            const open = catOpen(cat.id);
            const panelId = `faq-panel-${cat.id}`;
            return (
              <section key={cat.id} className="rounded-2xl bg-white border border-black/[0.06] overflow-hidden">
                <h2>
                  <button
                    onClick={() => !searching && toggleCat(cat.id)}
                    aria-expanded={open}
                    aria-controls={panelId}
                    className="w-full flex items-center gap-4 p-4 sm:p-5 text-left hover:bg-black/[0.015] focus-visible:outline-2 focus-visible:outline-[#4338ca] focus-visible:-outline-offset-2"
                  >
                    <span aria-hidden="true" className="shrink-0 w-11 h-11 rounded-xl bg-[#eef0fd] text-[#4338ca] flex items-center justify-center">
                      <Icon name={CATEGORY_ICON[cat.id] ?? "help"} size={20} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold text-black/90">{cat.label}</span>
                      <span className="block text-[14px] text-black/60">{cat.description}</span>
                    </span>
                    <span className="hidden sm:block shrink-0 text-[12px] text-black/60">
                      {cat.items.length} {pluralUk(cat.items.length, "питання", "питання", "питань")}
                    </span>
                    {!searching && (
                      <span aria-hidden="true" className={`shrink-0 text-black/50 transition-transform ${open ? "rotate-180" : ""}`}>
                        <Icon name="chevron" size={18} />
                      </span>
                    )}
                  </button>
                </h2>
                {open && (
                  <ul id={panelId} className="border-t border-black/[0.06] divide-y divide-black/[0.06]">
                    {cat.items.map((item) => {
                      const isOpen = openKey === item.key || (searching && found.total === 1);
                      return (
                        <li key={item.key} id={item.key} className={`scroll-mt-24 ${isOpen ? "bg-[#fafaff]" : ""}`}>
                          <h3>
                            <button
                              onClick={() => setOpenKey(openKey === item.key ? null : item.key)}
                              aria-expanded={isOpen}
                              aria-controls={`${item.key}-answer`}
                              className="w-full flex items-center justify-between gap-4 min-h-[52px] px-4 sm:px-5 py-3 text-left hover:bg-black/[0.02] focus-visible:outline-2 focus-visible:outline-[#4338ca] focus-visible:-outline-offset-2"
                            >
                              <span className={`text-[14px] ${isOpen ? "font-semibold text-black/90" : "font-medium text-black/85"}`}>{item.q}</span>
                              <span aria-hidden="true" className={`shrink-0 text-xl leading-none text-black/60 transition-transform ${isOpen ? "rotate-45" : ""}`}>+</span>
                            </button>
                          </h3>
                          {isOpen && (
                            <div id={`${item.key}-answer`} className="px-4 sm:px-5 pb-4 text-[14px] text-black/70 leading-relaxed">
                              {item.a}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
        </div>

        {/* SIDE: support, form, tickets, reassurance */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section className="rounded-2xl bg-gradient-to-br from-[#eef0fd] to-[#f6f0ff] border border-[#4338ca]/10 p-5 sm:p-6">
            <span aria-hidden="true" className="w-11 h-11 rounded-full bg-white text-[#4338ca] flex items-center justify-center shadow-sm">
              <Icon name="lifebuoy" size={22} />
            </span>
            <h2 className="text-[20px] font-semibold mt-3">Не знайшли того, що шукали?</h2>
            <p className="text-[14px] text-black/65 mt-1 leading-relaxed">Розкажіть, що сталося — ми підкажемо, що робити далі.</p>
            <button
              onClick={openSupportForm}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 min-h-[48px] rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white text-[14px] font-medium hover:opacity-90 transition"
            >
              <Icon name="mail" size={18} />
              Написати в підтримку
            </button>
            <p className="text-[12px] text-black/60 mt-2.5">Зазвичай відповідаємо протягом 1 робочого дня.</p>
          </section>

          {reportOpen && (
            <section id="support-form" aria-labelledby="support-form-title" className="rounded-2xl bg-white border border-black/[0.06] p-5 sm:p-6 scroll-mt-4">
              <div className="flex items-center justify-between">
                <h2 id="support-form-title" className="text-[16px] font-semibold">Розкажіть, що сталося</h2>
                <button
                  onClick={() => !reportSubmitting && setReportOpen(false)}
                  aria-label="Закрити форму"
                  className="-mr-2 w-11 h-11 rounded-full hover:bg-black/5 text-black/60 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {reportSent ? (
                <div role="status" className="mt-2 rounded-xl bg-emerald-50 text-emerald-800 text-[14px] px-4 py-3">
                  Звернення надіслано — воно з'явиться нижче, у «Ваші звернення».
                </div>
              ) : (
                <form
                  className="mt-3 flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitProblemReport();
                  }}
                >
                  <div>
                    <label htmlFor="ticket-category" className="block text-[14px] font-medium text-black/70 mb-1.5">Тема</label>
                    <select id="ticket-category" value={reportCategory} onChange={(e) => setReportCategory(e.target.value as TicketCategory)} className={field}>
                      {TICKET_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {TICKET_CATEGORY_LABELS[c]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ticket-text" className="block text-[14px] font-medium text-black/70 mb-1.5">
                      Опис <span className="text-rose-700" aria-hidden="true">*</span>
                      <span className="sr-only">(обов'язково)</span>
                    </label>
                    <textarea
                      id="ticket-text"
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value)}
                      placeholder="Опишіть, що сталося…"
                      rows={4}
                      maxLength={TICKET_MAX}
                      required
                      className={`${field} resize-none`}
                    />
                    <div className="text-[12px] text-black/60 text-right mt-1">{reportDescription.length}/{TICKET_MAX}</div>
                  </div>
                  {reportError && <div role="alert" className="text-[14px] text-red-700">{reportError}</div>}
                  <button
                    type="submit"
                    disabled={reportSubmitting || !reportDescription.trim()}
                    className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {reportSubmitting ? "Надсилаємо…" : "Надіслати"}
                  </button>
                </form>
              )}
            </section>
          )}

          {(ticketsState === "error" || tickets.length > 0) && (
            <section className="rounded-2xl bg-white border border-black/[0.06] p-5 sm:p-6" aria-labelledby="tickets-title">
              <h2 id="tickets-title" className="text-[16px] font-semibold mb-3">Ваші звернення</h2>
              {ticketsState === "error" ? (
                <div role="alert" className="text-[14px] text-red-700">
                  Не вдалося завантажити звернення.{" "}
                  <button onClick={loadTickets} className="underline font-medium">Спробувати ще раз</button>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {tickets.map((t) => (
                    <li key={t.id} className="text-[14px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{TICKET_CATEGORY_LABELS[t.category]}</span>
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[12px] font-medium ${t.status === "open" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>
                          {t.status === "open" ? "Очікує відповіді" : "Вирішено"}
                        </span>
                      </div>
                      <div className="text-black/60 text-[12px] mt-0.5">{formatAbsoluteDate(t.createdAt)}</div>
                      {t.adminResponse && <div className="mt-1.5 text-black/70 bg-black/[0.03] rounded-lg px-3 py-2 break-words">{t.adminResponse}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <div className="flex items-start gap-3 rounded-2xl bg-gradient-to-br from-[#fff7ea] to-[#fffdf8] border border-amber-200/50 p-4 sm:p-5">
            <span aria-hidden="true" className="shrink-0 text-amber-600 mt-0.5"><Icon name="bulb" size={20} /></span>
            <p className="text-[14px] text-black/70 leading-relaxed">
              Ми читаємо кожне звернення особисто — Sensoria завжди поруч, якщо щось піде не так.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
