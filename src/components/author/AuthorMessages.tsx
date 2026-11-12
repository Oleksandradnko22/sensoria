// «Повідомлення» in the author cabinet: conversations with participants, kept inside Sensoria. Everything the old
// version did stays (server-side moderation of contacts/links/profanity, chat ban, deleting a message or a
// conversation, opening a conversation from «Учасники», the unread badge), plus: search, «Непрочитані», real photos,
// fresh messages every 30 seconds while the tab is open, visible loading errors. Demo conversations come from the
// shared demo world (the same people as in «Учасники» / «Фінанси»), only in demo mode.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { messages as messagesData, type AuthoredContent } from "../../data/authorDashboard";
import { guides } from "../../data/guides";
import { meditations } from "../../data/meditations";
import ChatBanNotice from "../ChatBanNotice";
import { chatBanState } from "../../utils/chatBan";
import { useMyChatBan } from "../../lib/chatBan";
import { moderateMessage, recordViolation, PROFANITY_BLOCK_MESSAGE } from "../../utils/contactFilter";
import { useSession } from "../../context/SessionContext";
import { fetchConversationsPage, fetchThreadPage, fetchMyBroadcasts, sendBroadcast, sendMessage as sendRealMessage, markThreadRead, deleteMessage, deleteConversation, type Broadcast, type ConversationFilter, type RealConversation, type ThreadMessage } from "../../lib/messages";
import { pluralUk } from "../../utils/plural";
import CatalogSort from "../catalog/CatalogSort";
import { formatRelativeTime } from "../../utils/relativeTime";
import { isUuid, needsDaySeparator, formatClock, formatDayLabel, canSend, shouldSendOnEnter, MAX_MESSAGE_LENGTH } from "../../utils/messagesView";
import { SHOW_AUTHOR_DEMO } from "../../utils/demoMode";
import { demoWorld } from "../../data/demoWorld";
import { Icon } from "../ui/Icon";
import ConfirmDialog from "./public/ConfirmDialog";

type Notice = { type: "warn" | "block"; message: string };

const CONTACT_BLOCK_MESSAGE = "Це повідомлення містить контактні дані або посилання для спілкування поза Sensoria. Щоб захистити вас і зберегти спілкування в межах платформи, ми не можемо його надіслати.";
const CONTACT_WARN_MESSAGE = "Це повідомлення виглядає неоднозначно — переконайтесь, що воно не веде до спілкування чи оплати поза Sensoria.";
const CHAT_BANNED_MESSAGE = "Не вдалося надіслати: чат для вашого акаунта заблоковано через повторні порушення правил. Деталі — у повідомленні про блокування чату.";
const REPEATED_VIOLATION_MESSAGE = "Це вже кілька спроб надіслати заборонену інформацію в цьому діалозі. Спілкування має стосуватись лише курсу, медитації чи гайду.";

type ConversationItem = {
  id: string;
  from: string;
  avatarUrl: string | null;
  contentTitle: string | null;
  preview: string;
  date: string;
  unread: boolean;
  blocked?: boolean;
  real?: { otherId: string; contentId: string | null };
};

function toConversationItem(c: RealConversation): ConversationItem {
  const guide = c.contentId ? guides.find((g) => g.id === c.contentId) : undefined;
  const meditation = !guide && c.contentId ? meditations.find((m) => m.id === c.contentId) : undefined;
  return {
    id: `real:${c.otherId}:${c.contentId ?? "general"}`,
    from: c.otherName,
    avatarUrl: c.otherAvatarUrl,
    contentTitle: c.contentTitle ?? guide?.title ?? meditation?.title ?? null,
    preview: c.preview,
    date: c.date,
    unread: c.unread,
    real: { otherId: c.otherId, contentId: c.contentId },
  };
}

type Props = {
  content?: AuthoredContent[];
  onUnreadCountChange?: (count: number) => void;
  readIds?: Record<string, boolean>;
  onMarkRead?: (id: string) => void;
  // «Написати» from «Учасники»: open the conversation with this person (a new, empty one if none exists yet)
  openWith?: { otherId: string; name: string; contentId: string | null; contentTitle: string | null; key: number } | null;
};

const card = "rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff]";
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "У";
const REFRESH_MS = 30_000;
const LIST_PAGE = 20;
const BROADCAST_MAX = 1500;

