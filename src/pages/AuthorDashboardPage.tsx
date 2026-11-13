import { useEffect, useState } from "react";
import { touchFinanceActivity } from "../lib/finance";
import { Icon, type IconName } from "../components/ui/Icon";
import { SHOW_AUTHOR_DEMO } from "../utils/demoMode";
import { demoAuthoredContent } from "../data/demoWorld";
import { authoredContent, messages, type AuthoredContent, type ContentStatus, type ContentType } from "../data/authorDashboard";
import { SessionProvider } from "../context/SessionContext";
import { getInitials, type Profile } from "../lib/auth";
import { fetchMyContent, fetchContentMetrics, saveContent, setContentStatus, deleteDraft } from "../lib/content";
import { fetchConversations } from "../lib/messages";
import { loadDemoReadIds, saveDemoReadIds } from "../utils/demoReadStore";
import Avatar from "../components/ui/Avatar";

// Демо-контент Андрія (src/data/authorDashboard.ts) never touches the
// database — it's a fixed showcase, not something a logged-in author
// owns. Anything created via the editor from now on gets a real
// crypto.randomUUID() id, which is how saveContentItem below tells the
// two apart: only ids outside this set get persisted to Supabase.
const DEMO_IDS = new Set(authoredContent.map((c) => c.id));
import AuthorOverview from "../components/author/AuthorOverview";
import AuthorContentList from "../components/author/AuthorContentList";
import LeaveEditorDialog from "../components/author/LeaveEditorDialog";
import AuthorCourseEditor, { type EditorGuard } from "../components/author/AuthorCourseEditor";
import AuthorParticipants from "../components/author/AuthorParticipants";
import AuthorFinance from "../components/author/AuthorFinance";
import AuthorAnalytics from "../components/author/AuthorAnalytics";
import AuthorReviews from "../components/author/AuthorReviews";
import AuthorProfile from "../components/author/AuthorProfile";
import AuthorMessages from "../components/author/AuthorMessages";
import AuthorPromotion from "../components/author/AuthorPromotion";
import AuthorModeration from "../components/author/AuthorModeration";
import AuthorSettings from "../components/author/AuthorSettings";
import AuthorHelp from "../components/author/AuthorHelp";
import FeedHub from "../components/feed/FeedHub";

type SectionKey =
  | "overview"
  | "content"
  | "participants"
  | "finance"
  | "analytics"
  | "reviews"
  | "messages"
  | "posts"
  | "promotion"
  | "profile"
  | "moderation"
  | "settings"
  | "help";

type Props = {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  onBackToSite: () => void;
  onLogout: () => void;
  // Only ever passed when profile.isAdmin is true (see App.tsx) —
  // undefined here means "don't show the button at all," not "show it
  // disabled."
  onOpenAdmin?: () => void;
};

const NAV: { key: SectionKey; label: string; icon: IconName }[] = [
  { key: "overview", label: "Огляд", icon: "home" },
  { key: "content", label: "Контент", icon: "library" },
  { key: "participants", label: "Учасники", icon: "graduation" },
  { key: "finance", label: "Фінанси", icon: "card" },
  { key: "analytics", label: "Аналітика", icon: "chart" },
  { key: "reviews", label: "Відгуки", icon: "star" },
  { key: "messages", label: "Повідомлення", icon: "mail" },
  { key: "posts", label: "Публікації", icon: "note" },
  { key: "promotion", label: "Просування", icon: "megaphone" },
  { key: "profile", label: "Профіль", icon: "idcard" },
  { key: "moderation", label: "Модерація", icon: "shield" },
  { key: "settings", label: "Налаштування", icon: "settings" },
  { key: "help", label: "Допомога", icon: "help" },
];

// The one section that isn't a flat panel — creating/editing a course
// pushes a distinct full editor view on top of the "Контент" section
// rather than being its own nav item, the same way it would in a real
// product (you don't navigate to "editor," you land there from content).
type EditorTarget = { mode: "create"; type?: ContentType } | { mode: "edit"; id: string } | null;

