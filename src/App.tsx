import { lazy, Suspense, useEffect, useRef, useState, type ComponentType } from "react";
import { loadMaterialsFromDb } from "./lib/publicMaterials";
import { useMaterialsVersion } from "./lib/materialsStore";
import "./utils/devPreview"; // reads ?demo= before the router rewrites the URL (dev only)
import { clearLoginReturn, setLoginReturn, takeLoginReturn } from "./utils/loginReturn";
import CartPage from "./components/cart/CartPage";
import { OPEN_CART_EVENT, setCartOwner } from "./lib/cartStore";
import { setPendingChat, setPendingOpen } from "./lib/pendingChat";
import { fetchOwnedKeys, ownedKey } from "./lib/ownedContent";
import { subscribeAuthorProfileRequests, subscribeMaterialRequests } from "./context/AuthorProfileContext";
import Header from "./components/Header";
import Hero from "./components/home/Hero";
import AboutSection from "./components/AboutSection";
import ProgramsSection from "./components/ProgramsSection";
import TestPopup from "./components/TestPopup";
import Footer from "./components/Footer";
import ParallaxBackground from "./components/ParallaxBackground";
import FAQSection from "./components/FAQSection";
import {
  checkAndMarkTabOpen,
  touchSession,
  clearSessionBookkeeping,
  type UserRole,
} from "./utils/session";
import {
  fetchCurrentProfile,
  reconcileOAuthRole,
  recordConsent,
  logoutAccount,
  getMfaStatus,
  type Profile,
} from "./lib/auth";
// Unrelated to utils/session's touchSession (idle/tab-close
// bookkeeping) — this one records the device itself, for "Активні
// сеанси" in Profile/Settings. Named touchDeviceSession specifically
// to avoid confusion with the import above.
import { touchDeviceSession } from "./lib/deviceSessions";
import { fetchPublishedPrograms } from "./lib/publicContent";
import { saveAssessmentResult } from "./lib/assessment";
import funnelStore from "./store/funnelStore";
import { programs as demoPrograms, type Program } from "./data/programs";
import { meditations } from "./data/meditations";
import { guides } from "./data/guides";
import { track } from "./services/analytics";
import { getStateProfile } from "./utils/getStateProfile";
import { SHOW_DEMO } from "./utils/demoMode";
import { pageForPath, pathForPage, type Page } from "./utils/routes";
import { captureReferralFromUrl, claimStoredReferral } from "./lib/referral";

function ProgramPagePlaceholder({
  title,
  onBackToHome,
}: {
  title: string;
  onBackToHome: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center text-white">

      <div className="max-w-2xl text-center">

        <div className="text-white/60 mb-4">
          Ваша програма
        </div>

        <h1 className="text-5xl font-bold mb-6">
          {title}
        </h1>

        <p className="text-white/75 mb-10">
          Програма готова до запуску.
        </p>

        <button
          onClick={onBackToHome}
          className="
            px-8
            py-4
            rounded-2xl
            bg-white
            text-black
          "
        >
          Завершити
        </button>

      </div>

    </div>
  );
}