export default function AuthorMessages({ content = [], onUnreadCountChange, readIds: readIdsProp, onMarkRead, openWith }: Props) {
  const session = useSession();
  const myId = session?.profile.id;
  const chatBan = useMyChatBan(myId);
  const chatBanActive = chatBanState(chatBan.ban, Date.now()).active;

  // ── conversations: 20 at a time from the database; «Архів» = quiet for 6 months; refreshed every 30 s ──────────
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(t);
  }, [query]);
  const [realConversations, setRealConversations] = useState<ConversationItem[]>([]);
  const [totals, setTotals] = useState({ total: 0, unread: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const listRequest = useRef(0);
  const loadConversations = async (opts: { quiet?: boolean; append?: boolean } = {}) => {
    if (!myId) return;
    const req = ++listRequest.current;
    if (!opts.quiet && !opts.append) setLoading(true);
    if (opts.append) setLoadingMore(true);
    try {
      // a refresh re-reads what is already on screen (at most 50), «Показати ще» reads the next 20
      const offset = opts.append ? realConversations.length : 0;
      const limit = opts.append ? LIST_PAGE : Math.min(50, Math.max(LIST_PAGE, realConversations.length));
      const page = await fetchConversationsPage(myId, { limit, offset, search, filter });
      if (req !== listRequest.current) return; // a newer filter / search / refresh already answered
      const items = page.items.map(toConversationItem);
      setRealConversations((prev) => (opts.append ? [...prev, ...items.filter((i) => !prev.some((p) => p.id === i.id))] : items));
      setTotals({ total: page.total, unread: page.unread, archived: page.archived });
      setFailed(false);
    } catch {
      if (!opts.quiet && req === listRequest.current) setFailed(true);
    } finally {
      if (req === listRequest.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };
  useEffect(() => {
    setRealConversations([]);
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, filter, search]);
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void loadConversations({ quiet: true }); }, REFRESH_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, filter, search, realConversations.length]);

  // demo: the same people as in «Учасники», recent dates
  const demoConversations: ConversationItem[] = useMemo(() => {
    if (!SHOW_AUTHOR_DEMO) return [];
    const people = demoWorld().people;
    const extra = [
      ["Спокійний сон за 21 день", "Дякую за практику! Можна питання щодо третього дня?"],
      ["Вечірнє заспокоєння", "Медитація чудова, слухаю щовечора"],
      ["Робота зі стресом", "А чи буде продовження програми?"],
      ["SOS при панічних атаках", "Техніка дихання допомогла в метро, дякую"],
      ["Спокійний сон за 21 день", "Не відкривається другий модуль, підкажіть"],
      ["Робота зі стресом", "Дуже вчасно отримала розсилку, дякую"],
      ["Вечірнє заспокоєння", "Чи можна завантажити медитацію?"],
      ["Робота зі стресом", "Пройшла програму повністю, це було важливо для мене"],
    ];
    const more = extra.map(([title, text], j) => ({ id: `demo-x${j}`, from: people[messagesData.length + j]?.name ?? "Учасник", avatarUrl: null, contentTitle: title, preview: text, date: new Date(Date.now() - (messagesData.length * 2 + j * 3 + 1) * 86_400_000).toISOString(), unread: j < 2, blocked: false }));
    return [...messagesData.map((m, i) => ({
      id: m.id,
      from: people[i]?.name ?? m.from,
      avatarUrl: null,
      contentTitle: m.contentTitle ?? null,
      preview: m.preview,
      date: new Date(Date.now() - (i * 2 + 0.3) * 86_400_000).toISOString(),
      unread: m.unread,
      blocked: m.blocked,
    })), ...more];
  }, []);

  const [hiddenDemo, setHiddenDemo] = useState<Record<string, boolean>>({});
  const [draftConversation, setDraftConversation] = useState<ConversationItem | null>(null);
  const realWithDraft = draftConversation && !realConversations.some((c) => c.id === draftConversation.id) ? [draftConversation, ...realConversations] : realConversations;
  const demoVisible = filter === "archive" ? [] : demoConversations.filter((c) => !hiddenDemo[c.id]);
  const conversations = [...realWithDraft, ...demoVisible];

  const [localReadIds, setLocalReadIds] = useState<Record<string, boolean>>({});
  const readIds = readIdsProp ?? localReadIds;
  const markRead = (id: string) => (onMarkRead ? onMarkRead(id) : setLocalReadIds((prev) => ({ ...prev, [id]: true })));
  const isUnread = (id: string, original: boolean) => (readIds[id] !== undefined ? !readIds[id] : original);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sentReplies, setSentReplies] = useState<Record<string, string[]>>({});
  const [realThread, setRealThread] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyNotice, setReplyNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [coarsePointer] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<{ kind: "conversation" } | { kind: "message"; id: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const demoUnread = demoVisible.filter((c) => isUnread(c.id, c.unread)).length;
  const unreadCount = totals.unread + demoUnread;
  const visible = conversations
    .filter((c) => c.real || filter !== "unread" || isUnread(c.id, c.unread))
    .filter((c) => c.real || !search || `${c.from} ${c.contentTitle ?? ""} ${c.preview}`.toLowerCase().includes(search.toLowerCase()));
  const moreReal = totals.total > realConversations.length;
  // the list shows 4 conversations, «Показати ще» adds 4 more (and reads the next page from the database when needed)
  const [listShown, setListShown] = useState(4);
  useEffect(() => setListShown(4), [filter, search]);
  const hiddenCount = visible.length - listShown + (moreReal ? totals.total - realConversations.length : 0);
  const showMoreList = () => {
    const next = listShown + 4;
    setListShown(next);
    if (moreReal && next > visible.length) void loadConversations({ append: true });
  };

  // the first conversation opens by itself on a wide screen
  useEffect(() => {
    if (selectedId === null && conversations.length > 0 && typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) setSelectedId(conversations[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.length]);

  useEffect(() => {
    if (!openWith) return;
    const id = `real:${openWith.otherId}:${openWith.contentId ?? "general"}`;
    setDraftConversation({ id, from: openWith.name, avatarUrl: null, contentTitle: openWith.contentTitle, preview: "Нова розмова", date: new Date().toISOString(), unread: false, real: { otherId: openWith.otherId, contentId: openWith.contentId } });
    setSelectedId(id);
    setThreadOpen(true);
  }, [openWith]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // the open thread: its last 50 messages, older ones on request; new ones every 30 s
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const stickBottom = useRef(true);
  const openIdRef = useRef<string | null>(null);
  openIdRef.current = selected?.id ?? null;
  const loadThread = async (quiet = false) => {
    if (!selected?.real || !myId) { setRealThread([]); setHasOlder(false); return; }
    if (!quiet) setThreadLoading(true);
    const forId = selected.id;
    try {
      const page = await fetchThreadPage(myId, selected.real.otherId, selected.real.contentId, null);
      if (forId !== openIdRef.current) return; // another conversation was opened meanwhile
      const el = scrollerRef.current;
      stickBottom.current = !quiet || !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      // keep the older pages already loaded, replace the newest part
      setRealThread((prev) => {
        if (!quiet || prev.length <= page.messages.length) return page.messages;
        const firstNew = page.messages[0]?.createdAt;
        return [...prev.filter((m) => firstNew && m.createdAt < firstNew), ...page.messages];
      });
      if (!quiet) setHasOlder(page.hasMore);
    } catch {
      /* the old messages stay on screen */
    } finally {
      if (!quiet && forId === openIdRef.current) setThreadLoading(false);
    }
  };
  const loadOlder = async () => {
    if (!selected?.real || !myId || realThread.length === 0) return;
    setLoadingOlder(true);
    const el = scrollerRef.current;
    const fromBottom = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await fetchThreadPage(myId, selected.real.otherId, selected.real.contentId, realThread[0].createdAt);
      stickBottom.current = false;
      setRealThread((prev) => [...page.messages, ...prev]);
      setHasOlder(page.hasMore);
      // keep the reader where they were
      window.requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - fromBottom; });
    } catch {
      /* the button stays, the reader can try again */
    } finally {
      setLoadingOlder(false);
    }
  };
  useEffect(() => {
    void loadThread();
    if (!selected?.real) return;
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void loadThread(true); }, REFRESH_MS);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, myId]);

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el && stickBottom.current) el.scrollTop = el.scrollHeight;
  }, [selectedId, realThread.length, threadOpen, sentReplies]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadCount]);

  const selectConversation = (item: ConversationItem) => {
    setSelectedId(item.id);
    setThreadOpen(true);
    markRead(item.id);
    setReplyNotice(null);
    if (item.real && myId) void markThreadRead(myId, item.real.otherId, item.real.contentId).catch(() => {}).then(() => loadConversations({ quiet: true }));
  };

  const runDelete = async () => {
    if (!confirm || !selected) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (!selected.real) {
        setHiddenDemo((h) => ({ ...h, [selected.id]: true }));
        setSelectedId(null);
        setThreadOpen(false);
      } else if (myId) {
        if (confirm.kind === "message") {
          await deleteMessage(confirm.id);
          await loadThread(true);
          void loadConversations({ quiet: true });
        } else {
          await deleteConversation(selected.real.otherId, selected.real.contentId);
          setRealConversations((l) => l.filter((c) => c.id !== selected.id));
          void loadConversations({ quiet: true });
          setSelectedId(null);
          setThreadOpen(false);
        }
      }
      setConfirm(null);
    } catch {
      setDeleteError("Не вдалося видалити. Спробуйте ще раз.");
      setConfirm(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const sendReply = async () => {
    if (!selected) return;
    const text = replyDrafts[selected.id]?.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text || sending) return;
    if (selected.real && myId) {
      // moderation happens on the server; the page only reacts to its answer
      setSending(true);
      setReplyNotice(null);
      try {
        const result = await sendRealMessage({ recipientId: selected.real.otherId, contentId: selected.real.contentId, body: text });
        if (!result.delivered) {
          chatBan.applyResult(result);
          setReplyNotice({ type: "block", message: result.chatBanned ? CHAT_BANNED_MESSAGE : result.profanity ? PROFANITY_BLOCK_MESSAGE : result.escalated ? REPEATED_VIOLATION_MESSAGE : CONTACT_BLOCK_MESSAGE });
          return;
        }
        if (result.action === "WARN") setReplyNotice({ type: "warn", message: CONTACT_WARN_MESSAGE });
        await loadThread(true);
        setReplyDrafts((prev) => ({ ...prev, [selected.id]: "" }));
        void loadConversations({ quiet: true });
      } catch (e) {
        setReplyNotice({ type: "block", message: e instanceof Error ? e.message : "Не вдалося надіслати повідомлення." });
      } finally {
        setSending(false);
      }
      return;
    }
    // demo conversation: a local echo, the same client-side checks as before
    const result = moderateMessage(text);
    if (result.action === "BLOCK") {
      const violations = recordViolation(selected.id);
      setReplyNotice({ type: "block", message: violations >= 3 ? REPEATED_VIOLATION_MESSAGE : result.categories.includes("PROFANITY") ? PROFANITY_BLOCK_MESSAGE : CONTACT_BLOCK_MESSAGE });
      return;
    }
    setReplyNotice(result.action === "WARN" ? { type: "warn", message: CONTACT_WARN_MESSAGE } : null);
    setSentReplies((prev) => ({ ...prev, [selected.id]: [...(prev[selected.id] ?? []), text] }));
    setReplyDrafts((prev) => ({ ...prev, [selected.id]: "" }));
  };

  const draft = selected ? replyDrafts[selected.id] ?? "" : "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Повідомлення</h1>
          <p className="mt-1 text-[15px] text-black/55">Спілкування з учасниками в межах Sensoria.</p>
        </div>
        <details className="group relative">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 rounded-2xl bg-[#eef0fd] px-3.5 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#4338ca]/20">
            <Icon name="shield" size={15} /> Правила спілкування
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-[min(90vw,380px)] rounded-2xl bg-white p-4 text-[13px] leading-relaxed text-[#2d2a5c] shadow-[0_18px_40px_-16px_rgba(70,40,170,0.45)] ring-1 ring-[#ebe8ff]">
            Sensoria лишається посередником у спілкуванні. Обмінюватися телефоном, месенджерами, e-mail чи посиланнями, а також пропонувати оплату чи записи в обхід платформи заборонено для обох сторін: такі повідомлення не надсилаються.
          </div>
        </details>
      </div>

      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-5 py-3.5 text-[14px] text-amber-900 ring-1 ring-amber-100">
          Не вдалося завантажити повідомлення.
          <button type="button" onClick={() => void loadConversations()} className="font-semibold underline">Спробувати ще раз</button>
        </div>
      )}

      <div className={`${card} grid h-[calc(100dvh-170px)] min-h-[480px] grid-rows-[minmax(0,1fr)] overflow-hidden lg:h-[700px] lg:grid-cols-[340px_minmax(0,1fr)]`}>
        {/* LIST */}
        <div className={`min-h-0 flex-col border-[#efeafd] lg:border-r ${threadOpen ? "hidden lg:flex" : "flex"}`}>
          <div className="flex flex-col gap-2.5 border-b border-[#efeafd] p-4">
            <label className="relative block">
              <span className="sr-only">Пошук у повідомленнях</span>
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40"><Icon name="search" size={16} /></span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Пошук за ім’ям чи текстом" className="min-h-[42px] w-full rounded-2xl bg-[#faf9ff] pl-10 pr-4 text-[14px] ring-1 ring-[#ebe8ff] placeholder:text-black/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]" />
            </label>
            <div className="flex gap-2" role="group" aria-label="Які діалоги показати">
              <Pill active={filter === "all"} onClick={() => setFilter("all")}>Усі</Pill>
              <Pill active={filter === "unread"} onClick={() => setFilter("unread")}>Непрочитані{unreadCount > 0 && <span className="ml-1.5 rounded-full bg-[#4338ca] px-1.5 text-[11px] text-white">{unreadCount}</span>}</Pill>
              <Pill active={filter === "archive"} onClick={() => setFilter("archive")}>Архів{totals.archived > 0 && <span className="ml-1.5 text-[11px] text-black/45">{totals.archived}</span>}</Pill>
            </div>
          </div>
          <div className="sensoria-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
            {loading && conversations.length === 0 ? (
              [0, 1, 2, 3].map((k) => (
                <div key={k} className="flex min-h-[104px] flex-1 items-center gap-3 border-b border-[#f3f1fb] px-4 py-3.5">
                  <span className="h-11 w-11 animate-pulse rounded-full bg-[#e7e3fb]" />
                  <span className="h-4 flex-1 animate-pulse rounded bg-black/5" />
                </div>
              ))
            ) : visible.length === 0 ? (
              <p className="px-6 py-12 text-center text-[14px] text-black/55">{filter === "archive" ? "В архіві порожньо. Сюди потрапляють переписки, у яких 6 місяців не було нових повідомлень." : search ? "Нічого не знайдено." : filter === "unread" ? "Усі повідомлення прочитано." : "Повідомлень поки немає. Учасники зможуть написати вам зі сторінки матеріалу."}</p>
            ) : (
              visible.slice(0, listShown).map((m) => {
                const unread = isUnread(m.id, m.unread);
                const active = selectedId === m.id;
                return (
                  <button key={m.id} type="button" onClick={() => selectConversation(m)} aria-current={active ? "true" : undefined} className={`flex min-h-[104px] w-full flex-1 items-center gap-3 border-b border-[#f3f1fb] px-4 py-3.5 text-left transition focus:outline-none focus-visible:bg-[#f6f4ff] ${active ? "bg-[#eef0fd]" : "hover:bg-[#faf9ff]"}`}>
                    <Avatar name={m.from} url={m.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`flex min-w-0 items-center gap-1.5 truncate text-[14px] ${unread ? "font-bold text-[#12172b]" : "font-semibold text-[#1d2240]"}`}><span className="truncate">{m.from}</span>{!m.real && <span className="shrink-0 rounded-full bg-[#f6f4ff] px-1.5 text-[10px] font-semibold text-[#6d5bd0]">демо</span>}</span>
                        <span className="shrink-0 text-[11px] text-black/45">{formatRelativeTime(m.date)}</span>
                      </span>
                      {m.contentTitle && <span className="mt-0.5 block truncate text-[12px] font-medium text-[#6d5bd0]">{m.contentTitle}</span>}
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-[13px] ${m.blocked ? "italic text-amber-800" : unread ? "text-[#2d2a5c]" : "text-black/55"}`}>
                          {m.blocked && <Icon name="shield" size={12} className="mr-1 inline-block align-[-2px]" />}{m.preview}
                        </span>
                        {unread && <span role="img" aria-label="Непрочитане" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#4338ca]" />}
                      </span>
                    </span>
                  </button>
                );
              })
            )}

          </div>
            {hiddenCount > 0 && (
              <div className="border-t border-[#efeafd] px-4 py-3 sm:px-5">
                <button type="button" onClick={showMoreList} disabled={loadingMore} className="flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#f1eeff] text-[13px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff] disabled:opacity-60">
                  {loadingMore ? "Завантаження…" : <>Показати ще ({Math.min(4, hiddenCount)}) <span aria-hidden="true">↓</span></>}
                </button>
                <div aria-hidden="true" className="mt-1.5 h-[16px]" />
              </div>
            )}
        </div>

        {/* THREAD */}
        <div className={`min-h-0 min-w-0 flex-col ${threadOpen ? "flex" : "hidden lg:flex"}`}>
          {selected ? (
            <>
              <div className="flex items-center gap-3 border-b border-[#efeafd] px-4 py-3 sm:px-5">
                <button type="button" onClick={() => setThreadOpen(false)} aria-label="Назад до діалогів" className="-ml-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-black/60 hover:bg-black/5 lg:hidden">
                  <Icon name="chevron" size={18} className="rotate-90" />
                </button>
                <Avatar name={selected.from} url={selected.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-semibold text-[#12172b]">{selected.from}</div>
                  {selected.contentTitle && <div className="truncate text-[12px] font-medium text-[#6d5bd0]">{selected.contentTitle}</div>}
                </div>
                <button type="button" onClick={() => setConfirm({ kind: "conversation" })} className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-medium text-black/55 transition hover:bg-rose-50 hover:text-rose-700">Видалити переписку</button>
              </div>

              <div ref={scrollerRef} className="sensoria-scroll flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-[#fbfaff] px-4 py-5 sm:px-6" role="log" aria-label="Переписка">
                {selected.real && hasOlder && (
                  <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="mx-auto mb-1 rounded-full bg-white px-4 py-1.5 text-[12px] font-semibold text-[#5b4bd0] ring-1 ring-[#ebe8ff] hover:bg-[#f6f4ff] disabled:opacity-60">
                    {loadingOlder ? "Завантаження…" : "Показати раніші повідомлення"}
                  </button>
                )}
                {selected.real ? (
                  threadLoading && realThread.length === 0 ? (
                    <p className="m-auto text-[13px] text-black/45">Завантажуємо…</p>
                  ) : realThread.length === 0 ? (
                    <p className="m-auto max-w-[320px] text-center text-[13px] text-black/50">Напишіть перше повідомлення. Учасник отримає його в Sensoria й на пошту, якщо ввімкнув сповіщення.</p>
                  ) : (
                    realThread.map((msg, i) => {
                      const mine = msg.senderId === myId;
                      const showDay = needsDaySeparator(i > 0 ? realThread[i - 1].createdAt : null, msg.createdAt);
                      return (
                        <div key={msg.id} className="flex flex-col gap-2.5">
                          {showDay && <div className="mx-auto rounded-full bg-white px-3 py-1 text-[11px] font-medium text-black/50 ring-1 ring-[#efeafd]">{formatDayLabel(msg.createdAt)}</div>}
                          <Bubble mine={mine} deleted={msg.deleted} time={formatClock(msg.createdAt)} onDelete={mine && !msg.deleted && isUuid(msg.id) ? () => setConfirm({ kind: "message", id: msg.id }) : undefined}>{msg.body}</Bubble>
                        </div>
                      );
                    })
                  )
                ) : (
                  <>
                    {selected.blocked ? (
                      <div className="flex max-w-[78%] items-start gap-2 rounded-2xl rounded-bl-md border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-[14px] italic text-amber-800"><Icon name="shield" size={15} /><span>{selected.preview}</span></div>
                    ) : (
                      <Bubble mine={false} time={formatRelativeTime(selected.date)}>{selected.preview}</Bubble>
                    )}
                    {(sentReplies[selected.id] ?? []).map((text, i) => <Bubble key={i} mine time="щойно">{text}</Bubble>)}
                  </>
                )}
              </div>

              {deleteError && <p role="alert" className="px-5 pt-2 text-[12px] text-rose-700">{deleteError}</p>}
              {confirm && (
                <ConfirmDialog
                  title={confirm.kind === "conversation" ? "Видалити переписку?" : "Видалити повідомлення?"}
                  text={confirm.kind === "conversation" ? "Переписка зникне лише у вас. Інша людина збереже свою копію." : "Повідомлення зникне в обох. На його місці залишиться позначка «Повідомлення видалено»."}
                  confirmLabel="Видалити"
                  busy={deleteBusy}
                  onConfirm={runDelete}
                  onCancel={() => setConfirm(null)}
                />
              )}

              <div className="border-t border-[#efeafd] px-4 py-3 sm:px-5">
                <div className="flex items-end gap-2 rounded-2xl bg-[#faf9ff] p-1.5 ring-1 ring-[#ebe8ff] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#7c5cf0]">
                  <textarea
                    value={draft}
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH}
                    disabled={chatBanActive}
                    aria-label="Відповідь учаснику"
                    enterKeyHint={coarsePointer ? "enter" : "send"}
                    onChange={(e) => { setReplyDrafts((prev) => ({ ...prev, [selected.id]: e.target.value })); setReplyNotice(null); }}
                    onKeyDown={(e) => {
                      if (shouldSendOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, coarsePointer })) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                    placeholder="Напишіть повідомлення…"
                    className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-snug focus:outline-none disabled:opacity-50 sm:text-[15px]"
                  />
                  <button type="button" onClick={() => void sendReply()} disabled={chatBanActive || !canSend(draft, sending)} aria-label="Надіслати" className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40">
                    {sending ? "…" : <><span className="hidden sm:inline">Надіслати</span><Icon name="chevron" size={16} className="-rotate-90" /></>}
                  </button>
                </div>
                <div className="mt-1.5 flex justify-between px-1 text-[11px] text-black/40">
                  <span>{coarsePointer ? "" : "Enter — надіслати, Shift + Enter — новий рядок"}</span>
                  {draft.length > MAX_MESSAGE_LENGTH * 0.8 && <span>{draft.length}/{MAX_MESSAGE_LENGTH}</span>}
                </div>
                <ChatBanNotice ban={chatBan.ban} onExpire={chatBan.clear} className="mt-2" />
                {replyNotice && <p role="alert" className={`mt-2 rounded-xl px-3 py-2 text-[12px] ${replyNotice.type === "block" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>{replyNotice.message}</p>}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="mail" size={24} /></span>
              <p className="max-w-[300px] text-[14px] text-black/55">Оберіть діалог зліва, щоб прочитати й відповісти.</p>
            </div>
          )}
        </div>
      </div>

      <BroadcastCard content={content} />
    </div>
  );
}

// «Розсилка»: one message to every participant (or of one material). Sent by the send-message function: checked for
// contacts / links / rude words, once a day, delivered to each person's inbox (no mass e-mail).
function BroadcastCard({ content }: { content: AuthoredContent[] }) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState("all");
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [history, setHistory] = useState<Broadcast[]>([]);
  useEffect(() => { if (open) fetchMyBroadcasts().then(setHistory).catch(() => {}); }, [open]);
  // demo: how past broadcasts look (counts from the demo world), only while there are no real ones
  const demoHistory: Broadcast[] = useMemo(() => {
    if (!SHOW_AUTHOR_DEMO) return [];
    const w = demoWorld();
    const all = w.people.length;
    const stress = w.people.filter((p) => p.entries.some((e) => e.contentId === "stress-course")).length;
    const day = 86_400_000;
    return [
      { id: "demo-b1", contentId: "stress-course", body: "Додала новий модуль «Робота з емоціями» у програму «Робота зі стресом». Він уже відкритий у вашому кабінеті — почніть з короткої практики на 5 хвилин.", recipients: stress, createdAt: new Date(Date.now() - 3 * day).toISOString() },
      { id: "demo-b2", contentId: null, body: "Вийшла нова безкоштовна медитація «Вечірнє заспокоєння» на 10 хвилин. Вона допоможе м’яко завершити день і легше заснути.", recipients: all, createdAt: new Date(Date.now() - 16 * day).toISOString() },
      { id: "demo-b3", contentId: null, body: "Дякую, що ви зі мною! Оновила гайд «SOS при панічних атаках»: додала техніку дихання 4-7-8 і чекліст на випадок нападу.", recipients: all - 6, createdAt: new Date(Date.now() - 41 * day).toISOString() },
      { id: "demo-b4", contentId: "stress-course", body: "Нагадування: у модулі «Техніки стабілізації» є аудіопрактика на 7 хвилин. Спробуйте її сьогодні ввечері.", recipients: stress, createdAt: new Date(Date.now() - 58 * day).toISOString() },
      { id: "demo-b5", contentId: null, body: "Відкрила запис на нову програму «Спокійний сон за 21 день». Для тих, хто вже зі мною, — коротке відео-знайомство в описі.", recipients: all - 9, createdAt: new Date(Date.now() - 77 * day).toISOString() },
      { id: "demo-b6", contentId: null, body: "Перша розсилка: дякую, що довіряєте мені свій час. Тут я ділитимусь оновленнями матеріалів і новими практиками.", recipients: all - 14, createdAt: new Date(Date.now() - 120 * day).toISOString() },
    ];
  }, []);
  const shownHistory = history.length > 0 ? history : demoHistory;
  const [histShown, setHistShown] = useState(4);
  const live = content.filter((c) => /^[0-9a-f-]{36}$/i.test(c.id) && (c.status !== "draft" || c.everPublished));
  const options = [{ id: "all", label: "Усі мої учасники" }, ...live.map((c) => ({ id: c.id, label: `Учасники «${c.title.length > 32 ? `${c.title.slice(0, 32)}…` : c.title}»` }))];
  const local = moderateMessage(text);
  const problem = text.trim().length > 0 && text.trim().length < 10 ? "Щонайменше 10 символів." : local.action === "BLOCK" ? "У тексті є контакти, посилання для спілкування поза Sensoria або грубі слова." : null;
  const send = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await sendBroadcast({ contentId: audience === "all" ? null : audience, text });
      setResult({ ok: true, text: `Надіслано ${r.sent} ${pluralUk(r.sent, "учаснику", "учасникам", "учасникам")}. Відповіді прийдуть у ваші повідомлення.` });
      setText("");
      setConfirming(false);
      fetchMyBroadcasts().then(setHistory).catch(() => {});
    } catch (e) {
      setResult({ ok: false, text: e instanceof Error ? e.message : "Не вдалося надіслати розсилку." });
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className={`${card} p-5 sm:p-6`} aria-labelledby="msg-broadcast">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="megaphone" size={22} /></span>
        <div className="min-w-0 flex-1">
          <h2 id="msg-broadcast" className="text-[17px] font-bold text-[#12172b]">Розсилка учасникам</h2>
          <p className="mt-0.5 text-[14px] text-black/55">Анонс нового модуля, оновлення гайду, нова медитація. Кожен учасник отримає повідомлення у свій кабінет.</p>
        </div>
        {!open && <button type="button" onClick={() => setOpen(true)} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white hover:opacity-95">Нова розсилка</button>}
      </div>
      {open && (
        <div className="mt-5 flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <CatalogSort<string> value={audience} onChange={setAudience} options={options} label="Кому" variant="light" className="self-start" icon={<Icon name="graduation" size={16} />} />
            <textarea value={text} onChange={(e) => { setText(e.target.value.slice(0, BROADCAST_MAX)); setResult(null); setConfirming(false); }} rows={5} placeholder="Наприклад: «Додала новий модуль про сон — він уже доступний у вашій програмі»" className="w-full resize-y rounded-2xl border border-[#d9d4f5] bg-[#faf9ff] px-4 py-3 text-[15px] leading-relaxed focus:border-[#5b3df5] focus:bg-white focus:outline-none" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-black/50">
              <span>Раз на добу · без контактів і посилань · {text.length}/{BROADCAST_MAX}</span>
              {problem && <span className="text-rose-700">{problem}</span>}
            </div>
            {confirming ? (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[#f6f4ff] p-3 text-[14px] text-[#2d2a5c]">
                Надіслати {audience === "all" ? "усім вашим учасникам" : "учасникам цього матеріалу"}? Скасувати розсилку буде неможливо.
                <div className="ml-auto flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="min-h-[40px] rounded-xl px-3 text-[13px] font-semibold text-black/55 hover:text-black">Ні</button>
                  <button type="button" onClick={() => void send()} disabled={busy} className="min-h-[40px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? "Надсилаємо…" : "Так, надіслати"}</button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(true)} disabled={text.trim().length < 10 || !!problem} className="min-h-[44px] rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-5 text-[14px] font-semibold text-white hover:opacity-95 disabled:opacity-40">Надіслати розсилку</button>
                <button type="button" onClick={() => { setOpen(false); setResult(null); }} className="min-h-[44px] rounded-xl px-4 text-[14px] font-semibold text-black/55 hover:text-black">Згорнути</button>
              </div>
            )}
            {result && <p role="status" className={`rounded-xl px-3 py-2 text-[13px] ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{result.text}</p>}
          </div>
          <div className="border-t border-[#efeafd] pt-5">
            <div className="text-[15px] font-bold text-[#12172b]">Попередні розсилки</div>
            {shownHistory.length === 0 ? (
              <p className="mt-2 text-[13px] text-black/50">Ще не було.</p>
            ) : (
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {shownHistory.slice(0, histShown).map((h) => (
                  <li key={h.id} className="rounded-2xl bg-[#faf9ff] p-3 ring-1 ring-[#efeafd]">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-black/50">
                      <span className="flex items-center gap-2">{formatRelativeTime(h.createdAt)}{h.id.startsWith("demo-") && <span className="rounded-full bg-[#f1eeff] px-2 py-0.5 text-[10px] font-semibold text-[#6d5bd0]">демо</span>}</span>
                      <span>{h.recipients} {pluralUk(h.recipients, "отримувач", "отримувачі", "отримувачів")}</span>
                    </div>
                    <div className="mt-1 text-[11px] font-semibold text-[#6d5bd0]">{h.contentId ? `Учасники «${content.find((c) => c.id === h.contentId)?.title ?? "матеріалу"}»` : "Усі учасники"}</div>
                    <p className="mt-1 line-clamp-4 text-[13px] text-[#2d2a5c]">{h.body}</p>
                  </li>
                ))}
              </ul>
            )}
            {shownHistory.length > histShown && (
              <button type="button" onClick={() => setHistShown((n) => n + 4)} className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#f1eeff] px-5 text-[14px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff]">
                Показати ще ({Math.min(4, shownHistory.length - histShown)}) <span aria-hidden="true">↓</span>
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover ring-1 ring-[#ebe8ff]" />
  ) : (
    <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#e2dbff] to-[#cfc3ff] text-[14px] font-bold text-[#4a2fd0]">{initials(name)}</span>
  );
}

function Bubble({ mine, deleted, time, onDelete, children }: { mine: boolean; deleted?: boolean; time: string; onDelete?: () => void; children: ReactNode }) {
  return (
    <div className={`flex max-w-[85%] flex-col sm:max-w-[72%] ${mine ? "items-end self-end" : "items-start"}`}>
      {deleted ? (
        <div className="rounded-2xl border border-dashed border-black/20 px-4 py-2.5 text-[14px] italic text-black/50">Повідомлення видалено</div>
      ) : (
        <div className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${mine ? "rounded-br-md bg-gradient-to-br from-[#5b6ff2] to-[#7c5cf0] text-white" : "rounded-bl-md bg-white text-[#1d2240] ring-1 ring-[#ebe8ff]"}`}>{children}</div>
      )}
      <div className="mt-1 flex items-center gap-3 px-1 text-[11px] text-black/45">
        <span>{time}</span>
        {onDelete && <button type="button" onClick={onDelete} aria-label="Видалити повідомлення" className="hover:text-rose-700">Видалити</button>}
      </div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`inline-flex min-h-[34px] items-center rounded-full px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${active ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}>
      {children}
    </button>
  );
}