export default function AuthorDashboardPage({
  profile,
  onProfileChange,
  onBackToSite,
  onLogout,
  onOpenAdmin,
}: Props) {
  const [section, setSection] = useState<SectionKey>("overview");
  // «Написати» in «Учасники» → this person's conversation in «Повідомлення»
  const [openChat, setOpenChat] = useState<{ otherId: string; name: string; contentId: string | null; contentTitle: string | null; key: number } | null>(null);
  // Opening the cabinet counts as the author being present (finance: inactivity rule).
  useEffect(() => {
    touchFinanceActivity("login");
  }, []);
  // Every section tab a person has opened this session — once a
  // section is in this set it stays mounted (just hidden via CSS)
  // instead of unmounting on every switch, so switching BACK to an
  // already-visited tab is instant instead of re-fetching everything
  // and showing a loading state again. Per Sasha's explicit call
  // (2026-08-28) that tab switches shouldn't have pauses. Same
  // trade-off as ParticipantDashboardPage's identical mechanism: an
  // already-visited tab's own data isn't re-fetched just because you
  // switched back to it.
  const [visitedSections, setVisitedSections] = useState<Set<SectionKey>>(() => new Set(["overview"]));
  useEffect(() => {
    setVisitedSections((prev) => (prev.has(section) ? prev : new Set(prev).add(section)));
  }, [section]);
  const [editorTarget, setEditorTarget] = useState<EditorTarget>(null);
  // Seeded from the static demo mock, then real content (this author's
  // own rows in Supabase) is fetched in and merged on mount — from
  // then on this one array is the single source of truth for the rest
  // of the session, demo and real items alike.
  const [contentList, setContentList] = useState<AuthoredContent[]>(
    SHOW_AUTHOR_DEMO ? demoAuthoredContent() : []
  );

  const [contentLoading, setContentLoading] = useState(true);
  const [contentLoadFailed, setContentLoadFailed] = useState(false);
  const [contentReload, setContentReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setContentLoading(true);
    setContentLoadFailed(false);
    (async () => {
      try {
        const fetched = await fetchMyContent(profile.id, { strict: true });
        // participants, income and rating come from purchases, progress and reviews (best effort: zeros if unreadable)
        const metrics = await fetchContentMetrics(fetched.map((c) => c.id)).catch(() => null);
        const real = metrics ? fetched.map((c) => ({ ...c, ...(metrics.get(c.id) ?? {}) })) : fetched;
        // the real list replaces what was there (also when it is empty), demo items stay only in demo mode
        if (!cancelled) setContentList((prev) => [...real, ...prev.filter((c) => DEMO_IDS.has(c.id))]);
      } catch {
        if (!cancelled) setContentLoadFailed(true);
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile.id, contentReload]);

  // Archive / restore from the content list: only the status changes, and it is awaited, so the list never shows
  // a state the database refused (e.g. archiving inside the 14-day window after a purchase). Demo items
  // (Андрій's showcase) never get written to Supabase.
  const changeContentStatus = async (item: AuthoredContent, status: ContentStatus) => {
    if (!DEMO_IDS.has(item.id)) await setContentStatus(item.id, status);
    // the database marks anything that was published or archived as "ever published"; mirror it here so the
    // list shows «Знято з публікації» right after a restore, without a reload
    setContentList((prev) => prev.map((c) => (c.id === item.id ? { ...c, status, ...(status === "published" || status === "archived" ? { everPublished: true } : {}) } : c)));
  };

  // Permanent removal of a never-published, never-bought draft (the database checks it again).
  const removeDraft = async (item: AuthoredContent) => {
    await deleteDraft(item.id);
    setContentList((prev) => prev.filter((c) => c.id !== item.id));
  };

  // The editor's explicit "Зберегти"/"Надіслати на модерацію" is a
  // deliberate action the author is waiting on — unlike the
  // fire-and-forget version above, this awaits the real write and lets
  // the editor show an error and stay open if it fails, instead of
  // silently losing the change.
  const saveContentItemAwaited = async (item: AuthoredContent) => {
    setContentList((prev) => {
      const exists = prev.some((c) => c.id === item.id);
      return exists
        ? prev.map((c) => (c.id === item.id ? item : c))
        : [item, ...prev];
    });
    if (!DEMO_IDS.has(item.id)) {
      await saveContent(profile.id, item);
      // The server decides the final status (the first material goes to review,
      // later ones of a trusted author publish at once): show what is stored.
      try {
        const fresh = (await fetchMyContent(profile.id)).find((c) => c.id === item.id);
        if (fresh) setContentList((prev) => prev.map((c) => (c.id === fresh.id ? { ...c, status: fresh.status, saleStatus: fresh.saleStatus, everPublished: fresh.everPublished ?? c.everPublished } : c)));
      } catch {
        /* keep the local copy */
      }
    }
  };

  // Starts from the demo-only count (already-read demo conversations
  // excluded via localStorage — see demoReadStore.ts), then corrected
  // once real conversations are fetched — and kept live afterwards via
  // AuthorMessages' onUnreadCountChange, so reading a conversation
  // actually clears its badge instead of it staying frozen at whatever
  // it was on mount. Same fix already applied to
  // ParticipantDashboardPage.tsx.
  const countUnreadDemo = () => {
    const readIds = loadDemoReadIds();
    return messages.filter((m) =>
      readIds[m.id] !== undefined ? !readIds[m.id] : m.unread
    ).length;
  };
  const [unreadMessages, setUnreadMessages] = useState(countUnreadDemo);
  useEffect(() => {
    fetchConversations(profile.id).then((cs) => {
      const realUnread = cs.filter((c) => c.unread).length;
      setUnreadMessages(countUnreadDemo() + realUnread);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);

  // Lifted out of AuthorMessages so it survives switching away from
  // the "Повідомлення" tab and back — that component unmounts on
  // every tab switch, which used to reset which conversations had
  // been read this session. Seeded from localStorage (demo ids only —
  // see demoReadStore.ts) so it also survives leaving the dashboard
  // entirely and coming back, which plain in-memory state can't.
  const [messageReadIds, setMessageReadIds] = useState<Record<string, boolean>>(
    loadDemoReadIds
  );
  const markMessageRead = (id: string) => {
    setMessageReadIds((prev) => {
      const next = { ...prev, [id]: true };
      saveDemoReadIds(next);
      return next;
    });
  };

  // Leaving the editor with unsaved work asks "save the draft?" first (any way out: another tab, «Назад»,
  // the public site, logout, admin, closing the page).
  const [guard, setGuard] = useState<EditorGuard | null>(null);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const leaveWith = (action: () => void) => {
    if (editorTarget && guard?.dirty) {
      setLeaveError(null);
      setPendingLeave(() => action);
    } else action();
  };
  useEffect(() => {
    if (!editorTarget || !guard?.dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editorTarget, guard?.dirty]);

  const openSection = (key: SectionKey) => {
    leaveWith(() => {
      setSection(key);
      setEditorTarget(null);
    });
  };

  return (
    <SessionProvider value={{ profile, refreshProfile: onProfileChange }}>
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
      {/* TOP BAR — deliberately its own bar, not the public marketing
          Header: this is a logged-in area with a different job (identity,
          quick way back to the public site), not catalog nav. */}
      <div className="border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-6 py-5 flex items-center justify-between">
          <button
            onClick={() => leaveWith(onBackToSite)}
            className="flex items-center gap-2 text-white/80 hover:text-white transition"
          >
            <span className="text-xl">←</span>
            <span className="font-semibold tracking-wide">SENSORIA</span>
            <span className="text-white/40 text-sm ml-1">Кабінет автора</span>
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={() => openSection("messages")}
              className="relative w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-lg"
              aria-label="Повідомлення"
            >
              <Icon name="mail" size={18} />
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-semibold flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>

            <button
              onClick={() => openSection("profile")}
              className="flex items-center gap-3 pl-1 pr-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <Avatar
                avatarUrl={profile.avatarUrl}
                initials={getInitials(profile.name)}
                className="w-8 h-8 text-[13px]"
              />
              <span className="text-sm font-medium">{profile.name}</span>
            </button>

            {onOpenAdmin && (
              <button
                onClick={() => leaveWith(onOpenAdmin)}
                className="text-sm text-white/60 hover:text-white transition"
              >
                Адмін-панель
              </button>
            )}

            <button
              onClick={() => leaveWith(onLogout)}
              className="text-sm text-white/60 hover:text-white transition"
            >
              Вийти
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 pt-8 pb-24 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] gap-8 items-start">
        {/* SIDEBAR */}
        <div className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 p-4">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const isActive = section === item.key && !editorTarget;
              return (
                <button
                  key={item.key}
                  onClick={() => openSection(item.key)}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-2xl text-left text-[14px] font-medium
                    transition
                    ${
                      isActive
                        ? "bg-white text-black"
                        : "text-white/75 hover:bg-white/10 hover:text-white"
                    }
                  `}
                >
                  <Icon name={item.icon} size={18} />
                  <span className="flex-1">{item.label}</span>
                  {item.key === "messages" && unreadMessages > 0 && (
                    <span
                      className={`
                        min-w-[20px] h-5 px-1 rounded-full text-[11px] font-semibold
                        flex items-center justify-center
                        ${isActive ? "bg-[#4338ca] text-white" : "bg-blue-500 text-white"}
                      `}
                    >
                      {unreadMessages}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* CONTENT */}
        <div className="rounded-3xl bg-[#f6f8ff] text-black min-h-[70vh] p-8">
          {editorTarget ? (
            <AuthorCourseEditor
              target={editorTarget}
              content={contentList}
              onSave={async (item, opts) => {
                await saveContentItemAwaited(item);
                if (!opts?.stay) setEditorTarget(null);
              }}
              onCancel={() => leaveWith(() => setEditorTarget(null))}
              onGuardChange={setGuard}
            />
          ) : (
            // Each block below is gated on visitedSections (mount once,
            // keep alive) instead of `section === key` (mount/unmount
            // every switch) — see visitedSections' own comment above.
            // The `hidden` class is what actually shows/hides the
            // active one; `section === key` still decides which is
            // visible, just no longer which exists.
            <>
              {visitedSections.has("overview") && (
                <div className={section === "overview" ? "" : "hidden"}>
                  <AuthorOverview
                    content={contentList}
                    onNavigate={openSection}
                    onCreate={(type) => setEditorTarget({ mode: "create", type })}
                    onEditContent={(id) => setEditorTarget({ mode: "edit", id })}
                    unreadMessages={unreadMessages}
                  />
                </div>
              )}
              {visitedSections.has("content") && (
                <div className={section === "content" ? "" : "hidden"}>
                  <AuthorContentList
                    content={contentList}
                    onCreate={(type) => setEditorTarget({ mode: "create", type })}
                    onEdit={(id) => setEditorTarget({ mode: "edit", id })}
                    onChangeStatus={changeContentStatus}
                    onDeleteDraft={removeDraft}
                    loading={contentLoading}
                    loadFailed={contentLoadFailed}
                    onRetry={() => setContentReload((n) => n + 1)}
                  />
                </div>
              )}
              {visitedSections.has("participants") && (
                <div className={section === "participants" ? "" : "hidden"}>
                  <AuthorParticipants
                    content={contentList}
                    onWrite={(t) => {
                      // a demo participant has nobody real behind it: just open «Повідомлення»
                      if (t.otherId) setOpenChat({ ...t, otherId: t.otherId, key: Date.now() });
                      setVisitedSections((prev) => new Set(prev).add("messages"));
                      openSection("messages");
                    }}
                  />
                </div>
              )}
              {visitedSections.has("finance") && (
                <div className={section === "finance" ? "" : "hidden"}>
                  <AuthorFinance />
                </div>
              )}
              {visitedSections.has("analytics") && (
                <div className={section === "analytics" ? "" : "hidden"}>
                  <AuthorAnalytics content={contentList} />
                </div>
              )}
              {visitedSections.has("reviews") && (
                <div className={section === "reviews" ? "" : "hidden"}>
                  <AuthorReviews content={contentList} />
                </div>
              )}
              {visitedSections.has("messages") && (
                <div className={section === "messages" ? "" : "hidden"}>
                  <AuthorMessages
                    content={contentList}
                    onUnreadCountChange={setUnreadMessages}
                    readIds={messageReadIds}
                    onMarkRead={markMessageRead}
                    openWith={openChat}
                  />
                </div>
              )}
              {visitedSections.has("posts") && (
                <div className={section === "posts" ? "" : "hidden"}>
                  <FeedHub role="author" />
                </div>
              )}
              {visitedSections.has("promotion") && (
                <div className={section === "promotion" ? "" : "hidden"}>
                  <AuthorPromotion />
                </div>
              )}
              {visitedSections.has("profile") && (
                <div className={section === "profile" ? "" : "hidden"}>
                  <AuthorProfile content={contentList} />
                </div>
              )}
              {visitedSections.has("moderation") && (
                <div className={section === "moderation" ? "" : "hidden"}>
                  <AuthorModeration content={contentList} />
                </div>
              )}
              {visitedSections.has("settings") && (
                <div className={section === "settings" ? "" : "hidden"}>
                  <AuthorSettings />
                </div>
              )}
              {visitedSections.has("help") && (
                <div className={section === "help" ? "" : "hidden"}>
                  <AuthorHelp />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    {pendingLeave && guard && (
      <LeaveEditorDialog
        noun={guard.noun}
        published={guard.published}
        busy={leaveBusy}
        canSave={guard.hasTitle}
        error={leaveError}
        onStay={() => setPendingLeave(null)}
        onDiscard={() => {
          const go = pendingLeave;
          setPendingLeave(null);
          setGuard(null);
          go();
        }}
        onSave={async () => {
          const go = pendingLeave;
          setLeaveBusy(true);
          setLeaveError(null);
          try {
            const ok = await guard.save();
            if (ok) {
              setPendingLeave(null);
              setGuard(null);
              go();
            } else {
              // the editor shows the reason (e.g. no title yet) — go back to it
              setPendingLeave(null);
            }
          } finally {
            setLeaveBusy(false);
          }
        }}
      />
    )}
    </div>
    </SessionProvider>
  );
}
