import { useEffect, useState } from "react";
import { hasPendingChat, takePendingOpen } from "../lib/pendingChat";
import { Icon, type IconName } from "../components/ui/Icon";
import { participantMessages, type ContentKind } from "../data/participantDashboard";
import { SessionProvider } from "../context/SessionContext";
import { ProgramParticipationProvider } from "../context/ProgramParticipationContext";
import { getInitials, type Profile } from "../lib/auth";
import { fetchConversations } from "../lib/messages";
import { loadDemoReadIds, saveDemoReadIds } from "../utils/demoReadStore";
import Avatar from "../components/ui/Avatar";
import ParticipantOverview from "../components/participant/ParticipantOverview";
import ParticipantEmotionalProfile from "../components/participant/ParticipantEmotionalProfile";
import ParticipantLearning, { type StatusFilter } from "../components/participant/ParticipantLearning";
import ParticipantMessages from "../components/participant/ParticipantMessages";
import ParticipantReviews from "../components/participant/ParticipantReviews";
import ParticipantReports from "../components/participant/ParticipantReports";
import ParticipantReflections from "../components/participant/ParticipantReflections";
import ParticipantSaved from "../components/participant/ParticipantSaved";
import ParticipantBilling from "../components/participant/ParticipantBilling";
import ParticipantProfile from "../components/participant/ParticipantProfile";
import ParticipantHelp from "../components/participant/ParticipantHelp";
import ProgramExperience from "../components/participant/ProgramExperience";
import MeditationExperience from "../components/participant/MeditationExperience";
import GuideExperience from "../components/participant/GuideExperience";
import type { GuideBlockTarget } from "../data/guideContent";
import FeedHub from "../components/feed/FeedHub";
import MeditationMiniPlayer from "../components/participant/MeditationMiniPlayer";
import { MeditationPlayerProvider, useMeditationPlayer } from "../context/MeditationPlayerContext";

type SectionKey =
  | "overview"
  | "learning"
  | "saved"
  | "reflections"
  | "emotionalProfile"
  | "messages"
  | "posts"
  | "reviews"
  | "reports"
  | "billing"
  | "profile"
  | "help";

type Props = {
  profile: Profile;
  onProfileChange: (profile: Profile) => void;
  onBackToSite: () => void;
  onLogout: () => void;
  // Only ever passed when profile.isAdmin is true (see App.tsx).
  onOpenAdmin?: () => void;
  // Sends the participant back into the assessment funnel to redo the
  // state check-in (App.tsx's `openTest`). Optional so this page still
  // renders sensibly if that wiring is ever missing.
  onRetakeAssessment?: () => void;
  // Passed straight through to ParticipantOverview's recommendation
  // cards — see that component for why these leave the dashboard
  // entirely rather than opening in place.
  onOpenProgram?: (id: string) => void;
  onOpenGuide?: (id: string) => void;
  onOpenMeditation?: (id: string) => void;
  // ProgramExperience's completion "Що далі?" — opens the public
  // catalog pre-filtered to the just-finished program's own category
  // tags (App.tsx's openCatalogWithCategories).
  onSearchSimilar?: (categories: string[]) => void;
  // The Emotional Profile page's "Переглянути всі" per content type
  // (2026-09-11, per Sasha's explicit "з уже виставленими фільтрами під
  // стан" request) — same category deep-link idea as onSearchSimilar,
  // just for all three catalogs and keyed to the assessment result's
  // state tags instead of a finished program's own tags.
  onViewAllPrograms?: (categories: string[]) => void;
  onViewAllMeditations?: (categories: string[]) => void;
  onViewAllGuides?: (categories: string[]) => void;
};

const NAV: { key: SectionKey; label: string; icon: IconName }[] = [
  { key: "overview", label: "Огляд", icon: "home" },
  { key: "learning", label: "Моє навчання", icon: "library" },
  { key: "saved", label: "Збережене", icon: "bookmark" },
  { key: "reflections", label: "Ваші спостереження", icon: "note" },
  { key: "messages", label: "Повідомлення", icon: "mail" },
  { key: "posts", label: "Спільнота", icon: "community" },
  { key: "reviews", label: "Мої відгуки", icon: "star" },
  { key: "reports", label: "Мої скарги", icon: "shield" },
  { key: "billing", label: "Оплати", icon: "card" },
  { key: "profile", label: "Профіль", icon: "idcard" },
  { key: "help", label: "Допомога", icon: "help" },
];

