import { Icon } from "../ui/Icon";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { authoredContent, messages as messagesData } from "../../data/authorDashboard";
import { guides } from "../../data/guides";
import { meditations } from "../../data/meditations";
import ChatBanNotice from "../ChatBanNotice";
import { chatBanState } from "../../utils/chatBan";
import { useMyChatBan } from "../../lib/chatBan";
import { moderateMessage, recordViolation, PROFANITY_BLOCK_MESSAGE } from "../../utils/contactFilter";
import { useSession } from "../../context/SessionContext";
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
import { formatRelativeTime } from "../../utils/relativeTime";
import { isUuid, needsDaySeparator, formatClock, formatDayLabel, canSend, shouldSendOnEnter, MAX_MESSAGE_LENGTH } from "../../utils/messagesView";
import ConfirmDialog from "./public/ConfirmDialog";

type Notice = { type: "warn" | "block"; message: string };

const CONTACT_BLOCK_MESSAGE =
  "Це повідомлення містить контактні дані або посилання для спілкування поза Sensoria. Щоб захистити вас і зберегти спілкування в межах платформи, ми не можемо його надіслати.";
const CONTACT_WARN_MESSAGE =
  "Це повідомлення виглядає неоднозначно — переконайтесь, що воно не веде до спілкування чи оплати поза Sensoria.";
const CHAT_BANNED_MESSAGE =
  "Не вдалося надіслати: чат для вашого акаунта заблоковано через повторні порушення правил. Деталі — у повідомленні про блокування чату.";
const REPEATED_VIOLATION_MESSAGE =
  "Це вже кілька спроб надіслати заборонену інформацію в цьому діалозі. Спілкування має стосуватись лише курсу, медитації чи гайду.";

// Unified shape the inbox list renders. Demo conversations
// (src/data/authorDashboard.ts) stay exactly as they always were —
// local-only, never persisted, a fixed showcase. Anything actually
// fetched from Supabase carries `real` (the counterpart's id + which
// course, if any) so a reply can be sent and persisted for real.
type ConversationItem = {
  id: string;
  from: string;
  contentTitle: string | null;
  preview: string;
  date: string;
  unread: boolean;
  blocked?: boolean;
  real?: { otherId: string; contentId: string | null };
};

// Same fallback as ParticipantMessages.tsx's toConversationItem — a
// guide/meditation conversation's contentId is never a real `content`
// table row (see lib/contentAuthors.ts), so the title join above always
// comes back null for those; the static catalogs recover a real title
// instead of showing a blank line here (2026-09-09, "Запитати автора").
function toConversationItem(c: RealConversation): ConversationItem {
  const guide = c.contentId ? guides.find((g) => g.id === c.contentId) : undefined;
  const meditation = !guide && c.contentId ? meditations.find((m) => m.id === c.contentId) : undefined;
  return {
    id: `real:${c.otherId}:${c.contentId ?? "general"}`,
    from: c.otherName,
    contentTitle: c.contentTitle ?? guide?.title ?? meditation?.title ?? null,
    preview: c.preview,
    date: c.date,
    unread: c.unread,
    real: { otherId: c.otherId, contentId: c.contentId },
  };
}

type Props = {
  // Reports the live unread count up to AuthorDashboardPage so its
  // top-bar/sidebar badge actually decreases as conversations get
  // read — same fix already applied to ParticipantMessages.tsx, whose
  // badge had this exact bug (frozen at the demo-only count) before.
  onUnreadCountChange?: (count: number) => void;
  // Lifted up so read-state survives leaving and returning to the
  // "Повідомлення" tab (this component unmounts on every tab switch,
  // which used to reset which conversations had been read). Falls back
  // to local state if not provided.
  readIds?: Record<string, boolean>;
  onMarkRead?: (id: string) => void;
  // «Написати» from «Учасники»: open the conversation with this person (a new, empty one if none exists yet).
  // `key` changes on every click, so the same person can be opened again.
  openWith?: { otherId: string; name: string; contentId: string | null; contentTitle: string | null; key: number } | null;
};