// Everything that is not the home page loads on demand, so the first visit
// downloads only what the home page needs (dashboards/admin/test/catalogs
// were all in the initial bundle before).
const ResultPage = lazy(() => import("./pages/ResultPage"));
const StateSelectionPage = lazy(() => import("./pages/StateSelectionPage"));
const TestPage = lazy(() => import("./components/test/TestPage"));
const AuthorPublicProfilePage = lazy(() => import("./pages/AuthorPublicProfilePage"));
const ProgramExperience = lazy(() => import("./components/participant/ProgramExperience"));
const ProgramDetailPage = lazy(() => import("./components/programDetail/ProgramDetailPage"));
const ProgramsCatalogPage = lazy(() => import("./components/ProgramsCatalogPage"));
const GuidesCatalogPage = lazy(() => import("./components/GuidesCatalogPage"));
const MeditationsCatalogPage = lazy(() => import("./components/MeditationsCatalogPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const RefundsPage = lazy(() => import("./pages/RefundsPage"));
const AuthorAgreementPage = lazy(() => import("./pages/AuthorAgreementPage"));
const PaymentResultPage = lazy(() => import("./pages/PaymentResultPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const PreparingPage = lazy(() => import("./pages/PreparingPage"));
const LibraryHomePage = lazy(() => import("./pages/LibraryHomePage"));
const AuthorDashboardPage = lazy(() => import("./pages/AuthorDashboardPage"));
const ParticipantDashboardPage = lazy(() => import("./pages/ParticipantDashboardPage"));
const DashboardAuthPage = lazy(() => import("./pages/DashboardAuthPage"));
const AdminDashboardPage = lazy(() => import("./pages/AdminDashboardPage"));
const MfaCodeStep = lazy(() => import("./components/auth/MfaCodeStep"));
const RestoreAccountStep = lazy(() => import("./components/auth/RestoreAccountStep"));

// Preview modals open on top of the current page: a failed/slow chunk must not
// blank the whole screen, so each has its own empty Suspense boundary.
function lazyModal<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Lazy = lazy(load) as unknown as ComponentType<P>;
  return function LazyModal(props: P) {
    return (
      <Suspense fallback={null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
const GuidePreviewModal = lazyModal(() => import("./components/GuidesPreviewModal"));
const MeditationDetailModal = lazyModal(() => import("./components/MeditationDetailModal"));

function AppInner() {

  // The page lives in state; the address bar mirrors it (see utils/routes.ts).
  const initialRoute = typeof window !== "undefined" ? pageForPath(window.location.pathname) : { page: "home" as Page, authorId: null, programId: null };
  const [page, setPage] = useState<Page>(initialRoute.page);

  // Public author profile ("Переглянути профіль"): requested from many
  // places through context/AuthorProfileContext. "Назад" returns to the
  // page it was opened from (a program page opened from the catalog is
  // still reachable through browser history).
  const [authorProfileId, setAuthorProfileId] = useState<string | null>(initialRoute.authorId);

  // Program detail page (/programs/:id): the id lives in the URL.
  const [programDetailId, setProgramDetailId] = useState<string | null>(initialRoute.programId);

  // page -> URL (push only when it actually changes the address)
  useEffect(() => {
    const target = pathForPage(page, page === "program-detail" ? programDetailId : authorProfileId);
    if (window.location.pathname !== target) window.history.pushState(null, "", target);
  }, [page, authorProfileId, programDetailId]);

  // `?ref=<authorId>` from an author's referral link is remembered (30 days, last click wins)
  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  // Back / Forward -> page
  useEffect(() => {
    const onPop = () => {
      const r = pageForPath(window.location.pathname);
      setPage(r.page);
      setAuthorProfileId(r.authorId);
      setProgramDetailId(r.programId);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // Material preview opened from a public author profile.
  const [profilePreview, setProfilePreview] = useState<{ kind: "program" | "guide" | "meditation"; id: string; authorName?: string } | null>(null);
  const openProfileMaterial = async (kind: "program" | "guide" | "meditation", id: string, authorName?: string) => {
    if (session?.role === "participant") {
      try {
        const owned = await fetchOwnedKeys(session.id);
        if (owned.has(ownedKey(kind, id))) {
          setPendingOpen({ kind, id });
          setPage("participant-dashboard");
          window.scrollTo(0, 0);
          return;
        }
      } catch {
        // can't tell → show the public preview
      }
    }
    if (kind === "program") {
      openProgram(id);
      return;
    }
    setProfilePreview({ kind, id, authorName });
  };
  // a material card anywhere (e.g. under a post in «Спільнота») opens the material itself
  const openMaterialRef = useRef(openProfileMaterial);
  openMaterialRef.current = openProfileMaterial;
  useEffect(() => subscribeMaterialRequests((kind, id) => { void openMaterialRef.current(kind, id); }), []);
  const [authorReturnPage, setAuthorReturnPage] = useState<typeof page>("home");
  const pageRef = useRef(page);
  pageRef.current = page;
  useEffect(
    () =>
      subscribeAuthorProfileRequests((id) => {
        if (pageRef.current !== "author-profile") setAuthorReturnPage(pageRef.current);
        setAuthorProfileId(id);
        setPage("author-profile");
        window.scrollTo(0, 0);
      }),
    []
  );

  // undefined = still checking on boot, null = logged out, Profile =
  // logged in. Supabase's own session is checked against the two extra
  // rules in src/utils/session.ts (tab genuinely reopened, idle past
  // the 3-hour mark) before it's trusted — see the effect below.
  const [session, setSession] = useState<Profile | null | undefined>(undefined);

  // a signed-in buyer hands the remembered referral to the server (verified there; the finance function decides the rate)
  useEffect(() => {
    if (session && session.role === "participant") void claimStoredReferral();
  }, [session]);

  // Set when a session already exists on boot (page refresh, or a
  // return from the Google OAuth redirect) but hasn't cleared aal2 for
  // this browser yet — e.g. the person closed the tab mid-MFA-challenge
  // last time. `session` is deliberately kept at null in this case (not
  // the real profile) so nothing else in the app treats them as logged
  // in until the code step below actually passes.
  const [mfaPendingProfile, setMfaPendingProfile] = useState<Profile | null>(null);

  // Same idea, checked right after the MFA gate passes — an existing
  // session for an account that requested deletion within the last 14
  // days (see schema.sql's deletion_requested_at comment). `session`
  // stays null here too, for the same reason.
  const [restorePendingProfile, setRestorePendingProfile] = useState<Profile | null>(null);

  useEffect(() => {
    (async () => {
      // Returning from a Google OAuth redirect (loginWithGoogle in
      // src/lib/auth.ts) carries the role the person meant to sign in
      // as through this query param — strip it from the URL either way
      // so it doesn't linger across refreshes.
      const params = new URLSearchParams(window.location.search);
      const oauthRole = params.get("oauth_role") as UserRole | null;
      const oauthConsent = params.get("oauth_consent");
      if (oauthRole) {
        window.history.replaceState({}, "", window.location.pathname);
      }

      const shouldEvict = checkAndMarkTabOpen();
      if (shouldEvict) {
        await logoutAccount();
        setSession(null);
        return;
      }

      const profile = oauthRole
        ? await reconcileOAuthRole(oauthRole)
        : await fetchCurrentProfile();

      if (oauthConsent) await recordConsent(oauthConsent).catch(() => undefined);

      if (profile) {
        const mfaStatus = await getMfaStatus();
        if (mfaStatus.needsChallenge) {
          setMfaPendingProfile(profile);
          setSession(null);
          return;
        }
        if (profile.deletionRequestedAt) {
          setRestorePendingProfile(profile);
          setSession(null);
          return;
        }
        touchSession();
        touchDeviceSession(profile.id);
        // Only auto-jump into the dashboard when we just landed back
        // from the Google redirect — a normal boot with an existing
        // session still lands on the public home page, same as before.
        if (oauthRole) {
          setPage(profile.role === "author" ? "author-dashboard" : "participant-dashboard");
          window.scrollTo(0, 0);
        }
      }
      setSession(profile);
    })();
  }, []);

  // While a session is active, keep its "last seen" timestamp fresh so
  // idle time is measured from the last moment the tab was actually
  // open — not from the moment the user first logged in.
  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => touchSession(), 60_000);
    return () => clearInterval(id);
  }, [session]);

  // The real "проходження" player, distinct from the ProgramDetailPage
  // preview above — opened via "Продовжити"/"Ваш прогрес" once the
  // participant is actually enrolled, not from browsing the catalog.
  const [continuingProgramId, setContinuingProgramId] = useState<string | null>(null);
  // Lesson to land on when the player opens from the program page's curriculum (the page re-reads
  // progress itself when the player closes, via the "sensoria:progress-changed" event).
  const [continuingItemId, setContinuingItemId] = useState<string | null>(null);
  // Tab of the program page to open on (set when returning there after signing in).
  const [programInitialSection, setProgramInitialSection] = useState<string | null>(null);

  // Set when arriving via "Переглянути відгук" in ParticipantReviews —
  // tells ProgramDetailPage to scroll straight to the reviews block.
  // Reset on close so the next, unrelated open of the same modal
  // doesn't inherit it.
  const [scrollToProgramReviews, setScrollToProgramReviews] = useState(false);

  // Real, published author content (src/lib/publicContent.ts) merged
  // in alongside the static demo catalog — same "mix demo + real"
  // pattern already used for the author's own content list. Fetched
  // once on boot; doesn't depend on the viewer being logged in, since
  // published content is publicly readable.
  const [realPrograms, setRealPrograms] = useState<Program[]>([]);
  // false until the first fetch settles, so a direct /programs/:id visit can
  // tell "still loading" from "not found".
  const [realProgramsLoaded, setRealProgramsLoaded] = useState(false);
  useEffect(() => {
    fetchPublishedPrograms()
      .then(setRealPrograms)
      .catch(() => undefined)
      .finally(() => setRealProgramsLoaded(true));
  }, []);
  // Demo catalog switch: set VITE_SHOW_DEMO_PROGRAMS=false to hide the
  // hand-written demo programs and show only real, published ones.
  const allPrograms = [...(SHOW_DEMO ? demoPrograms : []), ...realPrograms];

  // Carries a pre-selected filter across the page-state transition when
  // the Library home page's "Переглянути всі X →" links open a catalog
  // already narrowed to the user's emotional-state result. Reset to []
  // (meaning "no filter") whenever a link doesn't specify one, so
  // opening the catalog from anywhere else still shows everything.
  const [catalogInitialCategories, setCatalogInitialCategories] = useState<
    string[]
  >([]);
  const [meditationsInitialCategories, setMeditationsInitialCategories] =
    useState<string[]>([]);
  const [guidesInitialCategories, setGuidesInitialCategories] = useState<
    string[]
  >([]);

  // Carries "open this exact item" from a Header search-result click
  // through the page transition — same convention as the
  // *InitialCategories state above, but for a single specific id
  // instead of a filter. Guides/Meditations don't have their own
  // top-level "selected" state the way Programs already does
  // (openProgram, below), so these fill that gap.
  const [guideInitialId, setGuideInitialId] = useState<string | undefined>(
    undefined
  );
  const [meditationInitialId, setMeditationInitialId] = useState<
    string | undefined
  >(undefined);

  const openTest = () => {
  setPage("state-selection");
  window.scrollTo(0, 0);
};

  const openCatalog = () => {
  // Generic nav entry (Header/footer) — no targeted filter, so clear
  // whatever a previous Library-page deep link may have set.
  setCatalogInitialCategories([]);
  setPage("catalog");
  window.scrollTo(0, 0);
  }

  // "Пошукати схожі курси" (ProgramExperience.tsx's "Що далі?", after
  // finishing a program) — same catalogInitialCategories deep-link
  // mechanism as the Library home page's "Переглянути всі X →" links,
  // just filtered to the program's own tags instead of an assessment
  // result.
  const openCatalogWithCategories = (categories: string[]) => {
    setCatalogInitialCategories(categories);
    setPage("catalog");
    window.scrollTo(0, 0);
  };

  const openGuides = () => {
    setGuideInitialId(undefined);
    setGuidesInitialCategories([]);
    setPage("guides");
    window.scrollTo(0, 0);
  };

  const openMeditations = () => {
    // Generic nav entry — no targeted filter, same convention as
    // openCatalog.
    setMeditationsInitialCategories([]);
    setMeditationInitialId(undefined);
    setPage("meditations");
    window.scrollTo(0, 0);
  };

  // "Переглянути всі" from the Emotional Profile page (participant
  // dashboard) — same category deep-link idea as openCatalogWithCategories
  // above, just for Meditations/Guides, so all three content types land
  // on their catalog with the person's real state already selected
  // (2026-09-11, per Sasha's explicit "з уже виставленими фільтрами під
  // стан" request).
  const openMeditationsWithCategories = (categories: string[]) => {
    setMeditationsInitialCategories(categories);
    setMeditationInitialId(undefined);
    setPage("meditations");
    window.scrollTo(0, 0);
  };

  const openGuidesWithCategories = (categories: string[]) => {
    setGuidesInitialCategories(categories);
    setGuideInitialId(undefined);
    setPage("guides");
    window.scrollTo(0, 0);
  };

  // Search-result clicks (Header) — go straight to the specific
  // program/guide/meditation instead of just its general catalog.
  // Every way of opening a program (catalog card, home carousel, search,
  // author profile, dashboards) lands on its own page: /programs/:id.
  const openProgram = (id: string, opts?: { scrollToReviews?: boolean; section?: string | null }) => {
    setScrollToProgramReviews(!!opts?.scrollToReviews);
    setProgramInitialSection(opts?.section ?? null);
    setProgramDetailId(id);
    setPage("program-detail");
    window.scrollTo(0, 0);
  };
  const selectProgramById = openProgram;

  // Cart: opened from the Header icon or the program page (an event, so no prop is threaded through every page).
  const openCart = () => {
    setPage("cart");
    window.scrollTo(0, 0);
  };
  // meditations and guides come from the database; the code copy shows until it arrives (or if it never does)
  useEffect(() => {
    void loadMaterialsFromDb();
  }, [session?.id]);
  useMaterialsVersion(); // re-render the whole app once the lists are updated
  // the cart belongs to whoever is signed in (a guest cart joins the account's on sign-in)
  useEffect(() => {
    if (session !== undefined) setCartOwner(session?.id ?? null);
  }, [session]);
  useEffect(() => {
    window.addEventListener(OPEN_CART_EVENT, openCart);
    return () => window.removeEventListener(OPEN_CART_EVENT, openCart);
  }, []);

  // Sign-in that reloaded the app (Google, MFA): once the participant session is back,
  // return to the program page the sign-in was started from.
  useEffect(() => {
    if (session?.role !== "participant") return;
    const back = takeLoginReturn();
    if (!back) return;
    if (back.id === "cart") openCart();
    else openProgram(back.id, { section: back.section });
  }, [session]);

  const selectGuideById = (id: string) => {
    setGuideInitialId(id);
    setGuidesInitialCategories([]);
    setPage("guides");
    window.scrollTo(0, 0);
  };

  const selectMeditationById = (id: string) => {
    setMeditationInitialId(id);
    setMeditationsInitialCategories([]);
    setPage("meditations");
    window.scrollTo(0, 0);
  };

  // Already logged in as that role -> straight to the dashboard.
  // Otherwise -> the login/register gate for that role.
  const openAuthorDashboard = () => {
    setPage(session?.role === "author" ? "author-dashboard" : "author-auth");
    window.scrollTo(0, 0);
  };

  const openParticipantDashboard = () => {
    setPage(
      session?.role === "participant" ? "participant-dashboard" : "participant-auth"
    );
    window.scrollTo(0, 0);
  };

  // No public entry point on purpose — reached only from the "Адмін-
  // панель" button the dashboard shells show when profile.isAdmin is
  // true, never from the marketing site.
  const openAdminDashboard = () => {
    if (session?.isAdmin) {
      setPage("admin-dashboard");
      window.scrollTo(0, 0);
    }
  };

  const openContacts = () => {
    setPage("contacts");
    window.scrollTo(0, 0);
  };

  const openPrivacy = () => {
    setPage("privacy");
    window.scrollTo(0, 0);
  };

  const openAuthorAgreement = () => {
    setPage("author-agreement");
    window.scrollTo(0, 0);
  };

  const openRefunds = () => {
    setPage("refunds");
    window.scrollTo(0, 0);
  };

  const openTerms = () => {
    setPage("terms");
    window.scrollTo(0, 0);
  };

  // From the contacts page: back to the home page, scrolled to the FAQ.
  const openFaq = () => {
    setPage("home");
    window.setTimeout(() => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
  };

  // Logo click (header / footer): back to the home page from anywhere.
  const goHome = () => {
    setPage("home");
    window.scrollTo(0, 0);
  };

  const logout = () => {
    clearSessionBookkeeping();
    logoutAccount();
    setSession(null);
    setPage("home");
    window.scrollTo(0, 0);
  };

// Session is still being resolved against Supabase — hold off on
// rendering any page (public or dashboard) until we know whether
// there's a valid, non-expired login, so a real session never flashes
// as "logged out" for a frame and vice versa.
if (session === undefined) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]" />
  );
}

// A session was found on boot (refresh, or return from an OAuth
// redirect) but hasn't cleared aal2 yet — hold here instead of
// rendering any page, public or dashboard, until the code step passes.
// See the boot effect above for how this gets set.
if (mfaPendingProfile) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]">
      <MfaCodeStep
        onVerified={() => {
          touchSession();
          touchDeviceSession(mfaPendingProfile.id);
          setSession(mfaPendingProfile);
          setMfaPendingProfile(null);
        }}
        onCancel={() => setMfaPendingProfile(null)}
      />
    </div>
  );
}

// Same idea, right after the MFA gate — an existing session for an
// account still inside its 14-day deletion-recovery window.
if (restorePendingProfile) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]">
      <RestoreAccountStep
        deletionRequestedAt={restorePendingProfile.deletionRequestedAt!}
        onRestored={() => {
          touchSession();
          touchDeviceSession(restorePendingProfile.id);
          setSession({ ...restorePendingProfile, deletionRequestedAt: null });
          setRestorePendingProfile(null);
        }}
        onCancel={() => setRestorePendingProfile(null)}
      />
    </div>
  );
}

