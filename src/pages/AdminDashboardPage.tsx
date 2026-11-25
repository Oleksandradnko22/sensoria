import { Icon } from "../components/ui/Icon";
import AdminAnalytics from "../components/admin/AdminAnalytics";
import ChatBanControls from "../components/admin/ChatBanControls";
import { NO_CHAT_BAN } from "../utils/moderationView";
import { chatBanState } from "../utils/chatBan";
import ConfirmDialog from "../components/author/public/ConfirmDialog";
import AdminActionsLog from "../components/admin/AdminActionsLog";
import AdminAuthorApplications from "../components/admin/AdminAuthorApplications";
import AdminModeration from "../components/admin/AdminModeration";
import { useEffect, useState } from "react";
import { addWorkingDays, kyivDay } from "../utils/taxRegister";

/** The last day to carry out a refund: the next working day after the request (monobank rules, Б9). */
const refundDueDay = (createdAt: string) => addWorkingDays(kyivDay(createdAt), 1);
import type { Profile } from "../lib/auth";
import { getInitials } from "../lib/auth";
import Avatar from "../components/ui/Avatar";
import {
  fetchUsers,
  setUserBanned,
  liftChatBan,
  fetchRefundRequests,
  markRefundReviewed,
  fetchSupportTickets,
  resolveTicket,
  fetchReports,
  fetchVerificationRequests,
  reviewVerification,
  type VerificationRequest,
  markReportReviewed,
  runReportAction,
  type AdminUserRow,
  type RefundRequest,
  type SupportTicket,
  type AdminReport,
  fetchAdminMe,
  setEducationVerified,
  type AdminRole,
} from "../lib/admin";
import { TICKET_CATEGORY_LABELS, type TicketCategory } from "../lib/supportTickets";
import AdminUserDetail from "../components/admin/AdminUserDetail";
import type { ReportActKind } from "../utils/reportsView";
import AdminVerification from "../components/admin/AdminVerification";
import AdminReports from "../components/admin/AdminReports";
import AdminMaterials from "../components/admin/AdminMaterials";
import AdminFinance from "../components/admin/AdminFinance";
import AdminRestoreAccess from "../components/admin/AdminRestoreAccess";
import { formatAbsoluteDate } from "../utils/relativeTime";

import AdminCommunity from "../components/admin/AdminCommunity";
import AdminHome from "../components/admin/AdminHome";
import AuthorsGuide from "../components/admin/AuthorsGuide";
import SectionGuide, { GUIDES } from "../components/admin/SectionGuide";
type Props = {
  profile: Profile;
  onBackToSite?: () => void;
  onLogout: () => void;
};

type Tab = "home" | "stats" | "moderation" | "users" | "materials" | "announcements" | "finance" | "refunds" | "tickets" | "contentReports" | "verification" | "actions" | "authorApps";


// The owner's map of the panel (25.11.2026): a few sections in plain words, each with one line «що тут робити»; a
// section with several pages shows them as tabs inside. «Головна» says what needs attention today.
const SECTIONS: { id: string; label: string; icon: string; hint: string; tabs: [Tab, string][] }[] = [
  { id: "home", label: "Головна", icon: "home", hint: "З чого почати сьогодні.", tabs: [["home", "Головна"]] },
  { id: "authors", label: "Автори", icon: "idcard", hint: "Нові анкети й схвалення авторів, статус «Фахівець» за дипломом чи сертифікатом.", tabs: [["authorApps", "Анкети й схвалення"], ["verification", "Статус «Фахівець»"]] },
  { id: "materials", label: "Матеріали", icon: "library", hint: "Усі програми, гайди й медитації: знайти, переглянути, приховати.", tabs: [["materials", "Усі матеріали"]] },
  { id: "people", label: "Люди", icon: "community", hint: "Учасники й автори: знайти людину, відкрити акаунт, заблокувати. Порушення в чатах і спільноті.", tabs: [["users", "Усі люди"], ["moderation", "Порушення"]] },
  { id: "requests", label: "Звернення", icon: "mail", hint: "Листи в підтримку, скарги й запити на повернення коштів — на кожне треба відповісти.", tabs: [["tickets", "Листи в підтримку"], ["contentReports", "Скарги"], ["refunds", "Повернення коштів"]] },
  { id: "money", label: "Гроші", icon: "card", hint: "Скільки оплатили покупці, скільки тарифу отримала Sensoria, акти авторам.", tabs: [["finance", "Гроші"]] },
  { id: "community", label: "Спільнота", icon: "megaphone", hint: "Оголошення й публікації для всіх на платформі.", tabs: [["announcements", "Спільнота"]] },
  { id: "more", label: "Більше", icon: "settings", hint: "Статистика відвідувань і журнал усіх дій в адмінці.", tabs: [["stats", "Аналітика"], ["actions", "Журнал дій"]] },
];
const sectionOf = (t: Tab) => SECTIONS.find((x) => x.tabs.some(([k]) => k === t)) ?? SECTIONS[0];

