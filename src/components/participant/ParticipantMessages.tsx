// Participant "Повідомлення": one continuous split view. The unit of a
// conversation is Participant → Author → content (program / guide /
// meditation), so the content is part of every row and of the header.
// Real conversations come from lib/messages (server-side moderation
// stays in the send-message Edge Function); the local demo conversations
// are kept as before and are echo-only.
import { Icon } from "../ui/Icon";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { participantMessages as demoMessagesData } from "../../data/participantDashboard";
import { SHOW_DEMO } from "../../utils/demoMode";
// sample conversations only while the demo is on (never on the live site: .env.production)
const messagesData = SHOW_DEMO ? demoMessagesData : [];
import { guides } from "../../data/guides";
import { meditations } from "../../data/meditations";
import ChatBanNotice from "../ChatBanNotice";
import { chatBanState } from "../../utils/chatBan";
import { useMyChatBan } from "../../lib/chatBan";
import { moderateMessage, recordViolation, PROFANITY_BLOCK_MESSAGE } from "../../utils/contactFilter";
import { useSession } from "../../context/SessionContext";
import { useOpenAuthorProfile } from "../../context/AuthorProfileContext";
import {
  fetchConversations,
  fetchThread,
  sendMessage as sendRealMessage,
  markThreadRead,
  deleteMessage,
  deleteConversation,
  type RealConversation,
  type ThreadMessage,
} from "../../lib/messages";
import ConfirmDialog from "../author/public/ConfirmDialog";
import { ownImage } from "../../lib/ownImage";
import { takePendingChat } from "../../lib/pendingChat";
import { fetchAuthorDetails, type AuthorDetails } from "../../lib/authorDetails";
import { submitReport, REPORT_REASON_LABELS, type ReportReason } from "../../lib/reports";
import {
  CONTENT_KIND_LABEL,
  MAX_MESSAGE_LENGTH,
  canSend,
  isUuid,
  formatClock,
  formatDayLabel,
  formatListDate,
  needsDaySeparator,
  resolveContentRef,
  shouldSendOnEnter,
  singleLine,
  type ContentKind,
} from "../../utils/messagesView";

type Notice = { type: "warn" | "block" | "error"; message: string };

// Calm, human wording. Nothing here says what exactly was detected.
const CONTACT_BLOCK_MESSAGE =
  "Це повідомлення не вдалося надіслати: у ньому є контакти або посилання, які ведуть за межі Sensoria. Ви можете запитати про програму, гайд чи медитацію — прямо тут.";
const CONTACT_WARN_MESSAGE =
  "Повідомлення надіслано, але нагадуємо: спілкування й оплата залишаються в межах Sensoria.";
const CHAT_BANNED_MESSAGE =
  "Не вдалося надіслати: чат для вашого акаунта заблоковано через повторні порушення правил. Деталі — у повідомленні про блокування чату.";
const REPEATED_VIOLATION_MESSAGE =
  "Ми не можемо надіслати це повідомлення. Тут можна говорити лише про програму, гайд чи медитацію.";

const REPORT_REASONS: ReportReason[] = [
  "inappropriate_content",
  "requests_contact_info",
  "offers_off_platform_payment",
  "inappropriate_behavior",
  "other",
];

type ConversationItem = {
  id: string;
  authorName: string;
  authorAvatarUrl: string | null;
  contentTitle: string | null;
  contentId: string | null;
  contentKind: ContentKind | null;
  contentUnavailable: boolean;
  preview: string;
  date: string;
  unread: boolean;
  real?: { otherId: string; contentId: string | null };
  profileId?: string; // the author's page (a demo conversation with a real author)
};

function toConversationItem(c: RealConversation): ConversationItem {
  const guide = c.contentId ? guides.find((g) => g.id === c.contentId) : undefined;
  const meditation = !guide && c.contentId ? meditations.find((m) => m.id === c.contentId) : undefined;
  const ref = resolveContentRef(c.contentId, {
    guideTitle: guide?.title,
    meditationTitle: meditation?.title,
    programTitle: c.contentTitle,
  });
  return {
    id: `real:${c.otherId}:${c.contentId ?? "general"}`,
    authorName: c.otherName,
    authorAvatarUrl: c.otherAvatarUrl,
    contentTitle: ref.title,
    contentId: c.contentId,
    contentKind: ref.kind,
    contentUnavailable: ref.unavailable,
    preview: c.preview,
    date: c.date,
    unread: c.unread,
    real: { otherId: c.otherId, contentId: c.contentId },
  };
}

function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