if (page === "catalog") {
  return (
    <div key={page} className="page-transition">
      <div
        className="
          min-h-screen
          bg-gradient-to-br
          from-[#1e3a8a]
          via-[#2563eb]
          to-[#8b5cf6]
        "
      >
        <Header
        onGoHome={goHome}
        onOpenTest={openTest}
        onOpenCatalog={openCatalog}
        onOpenGuides={openGuides}
        onOpenMeditations={openMeditations}
        onSelectProgram={selectProgramById}
        onSelectGuide={selectGuideById}
        onSelectMeditation={selectMeditationById}
        onOpenAuthorDashboard={openAuthorDashboard}
        onOpenParticipantDashboard={openParticipantDashboard}
        programs={allPrograms}
        session={session}
        />

        <ProgramsCatalogPage
          programs={allPrograms}
          initialCategories={catalogInitialCategories}
          session={session ?? null}
          onRequireLogin={openParticipantDashboard}
          onOpen={(program) => openProgram(program.id)}
        />
      </div>
    </div>
  );
}

if (page === "payment-result") {
  return (
    <div key={page} className="page-transition">
      <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]">
        <Header
          onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenParticipantDashboard={openParticipantDashboard}
          programs={allPrograms}
          session={session}
        />
        <PaymentResultPage
          session={session}
          onOpenCabinet={openParticipantDashboard}
          onOpenCart={openCart}
          onOpenCatalog={openCatalog}
          onRequireLogin={() => {
            setLoginReturn("cart");
            openParticipantDashboard();
          }}
        />
      </div>
    </div>
  );
}

if (page === "cart") {
  return (
    <div key={page} className="page-transition">
      <div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]">
        <Header
          onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenParticipantDashboard={openParticipantDashboard}
          programs={allPrograms}
          session={session}
        />
        <CartPage
          programs={allPrograms}
          programsLoaded={realProgramsLoaded}
          session={session ?? null}
          onOpenProgram={(id) => openProgram(id)}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onOpenGuide={selectGuideById}
          onOpenMeditation={selectMeditationById}
          onRequireLogin={() => {
            setLoginReturn("cart");
            openParticipantDashboard();
          }}
          onOpenCabinet={openParticipantDashboard}
        />
      </div>
    </div>
  );
}

if (page === "program-detail") {
  const detailProgram = programDetailId ? allPrograms.find((p) => p.id === programDetailId) ?? null : null;
  return (
    <div key={`${page}:${programDetailId}`} className="page-transition">
      <ProgramDetailPage
        program={detailProgram}
        loading={!detailProgram && !realProgramsLoaded}
        session={session}
        header={
          <Header
            onGoHome={goHome}
            onOpenTest={openTest}
            onOpenCatalog={openCatalog}
            onOpenGuides={openGuides}
            onOpenMeditations={openMeditations}
            onSelectProgram={selectProgramById}
            onSelectGuide={selectGuideById}
            onSelectMeditation={selectMeditationById}
            onOpenAuthorDashboard={openAuthorDashboard}
            onOpenParticipantDashboard={openParticipantDashboard}
            programs={allPrograms}
            session={session}
          />
        }
        onBackToCatalog={openCatalog}
        // Sign-in started from this page (review, rating, "Є питання до автора?") comes back to it.
        onRequireLogin={(section) => {
          if (programDetailId) setLoginReturn(programDetailId, section ?? null);
          openParticipantDashboard();
        }}
        onStart={(id, itemId) => {
          setContinuingItemId(itemId ?? null);
          setContinuingProgramId(id);
        }}
        scrollToReviews={scrollToProgramReviews}
        initialSection={programInitialSection}
        onMessageAuthor={(author) => {
          setPendingChat(author);
          setPage("participant-dashboard");
          window.scrollTo(0, 0);
        }}
      />
      {continuingProgramId && (
        <ProgramExperience
          programId={continuingProgramId}
          initialItemId={continuingItemId ?? undefined}
          onClose={() => {
            setContinuingProgramId(null);
            setContinuingItemId(null);
          }}
          session={session}
          onRetakeAssessment={() => {
            setContinuingProgramId(null);
            openTest();
          }}
          onSearchSimilar={(categories) => {
            setContinuingProgramId(null);
            openCatalogWithCategories(categories);
          }}
          onOpenGuide={(id) => {
            setContinuingProgramId(null);
            selectGuideById(id);
          }}
          onOpenMeditation={(id) => {
            setContinuingProgramId(null);
            selectMeditationById(id);
          }}
        />
      )}
    </div>
  );
}

if (page === "author-profile" && authorProfileId) {
  return (
    <div key={`${page}:${authorProfileId}`} className="page-transition">
      <AuthorPublicProfilePage
        authorId={authorProfileId}
        viewer={session}
        onRequireLogin={() => setPage("participant-auth")}
        onBack={() => {
          setPage(authorReturnPage === "author-profile" ? "home" : authorReturnPage);
          window.scrollTo(0, 0);
        }}
        onMessageAuthor={(author) => {
          setPendingChat(author);
          setPage("participant-dashboard");
          window.scrollTo(0, 0);
        }}
        // Already in the person's cabinet → open it there; otherwise the
        // pre-purchase preview of the platform, right over the profile.
        onOpenProgram={(id) => openProfileMaterial("program", id)}
        onOpenGuide={(id) => openProfileMaterial("guide", id)}
        onOpenMeditation={(id, name) => openProfileMaterial("meditation", id, name)}
      />
      {profilePreview?.kind === "guide" && guides.find((g) => g.id === profilePreview.id) && (
        <GuidePreviewModal guide={guides.find((g) => g.id === profilePreview.id)!} onClose={() => setProfilePreview(null)} userId={session?.id} isParticipant={session?.role === "participant"} />
      )}
      {profilePreview?.kind === "meditation" && meditations.find((m) => m.id === profilePreview.id) && (
        <MeditationDetailModal
          meditation={meditations.find((m) => m.id === profilePreview.id)!}
          authorId={authorProfileId}
          authorName={profilePreview.authorName}
          userId={session?.id}
          isParticipant={session?.role === "participant"}
          onClose={() => setProfilePreview(null)}
          onStart={() => {
            setProfilePreview(null);
            openParticipantDashboard();
          }}
        />
      )}
    </div>
  );
}

if (page === "guides") {
  return (
    <div key={page} className="page-transition">
      <div
        className="
          min-h-screen
          bg-gradient-to-br
          from-[#0f172a]
          via-[#172554]
          to-[#312e81]
          text-white
        "
      >
        <Header
        onGoHome={goHome}
  onOpenTest={openTest}
  onOpenCatalog={openCatalog}
  onOpenGuides={openGuides}
  onOpenMeditations={openMeditations}
  onSelectProgram={selectProgramById}
  onSelectGuide={selectGuideById}
  onSelectMeditation={selectMeditationById}
  onOpenAuthorDashboard={openAuthorDashboard}
  onOpenParticipantDashboard={openParticipantDashboard}
  programs={allPrograms}
  session={session}
/>
        <GuidesCatalogPage initialGuideId={guideInitialId} initialCategories={guidesInitialCategories} session={session ?? null} onRequireLogin={openParticipantDashboard} />
      </div>
    </div>
  );
}

if (page === "contacts") {
  return (
    <div key={page} className="page-transition">
      <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
        <Header
          onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenParticipantDashboard={openParticipantDashboard}
          programs={allPrograms}
          session={session}
        />
        <ContactsPage
          onOpenParticipantDashboard={openParticipantDashboard}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenFaq={openFaq}
        />
        <Footer
          onOpenTest={openTest}
          onGoHome={goHome}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onOpenContacts={openContacts} onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds}
          compact
        />
      </div>
    </div>
  );
}

if (page === "terms") {
  return (
    <div key={page} className="page-transition">
      <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
        <Header
          onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenParticipantDashboard={openParticipantDashboard}
          programs={allPrograms}
          session={session}
        />
        <TermsPage onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds} onOpenAuthorAgreement={openAuthorAgreement} />
        <Footer
          onOpenTest={openTest}
          onGoHome={goHome}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onOpenContacts={openContacts} onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds}
          compact
        />
      </div>
    </div>
  );
}

if (page === "privacy") {
  return (
    <div key={page} className="page-transition">
      <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
        <Header
          onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenParticipantDashboard={openParticipantDashboard}
          programs={allPrograms}
          session={session}
        />
        <PrivacyPage onOpenTerms={openTerms} onOpenRefunds={openRefunds} />
        <Footer
          onOpenTest={openTest}
          onGoHome={goHome}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onOpenContacts={openContacts} onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds}
          compact
        />
      </div>
    </div>
  );
}