type UserFilter = "all" | "author" | "participant" | "banned" | "chatBanned";

const CONTENT_KIND_LABEL: Record<RefundRequest["contentKind"], string> = {
  program: "Програма",
  guide: "Гайд",
  meditation: "Медитація",
};

// All-time complaint count at which an account gets flagged in the
// users table for manual review — not an auto-ban, just a spotlight;
// the existing "Заблокувати" button is still how an admin actually
// acts on it.
const REPORT_REVIEW_THRESHOLD = 5;

export default function AdminDashboardPage({ profile, onLogout }: Props) {
  const [tab, setTab] = useState<Tab>("home");

  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [usersTotal, setUsersTotal] = useState<number | null>(null);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [detailUser, setDetailUser] = useState<AdminUserRow | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  // Blocking an account is destructive — ask first. (Unblocking is instant.)
  const [banConfirm, setBanConfirm] = useState<AdminUserRow | null>(null);
  const [eduRevoke, setEduRevoke] = useState<AdminUserRow | null>(null);
  // granting «Фахівець» by hand (documents reviewed outside a request, e.g. sent by email); logged with the reason
  const [eduGrant, setEduGrant] = useState<AdminUserRow | null>(null);

  const [refunds, setRefunds] = useState<RefundRequest[] | null>(null);
  const [refundsError, setRefundsError] = useState<string | null>(null);
  const [busyRefundId, setBusyRefundId] = useState<string | null>(null);

  const [tickets, setTickets] = useState<SupportTicket[] | null>(null);
  const [ticketsError, setTicketsError] = useState<string | null>(null);
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);
  // Draft admin_response per ticket, keyed by id — kept local until
  // "Вирішено" is actually clicked, same UX as writing a reply before sending.
  const [ticketDrafts, setTicketDrafts] = useState<Record<string, string>>({});

  // "•••" → "Поскаржитися" on a meditation (2026-08-30, per Sasha's
  // explicit call — "и добавь это в админку"). Same open/reviewed
  // shape as refunds above, not merged into it — a different kind of
  // complaint (about the content itself, not a purchase).
  const [verifications, setVerifications] = useState<VerificationRequest[] | null>(null);
  const [verificationsError, setVerificationsError] = useState<string | null>(null);
  const [busyVerificationId, setBusyVerificationId] = useState<string | null>(null);
  const [contentReports, setContentReports] = useState<AdminReport[] | null>(null);
  const [contentReportsError, setContentReportsError] = useState<string | null>(null);
  const [busyContentReportId, setBusyContentReportId] = useState<string | null>(null);

  // Role and 2FA state of this admin (the server enforces both).
  const [me, setMe] = useState<{ role: AdminRole; mfaOk: boolean } | null>(null);
  useEffect(() => {
    fetchAdminMe().then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    fetchRefundRequests().then(setRefunds).catch((e) => setRefundsError(e.message));
    fetchSupportTickets().then(setTickets).catch((e) => setTicketsError(e.message));
    fetchReports().then(setContentReports).catch((e) => setContentReportsError(e.message));
    fetchVerificationRequests().then(setVerifications).catch((e) => setVerificationsError(e.message));
  }, []);

  // Server-side search (debounced) — the list is paged, so account #201 is
  // reachable by typing its name or email instead of scrolling.
  const loadUsers = (query: string) =>
    fetchUsers({ query })
      .then((r) => {
        setUsers(r.users);
        setUsersTotal(r.total);
        setUsersError(null);
      })
      .catch((e) => setUsersError(e.message));

  const reloadUsers = () => {
    void loadUsers(userSearch.trim());
  };

  useEffect(() => {
    const t = setTimeout(() => void loadUsers(userSearch.trim()), users ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userSearch]);

  const loadMoreUsers = async () => {
    if (!users) return;
    setUsersLoadingMore(true);
    try {
      const r = await fetchUsers({ query: userSearch.trim(), offset: users.length });
      setUsers([...users, ...r.users]);
      setUsersTotal(r.total);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Не вдалося завантажити.");
    } finally {
      setUsersLoadingMore(false);
    }
  };

  const reloadRefunds = () => {
    fetchRefundRequests().then(setRefunds).catch((e) => setRefundsError(e.message));
  };

  const reloadTickets = () => {
    fetchSupportTickets().then(setTickets).catch((e) => setTicketsError(e.message));
  };

  const resolveThisTicket = async (t: SupportTicket) => {
    setBusyTicketId(t.id);
    try {
      await resolveTicket(t.id, ticketDrafts[t.id]);
      reloadTickets();
    } catch (e) {
      setTicketsError(e instanceof Error ? e.message : "Не вдалося оновити.");
    } finally {
      setBusyTicketId(null);
    }
  };

  const openTicketsCount = (tickets ?? []).filter((t) => t.status === "open").length;

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectText, setRejectText] = useState("");
  const markReviewed = async (r: RefundRequest, rejectReason?: string) => {
    setBusyRefundId(r.id);
    try {
      await markRefundReviewed(r.id, rejectReason ? { reason: rejectReason } : undefined);
      setRejectingId(null);
      setRejectText("");
      reloadRefunds();
    } catch (e) {
      setRefundsError(e instanceof Error ? e.message : "Не вдалося оновити.");
    } finally {
      setBusyRefundId(null);
    }
  };

  const openRefundsCount = (refunds ?? []).filter((r) => r.status === "open").length;

  const reloadContentReports = () => {
    fetchReports().then(setContentReports).catch((e) => setContentReportsError(e.message));
  };

  const markContentReportDone = async (r: AdminReport) => {
    setBusyContentReportId(r.id);
    try {
      await markReportReviewed(r.source, r.id);
      reloadContentReports();
    } catch (e) {
      setContentReportsError(e instanceof Error ? e.message : "Не вдалося оновити.");
    } finally {
      setBusyContentReportId(null);
    }
  };

  const actOnReport = async (r: AdminReport, act: ReportActKind, reason?: string) => {
    setBusyContentReportId(r.id);
    try {
      await runReportAction(r.source, r.id, act, reason);
      setContentReportsError(null);
      reloadContentReports();
    } catch (e) {
      setContentReportsError(e instanceof Error ? e.message : "Не вдалося виконати дію.");
    } finally {
      setBusyContentReportId(null);
    }
  };

  const decideVerification = async (r: VerificationRequest, approve: boolean, reason?: string) => {
    setBusyVerificationId(r.id);
    try {
      await reviewVerification(r.id, approve, reason);
      setVerificationsError(null);
      fetchVerificationRequests().then(setVerifications).catch((e) => setVerificationsError(e.message));
      reloadUsers();
    } catch (e) {
      setVerificationsError(e instanceof Error ? e.message : "Не вдалося виконати дію.");
    } finally {
      setBusyVerificationId(null);
    }
  };
  const pendingVerificationsCount = (verifications ?? []).filter((v) => v.status === "pending" && v.kind === "education").length;

  const openContentReportsCount = (contentReports ?? []).filter((r) => r.status === "open").length;

  const toggleChatBanned = async (u: AdminUserRow) => {
    setBusyUserId(u.id);
    try {
      await liftChatBan(u.id);
      reloadUsers();
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Не вдалося оновити.");
    } finally {
      setBusyUserId(null);
    }
  };

  const toggleBanned = async (u: AdminUserRow, reason?: string) => {
    setBusyUserId(u.id);
    try {
      await setUserBanned(u.id, !u.isBanned, reason);
      reloadUsers();
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : "Не вдалося оновити.");
    } finally {
      setBusyUserId(null);
    }
  };

  const isChatBanned = (u: AdminUserRow) =>
    chatBanState(u.chatBan ? { permanent: u.chatBan.permanent, untilIso: u.chatBan.until } : null, Date.now()).active;
  const matchesUserFilter = (u: AdminUserRow, f: UserFilter) =>
    f === "all" ||
    (f === "author" && u.role === "author") ||
    (f === "participant" && u.role === "participant") ||
    (f === "banned" && u.isBanned) ||
    (f === "chatBanned" && isChatBanned(u));
  const userFilterCount = (f: UserFilter) => (users ?? []).filter((u) => matchesUserFilter(u, f)).length;
  const filteredUsers = (users ?? []).filter((u) => {
    if (!matchesUserFilter(u, userFilter)) return false;
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });
  const sec = sectionOf(tab);
  const queueCount = (k: Tab) =>
    k === "verification" ? pendingVerificationsCount : k === "tickets" ? openTicketsCount : k === "contentReports" ? openContentReportsCount : k === "refunds" ? openRefundsCount : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
      {/* TOP BAR */}
      <div className="border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-3 sm:py-5 flex items-center justify-between gap-2">
          {/* a closed space of its own: no way from here to the site or a cabinet (owner, 25.11.2026) */}
          <div className="flex items-center gap-2 min-h-[44px] text-white/85 min-w-0">
            <span className="font-semibold tracking-wide">SENSORIA</span>
            <span className="hidden min-[420px]:inline text-white/60 text-sm ml-1">Адмін-панель</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="flex items-center gap-3 pl-1 pr-1 sm:pr-3 py-1 rounded-full bg-white/10">
              <Avatar
                avatarUrl={profile.avatarUrl}
                initials={getInitials(profile.name)}
                className="w-8 h-8 text-[13px]"
              />
              <span className="hidden sm:inline text-sm font-medium">{profile.name}</span>
            </div>
            <button
              onClick={onLogout}
              className="min-h-[44px] px-2 text-sm text-white/70 hover:text-white transition"
            >
              Вийти
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-24">
        {me && !me.mfaOk && (
          <div role="alert" className="mb-4 rounded-2xl bg-amber-100 text-amber-900 px-5 py-4 text-[14px]">
            Для адмін-панелі потрібна двофакторна автентифікація. Увімкніть її в налаштуваннях свого кабінету, вийдіть і
            увійдіть знову з кодом — доти дані тут не завантажуватимуться.
          </div>
        )}
        <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-6">
        <nav aria-label="Розділи адмінки" className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:mb-0 lg:flex-col lg:overflow-visible lg:pb-0">
          {SECTIONS.map((x) => {
            const active = sec.id === x.id;
            const n = x.tabs.reduce((sum, [k]) => sum + queueCount(k), 0);
            return (
              <button key={x.id} type="button" onClick={() => setTab(x.tabs[0][0])} aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] shrink-0 items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-medium transition ${active ? "bg-white text-[#12172b] shadow-sm" : "text-white/85 hover:bg-white/10"}`}>
                <Icon name={x.icon as never} size={18} />
                <span className="flex-1 whitespace-nowrap">{x.label}</span>
                {n > 0 && <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[12px] font-semibold text-black">{n}</span>}
              </button>
            );
          })}
        </nav>
        <div className="rounded-3xl bg-[#f6f8ff] text-black min-h-[60vh] p-4 sm:p-8">
          {sec.id !== "home" && (
            <header className="mb-5">
              <h1 className="text-[24px] font-bold text-[#12172b]">{sec.label}</h1>
              <p className="mt-1 text-[15px] text-[#5a6080]">{sec.hint}</p>
            </header>
          )}
          {sec.id === "authors" && <AuthorsGuide />}
          {GUIDES[sec.id] && <SectionGuide id={sec.id} {...GUIDES[sec.id]} />}
          {tab === "home" && (
            <AdminHome
              name={profile.name}
              counts={{ tickets: openTicketsCount, verification: pendingVerificationsCount, reports: openContentReportsCount, refunds: openRefundsCount }}
              onGo={(t) => setTab(t)}
            />
          )}
          {tab === "stats" && (
            <AdminAnalytics
              onOpenUsers={() => setTab("users")}
              onOpenModeration={() => setTab("moderation")}
              attention={[
                { key: "tickets", label: "відкритих звернень", count: openTicketsCount, onOpen: () => setTab("tickets") },
                { key: "verification", label: "заявок на верифікацію", count: pendingVerificationsCount, onOpen: () => setTab("verification") },
                { key: "reports", label: "відкритих скарг", count: openContentReportsCount, onOpen: () => setTab("contentReports") },
                { key: "refunds", label: "запитів на повернення", count: openRefundsCount, onOpen: () => setTab("refunds") },
              ]}
            />
          )}

          {sec.tabs.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-6" role="tablist" aria-label={sec.label}>
              {sec.tabs.map(([k, label]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`min-h-[44px] px-4 rounded-xl text-[14px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${tab === k ? "bg-[#eef0fd] text-[#4338ca] border-[#4338ca]/35" : "bg-white border-black/10 hover:border-black/20"}`}>
                  {label}
                  {queueCount(k) > 0 && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-amber-400 text-black text-[11px] font-semibold">{queueCount(k)}</span>}
                </button>
              ))}
            </div>
          )}

          {tab === "actions" && <AdminActionsLog />}
          {tab === "authorApps" && <AdminAuthorApplications />}
          {tab === "announcements" && <AdminCommunity />}

          {tab === "moderation" && (
            <AdminModeration
              onOpenUser={(email) => {
                setUserSearch(email);
                setTab("users");
              }}
            />
          )}

          {tab === "users" && (
            <div>
              {me?.role === "owner" && <AdminRestoreAccess />}
              <p className="text-black/55 text-[14px] mb-4">Показано останні 200 акаунтів. Щоб знайти когось іншого — скористайтеся пошуком.</p>

              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Пошук за ім'ям або поштою..."
                className="w-full sm:w-[320px] mb-4 px-4 py-2.5 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30"
              />

              <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Фільтр користувачів">
                {(
                  [
                    { key: "all", label: "Усі" },
                    { key: "participant", label: "Учасники" },
                    { key: "author", label: "Автори" },
                    { key: "chatBanned", label: "Чат заблоковано" },
                    { key: "banned", label: "Акаунт заблоковано" },
                  ] as { key: UserFilter; label: string }[]
                ).map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setUserFilter(f.key)}
                    aria-pressed={userFilter === f.key}
                    className={`min-h-[44px] px-4 rounded-xl text-[14px] font-medium border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] ${
                      userFilter === f.key ? "bg-[#eef0fd] text-[#4338ca] border-[#4338ca]/35" : "bg-white border-black/10 hover:border-black/20"
                    }`}
                  >
                    {f.label}
                    {users && <span className="ml-1.5 opacity-70 tabular-nums">{userFilterCount(f.key)}</span>}
                  </button>
                ))}
              </div>

              {usersError && <div className="text-red-500 text-[14px] mb-3">{usersError}</div>}
              {!users && !usersError && (
                <div className="text-black/40 text-[14px]">Завантаження…</div>
              )}

              {users && (
                <div>
                  <table className="block w-full text-[14px]">
                    <thead className="hidden">
                      <tr className="text-left text-black/40 border-b border-black/5">
                        <th className="px-4 py-3 font-medium">Ім'я</th>
                        <th className="px-4 py-3 font-medium">Роль</th>
                        <th className="px-4 py-3 font-medium">Статус</th>
                        <th className="px-4 py-3 font-medium">Дії</th>
                      </tr>
                    </thead>
                    <tbody className="grid gap-3">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1.5fr)] md:items-start">
                          <td className="block min-w-0">
                            <div className="font-semibold text-[15px] break-words">
                              {u.name} {u.isAdmin && <span className="text-black/30">· адмін</span>}
                            </div>
                            <div className="text-black/55 text-[13px] break-all">{u.email}</div>
                            <div className="text-black/40 text-[12px]">Реєстрація: {formatAbsoluteDate(u.createdAt)}</div>
                          </td>
                          <td className="block min-w-0 text-black/60">
                            {u.role === "author" ? "Автор" : "Учасник"}
                          </td>
                          <td className="block min-w-0">
                            <div className="flex flex-col gap-1">
                              {u.isBanned && (
                                <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[12px] font-medium w-fit">
                                  Заблоковано
                                </span>
                              )}
                              {u.role === "author" && (
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[12px] font-medium w-fit ${
                                    u.educationVerified ? "bg-indigo-50 text-indigo-700" : "bg-black/5 text-black/50"
                                  }`}
                                >
                                  {u.educationVerified ? "Фахівець" : "Автор"}
                                </span>
                              )}
                              {u.reportCount >= REPORT_REVIEW_THRESHOLD && (
                                <span
                                  className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[12px] font-medium w-fit"
                                  title="Накопичено багато скарг — варто розглянути питання блокування"
                                >
                                  <Icon name="warning" size={12} className="inline-block align-[-1px] mr-1" />{u.reportCount} скарг — на розгляд
                                </span>
                              )}
                              {!u.isAdmin && (
                                <ChatBanControls
                                  ban={u.chatBan ?? NO_CHAT_BAN}
                                  busy={busyUserId === u.id}
                                  onLift={() => toggleChatBanned(u)}
                                />
                              )}
                            </div>
                          </td>
                          <td className="block min-w-0">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => setDetailUser(u)}
                                className="min-h-[44px] px-3 rounded-lg text-[14px] font-medium border border-black/10 hover:bg-black/5 transition"
                              >
                                Деталі
                              </button>
                              {u.role === "author" && u.educationVerified && me?.role === "owner" && (
                                <button
                                  onClick={() => setEduRevoke(u)}
                                  disabled={busyUserId === u.id}
                                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-black/5 hover:bg-black/10 transition disabled:opacity-50"
                                >
                                  Зняти статус «Фахівець»
                                </button>
                              )}
                              {u.role === "author" && !u.educationVerified && me?.role === "owner" && (
                                <button
                                  onClick={() => setEduGrant(u)}
                                  disabled={busyUserId === u.id}
                                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium bg-black/5 hover:bg-black/10 transition disabled:opacity-50"
                                >
                                  Надати статус «Фахівець»
                                </button>
                              )}
                              {!u.isAdmin &&
                                (u.isBanned ||
                                  // Chat already blocked → the account block isn't offered here
                                  // (it stays available on the Модерація card for 10+ BLOCKs).
                                  !chatBanState(
                                    u.chatBan ? { permanent: u.chatBan.permanent, untilIso: u.chatBan.until } : null,
                                    Date.now()
                                  ).active) && (
                                <button
                                  onClick={() => (u.isBanned ? toggleBanned(u) : setBanConfirm(u))}
                                  disabled={busyUserId === u.id}
                                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition disabled:opacity-50 ${
                                    u.isBanned
                                      ? "bg-black/5 hover:bg-black/10"
                                      : "bg-red-50 text-red-600 hover:bg-red-100"
                                  }`}
                                >
                                  {u.isBanned ? "Розблокувати акаунт" : "Заблокувати акаунт"}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <p className="px-5 py-8 text-center text-[14px] text-black/60">За вибраними умовами нічого не знайдено.</p>
                  )}
                </div>
              )}
              {users && (
                <div className="mt-4 flex flex-wrap items-center gap-3 text-[14px] text-black/70">
                  <span>
                    Завантажено {users.length}
                    {usersTotal != null ? ` із ${usersTotal}` : ""}
                  </span>
                  {usersTotal != null && users.length < usersTotal && (
                    <button
                      onClick={loadMoreUsers}
                      disabled={usersLoadingMore}
                      className="min-h-[44px] px-4 rounded-xl bg-white border border-black/10 font-medium hover:bg-black/5 transition disabled:opacity-50"
                    >
                      {usersLoadingMore ? "Завантаження…" : "Показати ще"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "refunds" && (
            <div>
              <h1 className="text-2xl font-bold mb-1">Запити на повернення коштів</h1>
              <p className="text-black/50 text-[13px] mb-6">
                Покупець може попросити повернення протягом 14 днів після покупки. Схваліть або відхиліть запит; саме повернення після схвалення проводиться в розділі «Гроші».
              </p>

              {refundsError && <div className="text-red-500 text-[14px] mb-3">{refundsError}</div>}
              {!refunds && !refundsError && (
                <div className="text-black/40 text-[14px]">Завантаження…</div>
              )}
              {refunds && refunds.length === 0 && (
                <div className="text-black/40 text-[14px]">Поки що порожньо.</div>
              )}

              {refunds && refunds.length > 0 && (
                <div className="flex flex-col gap-3">
                  {refunds.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-medium text-[14px]">
                            {r.fullName} · {r.email} · {r.phone}
                          </div>
                          <div className="text-[12px] text-black/40 mt-0.5">
                            {r.contentTitle} · {CONTENT_KIND_LABEL[r.contentKind]} ·{" "}
                            {r.amount > 0 ? `${r.amount.toLocaleString("uk-UA")} ₴` : "Безкоштовно"}{" "}
                            · куплено {formatAbsoluteDate(r.purchasedAt)}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                            r.status === "open"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-black/5 text-black/50"
                          }`}
                        >
                          {r.status === "open" ? "На розгляді" : "Розглянуто"}
                        </span>
                      </div>

                      <p className="text-[13px] text-black/70 leading-relaxed">{r.reason}</p>

                      <div className="flex items-center justify-between">
                        <div className="text-[11px] text-black/35">
                          Запит подано {formatAbsoluteDate(r.createdAt)}
                          {r.status === "open" && (() => {
                            // monobank: the refund must go through not later than the next working day after the request (Б9)
                            const due = refundDueDay(r.createdAt);
                            const today = kyivDay(new Date().toISOString());
                            return (
                              <span className={`ml-2 font-semibold ${today > due ? "text-rose-700" : today === due ? "text-amber-700" : "text-black/50"}`}>
                                {today > due ? `· строк минув ${formatAbsoluteDate(due)}` : `· повернути до кінця ${formatAbsoluteDate(due)}`}
                              </span>
                            );
                          })()}
                        </div>
                        {r.status === "open" && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setRejectingId(rejectingId === r.id ? null : r.id)}
                              disabled={busyRefundId === r.id}
                              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 transition disabled:opacity-50"
                            >
                              Відхилити…
                            </button>
                            <button
                              onClick={() => markReviewed(r)}
                              disabled={busyRefundId === r.id}
                              title="Повернення схвалено: проведіть його у «Фінансах», покупець отримає лист автоматично"
                              className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-black/5 hover:bg-black/10 transition disabled:opacity-50"
                            >
                              Розглянуто
                            </button>
                          </div>
                        )}
                      </div>
                      {rejectingId === r.id && (
                        <div className="mt-2 flex flex-col gap-2">
                          <textarea
                            value={rejectText}
                            onChange={(e) => setRejectText(e.target.value.slice(0, 600))}
                            rows={2}
                            placeholder="Причина відмови — її отримає покупець у листі"
                            className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px]"
                          />
                          <button
                            onClick={() => markReviewed(r, rejectText.trim())}
                            disabled={busyRefundId === r.id || rejectText.trim().length < 5}
                            className="self-end px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-rose-600 text-white disabled:opacity-40"
                          >
                            Відхилити й надіслати лист
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "tickets" && (
            <div>

              {ticketsError && <div className="text-red-500 text-[14px] mb-3">{ticketsError}</div>}
              {!tickets && !ticketsError && (
                <div className="text-black/40 text-[14px]">Завантаження…</div>
              )}
              {tickets && tickets.length === 0 && (
                <div className="rounded-2xl bg-white p-6 text-[15px] text-black/55 ring-1 ring-black/5">Листів поки немає. Коли хтось напише — лист з'явиться тут, а вам прийде сповіщення на пошту.</div>
              )}

              {tickets && tickets.length > 0 && (
                <div className="flex flex-col gap-3">
                  {[...tickets].sort((a, b) => (a.status === "open" ? 0 : 1) - (b.status === "open" ? 0 : 1)).map((t, i, list) => (
                    <div key={t.id} className="contents">
                    {(i === 0 || list[i - 1].status !== t.status) && (
                      <h2 className="mt-2 text-[16px] font-semibold text-[#12172b]">
                        {t.status === "open" ? `Чекають відповіді (${list.filter((x) => x.status === "open").length})` : "Відповідані"}
                      </h2>
                    )}
                    <div
                      key={t.id}
                      className="rounded-2xl bg-white border border-black/5 p-5 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-semibold text-[15px] break-words">
                            {t.userName} · {t.userEmail}
                            {t.userRole && (
                              <span className="text-black/30">
                                {" "}
                                · {t.userRole === "author" ? "автор" : "учасник"}
                              </span>
                            )}
                          </div>
                          <div className="text-[12px] text-black/40 mt-0.5">
                            {TICKET_CATEGORY_LABELS[t.category as TicketCategory] ?? t.category}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                            t.status === "open"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-black/5 text-black/50"
                          }`}
                        >
                          {t.status === "open" ? "Очікує відповіді" : "Вирішено"}
                        </span>
                      </div>

                      <p className="text-[15px] text-black/80 leading-relaxed whitespace-pre-wrap break-words">{t.description}</p>

                      {t.status === "resolved" && t.adminResponse && (
                        <div className="rounded-xl bg-black/[0.03] px-4 py-3 text-[13px] text-black/60">
                          <span className="text-black/40">Відповідь: </span>
                          {t.adminResponse}
                        </div>
                      )}

                      {t.status === "open" && (
                        <textarea
                          value={ticketDrafts[t.id] ?? ""}
                          onChange={(e) =>
                            setTicketDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                          }
                          placeholder="Ваша відповідь — людина побачить її у своєму кабінеті, розділ «Ваші звернення»"
                          rows={3}
                          className="w-full px-4 py-3 rounded-xl border border-black/10 text-[15px] focus:outline-none focus:border-[#6d5cf0] resize-y"
                        />
                      )}

                      <div className="flex items-center justify-between">
                        <div className="text-[13px] text-black/45">
                          Подано {formatAbsoluteDate(t.createdAt)}
                          {t.resolvedAt && ` · вирішено ${formatAbsoluteDate(t.resolvedAt)}`}
                        </div>
                        {t.status === "open" && (
                          <button
                            onClick={() => resolveThisTicket(t)}
                            disabled={busyTicketId === t.id}
                            className="min-h-[44px] px-5 rounded-xl text-[14px] font-semibold text-white bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] transition disabled:opacity-50"
                          >
                            {(ticketDrafts[t.id] ?? "").trim() ? "Надіслати відповідь і закрити" : "Закрити без відповіді"}
                          </button>
                        )}
                      </div>
                    </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "verification" && (
            <AdminVerification
              requests={verifications}
              error={verificationsError}
              busyId={busyVerificationId}
              onDecide={decideVerification}
              onOpenUser={(email) => {
                setUserSearch(email);
                setTab("users");
              }}
            />
          )}

          {tab === "materials" && <AdminMaterials role={me?.role ?? "support"} />}
          {tab === "finance" && <AdminFinance />}

          {tab === "contentReports" && (
            <AdminReports
              reports={contentReports}
              error={contentReportsError}
              busyId={busyContentReportId}
              onReviewed={markContentReportDone}
              onAct={actOnReport}
              onOpenUser={(email) => {
                setUserSearch(email);
                setTab("users");
              }}
            />
          )}
        </div>
        </div>
      </div>
      {detailUser && (
        <AdminUserDetail
          user={detailUser}
          onClose={() => setDetailUser(null)}
        />
      )}
      {eduGrant && (
        <ConfirmDialog
          title="Надати статус «Фахівець»?"
          text={`${eduGrant.name} зможе публікувати матеріали на теми підвищеного ризику. Надавайте статус лише після перегляду документів про освіту; у причині вкажіть, які документи переглянуто.`}
          confirmLabel="Надати статус"
          askReason
          busy={busyUserId === eduGrant.id}
          onConfirm={async (reason) => {
            const u = eduGrant;
            setBusyUserId(u.id);
            try {
              await setEducationVerified(u.id, true, reason);
              reloadUsers();
            } catch (e) {
              setUsersError(e instanceof Error ? e.message : "Не вдалося оновити.");
            } finally {
              setBusyUserId(null);
              setEduGrant(null);
            }
          }}
          onCancel={() => busyUserId === null && setEduGrant(null)}
        />
      )}
      {eduRevoke && (
        <ConfirmDialog
          title="Зняти статус «Фахівець»?"
          text={`${eduRevoke.name} знову стане «Автором»: нові матеріали на теми підвищеного ризику публікувати буде не можна. Вже опубліковане не зникає.`}
          confirmLabel="Зняти статус"
          askReason
          busy={busyUserId === eduRevoke.id}
          onConfirm={async (reason) => {
            const u = eduRevoke;
            setBusyUserId(u.id);
            try {
              await setEducationVerified(u.id, false, reason);
              reloadUsers();
            } catch (e) {
              setUsersError(e instanceof Error ? e.message : "Не вдалося оновити.");
            } finally {
              setBusyUserId(null);
              setEduRevoke(null);
            }
          }}
          onCancel={() => busyUserId === null && setEduRevoke(null)}
        />
      )}
      {banConfirm && (
        <ConfirmDialog
          title="Заблокувати акаунт?"
          text={`${banConfirm.name} більше не зможе користуватись платформою (вхід буде закрито). Розблокувати можна тут же.`}
          confirmLabel="Заблокувати акаунт"
          askReason
          busy={busyUserId === banConfirm.id}
          onConfirm={async (reason) => {
            const u = banConfirm;
            await toggleBanned(u, reason);
            setBanConfirm(null);
          }}
          onCancel={() => busyUserId === null && setBanConfirm(null)}
        />
      )}
    </div>
  );
}