// "Моє навчання" sub-nav — content-type pills that used to live inside
// ParticipantLearning.tsx itself, moved into the sidebar so they read
// as sub-tabs of the parent nav item, not filters buried in the page.
const LEARNING_SUBNAV: { key: ContentKind; label: string; icon: IconName }[] = [
  { key: "program", label: "Програми", icon: "program" },
  { key: "meditation", label: "Медитації", icon: "meditation" },
  { key: "guide", label: "Гайди", icon: "guide" },
];

// The actual meditation audio player (context/MeditationPlayerContext)
// is scoped to this page's own lifetime — created here, torn down if
// the whole dashboard unmounts. That's a deliberate boundary, not an
// oversight: the one thing this must survive is a phone's screen
// locking or switching to another dashboard tab, per Sasha's explicit
// call (2026-08-28) — neither of those unmounts this component. Only
// a genuine "На сайт"/log-out-style exit from the dashboard would stop
// playback, which reads as an intentional exit, not "выход" in the
// sense that request meant.
export default function ParticipantDashboardPage(props: Props) {
  return (
    <MeditationPlayerProvider>
      <ParticipantDashboardPageInner {...props} />
    </MeditationPlayerProvider>
  );
}

function ParticipantDashboardPageInner({
  profile,
  onProfileChange,
  onBackToSite,
  onLogout,
  onOpenAdmin,
  onRetakeAssessment,
  onOpenProgram,
  onOpenGuide,
  onOpenMeditation,
  onSearchSimilar,
  onViewAllPrograms,
  onViewAllMeditations,
  onViewAllGuides,
}: Props) {
  // Only used here to know whether something is currently loaded (for
  // the mini player) — actual playback control happens inside
  // MeditationExperience/MeditationMiniPlayer themselves.
  const meditationPlayer = useMeditationPlayer();
  // Bring the account's meditation history (sessions on other devices) into
  // this device's cache once per login.
  const refreshMeditationHistory = meditationPlayer.refreshSessionHistory;
  useEffect(() => {
    refreshMeditationHistory(profile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id]);
  // A chat requested from an author profile opens straight on "Повідомлення".
  // A material opened from an author's profile that the person already has.
  const [pendingOpen] = useState(() => takePendingOpen());
  const [section, setSection] = useState<SectionKey>(() => (hasPendingChat() ? "messages" : "overview"));
  // Every section tab a person has opened this session — once a
  // section is in this set it stays mounted (just hidden via CSS)
  // instead of unmounting when you switch away, so switching BACK to
  // an already-visited tab is instant instead of re-fetching everything
  // and showing a loading state again. Per Sasha's explicit call
  // (2026-08-28) that tab switches shouldn't have pauses. Trade-off,
  // worth knowing: a tab's own data is only ever fetched once per
  // dashboard visit — if something changes in another tab (e.g.
  // finishing a lesson changes "Огляд"'s stats), an already-visited tab
  // won't pick that up until the whole dashboard remounts (leaving and
  // coming back, or a refresh).
  const [visitedSections, setVisitedSections] = useState<Set<SectionKey>>(() => new Set(["overview"]));
  useEffect(() => {
    setVisitedSections((prev) => (prev.has(section) ? prev : new Set(prev).add(section)));
  }, [section]);
  // Which content type "Моє навчання" is showing — lives here (not
  // inside ParticipantLearning) so the sidebar sub-nav can control it.
  const [learningTab, setLearningTab] = useState<ContentKind>("program");
  // Dashboard → "Моє навчання" deep link (2026-09-11, per Sasha's full
  // redesign spec) — see ParticipantLearning's own focusFilter prop
  // comment for why this carries a token, not just a bare filter value.
  const [learningFocus, setLearningFocus] = useState<{ filter: StatusFilter; token: number } | undefined>(
    undefined
  );
  const goToLearning = (kind: ContentKind, filter: StatusFilter = "all") => {
    setLearningTab(kind);
    setLearningFocus({ filter, token: Date.now() });
    setSection("learning");
  };
  // The real "проходження" player — opened from "Моє навчання" instead
  // of navigating away to the public catalog preview, since content
  // reached from here is already owned/started (see ParticipantLearning's
  // onContinueProgram prop).
  const [continuingProgramId, setContinuingProgramId] = useState<string | null>(pendingOpen?.kind === "program" ? pendingOpen.id : null);
  // Paired with continuingProgramId — set only when opening a program
  // from somewhere that points at one specific lesson (right now just
  // "Ваші спостереження"), so ProgramExperience can deep-link straight
  // into it instead of landing on the overview. Cleared whenever the
  // program itself is closed/changed via openProgramAtItem below, so a
  // later plain "continue" open (no item in mind) never accidentally
  // reuses a stale one.
  const [continuingItemId, setContinuingItemId] = useState<string | null>(null);
  const [continuingAnchor, setContinuingAnchor] = useState<string | null>(null);
  const openProgramAtItem = (programId: string, itemId?: string | null, anchor?: string) => {
    setContinuingProgramId(programId);
    setContinuingItemId(itemId ?? null);
    setContinuingAnchor(anchor ?? null);
  };
  // Same in-dashboard-overlay pattern as continuingProgramId, but for
  // meditations — see MeditationExperience.tsx for why it's a separate,
  // deliberately simpler component rather than reusing ProgramExperience.
  const [continuingMeditationId, setContinuingMeditationId] = useState<string | null>(pendingOpen?.kind === "meditation" ? pendingOpen.id : null);
  // Same overlay pattern once more, but for guides (2026-09-08, per
  // Sasha's explicit call) — see GuideExperience.tsx. As of 2026-10-06
  // that screen is a guide's PDF preview page (the guide itself is the
  // PDF it opens), not a reader of web content.
  const [continuingGuideId, setContinuingGuideId] = useState<string | null>(pendingOpen?.kind === "guide" ? pendingOpen.id : null);
  // Where inside a structured guide to land (a saved fragment / note) — set
  // together with the guide id, cleared on every other way of opening one.
  const [continuingGuideTarget, setContinuingGuideTarget] = useState<GuideBlockTarget | null>(null);
  const openGuideOverlay = (id: string | null, target?: GuideBlockTarget) => {
    setContinuingGuideTarget(target ?? null);
    setContinuingGuideId(id);
  };
  // Bumped every time GuideBlockRenderer records a newly-viewed section
  // (2026-09-09, per Sasha's "Ви переглянули X із Y розділів" spec) —
  // ParticipantLearning's own guide-progress fetch depends on this
  // value, so a change here is what tells an already-mounted "Моє
  // навчання" tab its cached section counts are stale.
  const [guideSectionViewsVersion, setGuideSectionViewsVersion] = useState(0);
  // Bumped when a guide is saved/unsaved from its preview page (2026-10-06)
  // — same idea as guideSectionViewsVersion, for the bookmark: tells the
  // already-mounted "Моє навчання" tab its cached saved-guide ids are stale.
  const [guideSavesVersion, setGuideSavesVersion] = useState(0);

  // Starts from the demo-only count (already-read demo conversations
  // excluded via localStorage — see demoReadStore.ts), then corrected
  // once real conversations are fetched — and kept live afterwards via
  // ParticipantMessages' onUnreadCountChange, so reading a conversation
  // actually clears its badge instead of it staying frozen at whatever
  // it was on mount.
  const countUnreadDemo = () => {
    const readIds = loadDemoReadIds();
    return participantMessages.filter((m) =>
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

  // Lifted out of ParticipantMessages so it survives switching away
  // from the "Повідомлення" tab and back — that component unmounts on
  // every tab switch, which used to reset which conversations had been
  // read this session. Seeded from localStorage (demo ids only — see
  // demoReadStore.ts) so it also survives leaving the dashboard
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

  return (
    <SessionProvider value={{ profile, refreshProfile: onProfileChange }}>
    <ProgramParticipationProvider>
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
      {/* TOP BAR */}
      <div className="border-b border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <button
            onClick={onBackToSite}
            className="flex items-center gap-2 text-white/80 hover:text-white transition"
          >
            <span className="text-xl">←</span>
            <span className="font-semibold tracking-wide">SENSORIA</span>
            <span className="hidden sm:inline text-white/40 text-sm ml-1">Кабінет учасника</span>
          </button>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:gap-4">
            <button
              onClick={() => setSection("messages")}
              className="relative w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 transition flex items-center justify-center text-lg"
              aria-label="Повідомлення"
            >
              <Icon name="mail" size={18} />
              {unreadMessages > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[12px] font-semibold flex items-center justify-center">
                  {unreadMessages}
                </span>
              )}
            </button>

            <button
              onClick={() => setSection("profile")}
              className="flex items-center gap-3 pl-1 pr-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition"
            >
              <Avatar
                avatarUrl={profile.avatarUrl}
                initials={getInitials(profile.name)}
                className="w-8 h-8 text-[14px]"
              />
              <span className="text-sm font-medium max-w-[120px] sm:max-w-none truncate">{profile.name}</span>
            </button>

            {onOpenAdmin && (
              <button
                onClick={onOpenAdmin}
                className="text-sm text-white/60 hover:text-white transition"
              >
                Адмін-панель
              </button>
            )}

            <button
              onClick={onLogout}
              className="text-sm text-white/60 hover:text-white transition"
            >
              Вийти
            </button>
          </div>
        </div>
      </div>

      {/* grid-cols-[260px_minmax(0,1fr)], not the more obvious
          "260px_1fr" — a plain 1fr column has no real upper bound: any
          descendant whose content can't shrink (e.g. a long unbroken
          string) can force this whole track, and with it the entire
          content panel, wider than the viewport instead of wrapping
          inside it. minmax(0, 1fr) caps it at the available space, same
          fix as the "wide white block" report. */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-24 grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[260px_minmax(0,1fr)] gap-6 sm:gap-8 items-start">
        {/* SIDEBAR */}
        <div className="rounded-3xl bg-white/5 backdrop-blur-2xl border border-white/10 p-4">
          <nav className="flex flex-col gap-1">
            {NAV.map((item) => {
              const isActive = section === item.key;
              return (
                <div key={item.key} className="flex flex-col gap-1">
                  <button
                    onClick={() => setSection(item.key)}
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
                          min-w-[20px] h-5 px-1 rounded-full text-[12px] font-semibold
                          flex items-center justify-center
                          ${isActive ? "bg-[#4338ca] text-white" : "bg-blue-500 text-white"}
                        `}
                      >
                        {unreadMessages}
                      </span>
                    )}
                  </button>

                  {/* Підвкладки "Моє навчання" — раніше жили як пілюлі
                      всередині ParticipantLearning.tsx, тепер це
                      під-навігація в сайдбарі, видима, коли розділ
                      активний. */}
                  {item.key === "learning" && isActive && (
                    <div className="flex flex-col gap-1 pl-3">
                      {LEARNING_SUBNAV.map((sub) => {
                        const subActive = learningTab === sub.key;
                        return (
                          <button
                            key={sub.key}
                            onClick={() => setLearningTab(sub.key)}
                            className={`
                              flex items-center gap-2 pl-6 pr-4 py-2 rounded-xl text-left text-[14px] font-medium
                              transition
                              ${
                                subActive
                                  ? "bg-white/15 text-white"
                                  : "text-white/55 hover:bg-white/10 hover:text-white"
                              }
                            `}
                          >
                            <Icon name={sub.icon} size={16} />
                            {sub.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </div>

        {/* CONTENT — a fixed minimum height (same as the author cabinet): the white panel keeps its size when switching
            tabs instead of shrinking and growing with each tab's content. */}
        <div className="rounded-3xl bg-[#f6f8ff] text-black min-h-[70vh] p-4 sm:p-8">
          {/* Every block below is gated on visitedSections (mount once,
              keep alive) instead of `section === key` (mount/unmount
              every switch) — see visitedSections' own comment above.
              The `hidden` class is what actually shows/hides the
              active one; `section === key` still decides which is
              visible, just no longer which exists. */}
          {visitedSections.has("overview") && (
            <div className={section === "overview" ? "" : "hidden"}>
              <ParticipantOverview
                onNavigate={setSection}
                onGoToLearning={goToLearning}
                onRetakeAssessment={onRetakeAssessment}
                onBackToSite={onBackToSite}
                onOpenProgram={onOpenProgram}
                onOpenGuide={onOpenGuide}
                onOpenMeditation={onOpenMeditation}
                onOpenProgramAtItem={openProgramAtItem}
                onContinueMeditation={setContinuingMeditationId}
                onContinueGuide={openGuideOverlay}
                readIds={messageReadIds}
                guideSectionViewsVersion={guideSectionViewsVersion}
              />
            </div>
          )}
          {visitedSections.has("learning") && (
            <div className={section === "learning" ? "" : "hidden"}>
              <ParticipantLearning
                tab={learningTab}
                onOpenProgram={onOpenProgram}
                onOpenGuide={onOpenGuide}
                onOpenMeditation={onOpenMeditation}
                onContinueProgram={(id) => openProgramAtItem(id)}
                onContinueMeditation={setContinuingMeditationId}
                onContinueGuide={openGuideOverlay}
                guideSectionViewsVersion={guideSectionViewsVersion}
                guideSavesVersion={guideSavesVersion}
                focusFilter={learningFocus}
              />
            </div>
          )}
          {visitedSections.has("saved") && (
            <div className={section === "saved" ? "" : "hidden"}>
              <ParticipantSaved
                onNavigate={setSection}
                onOpenProgramAtItem={openProgramAtItem}
                onOpenMeditation={setContinuingMeditationId}
                onContinueGuide={openGuideOverlay}
                onOpenProgram={onOpenProgram}
                onOpenGuide={onOpenGuide}
                onOpenMeditationPage={onOpenMeditation}
                onBackToSite={onBackToSite}
                onViewAllGuides={onViewAllGuides}
                onViewAllMeditations={onViewAllMeditations}
                onViewAllPrograms={onViewAllPrograms}
                active={section === "saved"}
              />
            </div>
          )}
          {visitedSections.has("reflections") && (
            <div className={section === "reflections" ? "" : "hidden"}>
              <ParticipantReflections
                onNavigate={setSection}
                onOpenProgramAtItem={openProgramAtItem}
                onOpenMeditation={setContinuingMeditationId}
                active={section === "reflections"}
              />
            </div>
          )}
          {visitedSections.has("emotionalProfile") && (
            <div className={section === "emotionalProfile" ? "" : "hidden"}>
              <ParticipantEmotionalProfile
                onBack={() => setSection("overview")}
                onRetakeAssessment={onRetakeAssessment}
                onOpenProgram={onOpenProgram}
                onOpenGuide={onOpenGuide}
                onOpenMeditation={onOpenMeditation}
                onViewAllPrograms={onViewAllPrograms}
                onViewAllMeditations={onViewAllMeditations}
                onViewAllGuides={onViewAllGuides}
              />
            </div>
          )}
          {visitedSections.has("posts") && (
            <div className={section === "posts" ? "" : "hidden"}>
              <FeedHub role="participant" />
            </div>
          )}
          {visitedSections.has("messages") && (
            <div className={section === "messages" ? "" : "hidden"}>
              <ParticipantMessages
                onOpenProgram={onOpenProgram}
                onOpenGuide={onOpenGuide}
                onOpenMeditation={onOpenMeditation}
                onUnreadCountChange={setUnreadMessages}
                readIds={messageReadIds}
                onMarkRead={markMessageRead}
              />
            </div>
          )}
          {visitedSections.has("reviews") && (
            <div className={section === "reviews" ? "" : "hidden"}>
              <ParticipantReviews
                active={section === "reviews"}
                onNavigate={setSection}
                onOpenProgram={onOpenProgram}
                onOpenGuide={onOpenGuide}
                onOpenMeditation={onOpenMeditation}
              />
            </div>
          )}
          {visitedSections.has("reports") && (
            <div className={section === "reports" ? "" : "hidden"}>
              <ParticipantReports active={section === "reports"} />
            </div>
          )}
          {visitedSections.has("billing") && (
            <div className={section === "billing" ? "" : "hidden"}>
              <ParticipantBilling
                active={section === "billing"}
                onNavigate={setSection}
                onOpenProgram={onOpenProgram}
                onOpenGuide={onOpenGuide}
                onOpenMeditation={onOpenMeditation}
              />
            </div>
          )}
          {visitedSections.has("profile") && (
            <div className={section === "profile" ? "" : "hidden"}>
              <ParticipantProfile />
            </div>
          )}
          {visitedSections.has("help") && (
            <div className={section === "help" ? "" : "hidden"}>
              <ParticipantHelp />
            </div>
          )}
        </div>
      </div>
    </div>

    {continuingProgramId && (
      <ProgramExperience
        programId={continuingProgramId}
        initialItemId={continuingItemId ?? undefined}
        initialAnchor={continuingAnchor ?? undefined}
        onClose={() => {
          setContinuingProgramId(null);
          setContinuingItemId(null);
        }}
        session={profile}
        onRetakeAssessment={() => {
          setContinuingProgramId(null);
          setContinuingItemId(null);
          onRetakeAssessment?.();
        }}
        onSearchSimilar={(categories) => {
          setContinuingProgramId(null);
          setContinuingItemId(null);
          onSearchSimilar?.(categories);
        }}
        onNavigate={(key) => {
          setContinuingProgramId(null);
          setContinuingItemId(null);
          setSection(key);
        }}
        // "Спробуйте цей гайд далі" (2026-09-09) — same in-dashboard
        // overlay swap as a guide's own cross-links, just the other
        // direction (program → guide instead of guide → program).
        onOpenGuide={(id) => {
          setContinuingProgramId(null);
          setContinuingItemId(null);
          setContinuingGuideId(id);
        }}
        onOpenMeditation={(id) => {
          setContinuingProgramId(null);
          setContinuingItemId(null);
          setContinuingMeditationId(id);
        }}
      />
    )}

    {continuingMeditationId && (
      <MeditationExperience
        meditationId={continuingMeditationId}
        onClose={() => setContinuingMeditationId(null)}
      />
    )}

    {continuingGuideId && (
      <GuideExperience
        guideId={continuingGuideId}
        initialTarget={continuingGuideTarget}
        onClose={() => openGuideOverlay(null)}
        // Cross-links from a guide's own "Interactive experience"
        // content (2026-09-09) — following one swaps the open overlay
        // for the linked experience instead of stacking screens.
        onOpenMeditationLink={(id) => {
          setContinuingGuideId(null);
          setContinuingMeditationId(id);
        }}
        onOpenGuideLink={(id) => openGuideOverlay(id)}
        onOpenProgramLink={(id) => {
          setContinuingGuideId(null);
          setContinuingProgramId(id);
        }}
        onSectionViewed={() => setGuideSectionViewsVersion((v) => v + 1)}
        onSavedChange={() => setGuideSavesVersion((v) => v + 1)}
      />
    )}

    {/* Visible across every tab of the dashboard whenever a meditation
        is loaded but its full screen isn't currently open — audio kept
        playing by MeditationPlayerProvider above regardless of which
        section is showing. Reopens whatever's actually loaded (not
        necessarily continuingMeditationId, which is null right now by
        definition of this branch). */}
    {!continuingMeditationId && meditationPlayer.meditation && (
      <MeditationMiniPlayer onOpen={() => setContinuingMeditationId(meditationPlayer.meditation!.id)} />
    )}
    </ProgramParticipationProvider>
    </SessionProvider>
  );
}