export default function AuthorMessages({
  onUnreadCountChange,
  readIds: readIdsProp,
  onMarkRead,
  openWith,
}: Props) {
  const session = useSession();
  const myId = session?.profile.id;
  const chatBan = useMyChatBan(myId);
  // While the chat is banned the reply composer is switched off (the server refuses anyway).
  const chatBanActive = chatBanState(chatBan.ban, Date.now()).active;

  const [realConversations, setRealConversations] = useState<ConversationItem[]>([]);
  useEffect(() => {
    if (!myId) return;
    fetchConversations(myId).then((cs) => setRealConversations(cs.map(toConversationItem)));
  }, [myId]);

  const demoConversations: ConversationItem[] = messagesData.map((m) => ({
    id: m.id,
    from: m.from,
    contentTitle: m.contentTitle ?? null,
    preview: m.preview,
    date: m.date,
    unread: m.unread,
    blocked: m.blocked,
  }));

  // Real conversations (someone actually wrote in) surface first —
  // the demo showcase stays reachable below, same "mix demo + real"
  // convention already used for the content list.
  // demo conversations are a local showcase: «deleting» one just hides it
  const [hiddenDemo, setHiddenDemo] = useState<Record<string, boolean>>({});
  // a conversation opened from «Учасники» that has no messages yet
  const [draftConversation, setDraftConversation] = useState<ConversationItem | null>(null);
  const realWithDraft = draftConversation && !realConversations.some((c) => c.id === draftConversation.id) ? [draftConversation, ...realConversations] : realConversations;
  const conversations = [...realWithDraft, ...demoConversations.filter((c) => !hiddenDemo[c.id])];

  const [localReadIds, setLocalReadIds] = useState<Record<string, boolean>>({});
  const readIds = readIdsProp ?? localReadIds;
  const markRead = (id: string) => {
    if (onMarkRead) onMarkRead(id);
    else setLocalReadIds((prev) => ({ ...prev, [id]: true }));
  };
  const [selectedId, setSelectedId] = useState<string | null>(
    demoConversations[0]?.id ?? null
  );
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sentReplies, setSentReplies] = useState<Record<string, string[]>>({});
  const [realThread, setRealThread] = useState<ThreadMessage[]>([]);
  const [replyNotice, setReplyNotice] = useState<Notice | null>(null);
  const [sending, setSending] = useState(false);
  // narrow screens: list OR thread, like the participant cabinet
  const [threadOpen, setThreadOpen] = useState(false);
  const [coarsePointer] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // delete a message of mine / the whole conversation for me
  const [confirm, setConfirm] = useState<{ kind: "conversation" } | { kind: "message"; id: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [broadcastAudience, setBroadcastAudience] = useState("all");
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSent, setBroadcastSent] = useState(false);
  const [broadcastNotice, setBroadcastNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (!openWith) return;
    const id = `real:${openWith.otherId}:${openWith.contentId ?? "general"}`;
    setDraftConversation({ id, from: openWith.name, contentTitle: openWith.contentTitle, preview: "Нова розмова", date: new Date().toISOString(), unread: false, real: { otherId: openWith.otherId, contentId: openWith.contentId } });
    setSelectedId(id);
    setThreadOpen(true);
  }, [openWith]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected?.real || !myId) {
      setRealThread([]);
      return;
    }
    let cancelled = false;
    fetchThread(myId, selected.real.otherId, selected.real.contentId).then((t) => {
      if (!cancelled) setRealThread(t);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, myId]);

  const runDelete = async () => {
    if (!confirm || !selected) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      if (!selected.real) {
        setHiddenDemo((h) => ({ ...h, [selected.id]: true }));
        setSelectedId(null);
      } else if (myId) {
        if (confirm.kind === "message") {
          await deleteMessage(confirm.id);
          setRealThread(await fetchThread(myId, selected.real.otherId, selected.real.contentId));
          fetchConversations(myId).then((cs) => setRealConversations(cs.map(toConversationItem)));
        } else {
          await deleteConversation(selected.real.otherId, selected.real.contentId);
          setRealConversations((l) => l.filter((c) => c.id !== selected.id));
          setSelectedId(null);
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

  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [selectedId, realThread.length, threadOpen, sentReplies]);

  const isUnread = (id: string, original: boolean) =>
    readIds[id] !== undefined ? !readIds[id] : original;

  // Recomputed whenever the conversation list or read-state changes,
  // and pushed up to the dashboard shell so its badge stays accurate
  // instead of frozen at the demo-only value computed on first mount.
  useEffect(() => {
    if (!onUnreadCountChange) return;
    const count = conversations.filter((c) => isUnread(c.id, c.unread)).length;
    onUnreadCountChange(count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations.map((c) => c.id).join(","), readIds, onUnreadCountChange]);

  const selectConversation = (item: ConversationItem) => {
    setSelectedId(item.id);
    setThreadOpen(true);
    markRead(item.id);
    setReplyNotice(null);
    if (item.real && myId) {
      markThreadRead(myId, item.real.otherId, item.real.contentId);
    }
  };

  const sendReply = async () => {
    if (!selected) return;
    const text = replyDrafts[selected.id]?.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text || sending) return;

    if (selected.real && myId) {
      // Real conversation — moderation now happens server-side,
      // authoritatively (Phase 2). The client no longer decides
      // ALLOW/WARN/BLOCK itself, only reacts to what the server says.
      setSending(true);
      setReplyNotice(null);
      try {
        const result = await sendRealMessage({
          recipientId: selected.real.otherId,
          contentId: selected.real.contentId,
          body: text,
        });
        if (!result.delivered) {
          chatBan.applyResult(result);
          setReplyNotice({
            type: "block",
            message: result.chatBanned ? CHAT_BANNED_MESSAGE : result.profanity ? PROFANITY_BLOCK_MESSAGE : result.escalated ? REPEATED_VIOLATION_MESSAGE : CONTACT_BLOCK_MESSAGE,
          });
          return;
        }
        if (result.action === "WARN") {
          setReplyNotice({ type: "warn", message: CONTACT_WARN_MESSAGE });
        }
        const thread = await fetchThread(myId, selected.real.otherId, selected.real.contentId);
        setRealThread(thread);
        setReplyDrafts((prev) => ({ ...prev, [selected.id]: "" }));
      } catch (e) {
        setReplyNotice({
          type: "block",
          message: e instanceof Error ? e.message : "Не вдалося надіслати повідомлення.",
        });
      } finally {
        setSending(false);
      }
      return;
    }

    // Demo conversation — local-only echo, never persisted anywhere,
    // so there's no server to round-trip to; the shared client-side
    // pipeline still applies here exactly as it always did.
    const result = moderateMessage(text);
    if (result.action === "BLOCK") {
      const violations = recordViolation(selected.id);
      setReplyNotice({
        type: "block",
        message: violations >= 3 ? REPEATED_VIOLATION_MESSAGE : result.categories.includes("PROFANITY") ? PROFANITY_BLOCK_MESSAGE : CONTACT_BLOCK_MESSAGE,
      });
      return;
    }
    setReplyNotice(
      result.action === "WARN" ? { type: "warn", message: CONTACT_WARN_MESSAGE } : null
    );
    setSentReplies((prev) => ({
      ...prev,
      [selected.id]: [...(prev[selected.id] ?? []), text],
    }));
    setReplyDrafts((prev) => ({ ...prev, [selected.id]: "" }));
  };

  const sendBroadcast = () => {
    if (!broadcastText.trim()) return;

    const result = moderateMessage(broadcastText);

    if (result.action === "BLOCK") {
      const violations = recordViolation("broadcast");
      setBroadcastNotice({
        type: "block",
        message: violations >= 3 ? REPEATED_VIOLATION_MESSAGE : result.categories.includes("PROFANITY") ? PROFANITY_BLOCK_MESSAGE : CONTACT_BLOCK_MESSAGE,
      });
      return;
    }

    setBroadcastNotice(
      result.action === "WARN" ? { type: "warn", message: CONTACT_WARN_MESSAGE } : null
    );
    setBroadcastSent(true);
    setBroadcastText("");
    setTimeout(() => setBroadcastSent(false), 3000);
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Повідомлення</h1>
        <p className="text-black/60 mt-1">Спілкування з учасниками.</p>
      </div>

      {/* POLICY NOTICE */}
      <div className="flex items-start gap-3 px-5 py-4 rounded-xl bg-[#eef2ff] text-[#4338ca] text-[14px]">
        <Icon name="shield" size={18} />
        <div>
          Sensoria лишається посередником у спілкуванні з учасниками — обмін
          особистими контактами (телефон, месенджери тощо) та пропозиції
          купити курс чи записатися напряму в обхід платформи заборонені
          для обох сторін.
        </div>
      </div>

      {/* INBOX */}
      <div className="grid grid-rows-[minmax(0,1fr)] lg:grid-cols-[320px_1fr] rounded-2xl bg-white border border-black/5 overflow-hidden h-[calc(100dvh-96px)] min-h-[440px] lg:h-[500px]">
        <div className={`min-h-0 overflow-y-auto lg:border-r border-black/5 ${threadOpen ? "hidden lg:block" : "block"}`}>
          {conversations.length === 0 && (
            <div className="px-6 py-12 text-center text-[14px] text-black/60">Повідомлень поки немає</div>
          )}
          {conversations.map((m) => {
            const unread = isUnread(m.id, m.unread);
            return (
              <button
                key={m.id}
                onClick={() => selectConversation(m)}
                aria-current={selectedId === m.id ? "true" : undefined}
                className={`w-full text-left px-5 py-4 border-b border-black/5 border-l-2 transition focus:outline-none focus-visible:bg-black/[0.03] ${
                  selectedId === m.id ? "bg-[#f6f8ff] border-l-[#4338ca]" : "border-l-transparent hover:bg-black/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[14px] truncate ${unread ? "font-semibold" : "font-medium"}`}
                  >
                    {m.from}
                  </span>
                  {unread && <span role="img" aria-label="Непрочитане" className="w-2 h-2 rounded-full bg-[#4338ca] shrink-0" />}
                </div>
                {m.contentTitle && (
                  <div className="text-[12px] text-black/60 mt-0.5">{m.contentTitle}</div>
                )}
                <div
                  className={`text-[12px] mt-1 truncate ${
                    m.blocked ? "text-amber-800 italic" : "text-black/60"
                  }`}
                >
                  {m.blocked && <Icon name="shield" size={13} className="inline-block align-[-2px] mr-1" />}
                  {m.preview}
                </div>
                <div className="text-[12px] text-black/60 mt-1">{formatRelativeTime(m.date)}</div>
              </button>
            );
          })}
        </div>

        {/* THREAD */}
        <div className={`min-h-0 min-w-0 p-4 sm:p-6 flex-col ${threadOpen ? "flex" : "hidden lg:flex"}`}>
          {selected ? (
            <>
              <div className="pb-4 border-b border-black/5 flex items-start gap-2">
                <button
                  onClick={() => setThreadOpen(false)}
                  aria-label="Назад до діалогів"
                  className="lg:hidden -ml-2 -mt-1.5 w-11 h-11 shrink-0 rounded-full hover:bg-black/5 flex items-center justify-center text-black/60"
                >
                  <Icon name="chevron" size={18} className="rotate-90" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-[16px]">{selected.from}</div>
                  {selected.contentTitle && (
                    <div className="text-[12px] text-black/60 mt-0.5">
                      {selected.contentTitle}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setConfirm({ kind: "conversation" })}
                  className="shrink-0 min-h-[44px] px-3 -mt-2.5 rounded-lg text-[14px] text-black/60 hover:text-rose-600 hover:bg-rose-50 transition"
                >
                  Видалити переписку
                </button>
              </div>

              <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 py-5" aria-live="polite">
                {selected.real ? (
                  realThread.map((msg, i) => {
                    const mine = msg.senderId === myId;
                    const showDay = needsDaySeparator(i > 0 ? realThread[i - 1].createdAt : null, msg.createdAt);
                    return (
                      <div key={msg.id} className="flex flex-col gap-3">
                        {showDay && <div className="text-center text-[12px] text-black/60 py-1">{formatDayLabel(msg.createdAt)}</div>}
                        <div className={`flex flex-col max-w-[85%] sm:max-w-[75%] ${mine ? "self-end items-end" : "items-start"}`}>
                          {msg.deleted ? (
                            <div className="rounded-2xl px-4 py-3 text-[14px] italic text-black/60 border border-dashed border-black/20">
                              Повідомлення видалено
                            </div>
                          ) : (
                            <div
                              className={`rounded-2xl px-4 py-3 text-[14px] leading-relaxed whitespace-pre-wrap break-words ${
                                mine ? "rounded-br-md bg-[#eef0fb] text-[#1f2347]" : "rounded-bl-md bg-black/[0.05] text-black/85"
                              }`}
                            >
                              {msg.body}
                            </div>
                          )}
                          <div className="flex items-center gap-3 px-1">
                            <span className="text-[12px] text-black/60 mt-1">{formatClock(msg.createdAt)}</span>
                            {mine && !msg.deleted && isUuid(msg.id) && (
                              <button
                                onClick={() => setConfirm({ kind: "message", id: msg.id })}
                                aria-label="Видалити повідомлення"
                                className="mt-1 py-3 -my-3 text-[12px] text-black/60 hover:text-rose-700 focus-visible:text-rose-700"
                              >
                                Видалити
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <>
                    {selected.blocked ? (
                      <div className="max-w-[75%] rounded-2xl rounded-bl-md border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-700 italic flex items-start gap-2">
                        <Icon name="shield" size={15} />
                        <span>{selected.preview}</span>
                      </div>
                    ) : (
                      <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-black/5 px-4 py-3 text-[14px]">
                        {selected.preview}
                      </div>
                    )}
                    {(sentReplies[selected.id] ?? []).map((text, i) => (
                      <div
                        key={i}
                        className="max-w-[75%] self-end rounded-2xl rounded-br-md bg-[#eef0fb] text-[#1f2347] px-4 py-3 text-[14px] break-words whitespace-pre-wrap"
                      >
                        {text}
                      </div>
                    ))}
                  </>
                )}
              </div>

              {deleteError && (
                <div role="alert" className="text-[12px] text-red-600 mb-2">
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

              <div className="flex items-end gap-2 pt-2 border-t border-black/5">
                <textarea
                  value={replyDrafts[selected.id] ?? ""}
                  rows={1}
                  maxLength={MAX_MESSAGE_LENGTH}
                  disabled={chatBanActive}
                  aria-label="Відповідь учаснику"
                  enterKeyHint={coarsePointer ? "enter" : "send"}
                  onChange={(e) => {
                    setReplyDrafts((prev) => ({ ...prev, [selected.id]: e.target.value }));
                    setReplyNotice(null);
                  }}
                  onKeyDown={(e) => {
                    if (shouldSendOnEnter({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing, coarsePointer })) {
                      e.preventDefault();
                      sendReply();
                    }
                  }}
                  placeholder="Напишіть відповідь…"
                  className="flex-1 min-w-0 resize-none max-h-32 px-4 py-2.5 rounded-xl border border-black/15 text-[16px] leading-snug min-h-[44px] focus:outline-none focus:border-black/40"
                />
                <button
                  onClick={sendReply}
                  disabled={chatBanActive || !canSend(replyDrafts[selected.id] ?? "", sending)}
                  className="h-11 px-4 rounded-xl bg-black text-white text-[14px] font-medium hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {sending ? "Надсилаємо…" : "Надіслати"}
                </button>
              </div>
              <ChatBanNotice ban={chatBan.ban} onExpire={chatBan.clear} className="mt-2" />
              {replyNotice && (
                <div
                  role="alert"
                  className={`text-[12px] mt-2 ${
                    replyNotice.type === "block" ? "text-red-700" : "text-amber-800"
                  }`}
                >
                  {replyNotice.message}
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-black/60 text-[14px]">
              Оберіть діалог
            </div>
          )}
        </div>
      </div>

      {/* BROADCAST */}
      <div className="rounded-2xl bg-white border border-black/5 p-6">
        <h2 className="text-[17px] font-semibold mb-1">Розсилка учасникам</h2>
        <p className="text-[14px] text-black/60 mb-4">
          Наприклад, анонс нового курсу чи оновлення матеріалів. Скоро: функція ще в розробці, повідомлення поки не надсилаються.
        </p>

        <div className="flex flex-col gap-3">
          <select
            value={broadcastAudience}
            onChange={(e) => setBroadcastAudience(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-black/10 text-[14px] bg-white focus:outline-none focus:border-black/30 w-fit"
          >
            <option value="all">Усі мої учасники</option>
            {authoredContent.map((c) => (
              <option key={c.id} value={c.id}>
                Учасники «{c.title}»
              </option>
            ))}
          </select>

          <textarea
            value={broadcastText}
            onChange={(e) => {
              setBroadcastText(e.target.value);
              setBroadcastNotice(null);
            }}
            rows={3}
            placeholder="Текст повідомлення..."
            className="w-full px-4 py-3 rounded-xl border border-black/10 text-[14px] focus:outline-none focus:border-black/30 resize-none"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={sendBroadcast}
              disabled
              title="Розсилка ще в розробці"
              className="px-5 min-h-[44px] rounded-xl bg-black text-white text-[14px] font-medium w-fit disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Надіслати розсилку
            </button>
            {broadcastSent && (
              <span className="text-[14px] text-emerald-700">Надіслано ✓</span>
            )}
          </div>
          {broadcastNotice && (
            <div
              className={`text-[12px] ${
                broadcastNotice.type === "block" ? "text-red-700" : "text-amber-800"
              }`}
            >
              {broadcastNotice.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