if (page === "refunds") {
  return (
    <div key={page} className="page-transition">
      <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
        <Header
          onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenParticipantDashboard={openParticipantDashboard}
          programs={allPrograms}
          session={session}
        />
        <RefundsPage onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} />
        <Footer
          onOpenTest={openTest}
          onGoHome={goHome}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onOpenContacts={openContacts} onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds}
          compact
        />
      </div>
    </div>
  );
}

if (page === "author-agreement") {
  return (
    <div key={page} className="page-transition">
      <div className="relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white">
        <Header
          onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
          onOpenParticipantDashboard={openParticipantDashboard}
          programs={allPrograms}
          session={session}
        />
        <AuthorAgreementPage onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds} />
        <Footer
          onOpenTest={openTest}
          onGoHome={goHome}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onOpenContacts={openContacts} onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds}
          compact
        />
      </div>
    </div>
  );
}

if (page === "meditations") {
  return (
    <div key={page} className="page-transition">
      <div
        className="
          min-h-screen
          bg-gradient-to-br
          from-[#0f172a]
          via-[#172554]
          to-[#312e81]
          text-white
        "
      >
        <Header
        onGoHome={goHome}
          onOpenTest={openTest}
          onOpenCatalog={openCatalog}
          onOpenGuides={openGuides}
          onOpenMeditations={openMeditations}
          onSelectProgram={selectProgramById}
          onSelectGuide={selectGuideById}
          onSelectMeditation={selectMeditationById}
          onOpenAuthorDashboard={openAuthorDashboard}
        onOpenParticipantDashboard={openParticipantDashboard}
        programs={allPrograms}
        session={session}
        />
        <MeditationsCatalogPage
          meditations={meditations}
          initialCategories={meditationsInitialCategories}
          initialSelectedId={meditationInitialId}
          session={session}
          onRequireLogin={openParticipantDashboard}
          onStart={openParticipantDashboard}
        />
      </div>
    </div>
  );
}

if (page === "state-selection") {
  return (
    <div key={page} className="page-transition min-h-screen
      bg-gradient-to-br
      from-[#1e3a8a]
      via-[#2563eb]
      to-[#8b5cf6]
    ">
     <StateSelectionPage
        onContinue={() => {
          setPage("test");
        }}
      />
    </div>
  );
}

if (page === "test") {
  return (
    <div
      key={page}
      className="
        page-transition
        min-h-screen
        bg-gradient-to-br
        from-[#1e3a8a]
        via-[#2563eb]
        to-[#8b5cf6]
      "
    >

    <TestPage
      onComplete={() => {
        setPage("result");
      }}
    />
    </div>
  );
}

if (page === "result") {

  return (

    <div key={page} className="page-transition">
      <ResultPage

        onContinue={() => {

          setPage("registration");

        }}

        onMissingData={() => {

          // No insight in the store (e.g. a direct refresh with a
          // genuinely empty session) — send the user back to the start
          // of the funnel instead of rendering nothing.
          setPage("home");

        }}

      />
    </div>

  );

}

if (page === "registration") {
  const primaryState =
    funnelStore.insight
      ?.primaryState;

  if (!primaryState) {
    setPage("test");
    return null;
  }

  // Already logged in — this is someone retaking the assessment from
  // the participant dashboard (onRetakeAssessment), not a first-time
  // signup. There's no account left to create: just save the fresh
  // result against the one they already have and carry on through the
  // same "preparing recommendations" flow a new signup would see.
  if (session) {
    if (funnelStore.insight) {
      saveAssessmentResult(session.id, funnelStore.insight).catch((e) => {
         
        console.error("Не вдалося зберегти результат оцінки:", e);
      });
    }
    setPage("preparing");
    return null;
  }

  const profile = getStateProfile(primaryState, "moderate");

  return (
  <div
    key={page}
    className="
      page-transition
      min-h-screen
      bg-gradient-to-br
      from-[#1e3a8a]
      via-[#2563eb]
      to-[#8b5cf6]
    "
  >
    <RegisterPage
      stateTitle={profile.title}
      recommendationTitle={
        profile.recoveryFocus
      }

     onAuthenticated={(newProfile) => {

  setSession(newProfile);
  touchDeviceSession(newProfile.id);

  if (funnelStore.insight) {
    saveAssessmentResult(newProfile.id, funnelStore.insight).catch((e) => {
       
      console.error("Не вдалося зберегти результат оцінки:", e);
    });
  }

  track(
    "registration_completed"
  );

  setPage("preparing");
}}

  onGoToLogin={() => {
    setPage("login");
  }}

    />
  </div>
);
}

if (page === "preparing") {
  return (
    <div
      key={page}
      className="
        page-transition
        min-h-screen
        bg-gradient-to-br
        from-[#1e3a8a]
        via-[#2563eb]
        to-[#8b5cf6]
      "
    >
      <PreparingPage
        onComplete={() => {
          setPage("recommendation");
        }}
      />
    </div>
  );
}

if (page === "login") {
  return (
    <div
      key={page}
      className="
        page-transition
        min-h-screen
        bg-gradient-to-br
        from-[#1e3a8a]
        via-[#2563eb]
        to-[#8b5cf6]
      "
    >
      <LoginPage
        onAuthenticated={(profile) => {
          setSession(profile);
          touchDeviceSession(profile.id);

          if (funnelStore.insight) {
            saveAssessmentResult(profile.id, funnelStore.insight).catch((e) => {
               
              console.error("Не вдалося зберегти результат оцінки:", e);
            });
          }

          track("login_completed");
          setPage("recommendation");
        }}
        onBackToRegister={() => {
          setPage("registration");
        }}
      />
    </div>
  );
}

if (page === "recommendation") {

  const primaryState =
    funnelStore.insight
      ?.primaryState;

  if (!primaryState) {
    setPage("test");
    return null;
  }

  const secondaryState =
    funnelStore.insight?.secondaryState ?? null;

  track("recommendation_viewed", primaryState);

  // Carried into the "view all" deep links below — the categories the
  // Courses/Meditations catalogs should pre-select when opened from
  // here (still fully changeable by the user once there).
  const relevantCategories = secondaryState
    ? [primaryState, secondaryState]
    : [primaryState];

  return (
    <div
      key={page}
      className="
        page-transition
        min-h-screen
        bg-gradient-to-br
        from-[#1e3a8a]
        via-[#2563eb]
        to-[#8b5cf6]
      "
    >
      <LibraryHomePage
        primaryState={primaryState}
        secondaryState={secondaryState}
        onOpenCourse={(course) => {
          funnelStore.setProgram({
            id: course.id,
            title: course.title,
          });

          track("program_selected", course.id);

          setPage("program");
        }}
        onOpenMeditation={() => {
          setMeditationsInitialCategories([]);
          setPage("meditations");
        }}
        onOpenGuide={() => {
          setPage("guides");
        }}
        onViewAllCourses={() => {
          setCatalogInitialCategories(relevantCategories);
          setPage("catalog");
        }}
        onViewAllMeditations={() => {
          setMeditationsInitialCategories(relevantCategories);
          setPage("meditations");
        }}
        onViewAllGuides={() => {
          setPage("guides");
        }}
        onViewEntireLibrary={() => {
          setCatalogInitialCategories([]);
          setPage("catalog");
        }}
      />
    </div>
  );
}

if (page === "program") {

  const program =
    funnelStore.program;

  return (
    <div
      key={page}
      className="
        page-transition
        min-h-screen
        bg-gradient-to-br
        from-[#1e3a8a]
        via-[#2563eb]
        to-[#8b5cf6]
      "
    >
      <ProgramPagePlaceholder
        title={program!.title}
        onBackToHome={() => {

          funnelStore.reset();

          setPage("home");
        }}
      />
    </div>
  );
}

if (page === "author-auth") {
  return (
    <div
      key={page}
      className="page-transition min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]"
    >
      <DashboardAuthPage
        role="author"
        onBackToSite={() => setPage("home")}
        onAuthenticated={(profile) => {
          touchSession();
          touchDeviceSession(profile.id);
          setSession(profile);
          setPage("author-dashboard");
          window.scrollTo(0, 0);
        }}
      />
    </div>
  );
}

if (page === "participant-auth") {
  return (
    <div
      key={page}
      className="page-transition min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]"
    >
      <DashboardAuthPage
        role="participant"
        onBackToSite={() => {
          clearLoginReturn();
          setPage("home");
        }}
        onAuthenticated={(profile) => {
          touchSession();
          touchDeviceSession(profile.id);
          setSession(profile);
          const back = takeLoginReturn();
          if (back && back.id !== "cart") {
            setProgramDetailId(back.id);
            setProgramInitialSection(back.section);
          }
          setPage(back ? (back.id === "cart" ? "cart" : "program-detail") : "participant-dashboard");
          window.scrollTo(0, 0);
        }}
      />
    </div>
  );
}

if (page === "author-dashboard") {
  // Reaching this page without a valid author session (e.g. a direct
  // refresh after the session expired) sends the person back through
  // the login gate instead of rendering a dashboard for no one.
  if (!session || session.role !== "author") {
    setPage("author-auth");
    return null;
  }
  return (
    <div key={page} className="page-transition">
      <AuthorDashboardPage
        profile={session}
        onProfileChange={setSession}
        onBackToSite={() => setPage("home")}
        onOpenAdmin={session.isAdmin ? openAdminDashboard : undefined}
        onLogout={logout}
      />
    </div>
  );
}

if (page === "participant-dashboard") {
  if (!session || session.role !== "participant") {
    setPage("participant-auth");
    return null;
  }
  return (
    <div key={page} className="page-transition">
      <ParticipantDashboardPage
        profile={session}
        onProfileChange={setSession}
        onBackToSite={() => setPage("home")}
        onOpenAdmin={session.isAdmin ? openAdminDashboard : undefined}
        onRetakeAssessment={openTest}
        onOpenProgram={selectProgramById}
        onOpenGuide={selectGuideById}
        onOpenMeditation={selectMeditationById}
        onSearchSimilar={openCatalogWithCategories}
        onViewAllPrograms={openCatalogWithCategories}
        onViewAllMeditations={openMeditationsWithCategories}
        onViewAllGuides={openGuidesWithCategories}
        onLogout={logout} />
    </div>
  );
}

if (page === "admin-dashboard") {
  // Not a role — is_admin is an orthogonal flag on any account (see
  // schema.sql). Anyone without it lands back on the ordinary home
  // page instead of a blank/error screen.
  if (!session || !session.isAdmin) {
    setPage("home");
    return null;
  }
  return (
    <div key={page} className="page-transition">
      <AdminDashboardPage
        profile={session}
        onBackToSite={() => setPage("home")}
        onLogout={logout}
      />
    </div>
  );
}

  return (
    <div key={page} className="page-transition relative min-h-screen overflow-x-hidden bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6] text-white overflow-hidden">

      {/* BACKGROUND GLOW */}
      <ParallaxBackground />

      {/* HEADER (first in the document, so keyboard / screen-reader order starts here) */}
      <Header onGoHome={goHome} onOpenTest={openTest}
       onOpenCatalog={openCatalog}
       onOpenGuides={openGuides}
       onOpenMeditations={openMeditations}
       onSelectProgram={selectProgramById}
       onSelectGuide={selectGuideById}
       onSelectMeditation={selectMeditationById}
       onOpenAuthorDashboard={openAuthorDashboard}
       onOpenParticipantDashboard={openParticipantDashboard}
       programs={allPrograms}
       session={session} />

      <main>
      {/* HERO */}
      <Hero onOpenTest={openTest} onBecomeAuthor={openAuthorDashboard} />

      {/* ABOUT */}
      <div id="about">
        <AboutSection onOpenCatalog={openCatalog} onOpenGuides={openGuides} onOpenMeditations={openMeditations} />
      </div>

      {/* PROGRAMS */}
      <ProgramsSection
        items={allPrograms}
        onOpen={(program: Program) => openProgram(program.id)}
        onOpenCatalog={openCatalog}
      />

      {/* FAQ */}
      <FAQSection onOpenTest={openTest} />
      </main>

      {/* TEST POPUP */}
      <TestPopup onOpenTest={openTest} />

      {/* FOOTER */}
      <Footer onOpenTest={openTest} onGoHome={goHome} onOpenContacts={openContacts} onOpenTerms={openTerms} onOpenPrivacy={openPrivacy} onOpenRefunds={openRefunds} onOpenCatalog={openCatalog} onOpenGuides={openGuides} onOpenMeditations={openMeditations} />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gradient-to-br from-[#1e3a8a] via-[#2563eb] to-[#8b5cf6]" aria-busy="true" />}>
      <AppInner />
    </Suspense>
  );
}