// Real uploaded photo if there is one; otherwise a quiet monogram.
function AuthorMark({ name, url, size = 44 }: { name: string; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (url && !broken && ownImage(url)) {
    return (
      <img
        src={url}
        alt=""
        style={style}
        onError={() => setBroken(true)}
        className="rounded-full object-cover shrink-0 bg-[#f1eeff] ring-1 ring-[#ebe8ff]"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className="rounded-full shrink-0 bg-gradient-to-br from-[#e2dbff] to-[#cfc3ff] text-[#4a2fd0] text-[14px] font-bold flex items-center justify-center"
    >
      {name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "S"}
    </span>
  );
}

type Props = {
  onOpenProgram?: (id: string) => void;
  onOpenGuide?: (id: string) => void;
  onOpenMeditation?: (id: string) => void;
  onUnreadCountChange?: (count: number) => void;
  readIds?: Record<string, boolean>;
  onMarkRead?: (id: string) => void;
};

export default function ParticipantMessages({
  onOpenProgram,
  onOpenGuide,
  onOpenMeditation,
  onUnreadCountChange,
  readIds: readIdsProp,
  onMarkRead,
}: Props) {
  const session = useSession();
  const myId = session?.profile.id;
  const chatBan = useMyChatBan(myId);
  // While the chat is banned the composer is switched off (the server refuses anyway).
  const chatBanActive = chatBanState(chatBan.ban, Date.now()).active;
  const openAuthorProfile = useOpenAuthorProfile();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const coarsePointer = useMediaQuery("(pointer: coarse)");

  // ---- list data ----
  const [realConversations, setRealConversations] = useState<ConversationItem[]>([]);
  // the list, as in the author cabinet: search, «Усі / Непрочитані / Архів», 4 conversations at a time
  const [listQuery, setListQuery] = useState("");
  const [listFilter, setListFilter] = useState<"all" | "unread" | "archive">("all");
  const [listShown, setListShown] = useState(4);
  useEffect(() => setListShown(4), [listFilter, listQuery]);
  const [listState, setListState] = useState<"loading" | "ready" | "error">("loading");
  const loadList = useCallback(() => {
    if (!myId) return;
    setListState("loading");
    fetchConversations(myId, { strict: true })
      .then((cs) => {
        setRealConversations(cs.map(toConversationItem));
        setListState("ready");
      })
      .catch(() => setListState("error"));
  }, [myId]);
  useEffect(loadList, [loadList]);

  const demoConversations: ConversationItem[] = useMemo(
    () =>
      messagesData.map((m) => ({
        id: m.id,
        authorName: m.authorName,
        authorAvatarUrl: null,
        contentTitle: m.contentTitle ?? null,
        contentId: m.contentId ?? null,
        contentKind: m.contentKind ?? null,
        contentUnavailable: false,
        preview: m.preview,
        date: m.date,
        unread: m.unread,
        profileId: m.authorId,
      })),
    []
  );
  // A chat started from an author's profile ("Написати автору"): taken once
  // on mount. The general (no-content) conversation with that author is
  // opened if it exists, otherwise a draft one is created; it becomes a real
  // conversation with the first message.
  const [startChat] = useState(() => takePendingChat());
  const [draftChat, setDraftChat] = useState<ConversationItem | null>(() =>
    startChat
      ? {
          id: `real:${startChat.authorId}:general`,
          authorName: startChat.name,
          authorAvatarUrl: startChat.avatarUrl,
          contentTitle: null,
          contentId: null,
          contentKind: null,
          contentUnavailable: false,
          preview: "Нова розмова",
          date: new Date().toISOString(),
          unread: false,
          real: { otherId: startChat.authorId, contentId: null },
        }
      : null
  );
  const [hiddenDemo, setHiddenDemo] = useState<Record<string, boolean>>({});
  const conversations = useMemo(() => {
    const base = [...realConversations];
    if (draftChat && !base.some((c) => c.id === draftChat.id)) base.unshift(draftChat);
    return [...base, ...demoConversations.filter((c) => !hiddenDemo[c.id])];
  }, [realConversations, demoConversations, draftChat, hiddenDemo]);

  // ---- read state ----
  const [localReadIds, setLocalReadIds] = useState<Record<string, boolean>>({});
  const readIds = readIdsProp ?? localReadIds;
  const markRead = (id: string) => {
    if (onMarkRead) onMarkRead(id);
    else setLocalReadIds((prev) => ({ ...prev, [id]: true }));
  };
  const isUnread = (id: string, original: boolean) => (readIds[id] !== undefined ? !readIds[id] : original);

  useEffect(() => {
    if (!onUnreadCountChange) return;
    onUnreadCountChange(conversations.filter((c) => isUnread(c.id, c.unread)).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.map((c) => c.id).join(","), readIds, onUnreadCountChange]);

  // ---- selection ----
  // selectedId is what the thread shows; `threadOpen` is only about which
  // pane is visible below lg (list → conversation → back).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sentDemo, setSentDemo] = useState<Record<string, string[]>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  const [noticeExpanded, setNoticeExpanded] = useState(false);

  const selectConversation = (item: ConversationItem) => {
    setSelectedId(item.id);
    setThreadOpen(true);
    setNotice(null);
    if (isUnread(item.id, item.unread)) markRead(item.id);
    if (item.real && myId && item.unread) markThreadRead(myId, item.real.otherId, item.real.contentId).catch(() => {});
  };

  // Opened from an author profile: go straight to that author's conversation
  // (also on mobile, where the list would otherwise show first).
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startChat || startedRef.current || listState === "loading") return;
    const target = conversations.find((c) => c.id === `real:${startChat.authorId}:general`);
    if (target) {
      startedRef.current = true;
      selectConversation(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startChat, listState, conversations.length]);

  // Desktop shows a conversation straight away (the most recent one).
  useEffect(() => {
    if (isDesktop && !selectedId && listState !== "loading" && conversations.length) {
      selectConversation(conversations[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, selectedId, listState, conversations.length]);

  // ---- thread ----
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [threadState, setThreadState] = useState<"loading" | "ready" | "error">("ready");
  const loadThread = useCallback(() => {
    if (!selected?.real || !myId) {
      setThread([]);
      setThreadState("ready");
      return;
    }
    let cancelled = false;
    setThreadState("loading");
    fetchThread(myId, selected.real.otherId, selected.real.contentId, { strict: true })
      .then((t) => {
        if (cancelled) return;
        setThread(t);
        setThreadState("ready");
      })
      .catch(() => {
        if (!cancelled) setThreadState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, myId]);
  useEffect(() => loadThread(), [loadThread]);

  // Author details are fetched per opened conversation only, then cached.
  const detailsCache = useRef(new Map<string, AuthorDetails>());
  const [authorDetails, setAuthorDetails] = useState<AuthorDetails | null>(null);
  useEffect(() => {
    const otherId = selected?.real?.otherId;
    if (!otherId) {
      setAuthorDetails(null);
      return;
    }
    const cached = detailsCache.current.get(otherId);
    if (cached) {
      setAuthorDetails(cached);
      return;
    }
    setAuthorDetails(null);
    let cancelled = false;
    fetchAuthorDetails(otherId)
      .then((d) => {
        detailsCache.current.set(otherId, d);
        if (!cancelled) setAuthorDetails(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  // On mobile the conversation fills the screen: bring the panel to the
  // top so the header, messages and composer are all on screen together.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (threadOpen && !isDesktop) panelRef.current?.scrollIntoView({ block: "start" });
  }, [threadOpen, isDesktop, selectedId]);

  // Keep the newest message in view.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const messageCount = selected?.real ? thread.length : 1 + (sentDemo[selected?.id ?? ""]?.length ?? 0);
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selected?.id, messageCount, threadState, threadOpen]);

  // ---- composer ----
  const draft = selected ? drafts[selected.id] ?? "" : "";
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [draft, selected?.id, threadOpen]);

  const bumpListItem = (id: string, body: string, iso: string) => {
    setRealConversations((prev) => {
      const next = prev.some((c) => c.id === id)
        ? prev.map((c) => (c.id === id ? { ...c, preview: body, date: iso, unread: false } : c))
        : draftChat && draftChat.id === id
        ? [...prev, { ...draftChat, preview: body, date: iso, unread: false }]
        : prev;
      return next.sort((a, b) => (a.date < b.date ? 1 : -1));
    });
    if (draftChat && draftChat.id === id) setDraftChat(null);
  };

  const send = async () => {
    if (!selected || chatBanActive || !canSend(draft, sending)) return;
    const text = draft.trim();
    const convoId = selected.id;

    if (selected.real && myId) {
      setSending(true);
      setNotice(null);
      try {
        const result = await sendRealMessage({
          recipientId: selected.real.otherId,
          contentId: selected.real.contentId,
          body: text,
        });
        if (!result.delivered) {
          // Draft is kept so nothing the person wrote is lost.
          chatBan.applyResult(result);
          setNotice({ type: "block", message: result.chatBanned ? CHAT_BANNED_MESSAGE : result.profanity ? PROFANITY_BLOCK_MESSAGE : result.escalated ? REPEATED_VIOLATION_MESSAGE : CONTACT_BLOCK_MESSAGE });
          return;
        }
        if (result.action === "WARN") setNotice({ type: "warn", message: CONTACT_WARN_MESSAGE });
        setDrafts((prev) => ({ ...prev, [convoId]: "" }));
        try {
          setThread(await fetchThread(myId, selected.real.otherId, selected.real.contentId, { strict: true }));
        } catch {
          // Delivered but the refresh failed — show it locally.
          const now = new Date().toISOString();
          setThread((prev) => [...prev, { id: `local-${now}`, senderId: myId, body: text, createdAt: now }]);
        }
        bumpListItem(convoId, text, new Date().toISOString());
      } catch (e) {
        setNotice({
          type: "error",
          message: e instanceof Error ? e.message : "Не вдалося надіслати повідомлення. Спробуйте ще раз.",
        });
      } finally {
        setSending(false);
      }
      return;
    }

    // Demo conversation — local echo; same shared client-side filter.
    const result = moderateMessage(text);
    if (result.action === "BLOCK") {
      const violations = recordViolation(convoId);
      setNotice({ type: "block", message: violations >= 3 ? REPEATED_VIOLATION_MESSAGE : result.categories.includes("PROFANITY") ? PROFANITY_BLOCK_MESSAGE : CONTACT_BLOCK_MESSAGE });
      return;
    }
    setNotice(result.action === "WARN" ? { type: "warn", message: CONTACT_WARN_MESSAGE } : null);
    setSentDemo((prev) => ({ ...prev, [convoId]: [...(prev[convoId] ?? []), text] }));
    setDrafts((prev) => ({ ...prev, [convoId]: "" }));
  };

  // ---- content reference ----
  const canOpen = (c: ConversationItem) =>
    !!c.contentId &&
    !c.contentUnavailable &&
    ((c.contentKind === "program" && !!onOpenProgram) ||
      (c.contentKind === "guide" && !!onOpenGuide) ||
      (c.contentKind === "meditation" && !!onOpenMeditation));
  const openContent = (c: ConversationItem) => {
    if (!c.contentId || !canOpen(c)) return;
    if (c.contentKind === "program") onOpenProgram?.(c.contentId);
    if (c.contentKind === "guide") onOpenGuide?.(c.contentId);
    if (c.contentKind === "meditation") onOpenMeditation?.(c.contentId);
  };

  // ---- report ----
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-msg-menu]")) setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [menuOpen]);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("inappropriate_content");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);
  useEffect(() => {
    setMenuOpen(false);
    setReportOpen(false);
    setReportError(null);
    setReportSent(false);
    setReportReason("inappropriate_content");
    setReportDetails("");
  }, [selectedId]);
  const submitReportClick = async () => {
    if (!selected?.real || !myId) return;
    setReportSubmitting(true);
    setReportError(null);
    try {
      await submitReport({
        reporterId: myId,
        reportedId: selected.real.otherId,
        contentId: selected.real.contentId,
        reason: reportReason,
        details: reportDetails,
      });
      setReportOpen(false);
      setReportSent(true);
    } catch (e) {
      setReportError(e instanceof Error ? e.message : "Не вдалося надіслати скаргу.");
    } finally {
      setReportSubmitting(false);
    }
  };

  // ---- delete (a message of mine / the whole conversation for me) ----
  const [confirm, setConfirm] = useState<{ kind: "conversation" } | { kind: "message"; id: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const runDelete = async () => {
    if (confirm?.kind === "conversation" && selected && !selected.real) {
      setHiddenDemo((h) => ({ ...h, [selected.id]: true }));
      setSelectedId(null);
      setThreadOpen(false);
      setConfirm(null);
      return;
    }
    if (!confirm || !selected?.real || !myId) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (confirm.kind === "message") {
        await deleteMessage(confirm.id);
        setThread(await fetchThread(myId, selected.real.otherId, selected.real.contentId, { strict: true }));
        loadList();
      } else {
        await deleteConversation(selected.real.otherId, selected.real.contentId);
        setRealConversations((l) => l.filter((c) => c.id !== selected.id));
        setDraftChat((d) => (d && d.id === selected.id ? null : d));
        setSelectedId(null);
        setThreadOpen(false);
      }
      setConfirm(null);
    } catch {
      setDeleteError("Не вдалося видалити. Спробуйте ще раз.");
      setConfirm(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  // ---- render ----
  const renderBubble = (body: string, mine: boolean, at: string | null, opts: { id?: string; deleted?: boolean } = {}) => (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      {opts.deleted ? (
        <div className="max-w-[85%] sm:max-w-[72%] rounded-2xl border border-dashed border-black/20 px-4 py-2.5 text-[14px] italic text-black/50">
          Повідомлення видалено
        </div>
      ) : (
        <div
          className={`max-w-[85%] sm:max-w-[72%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap break-words ${
            mine ? "rounded-br-md bg-gradient-to-br from-[#5b6ff2] to-[#7c5cf0] text-white" : "rounded-bl-md bg-white text-[#1d2240] ring-1 ring-[#ebe8ff]"
          }`}
        >
          {body}
        </div>
      )}
      <div className="mt-1 flex items-center gap-3 px-1 text-[12px] text-black/45">
        {at && <span>{formatClock(at)}</span>}
        {mine && opts.id && !opts.deleted && (
          <button
            onClick={() => setConfirm({ kind: "message", id: opts.id! })}
            aria-label="Видалити повідомлення"
            className="py-3.5 -my-3.5 hover:text-rose-700 focus-visible:text-rose-700"
          >
            Видалити
          </button>
        )}
      </div>
    </div>
  );

  const messages = selected?.real
    ? thread.map((m) => ({ id: m.id, body: m.body, mine: m.senderId === myId, at: m.createdAt as string | null, deleted: !!m.deleted, real: true }))
    : selected
    ? [
        { id: "demo-first", body: selected.preview, mine: false, at: null as string | null, deleted: false, real: false },
        ...(sentDemo[selected.id] ?? []).map((t, i) => ({ id: `d${i}`, body: t, mine: true, at: null as string | null, deleted: false, real: false })),
      ]
    : [];

  const authorPageId = selected ? selected.real?.otherId ?? selected.profileId ?? null : null;
  const ARCHIVE_AFTER_MS = 183 * 24 * 60 * 60 * 1000; // no new messages for about 6 months
  const isArchived = (c: { date: string }) => {
    const t = new Date(c.date).getTime();
    return Number.isFinite(t) && Date.now() - t > ARCHIVE_AFTER_MS;
  };
  const q = listQuery.trim().toLowerCase();
  const visibleConversations = conversations
    .filter((c) => (listFilter === "archive" ? isArchived(c) : !isArchived(c)))
    .filter((c) => listFilter !== "unread" || isUnread(c.id, c.unread))
    .filter((c) => !q || `${c.authorName} ${c.contentTitle ?? ""} ${c.preview}`.toLowerCase().includes(q));
  const unreadTotal = conversations.filter((c) => !isArchived(c) && isUnread(c.id, c.unread)).length;
  const archivedTotal = conversations.filter(isArchived).length;
  const hiddenCount = visibleConversations.length - listShown;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-bold leading-tight text-[#12172b]">Повідомлення</h1>
          <p className="mt-1 text-[15px] text-black/55">Спілкування з авторами програм, гайдів і медитацій.</p>
        </div>
        <details className="group relative">
          <summary className="flex min-h-[40px] cursor-pointer list-none items-center gap-2 rounded-2xl bg-[#eef0fd] px-3.5 text-[13px] font-semibold text-[#4338ca] ring-1 ring-[#4338ca]/20">
            <Icon name="shield" size={15} /> Правила спілкування
          </summary>
          <div className="absolute right-0 z-20 mt-2 w-[min(90vw,380px)] max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:w-auto rounded-2xl bg-white p-4 text-[13px] leading-relaxed text-[#2d2a5c] shadow-[0_18px_40px_-16px_rgba(70,40,170,0.45)] ring-1 ring-[#ebe8ff]">
            Sensoria лишається посередником у спілкуванні. Обмінюватися телефоном, месенджерами, e-mail чи посиланнями, а також пропонувати оплату чи записи в обхід платформи заборонено для обох сторін: такі повідомлення не надсилаються. Не передавайте особисті чи платіжні дані.
          </div>
        </details>
      </div>

      <div
        ref={panelRef}
        className="grid grid-rows-[minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] rounded-[26px] bg-white shadow-[0_10px_30px_-14px_rgba(60,60,140,0.28)] ring-1 ring-[#ebe8ff] overflow-hidden h-[calc(100dvh-170px)] min-h-[480px] scroll-mt-3 lg:h-[700px]"
      >
        {/* LIST */}
        <div className={`min-h-0 flex-col lg:border-r border-[#efeafd] ${threadOpen ? "hidden lg:flex" : "flex"}`}>
          <div className="flex flex-col gap-2.5 border-b border-[#efeafd] p-4">
            <label className="relative block">
              <span className="sr-only">Пошук у повідомленнях</span>
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40"><Icon name="search" size={16} /></span>
              <input
                value={listQuery}
                onChange={(e) => setListQuery(e.target.value)}
                placeholder="Пошук за ім’ям чи текстом"
                className="min-h-[42px] w-full rounded-2xl bg-[#faf9ff] pl-10 pr-4 text-[14px] ring-1 ring-[#ebe8ff] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#7c5cf0]"
              />
            </label>
            <div className="flex gap-2" role="group" aria-label="Які діалоги показати">
              {(["all", "unread", "archive"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setListFilter(f)}
                  aria-pressed={listFilter === f}
                  className={`inline-flex min-h-[34px] items-center rounded-full px-3.5 text-[13px] font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0] ${listFilter === f ? "bg-[#eef0fd] text-[#4338ca] ring-1 ring-[#4338ca]/35" : "bg-white text-[#1d2240] ring-1 ring-[#ebe8ff] hover:bg-[#faf9ff]"}`}
                >
                  {f === "all" ? "Усі" : f === "unread" ? "Непрочитані" : "Архів"}
                  {f === "unread" && unreadTotal > 0 && <span className="ml-1.5 rounded-full bg-[#4338ca] px-1.5 text-[12px] text-white">{unreadTotal}</span>}
                  {f === "archive" && archivedTotal > 0 && <span className="ml-1.5 text-[12px] text-black/45">{archivedTotal}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="sensoria-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
          {listState === "loading" && conversations.length === 0 && (
            <div className="p-4 flex flex-col gap-4" aria-busy="true" aria-label="Завантаження діалогів">
              {[0, 1, 2].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-3 w-1/2 rounded bg-[#e7e3fb]" />
                  <div className="h-2.5 w-1/3 rounded bg-[#efecfc] mt-2" />
                  <div className="h-2.5 w-4/5 rounded bg-[#efecfc] mt-2" />
                </div>
              ))}
            </div>
          )}
          {listState === "error" && (
            <div className="px-4 py-3 text-[12px] text-black/60 border-b border-black/5" role="alert">
              Не вдалося завантажити всі діалоги.{" "}
              <button onClick={loadList} className="underline font-medium text-black/70">
                Спробувати ще раз
              </button>
            </div>
          )}
          {listState !== "loading" && conversations.length > 0 && visibleConversations.length === 0 && (
            <p className="px-6 py-12 text-center text-[14px] text-black/55">
              {q ? "Нічого не знайдено." : listFilter === "archive" ? "В архіві порожньо. Сюди потрапляють переписки, у яких 6 місяців не було нових повідомлень." : listFilter === "unread" ? "Непрочитаних повідомлень немає." : "Тут поки порожньо."}
            </p>
          )}
          {listState !== "loading" && conversations.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="mail" size={24} /></span>
              <div className="text-[14px] font-medium mt-3">Повідомлень поки немає</div>
              <p className="text-[12px] text-black/60 mt-1 leading-relaxed max-w-[220px]">
                Ви можете звернутися до авторів щодо їхніх програм, гайдів і медитацій.
              </p>
            </div>
          )}
            {visibleConversations.slice(0, listShown).map((c) => {
              const unread = isUnread(c.id, c.unread);
              const active = selectedId === c.id;
              return (
                  <button
                    key={c.id}
                    onClick={() => selectConversation(c)}
                    aria-current={active ? "true" : undefined}
                    className={`flex min-h-[104px] w-full flex-[0_0_25%] items-center gap-3 px-4 py-3.5 text-left border-b border-[#f3f1fb] transition focus:outline-none focus-visible:bg-[#f6f4ff] ${
                      active ? "bg-[#eef0fd]" : "hover:bg-[#faf9ff]"
                    }`}
                  >
                    <AuthorMark name={c.authorName} url={c.authorAvatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className={`flex min-w-0 items-center gap-1.5 truncate text-[14px] ${unread ? "font-bold text-[#12172b]" : "font-semibold text-[#1d2240]"}`}>
                          <span className="truncate">{c.authorName}</span>
                          {!c.real && <span className="shrink-0 rounded-full bg-[#f6f4ff] px-1.5 text-[12px] font-semibold text-[#6d5bd0]">демо</span>}
                        </span>
                        <span className="shrink-0 text-[12px] text-black/45">{formatListDate(c.date)}</span>
                      </span>
                      {(c.contentTitle || c.contentUnavailable) && (
                        <span className="mt-0.5 block truncate text-[12px] font-medium text-[#6d5bd0]">{c.contentTitle ?? "Матеріал більше недоступний"}</span>
                      )}
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className={`min-w-0 flex-1 truncate text-[13px] ${unread ? "text-[#2d2a5c]" : "text-black/55"}`}>{singleLine(c.preview)}</span>
                        {unread && <span role="img" aria-label="Непрочитане" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#4338ca]" />}
                      </span>
                    </span>
                  </button>
              );
            })}
          </div>
          {hiddenCount > 0 && (
            <div className="border-t border-[#efeafd] px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setListShown((n) => n + 4)}
                className="flex h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-[#f1eeff] text-[13px] font-semibold text-[#5b4bd0] hover:bg-[#e7e1ff]"
              >
                Показати ще ({Math.min(4, hiddenCount)}) <span aria-hidden="true">↓</span>
              </button>
              <div aria-hidden="true" className="mt-1.5 h-[16px]" />
            </div>
          )}
        </div>

        {/* CONVERSATION */}
        <div className={`min-h-0 min-w-0 flex-col ${threadOpen ? "flex" : "hidden lg:flex"}`}>
          {selected ? (
            <>
              <div className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-[#efeafd]">
                <button
                  onClick={() => setThreadOpen(false)}
                  aria-label="Назад до діалогів"
                  className="lg:hidden -ml-2 w-11 h-11 rounded-full hover:bg-[#f6f4ff] flex items-center justify-center text-black/60"
                >
                  <Icon name="chevron" size={18} className="rotate-90" />
                </button>
                {/* avatar, name and «Переглянути профіль» open the author's page */}
                {authorPageId ? (
                  <button type="button" onClick={() => openAuthorProfile(authorPageId)} aria-label={`Сторінка автора ${selected.authorName}`} className="shrink-0 rounded-full transition hover:opacity-85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cf0]">
                    <AuthorMark name={selected.authorName} url={selected.authorAvatarUrl} />
                  </button>
                ) : (
                  <AuthorMark name={selected.authorName} url={selected.authorAvatarUrl} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {authorPageId ? (
                      <button type="button" onClick={() => openAuthorProfile(authorPageId)} className="truncate text-left text-[16px] font-semibold text-[#12172b] hover:text-[#4338ca]">{selected.authorName}</button>
                    ) : (
                      <span className="truncate text-[16px] font-semibold text-[#12172b]">{selected.authorName}</span>
                    )}
                    {selected.real && authorDetails?.verified && (
                      <span title="Верифікований автор" className="shrink-0 text-[12px] text-[#4338ca]">✓</span>
                    )}
                    <span className="shrink-0 rounded-full bg-[#f1eeff] px-2 py-0.5 text-[12px] font-semibold text-[#6d5bd0]">Автор</span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
                    {selected.contentTitle && <span className="truncate font-medium text-[#6d5bd0]">{selected.contentTitle}</span>}
                    {authorPageId && (
                      <>
                        {selected.contentTitle && <span aria-hidden="true" className="text-black/30">·</span>}
                        <button type="button" onClick={() => openAuthorProfile(authorPageId)} className="shrink-0 font-medium text-[#4338ca] hover:underline">
                          Переглянути профіль
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {(
                  <button
                    type="button"
                    onClick={() => setConfirm({ kind: "conversation" })}
                    className="shrink-0 rounded-xl px-3 py-2 text-[13px] font-medium text-black/55 transition hover:bg-rose-50 hover:text-rose-700"
                  >
                    Видалити переписку
                  </button>
                )}
                {selected.real && (
                  <div className="relative shrink-0" data-msg-menu>
                    <button
                      onClick={() => setMenuOpen((v) => !v)}
                      aria-label="Дії з діалогом"
                      aria-expanded={menuOpen}
                      className="w-11 h-11 rounded-full hover:bg-[#f6f4ff] flex items-center justify-center text-black/60 text-xl transition"
                    >
                      ⋯
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-52 rounded-2xl bg-white p-1.5 ring-1 ring-[#ebe8ff] shadow-[0_18px_40px_-12px_rgba(30,41,90,0.35)] z-10">
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            setReportOpen(true);
                          }}
                          className="w-full text-left rounded-xl px-3 py-2.5 text-[14px] font-medium text-rose-700 hover:bg-rose-50 transition"
                        >
                          Поскаржитися
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Content context: quiet reference row, not a card. */}
              {(selected.contentTitle || selected.contentUnavailable) && (
                <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5 bg-[#faf9ff] border-b border-[#efeafd]">
                  <Icon
                    name={selected.contentKind ?? "program"}
                    size={16}
                    className="text-black/60 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    {selected.contentUnavailable ? (
                      <div className="text-[12px] text-black/60">Матеріал більше недоступний</div>
                    ) : (
                      <>
                        <div className="text-[12px] font-medium tracking-wide uppercase text-black/70 truncate">
                          {selected.contentTitle}
                        </div>
                        <div className="text-[12px] text-black/60">
                          {selected.contentKind ? CONTENT_KIND_LABEL[selected.contentKind] : ""}
                        </div>
                      </>
                    )}
                  </div>
                  {canOpen(selected) && (
                    <button
                      onClick={() => openContent(selected)}
                      className="text-[12px] font-medium text-[#4338ca] hover:underline shrink-0"
                    >
                      Відкрити →
                    </button>
                  )}
                </div>
              )}

              {/* Report form and messages share one scroll area, so opening the
                  form never squeezes the conversation out of view. */}
              <div ref={scrollerRef} className="sensoria-scroll flex-1 min-h-0 overflow-y-auto bg-[#fbfaff]">
              {reportOpen && (
                <div className="mx-4 sm:mx-6 mt-3 p-4 rounded-2xl bg-white ring-1 ring-[#ebe8ff]">
                  <div className="text-[14px] font-medium mb-3">На що поскаржитися?</div>
                  <div className="flex flex-col gap-2 mb-3">
                    {REPORT_REASONS.map((r) => (
                      <label key={r} className="flex items-center gap-2 text-[14px] cursor-pointer">
                        <input
                          type="radio"
                          name="report-reason"
                          checked={reportReason === r}
                          onChange={() => setReportReason(r)}
                        />
                        {REPORT_REASON_LABELS[r]}
                      </label>
                    ))}
                  </div>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    placeholder="Додаткові деталі (необов'язково)"
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-[#e3def9] text-[14px] focus:outline-none focus:border-black/30 resize-none mb-3"
                  />
                  {reportError && <div className="text-[12px] text-red-500 mb-2">{reportError}</div>}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={submitReportClick}
                      disabled={reportSubmitting}
                      className="min-h-[40px] px-4 rounded-xl bg-rose-600 text-white text-[14px] font-semibold hover:bg-rose-700 transition disabled:opacity-50"
                    >
                      {reportSubmitting ? "Надсилаємо…" : "Надіслати скаргу"}
                    </button>
                    <button
                      onClick={() => setReportOpen(false)}
                      className="px-4 py-2 rounded-lg text-[14px] text-black/60 hover:bg-[#f6f4ff] transition"
                    >
                      Скасувати
                    </button>
                  </div>
                </div>
              )}
              {reportSent && (
                <div className="mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-[14px]">
                  Дякуємо, ми розглянемо скаргу.
                </div>
              )}

              {/* Messages */}
              <div className="px-4 sm:px-6 py-5 flex flex-col gap-2" aria-live="polite">
                {threadState === "loading" && (
                  <div className="flex flex-col gap-3 animate-pulse" aria-busy="true">
                    <div className="h-9 w-1/2 rounded-2xl bg-[#ece9fe]" />
                    <div className="h-9 w-2/5 rounded-2xl bg-[#ece9fe] self-end" />
                    <div className="h-9 w-3/5 rounded-2xl bg-[#ece9fe]" />
                  </div>
                )}
                {threadState === "error" && (
                  <div className="text-[14px] text-black/60 text-center py-8" role="alert">
                    Не вдалося завантажити переписку.{" "}
                    <button onClick={() => loadThread()} className="underline font-medium text-black/70">
                      Спробувати ще раз
                    </button>
                  </div>
                )}
                {threadState === "ready" && selected.real && messages.length === 0 && (
                  <div className="text-[14px] text-black/60 text-center py-10 leading-relaxed">
                    Розпочніть розмову з автором. Повідомлення побачить лише {selected.authorName}.
                  </div>
                )}
                {threadState === "ready" &&
                  messages.map((m, i) => {
                    const prev = i > 0 ? messages[i - 1] : null;
                    const showDay = !!m.at && needsDaySeparator(prev?.at ?? null, m.at);
                    return (
                      <div key={m.id} className="flex flex-col gap-2">
                        {showDay && m.at && (
                          <div className="mx-auto my-1 w-fit rounded-full bg-white px-3 py-1 text-[12px] font-medium text-black/50 ring-1 ring-[#efeafd]">{formatDayLabel(m.at)}</div>
                        )}
                        {renderBubble(m.body, m.mine, m.at, { id: m.real && isUuid(m.id) ? m.id : undefined, deleted: m.deleted })}
                      </div>
                    );
                  })}
              </div>
              </div>

              {deleteError && (
                <div role="alert" className="mx-4 sm:mx-6 mb-2 text-[12px] text-red-600">
                  {deleteError}
                </div>
              )}
              {confirm && (
                <ConfirmDialog
                  title={confirm.kind === "conversation" ? "Видалити переписку?" : "Видалити повідомлення?"}
                  text={
                    confirm.kind === "conversation"
                      ? "Переписка зникне лише у вас. Інша людина збереже свою копію."
                      : "Повідомлення зникне в обох. На його місці залишиться позначка «Повідомлення видалено»."
                  }
                  confirmLabel="Видалити"
                  busy={deleteBusy}
                  onConfirm={runDelete}
                  onCancel={() => setConfirm(null)}
                />
              )}

              {/* Composer */}
              <div className="px-4 sm:px-5 py-3 border-t border-[#efeafd]">
                <ChatBanNotice ban={chatBan.ban} onExpire={chatBan.clear} className="mb-2" />
                {notice && (
                  <div
                    role="alert"
                    className={`text-[12px] leading-relaxed mb-2 px-3 py-2 rounded-lg ${
                      notice.type === "warn" ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700"
                    }`}
                  >
                    {notice.message}
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-2xl bg-[#faf9ff] p-1.5 ring-1 ring-[#ebe8ff] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#7c5cf0]">
                  <textarea
                    ref={inputRef}
                    value={draft}
                    rows={1}
                    maxLength={MAX_MESSAGE_LENGTH}
                    enterKeyHint={coarsePointer ? "enter" : "send"}
                    disabled={chatBanActive}
                    aria-label="Повідомлення автору"
                    placeholder="Напишіть повідомлення автору…"
                    onChange={(e) => {
                      const v = e.target.value;
                      setDrafts((prev) => ({ ...prev, [selected.id]: v }));
                      if (notice?.type !== "warn") setNotice(null);
                    }}
                    onKeyDown={(e) => {
                      if (
                        shouldSendOnEnter({
                          key: e.key,
                          shiftKey: e.shiftKey,
                          isComposing: e.nativeEvent.isComposing,
                          coarsePointer,
                        })
                      ) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    className="max-h-32 min-h-[44px] min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-snug focus:outline-none disabled:opacity-50 sm:text-[15px]"
                  />
                  <button
                    onClick={send}
                    disabled={chatBanActive || !canSend(draft, sending)}
                    className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-[#3b6df0] to-[#7c5cf0] px-4 text-[14px] font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {sending ? "Надсилаємо…" : "Надіслати"}
                  </button>
                </div>
                <div className="mt-1.5 px-1 text-[12px] text-black/45 leading-snug">
                  Спілкування залишається в Sensoria. Не передавайте особисті або платіжні дані.{" "}
                  <button
                    onClick={() => setNoticeExpanded((v) => !v)}
                    aria-expanded={noticeExpanded}
                    className="underline hover:text-black/80 py-3.5 -my-3.5"
                  >
                    {noticeExpanded ? "Згорнути" : "Детальніше"}
                  </button>
                  {noticeExpanded && (
                    <span className="block mt-1.5 text-black/60">
                      Обмін контактами (телефон, пошта, месенджери, соцмережі) і домовленості про оплату поза
                      платформою не допускаються для обох сторін. Такі повідомлення не надсилаються.
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f1eeff] text-[#7a68e0]"><Icon name="mail" size={24} /></span>
              <div className="text-[16px] font-medium mt-3">
                {conversations.length ? "Оберіть діалог" : "Тут з'являться ваші розмови"}
              </div>
              <p className="text-[14px] text-black/60 mt-1 max-w-[280px] leading-relaxed">
                Ви можете звернутися до авторів щодо їхніх програм, гайдів і медитацій.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
